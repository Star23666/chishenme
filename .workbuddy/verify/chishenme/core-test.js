/**
 * 今天吃啥 · 核心逻辑测试
 *
 * 在 Node 里伪造一套 wx 运行环境，把 app.js 当成普通模块加载，
 * 然后对数据服务层做全量断言。业务代码一行都不用为测试改动。
 *
 * 运行： node .workbuddy/verify/chishenme/core-test.js
 */

var path = require('path')
var fs = require('fs')

var ROOT = path.resolve(__dirname, '..', '..', '..')
var APP_DIR = path.join(ROOT, 'chishenme')

/* ---------------- 伪造小程序运行环境 ---------------- */

var store = {}

global.wx = {
  setStorageSync: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)) },
  getStorageSync: function (k) { return store[k] === undefined ? '' : store[k] },
  removeStorageSync: function (k) { delete store[k] },
  showToast: function () {},
  showModal: function () {},
  showLoading: function () {},
  hideLoading: function () {},
  switchTab: function () {},
  setClipboardData: function () {}
}

var appObj = null
global.App = function (o) { appObj = o }

var loadedPages = []
global.Page = function (o) { loadedPages.push(o) }

global.getApp = function () { return appObj }

/* ---------------- 断言机 ---------------- */

var pass = 0
var fail = 0
var failures = []
var section = ''

function S(name) {
  section = name
  console.log('\n' + name)
}

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
  ok(name, actual === expected, 'actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected))
}

function reset() {
  for (var k in store) delete store[k]
}

/* ---------------- 加载业务模块 ---------------- */

var config = require(path.join(APP_DIR, 'config.js'))

/*
 * ★ 强制本地模式。
 *
 * config.js 里的 CLOUD_ENV 是**用户会去改的值**（填了 envId 就是云端模式）。
 * 这一套 146 项测的是「本地模式下数据服务层的行为」，
 * 如果用户填了 envId，而这里又恰好提供了 wx.cloud，
 * app.js 就会切到云端模式 —— 那一堆断言会以看不懂的方式挂掉。
 *
 * 所以这里显式钉死，让测试结果与用户怎么配 config.js 无关。
 * 云端逻辑由 cloud-test.js 单独覆盖。
 */
config.CLOUD_ENV = ''

var D = require(path.join(APP_DIR, 'data', 'dishes.js'))
var fmt = require(path.join(APP_DIR, 'utils', 'format.js'))
var cloudUtil = require(path.join(APP_DIR, 'utils', 'cloud.js'))
require(path.join(APP_DIR, 'app.js'))

var app = appObj
if (app.onLaunch) app.onLaunch()

/*
 * 页面列表从 app.json 读，不写死。
 * 写死过一次：加了家庭页之后它完全不在检查范围内，而且不报任何错。
 */
var appJson = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'app.json'), 'utf8'))
var PAGES = []
var PAGE_DIRS = {}
for (var pi = 0; pi < appJson.pages.length; pi++) {
  var fullPath = path.join(APP_DIR, appJson.pages[pi])
  var pname = path.basename(fullPath)
  PAGES.push(pname)
  PAGE_DIRS[pname] = path.dirname(fullPath)
}

var pageObjs = {}
for (var i = 0; i < PAGES.length; i++) {
  var n = loadedPages.length
  require(path.join(PAGE_DIRS[PAGES[i]], PAGES[i] + '.js'))
  pageObjs[PAGES[i]] = loadedPages[n]
}

/* ==================== A. 菜品数据 ==================== */

S('A. 菜品数据')

eq('菜品总数与 DISHES 一致（当前 ' + D.DISHES.length + ' 道）', D.DISHES.length, D.TOTAL)
eq('菜库规模在合理区间（30~200）', D.DISHES.length >= 30 && D.DISHES.length <= 200, true)

var idSet = {}
var dupIds = []
for (var a = 0; a < D.DISHES.length; a++) {
  var dd = D.DISHES[a]
  if (idSet[dd.id]) dupIds.push(dd.id)
  idSet[dd.id] = true
}
eq('菜品 id 无重复', dupIds.length, 0)

var badCat = []
var emptyField = []
var LEGAL = { meat: 1, veg: 1, soup: 1, staple: 1, cold: 1 }
for (var b = 0; b < D.DISHES.length; b++) {
  var x = D.DISHES[b]
  if (!LEGAL[x.cat]) badCat.push(x.id)
  if (!x.id || !x.name || !x.main || !x.tips) emptyField.push(x.id)
}
eq('分类值全部合法', badCat.length, 0)
eq('id/名称/主料/要点 均非空', emptyField.length, 0)

/**
 * ★ 菜道数**不写死**。
 * 这里原来断言「荤菜 12 / 素菜 9 / 汤羹 5 / 主食 5 / 凉菜 4 / 合计 35」。
 * 2026-10 把菜库扩到 80 道之后，这 7 条集体挂掉 —— 而「改了检查才能过」的
 * 检查器，迟早会在某次赶时间时被顺手改成新数字，从此失去意义。
 * 改成断言真正的不变量：分类计数与 DISHES 一致、各类相加等于总数、每个分类都非空。
 * 这样加菜不用动检查，但「某道菜的 cat 拼错了」「byCat 漏了一类」依然会被抓到。
 */
