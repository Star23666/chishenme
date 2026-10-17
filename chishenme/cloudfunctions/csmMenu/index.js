/**
 * 今天吃啥 · 家庭菜单云函数
 *
 * 一个函数按 event.action 分发，避免建七八个小函数还要逐个部署。
 *
 * ── 为什么所有写操作都走云函数，而不是客户端直接写数据库 ──
 *   1. 客户端拿不到别人的 openid，也没法校验「这个房间码到底存不存在」；
 *      云函数里可以用 admin 权限先查后写，逻辑是可信的。
 *   2. 「谁点的」需要知道当前用户的称呼，云函数里 openid → 家庭 → 昵称，一步到位。
 *   3. 客户端只负责读（为了 watch 实时推送），写一律经过这里。
 *
 * ── 数据库集合 ──
 *   csm_families  { code, name, owner, members[], nicknames{}, createdAt }
 *                 权限：所有用户可读，仅创建者可读写
 *                 （文档由云函数以 admin 权限写入、不带 _openid，
 *                   所以客户端在「仅创建者可写」下实际写不了任何一条 → 写权限被天然收口）
 *   csm_menus     { familyCode, date, dishId, qty, note, byNames[], addedAt, updatedAt }
 *                 权限：同上。必须放开读，否则 watch 收不到别人写的记录。
 *   csm_dishes    { familyCode, dishId, name, cat, main, tips, image, creator, creatorName,
 *                   createdAt, updatedAt, builtin?, hidden? }
 *                 权限：同上。这个集合里装着**两种**记录，靠 builtin 标记分开：
 *                   - 用户自己加的菜：不带 builtin，dishId 一定以 u 开头
 *                   - 房主对内置 80 道菜的改动 / 隐藏：builtin 为 true，
 *                     dishId 就是内置菜自己的英文 id（hongshaorou 这种）
 *                 ★ 内置的 80 道菜本身写死在小程序包里（data/dishes.js + images/dishes/*.jpg），
 *                   这个集合里存的只是「房主把哪几道改了 / 藏了」。
 *                 ★ 图片存的是云存储文件 ID（cloud://...），不占数据库体积。
 *                 ★ 免费版环境的「云存储权限」改不动，客户端直接读**别人**传的图会报
 *                   STORAGE_EXCEED_AUTHORITY（表现是「家人互相看不到菜图」）。所以
 *                   listDishes 用管理员身份把 cloud:// 换成**临时链接**一起发下去，
 *                   客户端只拿它显示、绝不落库（见 signImages）。
 *                 ★ 这个集合的读写**全部**经过云函数，客户端不直连它：
 *                   菜单为了 watch 实时推送必须直连，菜谱不需要实时，
 *                   少开一条直连通道就少一份权限要配。
 *                 ★ 所以客户端提交的 dishId 不可信，要在这里校验形状；
 *                   「只有创建者能改删」和「只有房主能改内置菜」也必须在
 *                   服务端判定（见 updateDish / deleteDish / updateBuiltin）。
 *
 * ── 为什么 byNames 存「称呼」而不是 openid ──
 *   客户端 watch 到的只有这一个集合，拿不到 nicknames 映射表。
 *   若存 openid，前端还得再 watch 一次家庭集合才能显示人名，连接数翻倍。
 *   代价：改称呼不会回溯修正已经点过的记录（家里场景可以接受）。
 *
 * ★ 时区坑：云函数默认跑在 UTC。晚上 8 点以后，UTC 和东八区不是同一天，
 *   如果直接用 new Date() 算「今天」，北京时间晚上点完菜会存成「明天」。
 *   所以下面严格用 UTC+8 自己算日期。
 *
 * ★ 另一个「日」：菜单的日期不是 todayStr()，而是 menuDayStr() ——
 *   菜单一天只到 **22:30**（到点翻篇 = 今天的菜单自动作废）。
 *   菜单相关的读写一律用它，用错就会出「点了菜不显示」的沉默故障。
 *   客户端 `utils/format.js` 有同一套实现，两边的 MENU_CUTOFF_H 必须一致。
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const FAM = 'csm_families'
const MENU = 'csm_menus'
const DISH = 'csm_dishes'

const MAX_MEMBERS = 15
const MAX_QTY = 99
const NICK_MAX = 8
const NAME_MAX = 12
const NOTE_MAX = 20

/* 自建菜 */
const DISH_CATS = ['meat', 'veg', 'soup', 'staple', 'cold']
const DISH_NAME_MAX = 12
const DISH_MAIN_MAX = 20
const DISH_TIPS_MAX = 40
const DISH_IMAGE_MAX = 300          // cloud:// 文件 ID 也就一百来字符，留足余量
const MAX_DISHES = 100              // 一个家最多自己加多少道，防手滑 / 防滥用

/* 房主对内置菜的改动 */
/*
 * 自建菜的 id 是 'u' + 一串 base36（u5k2m1x9ab 这种），内置菜的 id 全是
 * 小写英文单词（hongshaorou / gaofengningmengya）。两种记录躺在同一个集合里，
 * 全靠这个形状把「改的是哪一道」认出来。
 *
 * ★ 两条正则必须**一起**用，缺一不可：
 *   只看 BUILTIN_ID 的话，'uabc123' 完全符合「小写字母开头 + 字母数字」，
 *   于是有人可以拿一道自建菜的 id 去调 updateBuiltin，在 csm_dishes 里
 *   造出一条既不生效（客户端对不上内置菜）又永远清不掉的记录。
 *   所以「像内置菜」还不够，还得「不像自建菜」。
 * ★ 代价：将来若真加了一道以 u 开头的纯字母内置菜（比如 umami），
 *   它会同时命中两条正则而被误拒。碰到时改这里一行就行 ——
 *   比反过来（认不出自建菜、静默造垃圾数据）好排查得多。
 * ★ 云函数这边维护不了那 80 个 id 的白名单（会和 data/dishes.js 两处重复，
 *   迟早不同步）。就算有人塞进来一个不存在的 id，客户端在 data/dishes.js 里
 *   对不上内置菜，那条记录也叠不上去、不会凭空多出一道菜，所以校验形状就够了。
 */
