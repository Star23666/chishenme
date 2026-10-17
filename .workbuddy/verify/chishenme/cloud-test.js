/**
 * 今天吃啥 · 云函数离线测试
 *
 * 云函数里跑着这个项目**唯一可信的那部分逻辑**（谁在哪个房间、能不能点、
 * 份数怎么算、房间码会不会撞车）。它偏偏是平时最难验证的：
 * 要连真实云环境、要真机、要多个微信号。
 *
 * 做法：用 Module._load 拦截 `require('wx-server-sdk')`，塞一个内存假数据库进去，
 * 然后 require 真实的 cloudfunctions/csmMenu/index.js。
 * 跑的是生产代码，一行都没改；只是把数据库换成了内存里的数组。
 *
 * 运行： node .workbuddy/verify/chishenme/cloud-test.js
 */

var path = require('path')
var fs = require('fs')
var Module = require('module')

var ROOT = path.resolve(__dirname, '..', '..', '..')
var CF_DIR = path.join(ROOT, 'chishenme', 'cloudfunctions', 'csmMenu')

/* ============================================================
 * 一、内存假数据库
 * ============================================================ */

var store = {}
var idSeq = 0
/* 云存储假 SDK 记录「哪些文件被删了」，用来验证删菜会把图一起清掉 */
var deletedFiles = []
/* getTempFileURL 的假账本：
   - tempCalls 记下每次问到的 fileList（验「只问 cloud://」「同一个只问一次」）
   - tempFail 里的 fileID 会被模拟成换不到（验「换不到不能拖垮主流程」） */
var tempCalls = []
var tempFail = {}

/* 订阅消息的假账本：
   - subCalls 记下每次真的发出去了什么（发给谁、哪个模板、填了哪些字段）
   - subFail 里的人会被模拟成「没授权 / 一次性订阅用完了」
     ★ 真实世界里这是**最常见的失败**，而且失败是静默的：
       点菜的人毫无感觉，收不到的人也不知道。所以要能造出来。 */
var subCalls = []
var subFail = {}

function resetStore() {
  for (var k in store) delete store[k]
  idSeq = 0
  deletedFiles = []
  tempCalls = []
  tempFail = {}
  subCalls = []
  subFail = {}
}

function col(name) {
  if (!store[name]) store[name] = []
  return store[name]
}

function newId() {
  idSeq++
  return 'doc_' + idSeq
}

/* ---------- 取值 / 赋值（支持 'a.b' 这种点号路径） ---------- */

function getPath(obj, key) {
  var parts = String(key).split('.')
  var cur = obj
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[parts[i]]
  }
  return cur
}

function setPath(obj, key, val) {
  var parts = String(key).split('.')
  var cur = obj
  for (var i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined || cur[parts[i]] === null) cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  cur[parts[parts.length - 1]] = val
}

/* ---------- 数据库指令（模拟 db.command） ---------- */

var command = {
  all: function (arr) { return { __op: 'all', v: arr } },
  lt: function (v) { return { __op: 'lt', v: v } },
  neq: function (v) { return { __op: 'neq', v: v } },
  inc: function (n) { return { __op: 'inc', v: n } },
  addToSet: function (v) { return { __op: 'addToSet', v: v } },
  pull: function (v) { return { __op: 'pull', v: v } }
}

/* ---------- 条件匹配 ---------- */

function matchDoc(doc, cond) {
  for (var k in cond) {
    if (!Object.prototype.hasOwnProperty.call(cond, k)) continue
    var want = cond[k]
    var got = getPath(doc, k)

    if (want && want.__op) {
      if (want.__op === 'all') {
        if (!Array.isArray(got)) return false
        for (var i = 0; i < want.v.length; i++) {
          if (got.indexOf(want.v[i]) < 0) return false
        }
      } else if (want.__op === 'lt') {
        if (!(got < want.v)) return false
      } else if (want.__op === 'neq') {
        // ★ 语义必须和真实云开发（MongoDB 的 $ne）一致：**字段不存在**也算
        //   「不等于」。createDish 数「自己加了几道菜」时要靠这条把更早版本
        //   留下的、没有 builtin 字段的自建菜一起数进去。
        //   照「字段必须存在」实现的话，测试会比线上宽松，等于白测。
        if (got === want.v) return false
      } else {
        // 把比较指令用在 where 里不是合法用法，直接不匹配
        return false
      }
    } else if (got !== want) {
      return false
    }
  }
  return true
}

/* ---------- 更新 ---------- */

function applyUpdate(doc, patch) {
  for (var k in patch) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue
    var v = patch[k]
    if (v && v.__op) {
      var cur = getPath(doc, k)
      if (v.__op === 'inc') {
        var n = typeof cur === 'number' ? cur : 0
        setPath(doc, k, n + v.v)
      } else if (v.__op === 'addToSet') {
        var arr = Array.isArray(cur) ? cur.slice() : []
        if (arr.indexOf(v.v) < 0) arr.push(v.v)
        setPath(doc, k, arr)
      } else if (v.__op === 'pull') {
        var a2 = Array.isArray(cur) ? cur.slice() : []
        var idx = a2.indexOf(v.v)
        if (idx >= 0) a2.splice(idx, 1)
        setPath(doc, k, a2)
      } else {
        setPath(doc, k, v)
      }
    } else {
      setPath(doc, k, v)
    }
  }
}

/* ---------- 查询 / 文档引用 ---------- */

function makeQuery(name, cond) {
  var q = {
    _limit: 0,
    _order: null,
    where: function (c) { return makeQuery(name, c) },
    limit: function (n) { q._limit = n; return q },
    orderBy: function (field, dir) { q._order = { field: field, dir: dir }; return q },
    get: function () {
      var rows = col(name).filter(function (d) { return matchDoc(d, cond) })
      if (q._order) {
        var f = q._order.field
        var sign = q._order.dir === 'desc' ? -1 : 1
        rows = rows.slice().sort(function (a, b) {
          var x = getPath(a, f), y = getPath(b, f)
          if (x === y) return 0
          return (x < y ? -1 : 1) * sign
        })
      }
      if (q._limit) rows = rows.slice(0, q._limit)
      return Promise.resolve({ data: rows.map(clone) })
    },
    count: function () {
      var n = col(name).filter(function (d) { return matchDoc(d, cond) }).length
      return Promise.resolve({ total: n })
    },
    remove: function () {
      var arr = col(name)
      var keep = []
      var removed = 0
      for (var i = 0; i < arr.length; i++) {
        if (matchDoc(arr[i], cond)) removed++
        else keep.push(arr[i])
      }
      store[name] = keep
      return Promise.resolve({ stats: { removed: removed } })
    }
  }
  return q
}

function makeDoc(name, id) {
  return {
    get: function () {
      var found = col(name).filter(function (d) { return d._id === id })[0]
      if (!found) return Promise.reject(new Error('document does not exist'))
      return Promise.resolve({ data: clone(found) })
    },
    update: function (opt) {
      var found = col(name).filter(function (d) { return d._id === id })[0]
      if (!found) return Promise.reject(new Error('document does not exist'))
      applyUpdate(found, (opt && opt.data) || {})
      return Promise.resolve({ stats: { updated: 1 } })
    },
    remove: function () {
      store[name] = col(name).filter(function (d) { return d._id !== id })
      return Promise.resolve({ stats: { removed: 1 } })
    }
  }
}

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

/* ---------- 假的 wx-server-sdk ---------- */

var currentOpenid = 'user_default'

function makeSdk() {
  function database() {
    return {
      command: command,
      collection: function (name) {
        return {
          where: function (cond) { return makeQuery(name, cond) },
          doc: function (id) { return makeDoc(name, id) },
          add: function (opt) {
            var doc = clone((opt && opt.data) || {})
            doc._id = newId()
            col(name).push(doc)
            return Promise.resolve({ _id: doc._id })
          },
          get: function () { return makeQuery(name, {}).get() },
          count: function () { return makeQuery(name, {}).count() }
        }
      }
    }
  }

  return {
    DYNAMIC_CURRENT_ENV: '__DYNAMIC_CURRENT_ENV__',
    init: function () {},
    database: database,
    getWXContext: function () { return { OPENID: currentOpenid, APPID: 'wxtest' } },
    /**
     * 订阅消息的假实现。
     * ★ 记下每次发送的完整参数（发给谁 / 模板 / 字段 / 落地页），
     *   这样「不给自己发」「加份数不发」「一次加多道只发一条」
     *   这些规则才有办法被断言，不然它们错了也没人知道。
     */
    openapi: {
      subscribeMessage: {
        send: function (opt) {
          subCalls.push({
            touser: opt.touser,
            templateId: opt.templateId,
            data: opt.data,
            page: opt.page
          })
          if (subFail[opt.touser]) {
            return Promise.reject({ errCode: 43101, errMsg: 'user refuse to accept the msg' })
          }
          return Promise.resolve({ errCode: 0 })
        }
      }
    },
    // 云存储：只实现删文件（删菜时要顺手把菜图清掉）
    deleteFile: function (opt) {
      var list = (opt && opt.fileList) || []
      for (var i = 0; i < list.length; i++) deletedFiles.push(list[i])
      return Promise.resolve({
        fileList: list.map(function (f) { return { fileID: f, status: 0 } })
      })
    },
    /**
     * 换临时链接的假实现。
     * ★ 真实接口一次最多 50 个 —— 这里必须**照着卡**，不然「分批换」那段逻辑
     *   等于没测（真到 60 张图的时候才会炸，而且是在线上炸）。
     */
    getTempFileURL: function (opt) {
      var list = ((opt && opt.fileList) || []).slice()
      if (list.length > 50) {
        return Promise.reject(new Error('fileList 一次最多 50 个'))
      }
      tempCalls.push(list.slice())
      return Promise.resolve({
        fileList: list.map(function (f) {
          if (tempFail[f]) {
            return { fileID: f, tempFileURL: '', status: 1, errMsg: 'STORAGE_EXCEED_AUTHORITY' }
          }
          return {
            fileID: f,
            tempFileURL: 'https://fake.tcb.example.com/' + String(f).split('/').pop() + '?sign=ok',
            status: 0,
            errMsg: 'ok'
          }
        })
      })
    }
  }
}