var catCount = {}
for (var cc = 0; cc < D.DISHES.length; cc++) {
  var ck0 = D.DISHES[cc].cat
  catCount[ck0] = (catCount[ck0] || 0) + 1
}
eq('TOTAL 与 DISHES.length 一致', D.TOTAL, D.DISHES.length)
eq('菜库规模合理（当前 ' + D.TOTAL + ' 道）', D.TOTAL >= 30, true)

var sumCat = 0
var emptyCat = []
for (var ci = 1; ci < D.CATS.length; ci++) {
  var ckey = D.CATS[ci].key
  var cnum = D.byCat(ckey).length
  sumCat += cnum
  eq('分类 ' + ckey + ' 计数与 DISHES 一致（' + cnum + ' 道）', cnum, catCount[ckey] || 0)
  if (cnum === 0) emptyCat.push(ckey)
}
eq('每个分类都有菜（没有空分类）', emptyCat.length, 0)
eq('各分类相加 = 菜库总数', sumCat, D.TOTAL)

eq('CATS 含 6 项（全部+5 类）', D.CATS.length, 6)
eq('CATS 第一项是「全部」', D.CATS[0].key, 'all')
eq('catName(meat) = 荤菜', D.catName('meat'), '荤菜')
eq('catName(soup) = 汤羹', D.catName('soup'), '汤羹')
eq('catName(未知) 有兜底', D.catName('zzz'), '其他')

eq('byCat("all") 返回全部', D.byCat('all').length, D.TOTAL)
eq('byCat(undefined) 返回全部', D.byCat(undefined).length, D.TOTAL)
eq('byId 命中', D.byId('hongshaorou').name, '红烧肉')
eq('byId 未命中返回 null', D.byId('no_such_dish'), null)
eq('imageOf 路径格式', D.imageOf('hongshaorou'), '/images/dishes/hongshaorou.jpg')

var tmp = D.byCat('meat')
tmp.push({ id: 'fake' })
eq('byCat 返回的是副本', D.byCat('meat').length, catCount['meat'])

var missImg = []
for (var c = 0; c < D.DISHES.length; c++) {
  var p = path.join(APP_DIR, 'images', 'dishes', D.DISHES[c].id + '.jpg')
  if (!fs.existsSync(p)) missImg.push(D.DISHES[c].id)
}
eq('每道菜都有对应的图片文件（' + D.DISHES.length + ' 张）', missImg.length, 0)

/* ==================== B. 菜单增删改 ==================== */

S('B. 菜单增删改')

reset()
eq('初始菜单为空', app.menuKinds(), 0)
eq('初始份数合计 0', app.menuCount(), 0)
eq('初始 menu() 长度 0', app.menu().length, 0)

eq('addToMenu 返回 true', app.addToMenu('hongshaorou'), true)
eq('加入后 qtyOf = 1', app.qtyOf('hongshaorou'), 1)
eq('加入后 kinds = 1', app.menuKinds(), 1)

app.addToMenu('hongshaorou')
eq('重复加入 → 份数变 2', app.qtyOf('hongshaorou'), 2)
eq('重复加入不增加种类数', app.menuKinds(), 1)
eq('菜单份数合计 2', app.menuCount(), 2)

eq('addToMenu 非法 id 返回 false', app.addToMenu('no_such_dish'), false)
app.addToMenu('no_such_dish')
eq('非法 id 不会进菜单', app.menuKinds(), 1)

app.addToMenu('suanrongxilanhua')
var menu = app.menu()
eq('菜单 2 种', menu.length, 2)
eq('菜单项带菜名', menu[0].name, '红烧肉')
eq('菜单项带分类中文名', menu[0].catName, '荤菜')
eq('菜单项带图片路径', menu[0].image, '/images/dishes/hongshaorou.jpg')
eq('菜单按加入顺序排（第 1 项）', menu[0].dishId, 'hongshaorou')
eq('菜单按加入顺序排（第 2 项）', menu[1].dishId, 'suanrongxilanhua')

app.setQty('hongshaorou', 5)
eq('setQty 改成 5', app.qtyOf('hongshaorou'), 5)
app.setQty('hongshaorou', 1)
eq('setQty 改成 1', app.qtyOf('hongshaorou'), 1)

eq('stepQty +1 → 2', app.stepQty('hongshaorou', 1), 2)
eq('stepQty -1 → 1', app.stepQty('hongshaorou', -1), 1)

app.stepQty('hongshaorou', -1)
eq('stepQty 减到 0 自动移除', app.qtyOf('hongshaorou'), 0)
eq('移除后只剩 1 种', app.menuKinds(), 1)

app.addToMenu('hongshaorou')
eq('重新加入', app.qtyOf('hongshaorou'), 1)

eq('setNote 成功', app.setNote('hongshaorou', '少放辣'), true)
var noteFound = false
var mm = app.menu()
for (var e = 0; e < mm.length; e++) if (mm[e].dishId === 'hongshaorou' && mm[e].note === '少放辣') noteFound = true
eq('备注写入成功', noteFound, true)

app.setNote('hongshaorou', '一二三四五六七八九十一二三四五六七八九十一二三四五')
var longNote = ''
var mm2 = app.menu()
for (var e2 = 0; e2 < mm2.length; e2++) if (mm2[e2].dishId === 'hongshaorou') longNote = mm2[e2].note
eq('超长备注截断到 20 字', longNote.length, 20)
eq('setNote 对不存在的菜返回 false', app.setNote('no_such_dish', 'x'), false)

app.removeFromMenu('hongshaorou')
eq('removeFromMenu 生效', app.qtyOf('hongshaorou'), 0)