const CUSTOM_ID = /^u[a-z0-9]{2,38}$/      // 和 createDish 里那条**必须**保持一致
const BUILTIN_ID = /^[a-z][a-z0-9]{2,39}$/
const MAX_OVERRIDES = 100           // 内置菜一共 80 道，留点余量防脏数据堆积

/* getTempFileURL 一次最多换几个（接口硬上限 50） */
const SIGN_BATCH = 50

/* ==================== 订阅消息（「有人点菜了」） ====================
 *
 * 三个必须知道的前提：
 *  1. **订阅消息是一次性的**：用户点一次「允许」只换到一条消息，发完就没了。
 *     所以界面上不能说「永久提醒」，那是在骗人。
 *  2. 云函数里必须 **await** 发送。云函数 return 之后容器可能被冻结，
 *     fire-and-forget 的请求会**静默丢掉**（日志里什么都看不到，最难查）。
 *  3. data 里的字段名必须和后台那个模板**一字不差**，对不上报 47003。
 *
 * ★ 模板 ID 不是密钥（它会出现在客户端代码里），但两处必须一致：
 *   这里和 chishenme/config.js 的 SUBSCRIBE_TMPL_ID（wxml-check 有断言比它们）。
 */
const SUBSCRIBE_TPL = 'nSZpROQ9bC2B2Uz6jdb42JYbTUKgEdY7U8K8TuOXQVc'

/* ★ 模板字段名集中在这里，换模板只改这张表。
   默认按最常见的「点菜提醒」模板写：thing1 = 内容、time2 = 时间。
   如果发送时日志里报 47003，就是这两个名字和你后台的模板对不上。 */
const TPL_FIELD = {
  item: 'thing1',
  time: 'time2'
}


/*
 * 菜单每天几点「翻篇」（22.5 = 22:30）。
 * ★ 必须和客户端 utils/format.js 的 MENU_CUTOFF_H **是同一个值**。
 *   两边不一致 = 22:30 之后点菜写进去的日期和读出来的日期对不上，
 *   菜沉在库里、界面不显示，而且两边都不报错。
 */
const MENU_CUTOFF_H = 22.5

/** 这个 id 看起来像不像一道内置菜 */
function isBuiltinId(id) {
  return BUILTIN_ID.test(id) && !CUSTOM_ID.test(id)
}

/** 房间码字母表：去掉了容易看错的 0 O 1 I */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/* ---------------- 工具 ---------------- */

function ok(data) {
  return { ok: true, data: data === undefined ? null : data }
}

function err(msg) {
  return { ok: false, msg: msg }
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

/** 东八区的「今天」，格式 yyyy-mm-dd */
function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate())
}

/** 东八区往前 n 天的日期 */
function daysAgoStr(n) {
  const d = new Date(Date.now() + 8 * 3600 * 1000 - n * 24 * 3600 * 1000)
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate())
}

/**
 * 菜单归属的日期（「菜单日」）—— 菜单一天是 **00:00~22:30**，不是到 0 点。
 *
 * 做法：算日期前把时间往后推 24 - 22.5 = 1.5 小时，等价于把一天的分界线
 * 从 0 点挪到 22:30。于是 22:29 还算今天、22:30 整就翻到明天，
 * 「今天的菜单」到点自动作废，**不需要真的去删任何文档**。
 *
 * ★ 菜单相关的每一个读写都必须用它，不能用 todayStr() ——
 *   见 MENU_CUTOFF_H 上面那段说明。
 * ★ 传 now 只为让离线单测能钉死时刻，不传就是此刻。
 */
function menuDayStr(now) {
  const base = typeof now === 'number' ? now : Date.now()
  const d = new Date(base + 8 * 3600 * 1000 + (24 - MENU_CUTOFF_H) * 3600 * 1000)
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate())
}

function makeCode() {
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length))
  }
  return s
}

function clean(v, max) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max)
}

/** 菜单文档 → 客户端形状（剥掉 _id / familyCode 等内部字段） */
function publicMenuDoc(d) {
  return {
    dishId: d.dishId,
    qty: d.qty > 0 ? d.qty : 1,
    note: d.note || '',
    byNames: d.byNames instanceof Array ? d.byNames : [],
    addedAt: d.addedAt || 0
  }
}

/**
 * 自建菜文档 → 客户端形状。
 * ★ 只回一个 mine 布尔，不回 creator 的 openid —— 家人之间不需要知道彼此的身份标识，
 *   客户端要的只是「这个按钮该不该显示」。
 */
function publicDish(d, openid) {
  return {
    id: d.dishId,
    name: d.name,
    cat: d.cat,
    main: d.main || '',
    tips: d.tips || '',
    image: d.image || '',
    mine: d.creator === openid,
    creatorName: d.creatorName || '',
    createdAt: d.createdAt || 0
  }
}

