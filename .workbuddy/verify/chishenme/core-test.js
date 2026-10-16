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

eq('菜品总数 35 道', D.DISHES.length, 35)
eq('D.TOTAL 与数组长度一致', D.TOTAL, D.DISHES.length)

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

eq('荤菜 12 道', D.byCat('meat').length, 12)
eq('素菜 9 道', D.byCat('veg').length, 9)
eq('汤羹 5 道', D.byCat('soup').length, 5)
eq('主食 5 道', D.byCat('staple').length, 5)
eq('凉菜 4 道', D.byCat('cold').length, 4)
eq('分类相加 = 35', D.byCat('meat').length + D.byCat('veg').length + D.byCat('soup').length + D.byCat('staple').length + D.byCat('cold').length, 35)

eq('CATS 含 6 项（全部+5 类）', D.CATS.length, 6)
eq('CATS 第一项是「全部」', D.CATS[0].key, 'all')
eq('catName(meat) = 荤菜', D.catName('meat'), '荤菜')
eq('catName(soup) = 汤羹', D.catName('soup'), '汤羹')
eq('catName(未知) 有兜底', D.catName('zzz'), '其他')

eq('byCat("all") 返回全部', D.byCat('all').length, 35)
eq('byCat(undefined) 返回全部', D.byCat(undefined).length, 35)
eq('byId 命中', D.byId('hongshaorou').name, '红烧肉')
eq('byId 未命中返回 null', D.byId('no_such_dish'), null)
eq('imageOf 路径格式', D.imageOf('hongshaorou'), '/images/dishes/hongshaorou.jpg')

var tmp = D.byCat('meat')
tmp.push({ id: 'fake' })
eq('byCat 返回的是副本', D.byCat('meat').length, 12)

var missImg = []
for (var c = 0; c < D.DISHES.length; c++) {
  var p = path.join(APP_DIR, 'images', 'dishes', D.DISHES[c].id + '.jpg')
  if (!fs.existsSync(p)) missImg.push(D.DISHES[c].id)
}
eq('35 张菜品图文件都存在', missImg.length, 0)

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
  ['NOT_OWNER', '只有建房间的人能做这个'],
  ['errCode: -501000 | FunctionName parameter could not be found', '云函数还没部署'],
  ['cloud init error: { errMsg: "invalid scope" }', '云环境刚开通'],
  ['errCode: -501007 | env not exists', '环境 ID 填错了'],
  ['errCode: -502005 | collection not exist', '集合还没建'],
  ['errCode: -502003 | permission denied', '数据库权限没配好'],
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

/* ---------------- 汇总 ---------------- */

console.log('\n' + '='.repeat(56))
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail) {
  console.log('\n  失败清单：')
  for (var fi = 0; fi < failures.length; fi++) console.log('    - ' + failures[fi])
}
console.log('='.repeat(56))
process.exit(fail ? 1 : 0)