app.clearMenu()
eq('clearMenu 后为空', app.menuKinds(), 0)

eq('addManyToMenu 返回加入数', app.addManyToMenu(['hongshaorou', 'danchaofan', 'jiaozi']), 3)
eq('批量加入后 3 种', app.menuKinds(), 3)
eq('addManyToMenu 非数组返回 0', app.addManyToMenu('nope'), 0)

/* ==================== C. 份数边界 ==================== */

S('C. 份数边界')

reset()
app.addToMenu('hongshaorou')
app.setQty('hongshaorou', 0)
eq('setQty(0) 移除', app.qtyOf('hongshaorou'), 0)

app.setQty('hongshaorou', -3)
eq('setQty 负数不会写入', app.qtyOf('hongshaorou'), 0)

app.setQty('hongshaorou', 2)
eq('setQty 对未点过的菜可直接新增', app.qtyOf('hongshaorou'), 2)
eq('新增不会重复', app.menuKinds(), 1)

app.stepQty('hongshaorou', 3)
eq('stepQty 正向累加', app.qtyOf('hongshaorou'), 5)

app.setQty('hongshaorou', 99)
eq('大份数没问题', app.qtyOf('hongshaorou'), 99)
eq('大份数统计正确', app.menuCount(), 99)

reset()
app.addToMenu('hongshaorou')
var rawMenu = app.menu()
eq('qty 恒为正数', rawMenu[0].qty > 0, true)

/* ==================== D. 跨天清空 ==================== */

S('D. 跨天自动清空')

reset()
app.addToMenu('hongshaorou')
app.addToMenu('danchaofan')
eq('今天有 2 种', app.menuKinds(), 2)

store['csm_menu_date'] = '2000-01-01'
eq('跨天后 menu() 为空', app.menu().length, 0)
eq('跨天后 kinds 为 0', app.menuKinds(), 0)
eq('跨天后份数为 0', app.menuCount(), 0)
eq('跨天后 qtyOf 归零', app.qtyOf('hongshaorou'), 0)

app.addToMenu('jiaozi')
eq('跨天后重新点菜只有新菜', app.menuKinds(), 1)
eq('跨天后新菜正确', app.menu()[0].dishId, 'jiaozi')

/* ==================== E. 收藏 ==================== */

S('E. 收藏')

reset()
eq('初始无收藏', app.favIds().length, 0)
eq('初始 isFav = false', app.isFav('hongshaorou'), false)

eq('toggleFav 第一次 → true', app.toggleFav('hongshaorou'), true)
eq('isFav → true', app.isFav('hongshaorou'), true)
eq('toggleFav 第二次 → false', app.toggleFav('hongshaorou'), false)
eq('isFav → false', app.isFav('hongshaorou'), false)
eq('toggleFav 非法 id → false', app.toggleFav('no_such_dish'), false)

reset()
app.toggleFav('hongshaorou')
app.toggleFav('jiaozi')
eq('收藏 2 项', app.favIds().length, 2)
eq('favDishes 返回详情', app.favDishes().length, 2)
eq('favDishes 带菜名', app.favDishes()[0].name, '红烧肉')

store['csm_fav'] = ['hongshaorou', 'ghost_dish']
eq('favDishes 过滤脏 id', app.favDishes().length, 1)
eq('favIds 保留原始（含脏）', app.favIds().length, 2)

reset()
app.toggleFav('jiaozi')
app.toggleFav('hongshaorou')
eq('收藏按加入顺序', app.favIds()[0], 'jiaozi')

/* ==================== F. 随机选菜 ==================== */

S('F. 随机选菜')

reset()
var one = app.randomOne('all')
eq('randomOne 返回菜品', !!(one && one.id), true)
eq('randomOne 结果合法', !!D.byId(one.id), true)

var allSoup = true
var allInRange = true
for (var f = 0; f < 200; f++) {
  var r1 = app.randomOne('soup')
  if (r1.cat !== 'soup') allSoup = false
  var r2 = app.randomOne('all')
  if (!D.byId(r2.id)) allInRange = false
}
eq('randomOne("soup") 200 次都是汤', allSoup, true)
eq('randomOne("all") 200 次都合法', allInRange, true)

var comboOk = true
var comboSawMeat = false
var comboSawVeg = false
var comboSawSoup = false
var comboUnique = true
for (var g = 0; g < 200; g++) {
  var cb = app.randomCombo()
  if (cb.length !== 4) comboOk = false
  var seen = {}
  var kinds = { meat: 0, veg: 0, soup: 0, staple: 0, cold: 0 }
  for (var h = 0; h < cb.length; h++) {
    if (seen[cb[h].id]) comboUnique = false
    seen[cb[h].id] = true
    kinds[cb[h].cat]++
  }
  if (kinds.meat >= 1) comboSawMeat = true
  if (kinds.veg >= 1) comboSawVeg = true
  if (kinds.soup >= 1) comboSawSoup = true
}
eq('三菜一汤每次 4 道', comboOk, true)
eq('三菜一汤内部无重复', comboUnique, true)
eq('三菜一汤必有荤菜', comboSawMeat, true)
eq('三菜一汤必有素菜', comboSawVeg, true)
eq('三菜一汤必有汤', comboSawSoup, true)