/**
 * 内置菜的改动记录 → 客户端形状。
 * id 就是内置菜自己的 id（hongshaorou 这种），客户端按它往那道菜上叠。
 * ★ 同样不回 creator 的 openid —— 客户端只需要知道「这道菜被改过 / 被藏了」。
 * ★ main / tips 传 null 表示「没改这两项」，传空串表示「房主把它清空了」，
 *   两者在客户端叠的时候行为不一样，不能混。
 */
function publicOverride(d) {
  return {
    id: d.dishId,
    name: d.name || '',
    cat: d.cat || '',
    main: (d.main === undefined || d.main === null) ? null : String(d.main),
    tips: (d.tips === undefined || d.tips === null) ? null : String(d.tips),
    image: d.image || '',
    hidden: d.hidden === true
  }
}

/** 把数据库里的家庭记录整理成客户端要的形状（不泄露 members 原始 openid 列表给前端展示） */
function publicFamily(fam, openid) {
  const members = fam.members || []
  const nicks = fam.nicknames || {}
  const list = []
  for (let i = 0; i < members.length; i++) {
    const nm = nicks[members[i]] || '家人'
    list.push({
      name: nm,
      initial: nm.slice(0, 1),   // 头像圈里那个字（WXML 里没法切字符串，服务端切好）
      isOwner: members[i] === fam.owner,
      isMe: members[i] === openid
    })
  }
  return {
    _id: fam._id,
    code: fam.code,
    name: fam.name,
    owner: fam.owner,
    isOwner: fam.owner === openid,
    myName: nicks[openid] || '',
    memberCount: members.length,
    maxMembers: MAX_MEMBERS,
    members: list,
    serverDate: todayStr()
  }
}

/* ---------------- 家庭 ---------------- */

async function findMyFamily(openid) {
  const r = await db.collection(FAM).where({ members: _.all([openid]) }).limit(1).get()
  return r.data[0] || null
}

async function requireFamily(openid) {
  const fam = await findMyFamily(openid)
  if (!fam) throw new Error('NO_FAMILY')
  return fam
}

async function createFamily(openid, p) {
  const exist = await findMyFamily(openid)
  if (exist) return ok(publicFamily(exist, openid))

  const name = clean(p.name, NAME_MAX) || '我的家'
  const nickname = clean(p.nickname, NICK_MAX) || '我'

  // 房间码要唯一，最多试 8 次
  let code = null
  for (let i = 0; i < 8; i++) {
    const c = makeCode()
    const dup = await db.collection(FAM).where({ code: c }).count()
    if (dup.total === 0) {
      code = c
      break
    }
  }
  if (!code) throw new Error('房间码生成失败，请重试')

  const nicknames = {}
  nicknames[openid] = nickname

  const doc = {
    code: code,
    name: name,
    owner: openid,
    members: [openid],
    nicknames: nicknames,
    createdAt: Date.now()
  }
  const r = await db.collection(FAM).add({ data: doc })
  doc._id = r._id
  return ok(publicFamily(doc, openid))
}

async function peekFamily(openid, p) {
  const code = clean(p.code, 8).toUpperCase()
  if (code.length !== 6) throw new Error('房间码是 6 位')
  const r = await db.collection(FAM).where({ code: code }).limit(1).get()
  const fam = r.data[0]
  if (!fam) throw new Error('没找到这个房间')
  return ok({
    name: fam.name,
    memberCount: (fam.members || []).length,
    full: (fam.members || []).length >= MAX_MEMBERS
  })
}

/**
 * 这个称呼在家庭里是不是已经有人用了（排除自己）。
 *
 * ★ 为什么必须拦在服务端：加入房间和改称呼是**两个入口**，
 *   只在界面上一处做提示，另一处照样能造出重名。
 * ★ 为什么重名要管：菜单里「谁点的」存的是**称呼字符串**，
 *   两个「爸爸」会让「我点的」判断出错 —— A 点的菜在 B 手机上
 *   也会标成「我点的」，而且不报错。
 * ★ 只管「新增重名」，不清查历史：如果家里本来就有重名（这是老数据），
 *   两个人都还能正常用，只是不能再改成同一个名字。
 */
function nickTaken(fam, nickname, exceptOpenid) {
  const nicks = (fam && fam.nicknames) || {}
  const members = (fam && fam.members instanceof Array) ? fam.members : []
  for (let i = 0; i < members.length; i++) {
    const oid = members[i]
    if (oid === exceptOpenid) continue
    if (String(nicks[oid] || '') === String(nickname)) return true
  }
  return false
}

async function joinFamily(openid, p) {
  const code = clean(p.code, 8).toUpperCase()
  if (code.length !== 6) throw new Error('房间码是 6 位')
  const nickname = clean(p.nickname, NICK_MAX) || '家人'

  const cur = await findMyFamily(openid)
  const r = await db.collection(FAM).where({ code: code }).limit(1).get()
  const fam = r.data[0]
  if (!fam) throw new Error('没找到这个房间')

  // 已经在同一个房间，直接当成功
  if (cur && cur._id === fam._id) return ok(publicFamily(cur, openid))
  if (cur) throw new Error('你已经在一个家庭里了，先退出再加入')
  if ((fam.members || []).length >= MAX_MEMBERS) throw new Error('这个房间人满了')

  // ★ 称呼不许和家里已有的人重名（服务端拦，两个入口都要过这一关）
  if (nickTaken(fam, nickname, openid)) {
    throw new Error('已经有家人叫「' + nickname + '」了，换一个称呼')
  }

  const data = { members: _.addToSet(openid) }
  data['nicknames.' + openid] = nickname
  await db.collection(FAM).doc(fam._id).update({ data: data })

  const fresh = await db.collection(FAM).doc(fam._id).get()
  return ok(publicFamily(fresh.data, openid))
}