var sdk = makeSdk()

/* 拦截 require('wx-server-sdk')，把假货塞进去 */
var origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return sdk
  return origLoad.apply(this, arguments)
}

/* 现在 require 真实云函数 */
var cf = require(path.join(CF_DIR, 'index.js'))

/** 以某个用户身份调云函数 */
function call(openid, action, payload) {
  currentOpenid = openid
  return cf.main({ action: action, payload: payload || {} })
}

/* ============================================================
 * 二、断言机
 * ============================================================ */

var pass = 0
var fail = 0
var failures = []
var section = ''

function S(t) { section = t; console.log('\n' + t) }

function ok(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  \u2713 ' + name)
  } else {
    fail++
    failures.push(section + ' \u203a ' + name + (extra ? '  [' + extra + ']' : ''))
    console.log('  \u2717 ' + name + (extra ? '  [' + extra + ']' : ''))
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, '期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
}

/* 冻结时间的小工具 */
var REAL_NOW = Date.now
function freeze(iso) {
  var t = Date.parse(iso)
  Date.now = function () { return t }
}
function unfreeze() {
  Date.now = REAL_NOW
}

/* ============================================================
 * 三、测试
 * ============================================================ */

async function run() {

  /* ---------- 负向对照：证明这套断言不是「永远绿」 ---------- */
  S('0. 负向对照（证明测试机真的会失败）')
  {
    var p0 = pass, f0 = fail
    ok('[故意失败] 1 === 2', 1 === 2)
    var detected = (fail === f0 + 1 && pass === p0)
    // 把这条故意的失败撤掉，不计入总数
    fail = f0
    failures.pop()
    ok('故意写错的断言会被计入失败（说明不是假测试）', detected)
  }

  /* ---------- A. 时区：云函数跑在 UTC ---------- */
  S('A. 时区：晚上点的菜不能算成明天')
  {
    resetStore()

    // 北京时间 2026-10-16 01:00 = UTC 2026-10-15 17:00
    // 如果云函数用本地时区算日期，这里会存成 2026-10-15（差一天）
    freeze('2026-10-15T17:00:00Z')
    await call('u_a', 'createFamily', { name: '甲家', nickname: '爸爸' })
    await call('u_a', 'addDish', { dishId: 'hongshaorou' })
    var menuDocs = col('csm_menus')
    eq('北京时间凌晨 1 点下的单，日期是北京的今天', menuDocs[0].date, '2026-10-16')

    // 北京时间 2026-10-15 23:00 = UTC 2026-10-15 15:00（两边同一天，不该出错）
    // ★ 但 23:00 已经过了 22:30 的翻篇点 —— 所以这一单算「明天（10-16）那份菜单」。
    //   这是 v1.6.2 起的行为（菜单每天 22:30 翻篇），不是时区算错。
    resetStore()
    freeze('2026-10-15T15:00:00Z')
    await call('u_b', 'createFamily', { name: '乙家', nickname: '妈妈' })
    await call('u_b', 'addDish', { dishId: 'fanqiechaodan' })
    eq('北京时间 23:00 下的单（已过 22:30）算明天那份', col('csm_menus')[0].date, '2026-10-16')

    // 北京 2026-10-16 07:59 = UTC 2026-10-15 23:59，仍然差一天
    resetStore()
    freeze('2026-10-15T23:59:00Z')
    await call('u_c', 'createFamily', { name: '丙家', nickname: '孩子' })
    await call('u_c', 'addDish', { dishId: 'danchaofan' })
    eq('北京时间早上 7:59 下的单，日期是北京今天', col('csm_menus')[0].date, '2026-10-16')

    unfreeze()
  }

  /* ---------- A2. 菜单日：每天 22:30 翻篇 ---------- */
  S('A2. 菜单日（每天 22:30 翻篇）')
  {
    var T = cf._test
    ok('云函数导出了日期算法（没导出这节就没法测）', !!(T && T.menuDayStr))
    eq('分界点常量是 22.5（= 22:30）', T.MENU_CUTOFF_H, 22.5)

    /* 绝对时刻，跟本机时区无关 */
    var BJ = function (y, m, d, H, M) { return Date.UTC(y, m - 1, d, H - 8, M || 0, 0) }

    eq('北京 22:29 -> 还是今天', T.menuDayStr(BJ(2026, 10, 17, 22, 29)), '2026-10-17')
    eq('★ 北京 22:30 整 -> 翻到明天', T.menuDayStr(BJ(2026, 10, 17, 22, 30)), '2026-10-18')
    eq('北京 23:59 -> 还是明天', T.menuDayStr(BJ(2026, 10, 17, 23, 59)), '2026-10-18')
    eq('次日 00:01 -> 明天', T.menuDayStr(BJ(2026, 10, 18, 0, 1)), '2026-10-18')
    eq('次日 08:00 -> 还是明天', T.menuDayStr(BJ(2026, 10, 18, 8, 0)), '2026-10-18')
    eq('北京 00:00 -> 今天', T.menuDayStr(BJ(2026, 10, 17, 0, 0)), '2026-10-17')
    eq('跨月：10-31 23:00 -> 11-01', T.menuDayStr(BJ(2026, 10, 31, 23, 0)), '2026-11-01')
    eq('跨年：12-31 23:00 -> 次年 01-01', T.menuDayStr(BJ(2026, 12, 31, 23, 0)), '2027-01-01')
    eq('★ 按东八区算（此刻 UTC 还停在 10-16）',
      T.menuDayStr(Date.UTC(2026, 9, 16, 23, 0)), '2026-10-17')

    /* 行为：真调接口，看写进去的 date 和读出来的结果 */
    resetStore()
    freeze(new Date(BJ(2026, 10, 17, 21, 0)).toISOString())
    await call('m1', 'createFamily', { name: '翻篇家', nickname: '甲' })
    await call('m1', 'addDish', { dishId: 'hongshaorou' })
    eq('21:00 点的菜在', (await call('m1', 'listMenu', {})).data.list.length, 1)
    eq('  存进去的日期是 10-17', col('csm_menus')[0].date, '2026-10-17')

    freeze(new Date(BJ(2026, 10, 17, 22, 29)).toISOString())
    eq('22:29 还能看到（就差一分钟）', (await call('m1', 'listMenu', {})).data.list.length, 1)

    freeze(new Date(BJ(2026, 10, 17, 22, 30)).toISOString())
    eq('★ 22:30 整就查不到了 = 菜单被清空', (await call('m1', 'listMenu', {})).data.list.length, 0)

    freeze(new Date(BJ(2026, 10, 17, 22, 35)).toISOString())
    await call('m1', 'addDish', { dishId: 'jiaozi' })
    var after = (await call('m1', 'listMenu', {})).data
    eq('22:35 点的菜落在「明天」那一份', after.date, '2026-10-18')
    eq('  而且当场就能看到（不是沉在库里）', after.list.length, 1)
    // ★ 这一条是「区分力」的关键：只断言「能看到一道菜」不够 ——
    //   日期算法写错时，看到的会是昨天那道（红烧肉）而不是刚点的饺子。
    eq('  看到的正是刚点的饺子，不是昨天那道',
      after.list.map(function (x) { return x.dishId }).join(','), 'jiaozi')

    freeze(new Date(BJ(2026, 10, 18, 8, 0)).toISOString())
    eq('第二天早上打开，昨晚 22:35 点的还在',
      (await call('m1', 'listMenu', {})).data.list[0].dishId, 'jiaozi')

    ok('老那份只是「不再属于当前」，并没有被删掉',
      col('csm_menus').filter(function (d) { return d.date === '2026-10-17' }).length === 1)

    await call('m1', 'clearMenu', {})
    eq('clearMenu 清掉的是当前那一份', (await call('m1', 'listMenu', {})).data.list.length, 0)
    ok('  没动到老那份',
      col('csm_menus').filter(function (d) { return d.date === '2026-10-17' }).length === 1)

    unfreeze()
  }

  /* ---------- B. 房间码 ---------- */
  S('B. 房间码')
  {
    resetStore()
    var codes = {}
    for (var i = 0; i < 12; i++) {
      var r = await call('code_u' + i, 'createFamily', { name: '家' + i, nickname: '我' })
      ok('第 ' + (i + 1) + ' 个房间创建成功', r.ok === true, r.msg)
      codes[r.data.code] = true
    }
    eq('12 个房间码互不相同', Object.keys(codes).length, 12)

    var all = Object.keys(codes)
    var lenOk = all.every(function (c) { return c.length === 6 })
    ok('房间码都是 6 位', lenOk)

    // 去掉 0 O 1 I 就是为了防止「我念给你听你听错」
    var alphabetOk = all.every(function (c) { return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/.test(c) })
    ok('房间码里没有容易看错的 0 O 1 I', alphabetOk)
  }

  /* ---------- C. 家庭成员的增删与幂等 ---------- */
  S('C. 家庭成员')
  {
    resetStore()
    var created = await call('owner1', 'createFamily', { name: '老王家', nickname: '爸爸' })
    var code = created.data.code

    eq('创建者是房主', created.data.isOwner, true)
    eq('创建后成员数 1', created.data.memberCount, 1)
    eq('创建者自己的称呼对', created.data.myName, '爸爸')

    // 幂等：同一个人再建一次，应该返回原来的房间，而不是建第二个
    var again = await call('owner1', 'createFamily', { name: '随便改个名', nickname: '啊' })
    eq('重复 createFamily 是幂等的', again.data.code, code)
    eq('重复创建不会改名', again.data.name, '老王家')

    var joined = await call('member1', 'joinFamily', { code: code, nickname: '妈妈' })
    eq('别人能用房间码加入', joined.ok, true)
    eq('加入后成员数 2', joined.data.memberCount, 2)
    eq('加入者的称呼是自己填的', joined.data.myName, '妈妈')

    // 幂等：同一个人重复加入同一房间
    var join2 = await call('member1', 'joinFamily', { code: code, nickname: '妈妈' })
    eq('重复加入同一房间不报错', join2.ok, true)
    eq('重复加入不会重复计成员', join2.data.memberCount, 2)

    // 一个人不能同时在两个房间
    var other = await call('owner2', 'createFamily', { name: '别家', nickname: '我' })
    var cross = await call('member1', 'joinFamily', { code: other.data.code, nickname: '妈妈' })
    eq('已在 A 房间就不能再加入 B 房间', cross.ok, false)
    ok('提示语说清楚要先退出', /退出/.test(cross.msg || ''), cross.msg)

    // 小写房间码
    var lower = await call('member2', 'joinFamily', { code: code.toLowerCase(), nickname: '孩子' })
    eq('房间码输小写也能进', lower.ok, true)

    // 预览
    var peek = await call('outsider', 'peekFamily', { code: code })
    eq('预览能看到房间名', peek.data.name, '老王家')
    eq('预览能看到人数', peek.data.memberCount, 3)
    eq('预览不会暴露 openid', JSON.stringify(peek.data).indexOf('owner1'), -1)

    // 不存在的房间
    var notFound = await call('outsider', 'peekFamily', { code: 'ZZZZZZ' })
    eq('不存在的房间码报错', notFound.ok, false)

    // 长度不对
    var shortCode = await call('outsider', 'peekFamily', { code: 'ABC' })
    eq('房间码长度不对报错', shortCode.ok, false)
    ok('提示语说明了是 6 位', /6\s*位/.test(shortCode.msg || ''), shortCode.msg)

    // 满员
    var fam = col('csm_families')[0]
    for (var m = 0; m < 12; m++) {
      await call('filler_' + m, 'joinFamily', { code: code, nickname: '家人' + m })
    }
    var famNow = col('csm_families').filter(function (f) { return f._id === fam._id })[0]
    eq('填充后正好 15 人', famNow.members.length, 15)
    var overflow = await call('too_late', 'joinFamily', { code: code, nickname: '多余的人' })
    eq('第 16 个人进不来', overflow.ok, false)
    ok('提示语说明人满了', /满/.test(overflow.msg || ''), overflow.msg)

    // 幽灵成员：members 里有 openid，但 nicknames 里没有
    famNow.members.push('ghost_openid')
    var withGhost = await call('owner1', 'myFamily', {})
    var ghost = withGhost.data.members.filter(function (x) { return x.name === '家人' })[0]
    ok('没有称呼的成员显示为「家人」而不是空白', !!ghost)
    eq('幽灵成员不是房主', ghost ? ghost.isOwner : null, false)

    // 退出
    var leaveOwner = await call('owner1', 'leaveFamily', {})
    eq('房主不能退出（否则房间会变孤儿）', leaveOwner.ok, false)
    ok('提示语说明了原因', /创建者/.test(leaveOwner.msg || ''), leaveOwner.msg)

    var leaveMember = await call('member1', 'leaveFamily', {})
    eq('普通成员可以退出', leaveMember.ok, true)
    var afterLeave = await call('member1', 'myFamily', {})
    eq('退出后就查不到家庭了', afterLeave.data, null)

    var leaveAgain = await call('member1', 'leaveFamily', {})
    eq('没在家庭里时退出也不报错', leaveAgain.ok, true)
  }

  /* ---------- C2. 解散房间：房主专属，且必须连菜单一起清 ---------- */
  S('C2. 解散房间（房主专属）')
  {
    resetStore()
    var created = await call('boss', 'createFamily', { name: '要解散的家', nickname: '爸爸' })
    var code = created.data.code
    await call('guest', 'joinFamily', { code: code, nickname: '妈妈' })
    await call('boss', 'addDish', { dishId: 'hongshaorou' })
    await call('guest', 'addDish', { dishId: 'gongbaojiding' })
    eq('解散前库里有 2 条菜单', col('csm_menus').length, 2)

    // ① 普通成员不能解散 —— 这是服务端挡下来的，不是靠界面藏按钮
    var byGuest = await call('guest', 'dissolveFamily', {})
    eq('普通成员不能解散房间', byGuest.ok, false)
    eq('返回的是 NOT_OWNER（前端据此翻译成人话）', byGuest.msg, 'NOT_OWNER')
    eq('被拒之后房间还在', col('csm_families').length, 1)
    eq('被拒之后菜单一条没少', col('csm_menus').length, 2)
    eq('被拒之后成员也还在房间里', (await call('guest', 'myFamily', {})).data.memberCount, 2)

    // ② 房间外的人点解散：什么也不该发生，但也不算错
    var byOutsider = await call('outsider', 'dissolveFamily', {})
    eq('房间外的人点解散不报错', byOutsider.ok, true)
    eq('房间外的人解散后房间仍在', col('csm_families').length, 1)
    eq('房间外的人解散后菜单仍在', col('csm_menus').length, 2)

    // ③ 房主解散：家庭和菜单一起没
    var byOwner = await call('boss', 'dissolveFamily', {})
    eq('房主能解散房间', byOwner.ok, true)
    eq('解散后家庭记录被删掉', col('csm_families').length, 0)
    eq('解散后菜单一起清干净（不留孤儿数据）', col('csm_menus').length, 0)

    // ④ 解散后每个人都不再属于任何房间（家人是被动退出的）
    eq('房主自己也不在房间里了', (await call('boss', 'myFamily', {})).data, null)
    eq('其他成员也自动退出了', (await call('guest', 'myFamily', {})).data, null)

    // ⑤ 幂等：网络重试再点一次不能炸
    var again = await call('boss', 'dissolveFamily', {})
    eq('重复解散不报错（幂等，网络重试安全）', again.ok, true)

    // ⑥ 原来的房间码彻底查不到
    var peek = await call('boss', 'peekFamily', { code: code })
    eq('解散后原房间码查不到了', peek.ok, false)
    ok('提示语是「没找到这个房间」', /没找到/.test(peek.msg || ''), peek.msg)
  }

  /* ---------- C3. 解散只删自己家，不能误伤别人 ---------- */
  S('C3. 解散的作用范围')
  {
    resetStore()
    var a = await call('a_owner', 'createFamily', { name: 'A 家', nickname: '甲' })
    var b = await call('b_owner', 'createFamily', { name: 'B 家', nickname: '乙' })
    await call('a_owner', 'addDish', { dishId: 'hongshaorou' })
    await call('b_owner', 'addDish', { dishId: 'gongbaojiding' })
    eq('两家各有一条菜单', col('csm_menus').length, 2)

    await call('a_owner', 'dissolveFamily', {})

    eq('解散 A 家后，B 家的菜单还在', col('csm_menus').length, 1)
    eq('留下来的那条确实是 B 家的', col('csm_menus')[0].familyCode, b.data.code)
    eq('B 家的房间也还在', col('csm_families').length, 1)
    eq('B 家房主仍然能正常拿到自己的家庭', (await call('b_owner', 'myFamily', {})).data.name, 'B 家')
    eq('A 家房主已经查不到家庭了', (await call('a_owner', 'myFamily', {})).data, null)
  }

  /* ---------- D. 没加入家庭不能点菜 ---------- */
  S('D. 权限：没进房间不能点菜')
  {
    resetStore()
    var r1 = await call('nobody', 'addDish', { dishId: 'hongshaorou' })
    eq('没加入家庭时加菜被拒绝', r1.ok, false)
    eq('拒绝原因是 NO_FAMILY', r1.msg, 'NO_FAMILY')

    var r2 = await call('nobody', 'setQty', { dishId: 'hongshaorou', qty: 3 })
    eq('没加入家庭时改份数被拒绝', r2.ok, false)

    var r3 = await call('nobody', 'setNote', { dishId: 'hongshaorou', note: '辣' })
    eq('没加入家庭时改备注被拒绝', r3.ok, false)

    var r4 = await call('nobody', 'clearMenu', {})
    eq('没加入家庭时清空被拒绝', r4.ok, false)

    var r5 = await call('nobody', 'listMenu', {})
    eq('没加入家庭时拉菜单被拒绝', r5.ok, false)
  }

  /* ---------- E. 加菜 / 份数 ---------- */
  S('E. 加菜与份数')
  {
    resetStore()
    await call('a1', 'createFamily', { name: '测试家', nickname: '甲' })
    await call('a2', 'joinFamily', { code: col('csm_families')[0].code, nickname: '乙' })

    var r = await call('a1', 'addDish', { dishId: 'hongshaorou' })
    eq('加菜成功', r.ok, true)
    var docs = col('csm_menus')
    eq('菜单里有 1 条记录', docs.length, 1)
    eq('份数是 1', docs[0].qty, 1)
    eq('记录了是谁点的', JSON.stringify(docs[0].byNames), JSON.stringify(['甲']))
    eq('写上了房间码', docs[0].familyCode, col('csm_families')[0].code)

    // 同一个人再加同一道 → 份数 +1，但 byNames 不该重复
    await call('a1', 'addDish', { dishId: 'hongshaorou' })
    eq('再加一次不会新增记录', col('csm_menus').length, 1)
    eq('份数变成 2', col('csm_menus')[0].qty, 2)
    eq('同一个人点两次，名字不重复', JSON.stringify(col('csm_menus')[0].byNames), JSON.stringify(['甲']))

    // 另一个人加同一道 → 份数 +1，名字要并进去
    await call('a2', 'addDish', { dishId: 'hongshaorou' })
    eq('两个人点同一道，份数变 3', col('csm_menus')[0].qty, 3)
    eq('两个人的名字都在', JSON.stringify(col('csm_menus')[0].byNames), JSON.stringify(['甲', '乙']))

    // 备注只在第一次写的时候带上
    await call('a1', 'addDish', { dishId: 'mapodoufu', note: '少放辣' })
    var tofu = col('csm_menus').filter(function (d) { return d.dishId === 'mapodoufu' })[0]
    eq('新加的菜带上了备注', tofu.note, '少放辣')

    // setQty
    await call('a1', 'setQty', { dishId: 'hongshaorou', qty: 5 })
    eq('改份数生效', col('csm_menus').filter(function (d) { return d.dishId === 'hongshaorou' })[0].qty, 5)

    await call('a1', 'setQty', { dishId: 'hongshaorou', qty: 0 })
    eq('份数 0 等于移除', col('csm_menus').filter(function (d) { return d.dishId === 'hongshaorou' }).length, 0)

    await call('a1', 'setQty', { dishId: 'gongbaojiding', qty: 3 })
    eq('对不在菜单里的菜直接设份数会新建', col('csm_menus').filter(function (d) { return d.dishId === 'gongbaojiding' })[0].qty, 3)

    await call('a1', 'setQty', { dishId: 'meiyouzhedaocai', qty: 0 })
    eq('对不存在的菜设 0 份不报错也不写入', col('csm_menus').filter(function (d) { return d.dishId === 'meiyouzhedaocai' }).length, 0)

    // setNote
    var nr = await call('a2', 'setNote', { dishId: 'gongbaojiding', note: '多做一份' })
    eq('改备注成功', nr.ok, true)
    eq('备注写进去了', col('csm_menus').filter(function (d) { return d.dishId === 'gongbaojiding' })[0].note, '多做一份')

    var nr2 = await call('a2', 'setNote', { dishId: 'buzai', note: 'x' })
    eq('对不在菜单里的菜改备注会报错', nr2.ok, false)
  }

  /* ---------- F. 非法输入 ---------- */
  S('F. 非法输入与边界')
  {
    resetStore()
    await call('b1', 'createFamily', { name: '边界家', nickname: '甲' })

    await call('b1', 'addDish', { dishId: 'culiubaicai', qty: 'abc' })
    eq('份数传字符串按 1 处理', col('csm_menus')[0].qty, 1)

    await call('b1', 'addDish', { dishId: 'culiubaicai', qty: -5 })
    eq('份数传负数按 1 处理', col('csm_menus')[0].qty, 2)

    await call('b1', 'addDish', { dishId: 'culiubaicai', qty: 999999 })
    eq('份数超上限被夹到 99', col('csm_menus')[0].qty, 99)

    // 已经封顶之后再点：份数不能再涨，但「谁点的」必须记上，
    // 否则第二个人点了这道菜，别人完全看不出来。
    await call('b1_friend', 'joinFamily', {
      code: col('csm_families').filter(function (f) { return f.nicknames && f.nicknames['b1'] })[0].code,
      nickname: '友'
    })
    await call('b1_friend', 'addDish', { dishId: 'culiubaicai', qty: 50 })
    eq('封顶之后再点，份数仍然是 99', col('csm_menus')[0].qty, 99)
    ok('但第二个人被记进了 byNames',
      col('csm_menus')[0].byNames.indexOf('友') >= 0,
      JSON.stringify(col('csm_menus')[0].byNames))

    await call('b1', 'setQty', { dishId: 'culiubaicai', qty: 9999 })
    eq('setQty 超上限也被夹到 99', col('csm_menus')[0].qty, 99)

    var noDish = await call('b1', 'addDish', { dishId: '' })
    eq('菜名为空被拒绝', noDish.ok, false)

    var badQty = await call('b1', 'setQty', { dishId: 'culiubaicai', qty: 'x' })
    eq('setQty 传非数字被拒绝', badQty.ok, false)

    // 超长文本要截断，不能无脑塞进数据库
    await call('b1', 'addDish', { dishId: 'liangbanhuanggua', note: '这是一段特别特别特别特别长的备注文字' })
    var noteDoc = col('csm_menus').filter(function (d) { return d.dishId === 'liangbanhuanggua' })[0]
    ok('超长备注被截断到 20 字以内', noteDoc.note.length <= 20, 'length=' + noteDoc.note.length)

    // 建房间时名字和称呼超长
    resetStore()
    var longName = 'x'.repeat(50)
    var longNick = 'y'.repeat(50)
    var created = await call('b2', 'createFamily', { name: longName, nickname: longNick })
    var fam = col('csm_families')[0]
    ok('家庭名被截断到 12 字以内', fam.name.length <= 12, 'length=' + fam.name.length)
    ok('称呼被截断到 8 字以内', fam.nicknames['b2'].length <= 8, 'length=' + fam.nicknames['b2'].length)

    // 空名字、空称呼都有兜底
    resetStore()
    await call('b3', 'createFamily', { name: '', nickname: '' })
    var fam2 = col('csm_families')[0]
    eq('不填家庭名有默认值', fam2.name, '我的家')
    eq('不填称呼有默认值', fam2.nicknames['b3'], '我')

    // 未知 action
    var unknown = await call('b3', 'dropDatabase', {})
    eq('未知 action 被拒绝', unknown.ok, false)
    ok('报错里带上 action 名，便于排查', /dropDatabase/.test(unknown.msg || ''), unknown.msg)

    // 拿不到 openid
    currentOpenid = ''
    var noId = await cf.main({ action: 'myFamily', payload: {} })
    eq('拿不到 openid 时直接拒绝', noId.ok, false)
    currentOpenid = 'b3'
  }

  /* ---------- G. 查询注入尝试（结构化匹配，不是拼字符串） ---------- */
  S('G. 注入尝试不会越权')
  {
    resetStore()
    var mine = await call('inj_owner', 'createFamily', { name: '真家', nickname: '我' })
    var myCode = mine.data.code
    await call('inj_owner', 'addDish', { dishId: 'hongshaorou' })

    var attacks = ["' OR '1'='1", '" OR ""="', 'AAAAAA\' OR \'x', '{code:{$ne:null}}', 'ABC%', '\\u0027']
    for (var i = 0; i < attacks.length; i++) {
      var a = attacks[i]
      var peek = await call('attacker', 'peekFamily', { code: a })
      eq('注入串 peekFamily 被拒：' + JSON.stringify(a), peek.ok, false)

      var join = await call('attacker', 'joinFamily', { code: a, nickname: '坏人' })
      eq('注入串 joinFamily 被拒：' + JSON.stringify(a), join.ok, false)
    }

    // 攻击者始终没有拿到任何数据
    var famAfter = col('csm_families').filter(function (f) { return f.code === myCode })[0]
    eq('攻击者没能混进房间', famAfter.members.length, 1)
    eq('攻击者没能看到菜单', (await call('attacker', 'listMenu', {})).ok, false)

    // 长度校验是第一道闸：6 位以外的输入根本不进查询
    var tooLong = await call('attacker', 'joinFamily', { code: 'A'.repeat(200), nickname: 'x' })
    eq('超长房间码被长度校验挡住', tooLong.ok, false)
  }

  /* ---------- H. 房间隔离 ---------- */
  S('H. 两个家庭互不干扰')
  {
    resetStore()
    var f1 = await call('h1', 'createFamily', { name: '一号家', nickname: '甲' })
    var f2 = await call('h2', 'createFamily', { name: '二号家', nickname: '乙' })

    await call('h1', 'addDish', { dishId: 'hongshaorou' })
    await call('h1', 'addDish', { dishId: 'hongshaorou' })
    await call('h2', 'addDish', { dishId: 'ganbiansijidou' })

    var l1 = await call('h1', 'listMenu', {})
    var l2 = await call('h2', 'listMenu', {})
    eq('一号家只看到自己的菜', l1.data.list.length, 1)
    eq('二号家只看到自己的菜', l2.data.list.length, 1)
    eq('一号家的份数没被串', l1.data.list[0].qty, 2)
    eq('二号家的菜不是一号家的', l2.data.list[0].dishId, 'ganbiansijidou')

    // 清空只清自己家
    await call('h1', 'clearMenu', {})
    eq('清空后一号家没菜了', (await call('h1', 'listMenu', {})).data.list.length, 0)
    eq('二号家的菜还在', (await call('h2', 'listMenu', {})).data.list.length, 1)

    // 非房主也能清空（用户明确选择「谁都能清空」）
    await call('h1', 'addDish', { dishId: 'danchaofan' })
    await call('h1_guest', 'joinFamily', { code: f1.data.code, nickname: '客人' })
    var clearByGuest = await call('h1_guest', 'clearMenu', {})
    eq('非房主也能清空菜单（这是用户明确要的）', clearByGuest.ok, true)
    eq('清空确实生效了', (await call('h1', 'listMenu', {})).data.list.length, 0)
    // 二号家不受影响
    eq('二号家仍然没被影响', (await call('h2', 'listMenu', {})).data.list.length, 1)
  }

  /* ---------- I. 跨天隔离与旧数据清理 ---------- */
  S('I. 跨天与旧数据')
  {
    resetStore()
    freeze('2026-10-15T04:00:00Z')   // 北京 10-15 12:00
    await call('d1', 'createFamily', { name: '跨天家', nickname: '甲' })
    await call('d1', 'addDish', { dishId: 'hongshaorou' })
    eq('今天有菜', (await call('d1', 'listMenu', {})).data.list.length, 1)

    // 把时间推到第二天中午
    freeze('2026-10-16T04:00:00Z')
    eq('第二天看不到昨天的菜', (await call('d1', 'listMenu', {})).data.list.length, 0)

    // 第二天点了新菜，两条记录并存（按 date 区分）
    await call('d1', 'addDish', { dishId: 'gongbaojiding' })
    eq('数据库里两个日期各一条', col('csm_menus').length, 2)
    eq('接口只返回今天那条', (await call('d1', 'listMenu', {})).data.list[0].dishId, 'gongbaojiding')

    // 抽样清理：Math.random 固定成 0 → 一定触发
    // 清的是 date < (今天 - 3 天)，所以在 10-19 这天跑，10-15 会被清、10-16 不会
    var realRandom = Math.random
    Math.random = function () { return 0 }
    freeze('2026-10-19T04:00:00Z')
    await call('d1', 'addDish', { dishId: 'danchaofan' })
    Math.random = realRandom

    var dates = col('csm_menus').map(function (d) { return d.date })
    ok('超过 3 天的旧菜单被清掉了', dates.indexOf('2026-10-15') < 0, dates.join(','))
    ok('刚好满 3 天的记录还在（阈值是「超过 3 天」）', dates.indexOf('2026-10-16') >= 0, dates.join(','))
    ok('今天的记录也在', dates.indexOf('2026-10-19') >= 0, dates.join(','))

    unfreeze()
  }

  /* ---------- J. 改称呼 ---------- */
  S('J. 改称呼')
  {
    resetStore()
    var c = await call('r1', 'createFamily', { name: '称呼家', nickname: '爸爸' })
    await call('r2', 'joinFamily', { code: c.data.code, nickname: '妈妈' })

    var rn = await call('r2', 'renameSelf', { nickname: '妈妈大人' })
    eq('改称呼成功', rn.ok, true)
    eq('返回值里我的称呼已更新', rn.data.myName, '妈妈大人')

    var fam = await call('r1', 'myFamily', {})
    var names = fam.data.members.map(function (m) { return m.name })
    ok('房主看到的成员名单里名字也更新了', names.indexOf('妈妈大人') >= 0, names.join(','))

    var empty = await call('r2', 'renameSelf', { nickname: '' })
    eq('称呼不能改成空', empty.ok, false)

    var rn2 = await call('r2', 'renameSelf', { nickname: 'x'.repeat(30) })
    ok('改称呼也会截断', rn2.data.myName.length <= 8, 'length=' + rn2.data.myName.length)

    var outsider = await call('r3', 'renameSelf', { nickname: '路人' })
    eq('不在家庭里的人改称呼会被拒', outsider.ok, false)
  }

  /* ---------- K. addMany 与 listMenu 排序 ---------- */
  S('K. 一次加多道 / 排序')
  {
    resetStore()
    await call('m1', 'createFamily', { name: '多道家', nickname: '甲' })

    var many = await call('m1', 'addMany', { dishIds: ['hongshaorou', 'jiachangdoufu', 'fanqiedantang', 'danchaofan'] })
    eq('addMany 成功', many.ok, true)
    eq('4 道菜都进去了', col('csm_menus').length, 4)

    var l = await call('m1', 'listMenu', {})
    eq('listMenu 返回 4 条', l.data.list.length, 4)
    var first = l.data.list[0].dishId
    ok('按加入时间升序返回（第一条是最早加的）', first === 'hongshaorou', first)

    var tooMany = await call('m1', 'addMany', { dishIds: new Array(11).fill('x') })
    eq('一次最多 10 道', tooMany.ok, false)

    var emptyMany = await call('m1', 'addMany', { dishIds: [] })
    eq('空数组被拒绝', emptyMany.ok, false)

    // 重复的 id 应该累加份数而不是建两条
    resetStore()
    await call('m2', 'createFamily', { name: '重复家', nickname: '乙' })
    await call('m2', 'addMany', { dishIds: ['jiaozi', 'jiaozi', 'jiaozi'] })
    eq('重复 id 只建一条记录', col('csm_menus').length, 1)
    eq('重复 id 累加成 3 份', col('csm_menus')[0].qty, 3)
  }

  /* ---------- L. 客户端 watch 依赖的形状 ---------- */
  S('L. watch 能读到的字段')
  {
    resetStore()
    await call('w1', 'createFamily', { name: '同步家', nickname: '甲' })
    await call('w1', 'addDish', { dishId: 'shouzhuabing' })
    await call('w1', 'addDish', { dishId: 'shouzhuabing' })

    var doc = col('csm_menus')[0]
    // watch 是把原始文档推给客户端的，客户端靠这三个字段判断「这条要不要显示」
    ok('文档有 familyCode（watch 的过滤条件）', typeof doc.familyCode === 'string' && doc.familyCode.length === 6, doc.familyCode)
    ok('文档有 date（客户端按北京时间筛今天）', /^\d{4}-\d{2}-\d{2}$/.test(doc.date), doc.date)
    ok('文档有 dishId（客户端拿它拼菜名和图片）', typeof doc.dishId === 'string', doc.dishId)
    ok('文档有 qty', typeof doc.qty === 'number', doc.qty)
    ok('文档有 byNames（显示「谁点的」）', Array.isArray(doc.byNames), JSON.stringify(doc.byNames))
    ok('文档有 addedAt（客户端排序用）', typeof doc.addedAt === 'number', doc.addedAt)

    // 关键：文档不能带 _openid，否则「仅创建者可写」的权限下客户端能改它
    ok('菜单文档不带 _openid（这样客户端在「仅创建者可写」下写不了）',
      doc._openid === undefined, String(doc._openid))

    var famDoc = col('csm_families')[0]
    ok('家庭文档也不带 _openid', famDoc._openid === undefined, String(famDoc._openid))
  }

  /* ---------- M. 用户自建菜（加菜 / 改菜 / 删菜） ---------- */
  S('M. 用户自建菜')
  {
    resetStore()
    var fam = await call('chef', 'createFamily', { name: '会做菜的家', nickname: '爸爸' })
    var code = fam.data.code
    await call('helper', 'joinFamily', { code: code, nickname: '妈妈' })

    // 不在房间里就不能碰菜库
    var noFam = await call('outsider', 'createDish', { name: '野生的菜' })
    eq('没加入家庭时不能加菜', noFam.ok, false)
    eq('拒绝原因是 NO_FAMILY', noFam.msg, 'NO_FAMILY')
    eq('没加入家庭时也列不出菜', (await call('outsider', 'listDishes', {})).ok, false)

    var created = await call('chef', 'createDish', {
      id: 'uabc123', name: '外婆的糖醋排骨', cat: 'meat',
      main: '排骨', tips: '多放糖', image: 'cloud://demo/dishes/a.jpg'
    })
    eq('加菜成功', created.ok, true, created.msg)
    eq('客户端带的 id 被采用', created.data.dish.id, 'uabc123')
    eq('自己加的菜 mine = true', created.data.dish.mine, true)
    eq('记下了是谁加的', created.data.dish.creatorName, '爸爸')

    var doc = col('csm_dishes')[0]
    eq('写上了房间码', doc.familyCode, code)
    eq('固定了创建者', doc.creator, 'chef')
    ok('菜文档不带 _openid（写权限天然收口的前提）', doc._openid === undefined, String(doc._openid))

    eq('同一个 id 不能加两次',
      (await call('chef', 'createDish', { id: 'uabc123', name: '重复的' })).ok, false)

    var auto = await call('chef', 'createDish', { name: '服务端自己造 id 的菜' })
    ok('不传 id 时服务端生成一个合法的', /^u[a-z0-9]{2,38}$/.test(auto.data.dish.id), auto.data.dish.id)

    // ★ 客户端提交的 dishId 是不可信输入
    var evil = await call('chef', 'createDish', { id: "' OR 1=1--", name: '注入菜' })
    eq('形状不合法时仍然加得进去（就地重造 id）', evil.ok, true)
    ok('乱七八糟的 id 不会被原样存下', evil.data.dish.id !== "' OR 1=1--", evil.data.dish.id)
    ok('重造出来的 id 仍然合法', /^u[a-z0-9]{2,38}$/.test(evil.data.dish.id), evil.data.dish.id)

    eq('空菜名被拒绝', (await call('chef', 'createDish', { name: '   ' })).ok, false)
    eq('非法分类回落到荤菜',
      (await call('chef', 'createDish', { name: '分类怪', cat: 'zzz' })).data.dish.cat, 'meat')

    var longOne = await call('chef', 'createDish', {
      name: '菜'.repeat(40), main: '主'.repeat(60), tips: '点'.repeat(120)
    })
    ok('菜名截断到 12 字以内', longOne.data.dish.name.length <= 12, '' + longOne.data.dish.name.length)
    ok('主料截断到 20 字以内', longOne.data.dish.main.length <= 20, '' + longOne.data.dish.main.length)
    ok('要点截断到 40 字以内', longOne.data.dish.tips.length <= 40, '' + longOne.data.dish.tips.length)

    // 家人看得到，但不能改也不能删
    var seen = await call('helper', 'listDishes', {})
    var asHelper = seen.data.list.filter(function (d) { return d.id === 'uabc123' })[0]
    ok('家人也看得到这道菜', !!asHelper)
    eq('但家人看到的 mine = false', asHelper ? asHelper.mine : null, false)
    ok('返回里不含任何 openid', JSON.stringify(seen.data).indexOf('chef') < 0)

    var editByOther = await call('helper', 'updateDish', { id: 'uabc123', name: '被改掉的菜' })
    eq('别人改不动这道菜', editByOther.ok, false)
    eq('返回 NOT_MINE（前端据此翻成人话）', editByOther.msg, 'NOT_MINE')
    eq('被拒之后名字没变',
      col('csm_dishes').filter(function (d) { return d.dishId === 'uabc123' })[0].name, '外婆的糖醋排骨')

    var edit = await call('chef', 'updateDish', {
      id: 'uabc123', name: '改良版糖醋排骨', cat: 'meat', main: '肋排', tips: '少放糖'
    })
    eq('自己改得动', edit.ok, true, edit.msg)
    eq('名字改掉了', edit.data.dish.name, '改良版糖醋排骨')
    eq('★ 没带新图时保留原来那张（改个名字不该把照片弄丢）',
      edit.data.dish.image, 'cloud://demo/dishes/a.jpg')

    var editImg = await call('chef', 'updateDish', {
      id: 'uabc123', name: '换图版', image: 'cloud://demo/dishes/b.jpg'
    })
    eq('带了新图就换成新的', editImg.data.dish.image, 'cloud://demo/dishes/b.jpg')

    eq('改一道不存在的菜会报错',
      (await call('chef', 'updateDish', { id: 'ubuzai', name: 'x' })).ok, false)
    eq('改成空名字被拒绝',
      (await call('chef', 'updateDish', { id: 'uabc123', name: '  ' })).ok, false)

    // 删：要连菜单里那条一起摘掉，并清掉云存储的图
    await call('chef', 'addDish', { dishId: 'uabc123' })
    await call('helper', 'addDish', { dishId: 'uabc123' })
    eq('菜单里有这道自建菜',
      col('csm_menus').filter(function (d) { return d.dishId === 'uabc123' }).length, 1)

    var delByOther = await call('helper', 'deleteDish', { id: 'uabc123' })
    eq('别人删不动这道菜', delByOther.ok, false)
    eq('返回 NOT_MINE', delByOther.msg, 'NOT_MINE')
    eq('被拒之后菜还在',
      col('csm_dishes').filter(function (d) { return d.dishId === 'uabc123' }).length, 1)
    eq('被拒之后菜单里那条也还在',
      col('csm_menus').filter(function (d) { return d.dishId === 'uabc123' }).length, 1)

    var del = await call('chef', 'deleteDish', { id: 'uabc123' })
    eq('自己删得掉', del.ok, true)
    eq('菜没了', col('csm_dishes').filter(function (d) { return d.dishId === 'uabc123' }).length, 0)
    eq('★ 菜单里那条一起摘掉了（不留指向已删菜的孤儿记录）',
      col('csm_menus').filter(function (d) { return d.dishId === 'uabc123' }).length, 0)
    ok('云存储里的图也一起删了',
      deletedFiles.indexOf('cloud://demo/dishes/b.jpg') >= 0, deletedFiles.join(','))
    eq('重复删除是幂等的（网络重试安全）',
      (await call('chef', 'deleteDish', { id: 'uabc123' })).ok, true)

    // 没有图的菜也能删（不能因为没图就崩）
    var noImg = await call('chef', 'createDish', { name: '没图的菜' })
    eq('没图的菜删得掉', (await call('chef', 'deleteDish', { id: noImg.data.dish.id })).ok, true)

    // 房间隔离
    var fam2 = await call('other_chef', 'createFamily', { name: '别家', nickname: '我' })
    await call('other_chef', 'createDish', { name: '别人家的菜' })
    var names = (await call('chef', 'listDishes', {})).data.list.map(function (d) { return d.name })
    ok('看不到别人家的菜', names.indexOf('别人家的菜') < 0, names.join(','))

    // 一个家的菜量上限
    for (var k = 0; k < 99; k++) {
      await call('other_chef', 'createDish', { name: '菜' + k })
    }
    var fam2Docs = col('csm_dishes').filter(function (d) { return d.familyCode === fam2.data.code })
    eq('攒到 100 道', fam2Docs.length, 100)
    var over = await call('other_chef', 'createDish', { name: '第 101 道' })
    eq('加满 100 道之后不让再加', over.ok, false)
    ok('提示语说清楚了上限', /最多/.test(over.msg || ''), over.msg)

    // 排序：按创建时间升序（菜库里自建菜的先后要稳定、可预期）
    var ordered = (await call('chef', 'listDishes', {})).data.list
    var orderedIds = ordered.map(function (d) { return d.id })
    var rawOrder = col('csm_dishes')
      .filter(function (d) { return d.familyCode === code })
      .sort(function (a, b) { return a.createdAt - b.createdAt })
      .map(function (d) { return d.dishId })
    eq('自建菜按创建时间升序返回', JSON.stringify(orderedIds), JSON.stringify(rawOrder))
    ok('返回的是本家全部自建菜', orderedIds.length === rawOrder.length, orderedIds.length + '/' + rawOrder.length)
  }

  /* ---------- 房主对内置菜的改动 / 隐藏 ---------- */
  S('8. 房主对内置菜的改动 / 隐藏')

  /*
   * 内置的 80 道菜写死在 data/dishes.js 里、图片打在小程序包里，物理上删不掉。
   * 所以「改」和「删」都是往 csm_dishes 里记一条**改动**：
   *   updateBuiltin  -> 改名字 / 主料 / 要点 / 分类 / 换图
   *   hideBuiltin    -> 对全家隐藏（客户端就当它不存在）
   *   restoreBuiltin -> 恢复出厂
   *
   * ★ 这一段要盯死两条：
   *   1. 权限在**服务端**判。客户端藏按钮只是方便，改一行 wxml 就绕过去了。
   *   2. 内置菜改动和自建菜存在同一个集合里，任何按「本家有几道菜」来判断的
   *      地方都必须把它们分开算 —— 混一次就是一个不报错的 bug。
   */
  {
    const bFam = await call('b_owner', 'createFamily', { name: '内置菜测试家', nickname: '房主' })
    const bCode = bFam.data.code
    await call('b_member', 'joinFamily', { code: bCode, nickname: '家人' })

    const overDocs = () => col('csm_dishes').filter(
      (d) => d.familyCode === bCode && d.builtin === true
    )

    /* ---- 房主改一道内置菜 ---- */
    const edit = await call('b_owner', 'updateBuiltin', {
      id: 'hongshaorou', name: '外婆红烧肉', cat: 'veg', main: '黑猪五花肉', tips: '炖足两小时'
    })
    eq('房主改得动内置菜', edit.ok, true)
    eq('库里记下了一条改动', overDocs().length, 1)
    eq('  dishId 就是内置菜自己的 id', overDocs()[0].dishId, 'hongshaorou')
    eq('  builtin 标成 true（和自建菜分开）', overDocs()[0].builtin, true)
    eq('  记的是房主的 openid', overDocs()[0].creator, 'b_owner')

    /* ---- 改动对全家生效 ---- */
    const bList = (await call('b_member', 'listDishes', {})).data
    ok('家人拉到的东西里有这条改动', !!bList.overrides['hongshaorou'],
      JSON.stringify(bList.overrides))
    eq('  改后的名字传下去了', bList.overrides['hongshaorou'].name, '外婆红烧肉')
    // ★ 这条最关键：内置菜改动要是混进 list，客户端会把它当成一道**新菜**，
    //   于是「红烧肉」在菜库里出现两次
    eq('★ 改动没有混进自建菜列表（否则菜库里会出现两道红烧肉）', bList.list.length, 0)

    /* ---- 权限：家人改不动 ---- */
    const memberEdit = await call('b_member', 'updateBuiltin', { id: 'xiangguhuaji', name: '我要改' })
    eq('家人改内置菜被拒', memberEdit.ok, false)
    eq('返回 NOT_OWNER', memberEdit.msg, 'NOT_OWNER')
    eq('被拒之后库里没多出记录', overDocs().length, 1)

    /* ---- 客户端传的 id 不可信 ---- */
    eq('拿自建菜形状的 id 来改内置菜会被拒',
      (await call('b_owner', 'updateBuiltin', { id: 'uabc123', name: '瞎编的' })).ok, false)
    eq('id 形状不对也被拒',
      (await call('b_owner', 'updateBuiltin', { id: '中文菜名', name: '瞎编的' })).ok, false)
    eq('菜名空着也被拒',
      (await call('b_owner', 'updateBuiltin', { id: 'hongshaorou', name: '   ' })).ok, false)
    eq('以上都被拒之后，库里还是只有那一条', overDocs().length, 1)

    /* ---- 再改一次是覆盖，不是新增 ---- */
    await call('b_owner', 'updateBuiltin', { id: 'hongshaorou', name: '外婆红烧肉2', cat: 'veg' })
    eq('再改一次不新增记录', overDocs().length, 1)
    eq('  名字更新了',
      (await call('b_owner', 'listDishes', {})).data.overrides['hongshaorou'].name, '外婆红烧肉2')

    /* ---- 换图之后改名字，不能把图弄丢 ---- */
    await call('b_owner', 'updateBuiltin', {
      id: 'hongshaorou', name: '带图的', image: 'cloud://demo/dishes/edited.jpg'
    })
    await call('b_owner', 'updateBuiltin', { id: 'hongshaorou', name: '改名字不带图' })
    const keepImg = (await call('b_owner', 'listDishes', {})).data.overrides['hongshaorou']
    eq('★ 改名字时没带新图，之前换的那张图还在', keepImg.image, 'cloud://demo/dishes/edited.jpg')

    /* ---- 隐藏 ---- */
    await call('b_owner', 'addDish', { dishId: 'hongshaorou' })
    await call('b_owner', 'addDish', { dishId: 'gongbaojiding' })
    eq('菜单里先有两道', col('csm_menus').filter((d) => d.familyCode === bCode).length, 2)

    const hid = await call('b_owner', 'hideBuiltin', { id: 'hongshaorou' })
    eq('房主藏得动内置菜', hid.ok, true)
    eq('★ 藏起来时今天菜单里那道也一起摘掉了（不留孤儿条目）',
      col('csm_menus').filter((d) => d.dishId === 'hongshaorou').length, 0)
    eq('菜单里另一道没被连累',
      col('csm_menus').filter((d) => d.dishId === 'gongbaojiding').length, 1)
    eq('那条记录被标成 hidden', overDocs().filter((d) => d.dishId === 'hongshaorou')[0].hidden, true)
    eq('★ 之前改过的名字还留着（恢复之后还是那个样子）',
      (await call('b_member', 'listDishes', {})).data.overrides['hongshaorou'].name, '改名字不带图')
    eq('★ 换过的那张图也还留着',
      (await call('b_member', 'listDishes', {})).data.overrides['hongshaorou'].image,
      'cloud://demo/dishes/edited.jpg')

    await call('b_owner', 'hideBuiltin', { id: 'gongbaojiding' })
    eq('藏一道从没改过的内置菜也会记一条', overDocs().length, 2)
    eq('  那条只有 hidden、没有名字',
      !!overDocs().filter((d) => d.dishId === 'gongbaojiding')[0].name, false)
    eq('  客户端拿到它时 hidden 是 true',
      (await call('b_member', 'listDishes', {})).data.overrides['gongbaojiding'].hidden, true)

    /* ---- 权限：家人藏不动 ---- */
    const memberHide = await call('b_member', 'hideBuiltin', { id: 'mapodoufu' })
    eq('家人藏不了内置菜', memberHide.ok, false)
    eq('返回 NOT_OWNER', memberHide.msg, 'NOT_OWNER')
    eq('被拒之后库里还是两条', overDocs().length, 2)

    /* ---- 幂等 ---- */
    eq('重复藏同一道不报错', (await call('b_owner', 'hideBuiltin', { id: 'gongbaojiding' })).ok, true)
    eq('  也不会多出一条记录', overDocs().length, 2)

    /* ---- 恢复 ---- */
    const res = await call('b_owner', 'restoreBuiltin', { id: 'hongshaorou' })
    eq('房主恢复得动', res.ok, true)
    eq('恢复之后这条改动没了',
      overDocs().filter((d) => d.dishId === 'hongshaorou').length, 0)
    ok('★ 房主换的那张图顺手删了（已经没人引用它）',
      deletedFiles.indexOf('cloud://demo/dishes/edited.jpg') >= 0, deletedFiles.join(','))
    eq('★ 恢复不会把菜自动塞回今天的菜单（要吃再点一次）',
      col('csm_menus').filter((d) => d.dishId === 'hongshaorou').length, 0)
    eq('恢复是幂等的', (await call('b_owner', 'restoreBuiltin', { id: 'hongshaorou' })).ok, true)
    eq('恢复一道从没改过的菜也不报错',
      (await call('b_owner', 'restoreBuiltin', { id: 'laweibaozifan' })).ok, true)
    eq('家人恢复不了', (await call('b_member', 'restoreBuiltin', { id: 'gongbaojiding' })).ok, false)
    eq('  被拒之后那道菜还是藏着的', overDocs().length, 1)

    /* ---- 房间隔离 ---- */
    eq('别家看不到这个房间的内置菜改动',
      Object.keys((await call('other_chef', 'listDishes', {})).data.overrides).length, 0)
    eq('没有家庭的人改不了内置菜',
      (await call('lonely_one', 'updateBuiltin', { id: 'hongshaorou', name: 'x' })).msg, 'NO_FAMILY')

    /* ---- ★ 内置菜改动不能占掉「一个家最多 100 道自己的菜」的名额 ---- */
    /*
     * 两种记录躺在同一个集合里，而 createDish 是按「本家有多少条记录」来数上限的。
     * 不把 builtin 排除掉的话，房主改一道内置菜就白占一个名额 ——
     * 改满 100 道之后这个家连一道自己的菜都加不了，而且看不出任何异常。
     */
    const qFam = await call('q_owner', 'createFamily', { name: '名额测试', nickname: '我' })
    const qCode = qFam.data.code
    await call('q_owner', 'hideBuiltin', { id: 'hongshaorou' })
    await call('q_owner', 'hideBuiltin', { id: 'gongbaojiding' })
    await call('q_owner', 'hideBuiltin', { id: 'mapodoufu' })
    eq('先摆好 3 条内置菜改动',
      col('csm_dishes').filter((d) => d.familyCode === qCode).length, 3)

    for (let h = 0; h < 99; h++) {
      await call('q_owner', 'createDish', { name: '自家菜' + h })
    }
    eq('★ 内置菜改动不占自建菜的名额（99 道都加进去了）',
      col('csm_dishes').filter((d) => d.familyCode === qCode && d.builtin !== true).length, 99)
    eq('  第 100 道还能加',
      (await call('q_owner', 'createDish', { name: '第一百道' })).ok, true)
    eq('  到 100 道才拦住',
      (await call('q_owner', 'createDish', { name: '第一百零一道' })).ok, false)
  }

  S('9. 图片临时链接（免费版改不了云存储权限，只能由云函数去换）')

  /*
   * 背景：云存储权限若是「仅创建者及管理员可读写」，客户端直接读**别人**传的图
   * 会报 STORAGE_EXCEED_AUTHORITY —— 表现就是「家人互相看不到菜图」，
   * 而且现象是开发者工具里一行 `Failed to load image .../cloud://... net::OK`，
   * 一点都不像权限问题。免费版环境又改不了这个权限。
   * 所以改由云函数去换：它是 admin，安全规则只管客户端、管不着他。
   *
   * ★ 这一段盯死四条：
   *   1. 只对 cloud:// 去换 —— 本机路径 / 包内路径不该白花一次调用。
   *   2. 换不到**绝不能抛错**。文字信息比一张图重要，菜库得照样打得开。
   *   3. 映射只发给客户端「显示」用，**不许混进 list / overrides** ——
   *      否则客户端会把一个会过期的链接当成正式数据存下来。
   *   4. 一次最多 50 个，超了必须分批（不然图一多就整批失败）。
   */
  {
    const tFam = await call('tl_owner', 'createFamily', { name: '临时链接测试家', nickname: '房主' })

    /* ---- 空菜库：一次调用都不该发 ---- */
    tempCalls = []
    const empty = (await call('tl_owner', 'listDishes', {})).data
    eq('没图的时候 temp 是空对象', Object.keys(empty.temp || {}).length, 0)
    eq('★ 没图就一次都不去换（不白花调用）', tempCalls.length, 0)

    /* ---- 一道带云图、一道没图 ---- */
    await call('tl_owner', 'createDish', {
      id: 'uc001', name: '带图的菜', cat: 'meat', image: 'cloud://demo/dishes/a.jpg'
    })
    await call('tl_owner', 'createDish', { id: 'uc002', name: '没图的菜', cat: 'veg' })

    tempCalls = []
    const one = (await call('tl_owner', 'listDishes', {})).data
    eq('★ 云图换到了临时链接',
      one.temp['cloud://demo/dishes/a.jpg'], 'https://fake.tcb.example.com/a.jpg?sign=ok')
    eq('  映射里只有这一条', Object.keys(one.temp).length, 1)
    eq('  只问了一次', tempCalls.length, 1)
    eq('★ 只把 cloud:// 拿去问（没图的菜不会被牵连）',
      tempCalls[0].join('|'), 'cloud://demo/dishes/a.jpg')
    eq('★ 换出来的链接只待在 temp 里，没混进菜本身',
      one.list.filter((d) => d.id === 'uc001')[0].image, 'cloud://demo/dishes/a.jpg')

    /* ---- 两道菜共用同一张图：只问一次 ---- */
    await call('tl_owner', 'createDish', {
      id: 'uc003', name: '蹭同一张图', cat: 'soup', image: 'cloud://demo/dishes/a.jpg'
    })
    tempCalls = []
    await call('tl_owner', 'listDishes', {})
    eq('★ 同一个 fileID 只问一次', tempCalls[0].length, 1)

    /* ---- 房主给内置菜换的图也要换（它同样可能是别人传的） ---- */
    await call('tl_owner', 'updateBuiltin', {
      id: 'hongshaorou', name: '带图红烧肉', image: 'cloud://demo/dishes/builtin.jpg'
    })
    const withOv = (await call('tl_owner', 'listDishes', {})).data
    ok('★ 内置菜改动里的图也换了',
      !!withOv.temp['cloud://demo/dishes/builtin.jpg'], JSON.stringify(withOv.temp))
    eq('  映射没混进 overrides 里',
      withOv.overrides['hongshaorou'].image, 'cloud://demo/dishes/builtin.jpg')

    /* ---- 换不到：不抛错，其余照常 ---- */
    tempFail['cloud://demo/dishes/a.jpg'] = true
    const gf = await call('tl_owner', 'listDishes', {})
    eq('★ 某张换不到也不会让整次请求失败', gf.ok, true)
    eq('★ 换不到的那个不进映射', gf.data.temp['cloud://demo/dishes/a.jpg'], undefined)
    ok('  换得到的那个照样在',
      !!gf.data.temp['cloud://demo/dishes/builtin.jpg'], JSON.stringify(gf.data.temp))
    eq('  菜本身的数据一点没受影响', gf.data.list.length, 3)
    tempFail = {}

    /* ---- 图一多必须分批（51 张 batch + a.jpg + builtin.jpg = 53） ---- */
    for (let i = 0; i < 51; i++) {
      await call('tl_owner', 'createDish', {
        id: 'ub' + (100 + i), name: '凑数' + i, cat: 'meat',
        image: 'cloud://demo/dishes/batch' + i + '.jpg'
      })
    }
    tempCalls = []
    const many = (await call('tl_owner', 'listDishes', {})).data
    eq('★ 超过 50 个自动分批（不是一次全塞进去）', tempCalls.length, 2)
    eq('  第一批正好 50 个', tempCalls[0].length, 50)
    eq('  第二批是剩下的 3 个', tempCalls[1].length, 3)
    eq('★ 每一批都没超接口上限',
      tempCalls.every((c) => c.length <= 50), true)
    eq('  53 张全都换到了', Object.keys(many.temp).length, 53)
  }

  /* ---------- 10. 「有人点菜了」的提醒 ---------- */
  S('10. 订阅消息：有人点菜了')
  {
    /*
     * 这一段盯的是四条「错了也不报错」的规则：
     *   ① 不给自己发（你刚点的菜你最清楚）
     *   ② 加份数不发（同一道菜点三次收三条会烦死）
     *   ③ 一次加多道只发一条（摇一摇「全部加入菜单」不该轰炸）
     *   ④ 某人没授权 / 用完了 → 不影响点菜本身
     * 失败是**静默**的：点菜的人没感觉，收不到的人也不知道。
     */
    resetStore()
    subCalls = []
    subFail = {}

    const made = await call('na', 'createFamily', { name: '提醒家', nickname: '爸爸' })
    const roomCode = made.data.code
    await call('nb', 'joinFamily', { code: roomCode, nickname: '妈妈' })
    await call('nc', 'joinFamily', { code: roomCode, nickname: '妹妹' })

    // 爸爸加一道新菜 → 只发给妈妈和妹妹
    await call('na', 'addDish', { dishId: 'hongshaorou', dishName: '红烧肉' })
    eq('★ 新加一道菜会发提醒', subCalls.length, 2)
    ok('★ 不发给操作者自己',
      subCalls.every((c) => c.touser !== 'na'), subCalls.map((c) => c.touser).join(','))
    ok('发给的是另外两个成员',
      subCalls.map((c) => c.touser).sort().join(',') === 'nb,nc',
      subCalls.map((c) => c.touser).join(','))
    eq('模板 ID 用的是配置里那个',
      subCalls[0].templateId, 'nSZpROQ9bC2B2Uz6jdb42JYbTUKgEdY7U8K8TuOXQVc')
    ok('消息里带了菜名',
      !!(subCalls[0].data && subCalls[0].data.thing1 && subCalls[0].data.thing1.value === '红烧肉'),
      JSON.stringify(subCalls[0].data))
    ok('消息里带了时间（time 字段）',
      !!(subCalls[0].data && subCalls[0].data.time2 && /^\d{2}:\d{2}$/.test(subCalls[0].data.time2.value)),
      JSON.stringify(subCalls[0].data))
    eq('点进去落在菜单页', subCalls[0].page, 'pages/menu/menu')

    // 同一道菜再加一份（已存在）→ 不该发
    subCalls = []
    await call('na', 'addDish', { dishId: 'hongshaorou', dishName: '红烧肉' })
    eq('★ 加份数不发提醒', subCalls.length, 0)

    // 妈妈加一道新菜 → 只发给爸爸和妹妹
    subCalls = []
    await call('nb', 'addDish', { dishId: 'qingzhengluyu', dishName: '清蒸鲈鱼' })
    ok('别人加菜也不发给操作者本人',
      subCalls.every((c) => c.touser !== 'nb') && subCalls.length === 2,
      subCalls.map((c) => c.touser).join(','))

    // 一次加多道 → 只发一条（合并成「N 道菜」）
    subCalls = []
    await call('na', 'addMany', { dishIds: ['gongbaojiding', 'suanrongxilanhua', 'fanqiedantang'] })
    eq('★ 一次加多道只发一轮（不按道数轰炸）', subCalls.length, 2)
    ok('  内容是「3 道菜」而不是某一道的名字',
      !!(subCalls[0].data && subCalls[0].data.thing1 && /3 道菜/.test(subCalls[0].data.thing1.value)),
      JSON.stringify(subCalls[0].data))

    // 再加多道但**全都已存在**（全是加份数）→ 一条都不发
    subCalls = []
    await call('na', 'addMany', { dishIds: ['gongbaojiding', 'suanrongxilanhua'] })
    eq('★ 全是加份数时一条都不发', subCalls.length, 0)

    // 收件人没授权 / 一次性订阅用完了 → 点菜照样成功
    subCalls = []
    subFail = { nb: true, nc: true }
    const stillOk = await call('na', 'addDish', { dishId: 'danchaofan', dishName: '蛋炒饭' })
    eq('★ 发不出去也不影响点菜本身', stillOk.ok, true)
    eq('  菜确实进了菜单', col('csm_menus').filter((d) => d.dishId === 'danchaofan').length, 1)
    eq('  还是尝试发了（不是直接跳过）', subCalls.length, 2)

    // 只有部分人失败 → 其他人照样收到
    subCalls = []
    subFail = { nb: true }
    await call('na', 'addDish', { dishId: 'jiaozi', dishName: '白菜猪肉饺子' })
    eq('一个人失败不影响另一个人', subCalls.length, 2)
  }

  /* ---------- 11. 称呼不许重名 ---------- */
  S('11. 称呼不许重名（服务端拦）')
  {
    /*
     * 为什么这条要单独测：
     *  - 「加入房间」和「改称呼」是**两个入口**，只在界面提示挡不住；
     *  - 重名的代价不是看着别扭：菜单里「谁点的」存的是称呼字符串，
     *    两个「爸爸」会让「我点的」判断出错，而且不报错。
     *  - 还有一条容易漏：**不能把历史重名的人锁死**（家里本来就有重名是
     *    老数据），只是不许再改成同一个名字。
     */
    resetStore()
    const made = await call('nk_a', 'createFamily', { name: '称呼家', nickname: '爸爸' })
    const mk = made.data.code
    await call('nk_b', 'joinFamily', { code: mk, nickname: '妈妈' })

    // 加入时重名
    const dup = await call('nk_c', 'joinFamily', { code: mk, nickname: '爸爸' })
    eq('★ 加入时不能和家人重名', dup.ok, false)
    ok('  提示里点名了是哪个称呼', /爸爸/.test(dup.msg || ''), dup.msg)
    ok('  而且说清楚了要换一个', /换/.test(dup.msg || ''), dup.msg)

    // 前后空格不算不同名
    const dupSpace = await call('nk_c', 'joinFamily', { code: mk, nickname: '  爸爸 ' })
    eq('★ 带空格也算重名（服务端会 trim）', dupSpace.ok, false)

    // 换个名字就能进
    const okc = await call('nk_c', 'joinFamily', { code: mk, nickname: '妹妹' })
    eq('换个称呼就能加入', okc.ok, true)

    // 改称呼时重名
    const rn = await call('nk_b', 'renameSelf', { nickname: '爸爸' })
    eq('★ 改称呼也不能重名', rn.ok, false)
    ok('  同样点名了称呼', /爸爸/.test(rn.msg || ''), rn.msg)

    // 改成自己现在的名字 = 空操作，不该被自己挡住
    const rnSelf = await call('nk_b', 'renameSelf', { nickname: '妈妈' })
    eq('改成自己现在的称呼不算重名', rnSelf.ok, true)

    // 改成没被占用的
    const rnFree = await call('nk_b', 'renameSelf', { nickname: '娘' })
    eq('改成没被占用的称呼能成功', rnFree.ok, true)
    eq('  改完称呼真的变了', rnFree.data.myName, '娘')

    // 重名只在「同一个家」里算：别家用同样的称呼不受影响
    const other = await call('nk_x', 'createFamily', { name: '隔壁家', nickname: '爸爸' })
    eq('别的家用同一个称呼不受影响', other.ok, true)

    /*
     * 历史重名不能把人锁死：
     * 直接造一个「两个成员都叫爸爸」的房间（模拟加校验之前就有的老数据），
     * 两个人都得能正常用，而且可以把其中一个改走。
     */
    col('csm_families').push({
      _id: 'fam_dup_old', code: 'DUP001', name: '老重名家', owner: 'od1',
      members: ['od1', 'od2'], nicknames: { od1: '爸爸', od2: '爸爸' }, createdAt: 1
    })
    const oldUse = await call('od1', 'addDish', { dishId: 'hongshaorou', dishName: '红烧肉' })
    eq('★ 历史重名的老数据不会被锁死（还能点菜）', oldUse.ok, true)
    const oldFix = await call('od1', 'renameSelf', { nickname: '大伯' })
    eq('  而且能把其中一个改走', oldFix.ok, true)
  }

  /* ---------- 汇总 ---------- */
  console.log('\n' + '='.repeat(56))
  console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项')
  if (fail) {
    console.log('\n  失败清单：')
    for (var i = 0; i < failures.length; i++) console.log('    - ' + failures[i])
  }
  console.log('='.repeat(56))
  process.exit(fail ? 1 : 0)
}

run().catch(function (e) {
  console.error('\n测试脚本自己崩了：')
  console.error(e && e.stack ? e.stack : e)
  process.exit(1)
})