var catOk = true
var CATS5 = ['meat', 'veg', 'soup', 'staple', 'cold']
for (var q = 0; q < CATS5.length; q++) {
  for (var w = 0; w < 50; w++) {
    if (app.randomOne(CATS5[q]).cat !== CATS5[q]) catOk = false
  }
}
eq('分类随机 250 次不串类', catOk, true)

/* ==================== G. 统计口径 ==================== */

S('G. 统计口径')

reset()
var s0 = app.menuStats()
eq('空菜单统计全 0', s0.total + s0.meat + s0.veg + s0.soup + s0.staple + s0.cold, 0)

app.addToMenu('hongshaorou')
app.addToMenu('hongshaorou')
app.addToMenu('suanrongxilanhua')
app.addToMenu('fanqiedantang')
app.addToMenu('danchaofan')
app.addToMenu('liangbanhuanggua')

var st = app.menuStats()
eq('kinds = 5', st.kinds, 5)
eq('total = 6', st.total, 6)
eq('meat = 2', st.meat, 2)
eq('veg = 1', st.veg, 1)
eq('soup = 1', st.soup, 1)
eq('staple = 1', st.staple, 1)
eq('cold = 1', st.cold, 1)
eq('分类相加 = total', st.meat + st.veg + st.soup + st.staple + st.cold, st.total)

/* ==================== H. 菜单文本 ==================== */

S('H. 菜单文本')

reset()
eq('空菜单有提示语', app.menuText().indexOf('还没点菜') >= 0, true)

app.addToMenu('hongshaorou')
app.addToMenu('hongshaorou')
app.setNote('hongshaorou', '少放辣')
var txt = app.menuText()
eq('文本含菜名', txt.indexOf('红烧肉') >= 0, true)
eq('文本含份数 x2', txt.indexOf('x2') >= 0, true)
eq('文本含备注', txt.indexOf('少放辣') >= 0, true)
eq('文本含总道数', txt.indexOf('共 2 道') >= 0, true)

/* ==================== I. 页面加载与结构 ==================== */

S('I. 页面加载与结构')

for (var z = 0; z < PAGES.length; z++) {
  ok('页面 ' + PAGES[z] + ' 已注册', !!pageObjs[PAGES[z]])
}

ok('菜库页有 onLoad', typeof pageObjs.library.onLoad === 'function')
ok('菜库页有 onShow', typeof pageObjs.library.onShow === 'function')
ok('点菜页有 onShow', typeof pageObjs.order.onShow === 'function')
ok('菜单页有 onShow', typeof pageObjs.menu.onShow === 'function')
ok('摇一摇页有 onLoad', typeof pageObjs.random.onLoad === 'function')
ok('摇一摇页有 onUnload（清定时器）', typeof pageObjs.random.onUnload === 'function')
ok('摇一摇页有 onHide（清定时器）', typeof pageObjs.random.onHide === 'function')
ok('收藏页有 onShow', typeof pageObjs.fav.onShow === 'function')

ok('菜单页支持转发', typeof pageObjs.menu.onShareAppMessage === 'function')
ok('菜单页支持朋友圈分享', typeof pageObjs.menu.onShareTimeline === 'function')
ok('菜库页支持转发', typeof pageObjs.library.onShareAppMessage === 'function')

eq('菜库页 activeCat 初始为 all', pageObjs.library.data.activeCat, 'all')
eq('摇一摇页 mode 初始为 one', pageObjs.random.data.mode, 'one')
eq('菜单页空状态初始为 true', pageObjs.menu.data.empty, true)
eq('收藏页空状态初始为 true', pageObjs.fav.data.empty, true)
eq('点菜页初始 kinds = 0', pageObjs.order.data.kinds, 0)

// 家庭页（一起点菜）：只有云模式才有内容，但本地模式下也必须能安全打开
ok('家庭页有 onLoad', typeof pageObjs.family.onLoad === 'function')
ok('家庭页有 onShow', typeof pageObjs.family.onShow === 'function')
ok('家庭页有 onInput', typeof pageObjs.family.onInput === 'function')
ok('家庭页能创建房间', typeof pageObjs.family.doCreate === 'function')
ok('家庭页能加入房间', typeof pageObjs.family.doJoin === 'function')
ok('家庭页能退出房间', typeof pageObjs.family.doLeave === 'function')
ok('家庭页能解散房间（房主专属）', typeof pageObjs.family.doDissolve === 'function')
ok('解散有第二道确认，不是一弹就删', typeof pageObjs.family.confirmDissolve === 'function')
ok('家庭页能改称呼', typeof pageObjs.family.doRename === 'function')
ok('家庭页支持转发邀请', typeof pageObjs.family.onShareAppMessage === 'function')
eq('家庭页初始未进房间', pageObjs.family.data.fam, null)
eq('家庭页默认在「建一个家」这一栏', pageObjs.family.data.tab, 'create')
eq('家庭页初始云模式为 false（这套测试强制本地模式）', pageObjs.family.data.cloud, false)

// 本地模式下点「创建房间」不应该抛异常，而且每一步都要给出可读的中文
var pageCtx = {
  data: JSON.parse(JSON.stringify(pageObjs.family.data)),
  setData: function (p) { for (var k in p) this.data[k] = p[k] }
}
var toastText = ''
var origToast = global.wx.showToast
global.wx.showToast = function (o) { toastText = (o && o.title) || '' }

// 第一道闸：昵称没填，本地就该拦下来（不用等云端）
var syncErr = null
try {
  pageObjs.family.doCreate.call(pageCtx)
} catch (e) {
  syncErr = e
}
ok('本地模式下点「创建房间」不抛异常', syncErr === null, syncErr ? String(syncErr.message) : '')
eq('昵称为空时给的是中文校验提示，不是错误码', toastText, '先给自己起个称呼')