async function leaveFamily(openid) {
  const fam = await findMyFamily(openid)
  if (!fam) return ok(null)
  if (fam.owner === openid) throw new Error('你是房间创建者，不能退出')

  await db.collection(FAM).doc(fam._id).update({
    data: { members: _.pull(openid) }
  })
  return ok(null)
}

/**
 * 解散房间：把家庭连菜单一起删掉，只有房主能做。
 *
 * ★ 删除顺序不能反：先删菜单，再删家庭。
 *   家庭记录里存着房间码，是找这批菜单的唯一线索（菜单只按 familyCode 归类）。
 *   先删家庭的话，万一删菜单失败，那批菜单就变成谁也定位不到的孤儿数据 ——
 *   没人能再清掉它们，只能一直躺在库里。
 *
 * ★ 房主校验必须放在服务端。客户端那个「房主才显示解散按钮」只是界面上的
 *   方便，改个 wxml 就绕过去了；这里返回 NOT_OWNER 才是真正拦得住的地方。
 */
async function dissolveFamily(openid) {
  const fam = await findMyFamily(openid)
  if (!fam) return ok(null)          // 已经不在任何房间，当作已经解散，不报错
  if (fam.owner !== openid) throw new Error('NOT_OWNER')

  await db.collection(MENU).where({ familyCode: fam.code }).remove()
  await db.collection(FAM).doc(fam._id).remove()
  return ok(null)
}

async function renameSelf(openid, p) {
  const fam = await requireFamily(openid)
  const nickname = clean(p.nickname, NICK_MAX)
  if (!nickname) throw new Error('称呼不能为空')

  // ★ 同上：改成别人已经用着的称呼要拦住。排除自己 ——
  //   否则「改成和我现在一样」会被自己挡掉（虽然是个空操作）。
  if (nickTaken(fam, nickname, openid)) {
    throw new Error('已经有家人叫「' + nickname + '」了，换一个称呼')
  }

  const data = {}
  data['nicknames.' + openid] = nickname
  await db.collection(FAM).doc(fam._id).update({ data: data })
  const fresh = await db.collection(FAM).doc(fam._id).get()
  return ok(publicFamily(fresh.data, openid))
}

/* ---------------- 菜单 ---------------- */

/** 顺手清理这个房间 3 天前的旧菜单，避免无限堆积。不必每次都做，抽样触发。 */
async function maybeCleanupOld(familyCode) {
  if (Math.random() > 0.04) return
  try {
    await db.collection(MENU).where({
      familyCode: familyCode,
      date: _.lt(daysAgoStr(3))
    }).remove()
  } catch (e) {
    // 清理失败不能影响正常点菜
  }
}

async function findDish(familyCode, date, dishId) {
  const r = await db.collection(MENU).where({
    familyCode: familyCode,
    date: date,
    dishId: dishId
  }).limit(1).get()
  return r.data[0] || null
}

/** 东八区 'HH:mm' —— 订阅消息里 time 类型字段要的是这种格式 */
function beijingClock() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes())
}

/**
 * 有人新点了菜 → 给家里**其他人**发一条提醒。
 *
 * ★ 不发给自己：你刚点的菜你最清楚。
 * ★ 只在新加一道菜时发；加份数不发（同一道菜点三次收三条，很快就烦了）。
 * ★ 返回值里的 err 只用于排查（调用处只写日志，不进任何界面文案）。
 */
async function notifyOthers(fam, fromOpenid, text) {
  const out = { sent: 0, err: '' }
  try {
    const members = (fam && fam.members instanceof Array) ? fam.members : []
    const targets = members.filter(function (o) { return o && o !== fromOpenid })
    if (!targets.length) return out

    const data = {}
    data[TPL_FIELD.item] = { value: String(text || '一道菜').slice(0, 20) }
    data[TPL_FIELD.time] = { value: beijingClock() }

    // 并行发；单人失败（没授权 / 用完了 / 字段不符）不影响其他人
    const results = await Promise.all(targets.map(function (to) {
      return cloud.openapi.subscribeMessage.send({
        touser: to,
        templateId: SUBSCRIBE_TPL,
        data: data,
        page: 'pages/menu/menu'
      }).then(function () {
        return ''
      }).catch(function (e) {
        return String((e && (e.errCode || e.message)) || 'fail')
      })
    }))

    for (let i = 0; i < results.length; i++) {
      if (results[i]) { if (!out.err) out.err = results[i] } else out.sent++
    }
  } catch (e) {
    out.err = String((e && e.message) || e)
  }
  return out
}

