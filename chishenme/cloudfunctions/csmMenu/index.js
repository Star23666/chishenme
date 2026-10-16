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
 *
 * ── 为什么 byNames 存「称呼」而不是 openid ──
 *   客户端 watch 到的只有这一个集合，拿不到 nicknames 映射表。
 *   若存 openid，前端还得再 watch 一次家庭集合才能显示人名，连接数翻倍。
 *   代价：改称呼不会回溯修正已经点过的记录（家里场景可以接受）。
 *
 * ★ 时区坑：云函数默认跑在 UTC。晚上 8 点以后，UTC 和东八区不是同一天，
 *   如果直接用 new Date() 算「今天」，北京时间晚上点完菜会存成「明天」。
 *   所以下面严格用 UTC+8 自己算日期。
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const FAM = 'csm_families'
const MENU = 'csm_menus'

const MAX_MEMBERS = 15
const MAX_QTY = 99
const NICK_MAX = 8
const NAME_MAX = 12
const NOTE_MAX = 20

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

async function renameSelf(openid, p) {
  const fam = await requireFamily(openid)
  const nickname = clean(p.nickname, NICK_MAX)
  if (!nickname) throw new Error('称呼不能为空')
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

async function addDish(openid, p) {
  const fam = await requireFamily(openid)
  const dishId = clean(p.dishId, 40)
  if (!dishId) throw new Error('菜名不对')

  const date = todayStr()
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
  }

  await maybeCleanupOld(fam.code)
  return ok({ dishId: dishId, date: date })
}

/** 一次加多道（摇一摇的「三菜一汤」用） */
async function addMany(openid, p) {
  const ids = Array.isArray(p.dishIds) ? p.dishIds : []
  if (!ids.length) throw new Error('没有要加的菜')
  if (ids.length > 10) throw new Error('一次最多加 10 道')
  for (let i = 0; i < ids.length; i++) {
    await addDish(openid, { dishId: ids[i] })
  }
  return ok({ count: ids.length })
}

async function setQty(openid, p) {
  const fam = await requireFamily(openid)
  const dishId = clean(p.dishId, 40)
  const date = todayStr()
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
  const exist = await findDish(fam.code, todayStr(), dishId)
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
    date: todayStr()
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
  const date = todayStr()
  const r = await db.collection(MENU)
    .where({ familyCode: fam.code, date: date })
    .orderBy('addedAt', 'asc')
    .limit(100)
    .get()
  return ok({ date: date, list: r.data.map(publicMenuDoc) })
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
      default:
        return err('未知操作: ' + action)
    }
  } catch (e) {
    return err((e && e.message) || String(e))
  }
}