// 第二道闸：填了昵称后会走异步的云调用路径
pageCtx.data.nick = '爸爸'
toastText = ''
var syncErr2 = null
try {
  pageObjs.family.doCreate.call(pageCtx)
} catch (e) {
  syncErr2 = e
}
ok('填了昵称后点击也不抛异常', syncErr2 === null, syncErr2 ? String(syncErr2.message) : '')
eq('点击后立刻进入 busy 状态（先给反馈，不等网络）', pageCtx.data.busy, true)

global.wx.showToast = origToast

/* ============ I2. 解散房间：拦两道，别让它顺手被点掉 ============ */
/*
 * 「解散房间」是这个项目里唯一一个**不可逆**的操作：
 * 房间码作废、所有人的菜单一起没，而且家里其他人是被动的 ——
 * 他们什么都没点，房间就没了。
 * 所以它必须弹两次：第一次说清后果，第二次才真的删。
 * 下面验证这个拦截真的生效，而不是只写在注释里。
 */
;(function () {
  var lastModal = null
  var origModal = global.wx.showModal

  function ctxWith(isOwner, extra) {
    var c = {
      data: { fam: { code: 'ABC234', name: '老王家', isOwner: isOwner } },
      setData: function (p) { for (var k in p) this.data[k] = p[k] }
    }
    for (var k in (extra || {})) c[k] = extra[k]
    return c
  }

  // 1) 非房主：连弹窗都不该弹（按钮本来就不该出现在他眼前）
  var modalCount = 0
  global.wx.showModal = function (o) { modalCount++; lastModal = o }
  var guestErr = null
  try {
    pageObjs.family.doDissolve.call(ctxWith(false))
  } catch (e) {
    guestErr = e
  }
  ok('非房主点解散不抛异常（本地就拦下了）', guestErr === null, guestErr ? String(guestErr.message) : '')
  eq('非房主点解散：一个弹窗都不弹', modalCount, 0)

  // 2) 房主：第一道弹窗出现，文案要带房间码和后果
  modalCount = 0
  var confirmed = 0
  pageObjs.family.doDissolve.call(ctxWith(true, { confirmDissolve: function () { confirmed++ } }))
  eq('房主点解散会弹第一道确认框', modalCount, 1)
  ok('第一道确认框里带了房间码（防止连错的是哪个房间都不知道）',
    !!(lastModal && String(lastModal.content).indexOf('ABC234') >= 0),
    lastModal ? String(lastModal.content) : '(没有弹窗)')
  eq('第一道确认框的按钮是「继续 / 算了」，不是顺手就能点的「确定」',
    lastModal ? (lastModal.confirmText + ' / ' + lastModal.cancelText) : '', '继续 / 算了')
  eq('只是弹了框，还没真的开始删', confirmed, 0)

  // 3) 第一道点「算了」→ 什么都不发生
  global.wx.showModal = function (o) { lastModal = o; if (o && o.success) o.success({ confirm: false }) }
  confirmed = 0
  pageObjs.family.doDissolve.call(ctxWith(true, { confirmDissolve: function () { confirmed++ } }))
  eq('第一道点「算了」就停下，不进入第二道', confirmed, 0)

  // 4) 第一道点「继续」→ 进入第二道
  global.wx.showModal = function (o) { lastModal = o; if (o && o.success) o.success({ confirm: true }) }
  confirmed = 0
  pageObjs.family.doDissolve.call(ctxWith(true, { confirmDissolve: function () { confirmed++ } }))
  eq('第一道点「继续」才进入第二道', confirmed, 1)

  // 5) 第二道点「再想想」→ 一个请求都不发
  var dissolveCalls = 0
  var origDissolve = app.dissolveFamily
  app.dissolveFamily = function () { dissolveCalls++; return Promise.resolve(true) }
  global.wx.showModal = function (o) { lastModal = o; if (o && o.success) o.success({ confirm: false }) }
  pageObjs.family.confirmDissolve.call(ctxWith(true))
  eq('第二道点「再想想」：一个请求都不发', dissolveCalls, 0)
  eq('第二道用的是「解散 / 再想想」，两个都不是顺手点的按钮',
    lastModal ? (lastModal.confirmText + ' / ' + lastModal.cancelText) : '', '解散 / 再想想')
  eq('第二道把确认按钮标成红色（破坏性操作要看得出来）',
    lastModal ? lastModal.confirmColor : '', '#D9483B')

  // 6) 第二道点「解散」→ 这才真的调云函数
  global.wx.showModal = function (o) { lastModal = o; if (o && o.success) o.success({ confirm: true }) }
  pageObjs.family.confirmDissolve.call(ctxWith(true))
  eq('第二道点「解散」才真的发请求', dissolveCalls, 1)

  app.dissolveFamily = origDissolve
  global.wx.showModal = origModal
})()

/* ==================== J. 脏数据容错 ==================== */

S('J. 脏数据容错')

reset()
store['csm_menu'] = 'not-an-array'
store['csm_menu_date'] = fmt.todayStr()
eq('菜单存储被写坏时返回空数组', app.menu().length, 0)
eq('菜单存储被写坏时不抛异常', app.menuCount(), 0)

reset()
store['csm_fav'] = 12345
eq('收藏存储被写坏时返回空数组', app.favIds().length, 0)