async function addDish(openid, p) {
  const fam = await requireFamily(openid)
  const dishId = clean(p.dishId, 40)
  if (!dishId) throw new Error('菜名不对')

  const date = menuDayStr()
  let qty = parseInt(p.qty, 10)
  if (isNaN(qty) || qty < 1) qty = 1
  if (qty > MAX_QTY) qty = MAX_QTY

  const nicks = fam.nicknames || {}
  const me = nicks[openid] || '家人'

  const exist = await findDish(fam.code, date, dishId)
  if (exist) {
    // ★ 上限必须夹在「加完之后的份数」上，不能夹在增量上。
    //   夹增量的话：库里已有 2 份，客户端传 qty=999999 → 夹成 99 → 变成 101 份，
    //   而且反复调可以无限涨。MAX_QTY 就形同虚设了。
    const cur = exist.qty > 0 ? exist.qty : 0
    let delta = qty
    if (cur + delta > MAX_QTY) delta = MAX_QTY - cur
    if (delta < 0) delta = 0

    await db.collection(MENU).doc(exist._id).update({
      data: {
        qty: _.inc(delta),           // delta 为 0 时是空操作，但仍然要把名字并进去
        byNames: _.addToSet(me),
        updatedAt: Date.now()
      }
    })
  } else {
    await db.collection(MENU).add({
      data: {
        familyCode: fam.code,
        date: date,
        dishId: dishId,
        qty: qty,
        note: clean(p.note, NOTE_MAX),
        byNames: [me],
        addedAt: Date.now(),
        updatedAt: Date.now()
      }
    })
    // ★ 只有「新加一道菜」才提醒别人：加份数不提醒。
    // ★ 必须 await —— 云函数 return 之后容器可能被冻结，
    //   不 await 的请求会静默丢掉（这段最容易被写成 fire-and-forget）。
    // ★ 提醒失败绝不能影响点菜本身，notifyOthers 内部已经全兜住了。
    if (p.notify !== false) {
      const r = await notifyOthers(fam, openid, clean(p.dishName, 20))
      if (r.err) console.warn('[notify] 没发出去：' + r.err + '（sent=' + r.sent + '）')
    }
  }

  await maybeCleanupOld(fam.code)
  return ok({ dishId: dishId, date: date, isNew: !exist })
}

/** 一次加多道（摇一摇的「三菜一汤」用） */
async function addMany(openid, p) {
  const ids = Array.isArray(p.dishIds) ? p.dishIds : []
  if (!ids.length) throw new Error('没有要加的菜')
  if (ids.length > 10) throw new Error('一次最多加 10 道')
  // ★ 逐道加的时候关掉单条提醒，最后合并成一条发 ——
  //   摇一摇「全部加入菜单」一次加四道，逐条发就是四条推送，太吵。
  let added = 0
  for (let i = 0; i < ids.length; i++) {
    const r = await addDish(openid, { dishId: ids[i], notify: false })
    if (r && r.data && r.data.isNew) added++
  }
  if (added) {
    const fam = await requireFamily(openid)
    const nr = await notifyOthers(fam, openid, added + ' 道菜')
    if (nr.err) console.warn('[notify] 没发出去：' + nr.err + '（sent=' + nr.sent + '）')
  }
  return ok({ count: ids.length })
}

async function setQty(openid, p) {
  const fam = await requireFamily(openid)
  const dishId = clean(p.dishId, 40)
  const date = menuDayStr()
  let qty = parseInt(p.qty, 10)
  if (isNaN(qty)) throw new Error('份数不合法')

  const exist = await findDish(fam.code, date, dishId)
  if (!exist) {
    if (qty <= 0) return ok(null)
    return addDish(openid, { dishId: dishId, qty: qty })
  }

  if (qty <= 0) {
    await db.collection(MENU).doc(exist._id).remove()
  } else {
    if (qty > MAX_QTY) qty = MAX_QTY
    await db.collection(MENU).doc(exist._id).update({
      data: { qty: qty, updatedAt: Date.now() }
    })
  }
  return ok(null)
}

async function setNote(openid, p) {
  const fam = await requireFamily(openid)
  const dishId = clean(p.dishId, 40)
  const exist = await findDish(fam.code, menuDayStr(), dishId)
  if (!exist) throw new Error('这道菜不在菜单里')
  await db.collection(MENU).doc(exist._id).update({
    data: { note: clean(p.note, NOTE_MAX), updatedAt: Date.now() }
  })
  return ok(null)
}

async function clearMenu(openid) {
  const fam = await requireFamily(openid)
  await db.collection(MENU).where({
    familyCode: fam.code,
    // ★ 清的是「当前这一份菜单」。过了 22:30 这一份已经翻到明天，
    //   这时清空 = 把明天那份清掉，今天的老数据本来就已作废。
    date: menuDayStr()
  }).remove()
  return ok(null)
}

/**
 * 拉一份今天的菜单。
 * watch 是主通道（实时推送），但 watch 依赖集合读权限 + 连接可用，
 * 万一 watch 建不起来（后台权限没配好、开发者工具偶发断连），
 * 前端会退化成轮询这个接口，所以必须有它兜底。
 */
async function listMenu(openid) {
  const fam = await requireFamily(openid)
  const date = menuDayStr()
  const r = await db.collection(MENU)
    .where({ familyCode: fam.code, date: date })
    .orderBy('addedAt', 'asc')
    .limit(100)
    .get()
  return ok({ date: date, list: r.data.map(publicMenuDoc) })
}

/* ---------------- 用户自建菜 ---------------- */

/**
 * 把一批 cloud:// 文件 ID 换成带签名的 https 临时链接，返回 { fileID: 链接 }。
 *
 * ── 为什么必须由云函数来做这件事 ──
 * 云存储有自己的一套权限。如果是「仅创建者及管理员可读写」，**客户端直接读别人的图
 * 会报 STORAGE_EXCEED_AUTHORITY** —— 结果就是家人之间互相看不到对方上传的菜图。
 * 而免费版云开发环境**改不了这个权限**（控制台会拦，提示升级付费版）。
 * 云函数是管理员身份，安全规则只约束客户端、管不着他，所以这里换出来的链接是能用的。
 *
 * ── 三条注意 ──
 *   1. 换到的链接**默认 1 天过期**，所以它只随本次响应发下去给客户端「显示」用，
 *      **绝不写进数据库**。客户端那边也只存在内存里（见 data/dishes.js 的 TEMP_URL）。
 *   2. 换不到就不进映射（客户端会退回原始 cloud://，表现是「这张图暂时看不到」），
 *      **绝不抛错** —— 菜名分类这些文字信息比一张图重要得多，
 *      不能因为换图失败就让整个菜库打不开。
 *   3. 同一个 fileID 只问一次（家人可能好几道菜共用一张图）。
 */