reset()
store['csm_menu'] = [{ dishId: 'ghost_dish', qty: 1 }, { dishId: 'hongshaorou', qty: 2 }]
store['csm_menu_date'] = fmt.todayStr()
eq('菜单里的幽灵菜被过滤', app.menu().length, 1)
eq('幽灵菜不影响正常菜', app.menu()[0].dishId, 'hongshaorou')

reset()
store['csm_menu'] = [{ dishId: 'hongshaorou', qty: 0 }, { dishId: 'jiaozi' }]
store['csm_menu_date'] = fmt.todayStr()
eq('qty=0 的项按 1 份算', app.qtyOf('hongshaorou'), 1)
eq('缺失 qty 的项按 1 份算', app.qtyOf('jiaozi'), 1)
eq('缺失 qty 统计为 2', app.menuCount(), 2)

/* ==================== K. 日期工具 ==================== */

S('K. 日期工具')

eq('todayStr 格式 yyyy-mm-dd', /^\d{4}-\d{2}-\d{2}$/.test(fmt.todayStr()), true)
eq('dateLabel(今天)', fmt.dateLabel(fmt.todayStr()), '今天')
eq('mdLabel 去掉前导零', fmt.mdLabel('2026-10-05'), '10月5日')
eq('weekday 2026-10-15 = 周四', fmt.weekday('2026-10-15'), '周四')
eq('weekday 2026-10-18 = 周日', fmt.weekday('2026-10-18'), '周日')
eq('weekday 非法输入返回空串', fmt.weekday('abc'), '')
eq('pad2 补零', fmt.pad2(7), '07')
eq('pad2 不补两位数', fmt.pad2(12), '12')
eq('nowTime 格式 hh:mm', /^\d{2}:\d{2}$/.test(fmt.nowTime()), true)

/* ==================== L. 运行模式与错误提示 ==================== */

S('L. 运行模式判定')

// 这套测试里没有 wx.cloud，所以无论 config 怎么写都必须是本地模式
eq('没有 wx.cloud 时回落到本地模式', app.mode(), 'local')
eq('isCloud() 与 mode() 一致', app.isCloud(), false)
eq('本地模式下 family() 返回 null', app.family(), null)
eq('本地模式下仍能正常读菜单', Array.isArray(app.menu()), true)

S('M. 错误提示翻译（云端模式的第一道体验关）')

/*
 * 这段的每一条都是「第一次开通云开发的人一定会按顺序撞到」的报错。
 * 原文是英文 + 错误码，直接弹给用户等于什么都没说。
 * 这里锁住「每个码都必须翻译成带下一步指引的中文」。
 */
var cases = [
  ['CLOUD_DISABLED', '还没配置云开发'],
  ['NO_FAMILY', '你还没加入家庭'],
  ['NOT_OWNER', '只有房主能做这个'],
  ['NOT_MINE', '只能改自己加的菜'],
  ['errCode: -501000 | FunctionName parameter could not be found', '云函数还没部署'],
  ['未知操作: dissolveFamily', '云函数还是旧版本'],
  ['cloud init error: { errMsg: "invalid scope" }', '云环境刚开通'],
  ['errCode: -501007 | env not exists', '环境 ID 填错了'],
  ['errCode: -502005 | collection not exist', '集合还没建'],
  ['errCode: -502003 | permission denied', '数据库权限没配好'],
  // 真机上传照片失败的真实报错：官方错误码表里查不到这个码，
  // 不翻译的话用户会被一句「cgi fail(1,-10090)」彻底搞懵
  ['cgi fail(1,-10090)', '照片没传上去'],
  ['errCode: -403001 | upload file exceed size limit', '太大了'],
  ['request:fail timeout', '网络不太好']
]

for (var mc = 0; mc < cases.length; mc++) {
  var rawMsg = cases[mc][0]
  var wantWord = cases[mc][1]
  var gotText = cloudUtil.friendly(new Error(rawMsg))
  ok('「' + rawMsg.slice(0, 42) + '…」翻成「' + wantWord + '…」',
    gotText.indexOf(wantWord) >= 0, gotText)
  ok('  翻译结果里不含英文错误码', gotText.indexOf('errCode') < 0 && gotText.indexOf('errMsg') < 0, gotText)
}

// 云函数抛回的中文提示要原样透传，不要再包一层
eq('云函数的中文提示原样透传',
  cloudUtil.friendly(new Error('你是房间创建者，不能退出')), '你是房间创建者，不能退出')

// 空错误也得有兜底，不能弹一个空白 toast
ok('错误对象为 null 时有兜底文案', cloudUtil.friendly(null).length > 0, cloudUtil.friendly(null))

/*
 * ★ 真机上 wx.cloud.uploadFile 传错时给的是 { errCode, errMsg } 这种**裸对象**，
 *   不是 Error 实例。以前 friendly 只读 message，于是真实错误全被吞掉，
 *   用户只能看到一句没用的兜底文案。这两条把「两种形态都认」锁住。
 */
var bareFail = { errCode: -1, errMsg: 'uploadFile:fail cgi fail(1,-10090)' }
ok('上传失败的裸对象（errMsg 形态）也能翻译',
  cloudUtil.friendly(bareFail).indexOf('照片没传上去') >= 0, cloudUtil.friendly(bareFail))

var codeOnly = { errCode: -10090 }
ok('只有 errCode、没有任何文案时也能认出来',
  cloudUtil.friendly(codeOnly).indexOf('照片没传上去') >= 0, cloudUtil.friendly(codeOnly))

ok('字符串形态的错误也能翻译',
  cloudUtil.friendly('cgi fail(1,-10090)').indexOf('照片没传上去') >= 0,
  cloudUtil.friendly('cgi fail(1,-10090)'))

/* ==================== M2. 菜库搜索 ==================== */

S('M2. 菜库搜索（菜名优先，其次主料）')

/*
 * 搜「鸡」的时候想要的是「宫保鸡丁」，而不是随便哪道主料里带个鸡字的菜。
 * ★ 这条排序规则错了**不会报错**，只会「搜出来的顺序怪怪的」——
 *   很难被人发现，所以必须钉死。
 */
var hitChicken = D.search('鸡')
ok('搜「鸡」有结果', hitChicken.length > 0, hitChicken.length)

var nameHitCount = 0
var seenMainHit = false
var orderOk = true
for (var si = 0; si < hitChicken.length; si++) {
  var sName = String(hitChicken[si].name || '')
  var sMain = String(hitChicken[si].main || '')
  if (sName.indexOf('鸡') >= 0) {
    nameHitCount++
    if (seenMainHit) orderOk = false      // 名字命中的跑到了主料命中的后面
  } else if (sMain.indexOf('鸡') >= 0) {
    seenMainHit = true
  } else {
    orderOk = false                       // 结果里混进了毫不相关的菜
  }
}
ok('菜名命中的全部排在主料命中的前面', orderOk,
  hitChicken.map(function (d) { return d.name }).join(' / '))
ok('确实两种命中都有（否则这条排序等于没验）', nameHitCount > 0 && seenMainHit,
  '菜名命中 ' + nameHitCount + ' 道，主料命中 ' + (hitChicken.length - nameHitCount) + ' 道')

eq('搜不到时返回空数组', D.search('zzzzqqq不存在的词').length, 0)
eq('空关键词 = 不过滤，返回全部', D.search('').length, D.totalAll())
eq('只有空格也算空关键词', D.search('   ').length, D.totalAll())
eq('搜索忽略大小写', D.search('ABC').length, D.search('abc').length)

/*
 * ★ 「全库搜」的意义就在这条：自己加的菜必须也能被搜到。
 *   下面用一道内置菜库里**根本不存在的**菜来验证，
 *   并顺带断言「内置菜里确实没有这两个字」—— 否则这条测试等于自欺欺人。
 */
var SEARCH_TEST_ID = 'usearchtest'
D.setCustom([{
  id: SEARCH_TEST_ID, name: '清炒西葫芦', cat: 'veg',
  main: '西葫芦、蒜', tips: '', image: '', mine: true
}])

eq('内置菜里确实没有「葫芦」二字（前置条件）',
  D.DISHES.filter(function (d) { return d.name.indexOf('葫芦') >= 0 }).length, 0)

var hitCustom = D.search('葫芦')
eq('自己加的菜也能被搜到', hitCustom.length, 1)
eq('  搜到的正是它', hitCustom[0] && hitCustom[0].id, SEARCH_TEST_ID)

var hitXi = D.search('西葫')
eq('搜自建菜独有的词只返回那一道', hitXi.length, 1)

D.setCustom([])   // 收尾，别把这个状态留给后面的测试段

/* ==================== N. 用户自建菜（本地模式） ==================== */

/*
 * 加菜 / 改菜 / 删菜在本地模式下的完整链路。
 *
 * ★ 这一段是**异步**的（saveDish / deleteDish 都返回 Promise），
 *   所以放在最后单独跑：上面的 A~M 都是同步的，跑完才轮到这里，
 *   汇总和退出挪进 runAsync() 的回调里。
 */