async function signImages(fileIDs) {
  const map = {}
  const uniq = []
  for (let i = 0; i < fileIDs.length; i++) {
    const f = fileIDs[i]
    if (typeof f === 'string' && f.indexOf('cloud://') === 0 && uniq.indexOf(f) < 0) uniq.push(f)
  }
  for (let s = 0; s < uniq.length; s += SIGN_BATCH) {
    try {
      const r = await cloud.getTempFileURL({ fileList: uniq.slice(s, s + SIGN_BATCH) })
      const got = (r && r.fileList) || []
      for (let i = 0; i < got.length; i++) {
        const x = got[i]
        // status 为 0 才是真换到了；失败的那条 errMsg 各异，一律跳过
        if (x && x.status === 0 && x.tempFileURL) map[x.fileID] = x.tempFileURL
      }
    } catch (e) {
      // 整批失败也只当没换成，继续下一批
    }
  }
  return map
}

/**
 * 列出本房间的菜库：自己加的菜 + 房主对内置菜的改动。
 * ★ 只按 familyCode 过滤 —— 别的家的菜一道都不能漏出来。
 * ★ 两种记录放在同一个集合里，靠 builtin 标记拆开。一次拉回来在内存里分，
 *   比查两次少一个来回；数量上限就是两个上限之和，够用。
 * ★ temp 是「图片临时链接映射」，只给客户端显示用，别写进任何记录（会过期）。
 */
async function listDishes(openid) {
  const fam = await requireFamily(openid)
  const r = await db.collection(DISH)
    .where({ familyCode: fam.code })
    .orderBy('createdAt', 'asc')
    .limit(MAX_DISHES + MAX_OVERRIDES)
    .get()
  const list = []
  const overrides = {}
  for (let i = 0; i < r.data.length; i++) {
    const d = r.data[i]
    if (d.builtin === true) overrides[d.dishId] = publicOverride(d)
    else list.push(publicDish(d, openid))
  }
  // 两种记录里的图都要换：房主给内置菜换的图同样可能是别人传的
  const images = list.map(function (d) { return d.image })
  for (const k in overrides) images.push(overrides[k].image)
  const temp = await signImages(images)
  return ok({ list: list, overrides: overrides, temp: temp })
}

async function findDishDoc(familyCode, dishId) {
  const r = await db.collection(DISH).where({
    familyCode: familyCode,
    dishId: dishId
  }).limit(1).get()
  return r.data[0] || null
}

/** 校验分类，非法就回落到一个合法的 */
function safeCat(v, fallback) {
  const c = clean(v, 10)
  return DISH_CATS.indexOf(c) >= 0 ? c : fallback
}

/**
 * 新增一道菜。
 * dishId 由客户端生成后带过来 —— 因为传图时要用它命名云存储文件，
 * 顺序上「先有 id 才能上传」。所以这里**必须当成不可信输入**校验形状，
 * 不合格就地重造一个，绝不能让客户端塞任意字符串当 id。
 */