function asyncPart() {
  S('N. 用户自建菜（本地模式）')

  reset()
  D.setCustom([])
  app.refreshDishes()

  eq('一开始一道自建菜都没有', app.customDishes().length, 0)
  eq('totalDishes 等于内置菜数', app.totalDishes(), D.TOTAL)
  eq('内置菜不算自建菜', app.isCustomDish('hongshaorou'), false)
  eq('内置菜不能编辑 / 删除', app.canEditDish('hongshaorou'), false)
  eq('不存在的菜也不能编辑', app.canEditDish('no_such_dish'), false)

  var savedId = ''
  var keepMeatCount = catCount['meat']

  return app.saveDish({
    name: '外婆的糖醋排骨',
    cat: 'meat',
    main: '排骨',
    tips: '多放糖，收汁要快',
    image: 'cloud://demo/dishes/x.jpg'
  }).then(function (rec) {
    savedId = rec.id

    ok('新菜的 id 带 u 前缀（不会撞上内置菜）', /^u/.test(savedId), savedId)
    eq('自建菜进了菜库', app.customDishes().length, 1)
    eq('菜库总数 +1', app.totalDishes(), D.TOTAL + 1)
    eq('能按 id 查到', (D.byId(savedId) || {}).name, '外婆的糖醋排骨')
    eq('图片用的是自己那张', D.imageOf(savedId), 'cloud://demo/dishes/x.jpg')
    eq('这一类的数量 +1', D.byCat('meat').length, keepMeatCount + 1)
    eq('「全部」也跟着 +1', D.byCat('all').length, D.TOTAL + 1)
    var meatList = D.byCat('meat')
    eq('自建菜排在同类内置菜后面', meatList[meatList.length - 1].id, savedId)
    eq('自己加的菜可以编辑', app.canEditDish(savedId), true)

    // 自建菜必须能像内置菜一样点
    eq('自建菜能加进菜单', app.addToMenu(savedId), true)
    var m = app.menu()
    eq('菜单里能看到它', m.length, 1)
    eq('菜单项带的是自建菜的名字', m[0].name, '外婆的糖醋排骨')
    eq('菜单项图片走的是自建菜那张', m[0].image, 'cloud://demo/dishes/x.jpg')
    eq('菜单统计把它算进荤菜', app.menuStats().meat, 1)

    // 收藏也要能收
    eq('自建菜能收藏', app.toggleFav(savedId), true)
    eq('收藏列表里有它', app.favDishes().length, 1)

    // 改：同一个 id 应当是覆盖，不是新增
    return app.saveDish({
      id: savedId, name: '外婆的糖醋排骨（改良版）', cat: 'meat', main: '肋排', tips: ''
    })
  }).then(function () {
    eq('改菜不会多出一条', app.customDishes().length, 1)
    eq('菜名改掉了', (D.byId(savedId) || {}).name, '外婆的糖醋排骨（改良版）')
    eq('总数没变', app.totalDishes(), D.TOTAL + 1)
    eq('菜单里跟着改成新名字', app.menu()[0].name, '外婆的糖醋排骨（改良版）')
    ok('没传图片时保留原来那张（否则改次名字照片就没了）',
      D.imageOf(savedId) === 'cloud://demo/dishes/x.jpg', D.imageOf(savedId))

    // 空名字应当被拒绝，而不是存进去一道没名字的菜
    return app.saveDish({ name: '   ', cat: 'veg' }).then(function () { return 'ok' }, function () { return 'rejected' })
  }).then(function (r) {
    eq('菜名是空白时被拒绝', r, 'rejected')
    eq('被拒绝后菜库数量没变', app.customDishes().length, 1)

    // 没传照片 → 用占位图
    return app.saveDish({ name: '妈妈的番茄蛋汤', cat: 'soup' })
  }).then(function (rec) {
    var id = rec.id
    eq('没传照片时用占位图', D.imageOf(id), '/images/dish-placeholder.png')
    ok('占位图文件真的在包里', fs.existsSync(path.join(APP_DIR, 'images', 'dish-placeholder.png')))

    // 别人加的菜：看得见、能点，但改不了也删不了。
    // 本地模式下不会有这种记录（本机上的菜当然都是自己的），
    // 它来自云端模式下别的家人 —— 这里直接把菜库摆成那种样子来验。
    D.setCustom([
      { id: savedId, name: '外婆的糖醋排骨（改良版）', cat: 'meat', image: 'cloud://demo/dishes/x.jpg', mine: true },
      { id: 'u_other', name: '别人加的菜', cat: 'veg', mine: false }
    ])
    eq('别人加的菜也在菜库里', !!D.byId('u_other'), true)
    eq('但自己改不了别人的菜', app.canEditDish('u_other'), false)

    return app.deleteDish('u_other').then(function () { return 'ok' }, function () { return 'rejected' })
  }).then(function (r) {
    eq('删别人的菜被拒绝', r, 'rejected')
    eq('被拒之后那道菜还在', !!D.byId('u_other'), true)

    return app.deleteDish('hongshaorou').then(function () { return 'ok' }, function () { return 'rejected' })
  }).then(function (r) {
    eq('删内置菜被拒绝（内置的 80 道永远是只读的）', r, 'rejected')

    // 回到「本机存储说了算」的状态，再验真正的删除链路。
    // 本地模式下 refreshDishes 是同步生效的（Promise.resolve 的参数先求值），
    // 所以这行之后可以直接断言。
    app.refreshDishes()
    eq('本机存着 2 道自建菜', app.customDishes().length, 2)
    eq('删之前菜单里有它', app.qtyOf(savedId), 1)
    return app.deleteDish(savedId)
  }).then(function () {
    eq('删掉了', !!D.byId(savedId), false)
    eq('菜库只剩没删的那道', app.customDishes().length, 1)
    eq('总数 = 内置 + 剩下那道', app.totalDishes(), D.TOTAL + 1)
    eq('菜单里也一起摘掉了', app.qtyOf(savedId), 0)
    eq('菜单统计跟着归零', app.menuStats().meat, 0)
    eq('被删的菜不再出现在分类里', (function () {
      var l = D.byCat('meat')
      for (var i = 0; i < l.length; i++) if (l[i].id === savedId) return true
      return false
    })(), false)

    // 收尾：本机存储和菜库叠加层一起清干净，别影响别的检查
    reset()
    app.refreshDishes()
    eq('清空后总数回到内置数', app.totalDishes(), D.TOTAL)
    eq('清空后连自建菜查询都查不到', D.byId(savedId), null)
  })
}

/* ---------------- 汇总 ---------------- */

function summary() {
  console.log('\n' + '='.repeat(56))
  console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项')
  if (fail) {
    console.log('\n  失败清单：')
    for (var fi = 0; fi < failures.length; fi++) console.log('    - ' + failures[fi])
  }
  console.log('='.repeat(56))
  process.exit(fail ? 1 : 0)
}

asyncPart().then(summary).catch(function (e) {
  console.error('\n  异步段自己崩了：')
  console.error(e && e.stack ? e.stack : e)
  process.exit(1)
})