async function createDish(openid, p) {
  const fam = await requireFamily(openid)
  const name = clean(p.name, DISH_NAME_MAX)
  if (!name) throw new Error('给这道菜起个名字')

  let dishId = clean(p.id, 40)
  if (!CUSTOM_ID.test(dishId)) {
    dishId = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  }

  const exist = await findDishDoc(fam.code, dishId)
  if (exist) throw new Error('这道菜已经加过了')

  // ★ 计数必须排除房主对内置菜的改动记录 —— 它们和自建菜存在同一个集合里。
  //   不排除的话，房主改一道内置菜就白占掉一个「自己加菜」的名额：
  //   改满 100 道之后，这个家连一道自己的菜都加不了了。
  //   neq 语义和 MongoDB 的 $ne 一样，**字段不存在**也算「不等于 true」，
  //   所以更早版本留下的、没有 builtin 字段的自建菜照样数得到。
  const cnt = await db.collection(DISH)
    .where({ familyCode: fam.code, builtin: _.neq(true) })
    .count()
  if (cnt.total >= MAX_DISHES) {
    throw new Error('一个家最多加 ' + MAX_DISHES + ' 道自己的菜')
  }

  const nicks = fam.nicknames || {}
  const doc = {
    familyCode: fam.code,
    dishId: dishId,
    name: name,
    cat: safeCat(p.cat, 'meat'),
    main: clean(p.main, DISH_MAIN_MAX),
    tips: clean(p.tips, DISH_TIPS_MAX),
    image: clean(p.image, DISH_IMAGE_MAX),
    creator: openid,
    creatorName: nicks[openid] || '家人',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  await db.collection(DISH).add({ data: doc })
  return ok({ dish: publicDish(doc, openid) })
}

/**
 * 改一道菜。
 * ★ 「只有创建者能改」必须在服务端判定。客户端那个「不是自己加的不显示编辑按钮」
 *   只是界面上的方便，改一行 wxml 就绕过去了。
 */
async function updateDish(openid, p) {
  const fam = await requireFamily(openid)
  const dishId = clean(p.id, 40)
  if (!dishId) throw new Error('这道菜已经不在了')

  const doc = await findDishDoc(fam.code, dishId)
  if (!doc) throw new Error('这道菜已经不在了')
  if (doc.creator !== openid) throw new Error('NOT_MINE')

  const name = clean(p.name, DISH_NAME_MAX)
  if (!name) throw new Error('给这道菜起个名字')

  const data = {
    name: name,
    cat: safeCat(p.cat, doc.cat),
    main: clean(p.main, DISH_MAIN_MAX),
    tips: clean(p.tips, DISH_TIPS_MAX),
    updatedAt: Date.now()
  }
  // ★ 图片只在带了新图时才覆盖。编辑文字时没重选图片，客户端传的就是空串；
  //   若无脑覆盖，改一次菜名顺手就把照片弄没了。
  const image = clean(p.image, DISH_IMAGE_MAX)
  if (image) data.image = image

  await db.collection(DISH).doc(doc._id).update({ data: data })
  const fresh = await db.collection(DISH).doc(doc._id).get()
  return ok({ dish: publicDish(fresh.data, openid) })
}

/**
 * 删一道菜。只有创建者能删。
 *
 * ★ 顺序：先摘菜单 → 再删云存储的图 → 最后删菜本身。
 *   和「解散房间」同一个道理：菜记录是找那批菜单条目的**唯一线索**
 *   （菜单里只存 dishId）。先删菜的话，万一摘菜单失败，那些条目就变成
 *   指向一道已经不存在的菜的孤儿记录 —— 客户端会把它们当脏数据静默过滤掉，
 *   谁也看不见，也就永远没人去清。
 */
async function deleteDish(openid, p) {
  const fam = await requireFamily(openid)
  const dishId = clean(p.id, 40)
  if (!dishId) return ok(null)

  const doc = await findDishDoc(fam.code, dishId)
  if (!doc) return ok(null)                 // 已经没了：幂等，网络重试安全
  if (doc.creator !== openid) throw new Error('NOT_MINE')

  await db.collection(MENU).where({
    familyCode: fam.code,
    dishId: dishId
  }).remove()

  if (doc.image && String(doc.image).indexOf('cloud://') === 0) {
    try {
      await cloud.deleteFile({ fileList: [doc.image] })
    } catch (e) {
      // 图删不掉不能拦住删菜：留下一个没人引用的文件，比让用户删不掉菜好得多
    }
  }

  await db.collection(DISH).doc(doc._id).remove()
  return ok(null)
}

/* ---------------- 房主对内置菜的改动 ---------------- */

/*
 * 内置的 80 道菜写死在 data/dishes.js 里，图片也打在小程序包里 ——
 * **物理上删不掉**，也没法只删掉某一家看到的那一份。所以这里只做两件事：
 *   改：记一条改动（名字 / 主料 / 要点 / 分类 / 换图）
 *   删：记一条「藏起来」，对全家人都不出现，房主随时能恢复
 *
 * ★ 权限一律在服务端判：`fam.owner !== openid` 直接 NOT_OWNER。
 *   客户端那个「是房主才显示编辑 / 删除按钮」只是界面上的方便，
 *   改一行 wxml 就能让按钮出现，真正拦得住的地方只有这里。
 */

/** 同一个家最多能有多少条内置菜改动（内部用，省得三处重复写） */
async function countOverrides(familyCode) {
  const c = await db.collection(DISH).where({ familyCode: familyCode, builtin: true }).count()
  return c.total
}

/**
 * 改一道内置菜（房主专属）。
 *
 * ★ 和 createDish / updateDish 是两条路，不能合并：
 *   那两个只认自建菜（id 形状不合格会**就地重造成一个新 id**），
 *   拿内置菜的 id 去调会被重造成一条全新的自建菜 —— 于是「改红烧肉」
 *   变成「菜库里多出一道 uxxxxx 的红烧肉」，而原来那道一动没动。
 */
async function updateBuiltin(openid, p) {
  const fam = await requireFamily(openid)
  if (fam.owner !== openid) throw new Error('NOT_OWNER')

  const dishId = clean(p.id, 40)
  if (!isBuiltinId(dishId)) throw new Error('这道菜改不了')

  const name = clean(p.name, DISH_NAME_MAX)
  if (!name) throw new Error('给这道菜起个名字')

  const data = {
    name: name,
    cat: safeCat(p.cat, 'meat'),
    main: clean(p.main, DISH_MAIN_MAX),
    tips: clean(p.tips, DISH_TIPS_MAX),
    updatedAt: Date.now()
  }
  // ★ 图片只在带了新图时才覆盖。编辑文字时没重选图片，客户端传的就是空串；
  //   无脑覆盖的话，改一次菜名顺手就把房主之前换的那张图弄丢了。
  const image = clean(p.image, DISH_IMAGE_MAX)
  if (image) data.image = image

  const doc = await findDishDoc(fam.code, dishId)
  if (doc) {
    // 顺手把 builtin 标上：万一这条记录是更早的版本留下的，现在补齐。
    // ★ 不碰 hidden —— 改一道已经藏起来的菜不该顺手把它放出来。
    data.builtin = true
    await db.collection(DISH).doc(doc._id).update({ data: data })
    return ok(null)
  }

  if (await countOverrides(fam.code) >= MAX_OVERRIDES) {
    throw new Error('改过的内置菜太多了')
  }

  const nicks = fam.nicknames || {}
  data.familyCode = fam.code
  data.dishId = dishId
  data.builtin = true
  data.hidden = false          // 能点开编辑就说明它当前是可见的
  data.creator = openid
  data.creatorName = nicks[openid] || '房主'
  data.createdAt = Date.now()
  await db.collection(DISH).add({ data: data })
  return ok(null)
}

/**
 * 把一道内置菜从全家的菜库里藏起来（房主专属）。
 *
 * ★ 顺序：先摘菜单 → 再写隐藏记录。
 *   隐藏记录是找那批菜单条目的**唯一线索**（菜单里只存 dishId），
 *   和「删自建菜」同一个道理：顺序反了的话，万一摘菜单失败，那些条目就变成
 *   指向一道「已经看不见的菜」的孤儿记录 —— 客户端会把它们当脏数据静默过滤掉，
 *   谁也看不见，也就永远没人去清。
 */
async function hideBuiltin(openid, p) {
  const fam = await requireFamily(openid)
  if (fam.owner !== openid) throw new Error('NOT_OWNER')

  const dishId = clean(p.id, 40)
  if (!isBuiltinId(dishId)) throw new Error('这道菜删不了')

  await db.collection(MENU).where({
    familyCode: fam.code,
    dishId: dishId
  }).remove()

  const doc = await findDishDoc(fam.code, dishId)
  if (doc) {
    // 房主之前改过的名字 / 换过的图都留着 —— 万一恢复回来，
    // 看到的还是他改过的那个样子，而不是又变回出厂设置。
    await db.collection(DISH).doc(doc._id).update({
      data: { builtin: true, hidden: true, updatedAt: Date.now() }
    })
    return ok(null)
  }

  if (await countOverrides(fam.code) >= MAX_OVERRIDES) {
    throw new Error('改过的内置菜太多了')
  }

  const nicks = fam.nicknames || {}
  await db.collection(DISH).add({
    data: {
      familyCode: fam.code,
      dishId: dishId,
      builtin: true,
      hidden: true,
      creator: openid,
      creatorName: nicks[openid] || '房主',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  })
  return ok(null)
}

/**
 * 把一道被藏起来的内置菜恢复成出厂的样子（房主专属）。
 *
 * ★ 整条改动记录一起删掉，不是只把 hidden 关掉 —— 按钮上写的是「恢复」，
 *   那就要连房主改过的名字 / 换过的图一起回到原样，否则会出现
 *   「恢复了但名字还是我改的那个」这种谁也说不清的状态。
 * ★ 幂等：没藏过、或者已经恢复过了，都当成功 —— 网络重试是安全的。
 * ★ 恢复之后这道菜**不会**自动回到今天的菜单（藏起来时已经摘掉了），
 *   要吃就再点一次，不会让一道菜凭空出现在菜单里。
 */
async function restoreBuiltin(openid, p) {
  const fam = await requireFamily(openid)
  if (fam.owner !== openid) throw new Error('NOT_OWNER')

  const dishId = clean(p.id, 40)
  if (!dishId) return ok(null)

  const doc = await findDishDoc(fam.code, dishId)
  if (!doc || doc.builtin !== true) return ok(null)

  // 房主给这道菜换过图的话，那张图现在没人引用了，顺手删掉。
  // 删不掉不能拦住恢复：留一个没人引用的文件，比让房主恢复不了好得多。
  if (doc.image && String(doc.image).indexOf('cloud://') === 0) {
    try {
      await cloud.deleteFile({ fileList: [doc.image] })
    } catch (e) {
      // 忽略
    }
  }

  await db.collection(DISH).doc(doc._id).remove()
  return ok(null)
}

/* ---------------- 入口 ---------------- */

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = (event && event.action) || ''
  const p = (event && event.payload) || {}

  if (!openid) return err('拿不到用户身份，请重进小程序')

  try {
    switch (action) {
      case 'createFamily': return await createFamily(openid, p)
      case 'joinFamily': return await joinFamily(openid, p)
      case 'peekFamily': return await peekFamily(openid, p)
      case 'leaveFamily': return await leaveFamily(openid)
      case 'dissolveFamily': return await dissolveFamily(openid)
      case 'renameSelf': return await renameSelf(openid, p)
      case 'myFamily': {
        const fam = await findMyFamily(openid)
        return ok(fam ? publicFamily(fam, openid) : null)
      }
      case 'addDish': return await addDish(openid, p)
      case 'addMany': return await addMany(openid, p)
      case 'setQty': return await setQty(openid, p)
      case 'setNote': return await setNote(openid, p)
      case 'clearMenu': return await clearMenu(openid)
      case 'listMenu': return await listMenu(openid)
      case 'listDishes': return await listDishes(openid)
      case 'createDish': return await createDish(openid, p)
      case 'updateDish': return await updateDish(openid, p)
      case 'deleteDish': return await deleteDish(openid, p)
      // 房主对内置 80 道菜的改动（服务端判房主）
      case 'updateBuiltin': return await updateBuiltin(openid, p)
      case 'hideBuiltin': return await hideBuiltin(openid, p)
      case 'restoreBuiltin': return await restoreBuiltin(openid, p)
      default:
        return err('未知操作: ' + action)
    }
  } catch (e) {
    return err((e && e.message) || String(e))
  }
}

/*
 * 给离线单测直接断言日期算法用（cloud-test.js 会 require 本文件）。
 * ★ 只挂在这里，不参与 main 的分发，线上行为完全不受影响。
 */
exports._test = {
  todayStr: todayStr,
  menuDayStr: menuDayStr,
  daysAgoStr: daysAgoStr,
  MENU_CUTOFF_H: MENU_CUTOFF_H
}
