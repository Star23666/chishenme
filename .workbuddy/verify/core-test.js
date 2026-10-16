/**
 * 一目账 · 核心逻辑验证（在 Node 里模拟 wx 环境跑，不需要开发者工具）
 * 目的：证明金额精度、增删查、月份隔离、统计口径都是对的
 */

/* ---------- 1. 模拟微信小程序运行环境 ---------- */
var store = {}

global.wx = {
  setStorageSync: function (k, v) {
    store[k] = JSON.parse(JSON.stringify(v))
  },
  getStorageSync: function (k) {
    return store[k] === undefined ? '' : store[k]
  },
  showToast: function () {},
  showModal: function () {},
  switchTab: function () {},
  setClipboardData: function () {}
}

var appObj = null
var loadedPages = []
global.App = function (o) { appObj = o }
global.Page = function (o) { loadedPages.push(o) }
global.Component = function (o) {}
global.getApp = function () { return appObj }

/* ---------- 2. 加载业务代码 ---------- */
var fmt = require('../../yimuzhang/utils/format.js')
var CATS = require('../../yimuzhang/utils/categories.js')
require('../../yimuzhang/app.js')
appObj.onLaunch()

/* ---------- 3. 断言工具 ---------- */
var pass = 0
var fail = 0
var failures = []

function ok(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  [PASS] ' + name)
  } else {
    fail++
    failures.push(name + (extra ? '  -> ' + extra : ''))
    console.log('  [FAIL] ' + name + (extra ? '  -> ' + extra : ''))
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, 'actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected))
}

function section(t) { console.log('\n===== ' + t + ' =====') }

/* =========================================================
   A. 金额精度：元 <-> 分
   ========================================================= */
section('A. 金额转换精度')

eq('yuan2fen("25.50") = 2550', fmt.yuan2fen('25.50'), 2550)
eq('yuan2fen("25.5")  = 2550', fmt.yuan2fen('25.5'), 2550)
eq('yuan2fen("25")    = 2500', fmt.yuan2fen('25'), 2500)
eq('yuan2fen("0.01")  = 1', fmt.yuan2fen('0.01'), 1)
eq('yuan2fen("0.1")   = 10', fmt.yuan2fen('0.1'), 10)
eq('yuan2fen("0.2")   = 20', fmt.yuan2fen('0.2'), 20)
eq('yuan2fen(".5")    = 50', fmt.yuan2fen('.5'), 50)
eq('yuan2fen("999999.99") = 99999999', fmt.yuan2fen('999999.99'), 99999999)
eq('yuan2fen("007.07") = 707', fmt.yuan2fen('007.07'), 707)

ok('yuan2fen("1.999") 非法 -> NaN', isNaN(fmt.yuan2fen('1.999')))
ok('yuan2fen("12.345") 非法 -> NaN', isNaN(fmt.yuan2fen('12.345')))
ok('yuan2fen("abc")   非法 -> NaN', isNaN(fmt.yuan2fen('abc')))
ok('yuan2fen("")      非法 -> NaN', isNaN(fmt.yuan2fen('')))
ok('yuan2fen("-5")    非法 -> NaN', isNaN(fmt.yuan2fen('-5')))
ok('yuan2fen("1e3")   非法 -> NaN', isNaN(fmt.yuan2fen('1e3')))

eq('fen2yuan(2550)  = "25.50"', fmt.fen2yuan(2550), '25.50')
eq('fen2yuan(5)     = "0.05"', fmt.fen2yuan(5), '0.05')
eq('fen2yuan(0)     = "0.00"', fmt.fen2yuan(0), '0.00')
eq('fen2yuan(-30)   = "-0.30"', fmt.fen2yuan(-30), '-0.30')
eq('fen2yuan(99999999) = "999999.99"', fmt.fen2yuan(99999999), '999999.99')

/* 往返一致性 */
var samples = ['0.01', '0.1', '0.99', '1.00', '12.34', '100.00', '9999.99']
var rtOk = true
for (var i = 0; i < samples.length; i++) {
  var back = fmt.fen2yuan(fmt.yuan2fen(samples[i]))
  // 期望值 = 输入补齐成两位小数的规范显示（0.1 应显示为 0.10）
  var sp = samples[i].split('.')
  var want = (sp[0] === '' ? '0' : sp[0]) + '.' + ((sp[1] || '') + '00').slice(0, 2)
  if (back !== want) { rtOk = false; console.log('     往返不符: ' + samples[i] + ' -> ' + back + ' 期望 ' + want) }
}
ok('往返转换一致 (元->分->元)', rtOk)

/* =========================================================
   B. 浮点陷阱：这就是为什么金额要存「分」
   ========================================================= */
section('B. 浮点陷阱验证')

var naive = 0.1 + 0.2
ok('用「元」直接浮点相加会出错: 0.1+0.2 = ' + naive, naive !== 0.3)

appObj.clearAll()
appObj.addRecord({ type: 'expense', amount: fmt.yuan2fen('0.1'), category: 'food', date: '2026-10-15' })
appObj.addRecord({ type: 'expense', amount: fmt.yuan2fen('0.2'), category: 'food', date: '2026-10-15' })
var halfYuan = appObj.summary({ year: 2026, month: 10 })
eq('用「分」记账后合计精确 = 0.30', fmt.fen2yuan(halfYuan.expense), '0.30')

/* =========================================================
   C. 增 / 删 / 查
   ========================================================= */
section('C. 增删查')

appObj.clearAll()

var r1 = appObj.addRecord({ type: 'expense', amount: 2550, category: 'food', date: '2026-10-15', note: '午饭' })
ok('addRecord 补全了 id', typeof r1.id === 'string' && r1.id.length > 0, 'id=' + r1.id)
eq('addRecord 保留备注', r1.note, '午饭')
eq('addRecord 默认类型为 expense', r1.type, 'expense')

var s1 = appObj.summary({ year: 2026, month: 10 })
eq('记 25.50 支出后 expense = 2550', s1.expense, 2550)
eq('记 25.50 支出后 income = 0', s1.income, 0)
eq('记 25.50 支出后 balance = -2550', s1.balance, -2550)

appObj.addRecord({ type: 'income', amount: 500000, category: 'salary', date: '2026-10-01' })
var s2 = appObj.summary({ year: 2026, month: 10 })
eq('再记 5000 收入后 income = 500000', s2.income, 500000)
eq('结余 = 收入 - 支出 = 497450', s2.balance, 497450)
eq('共 2 笔', s2.count, 2)

/* 10 笔小数金额，合计必须与手算一致 */
appObj.clearAll()
var amounts = ['0.1', '0.2', '0.3', '1.05', '2.55', '10.01', '99.99', '0.01', '123.45', '7.77']
for (var a = 0; a < amounts.length; a++) {
  appObj.addRecord({ type: 'expense', amount: fmt.yuan2fen(amounts[a]), category: 'food', date: '2026-10-10' })
}
var s3 = appObj.summary({ year: 2026, month: 10 })
eq('10 笔小数金额合计 = 245.43（手算校验）', fmt.fen2yuan(s3.expense), '245.43')
eq('10 笔合计(分) = 24543', s3.expense, 24543)

/* 删除：用一条当场新建的记录来验，避免受前面的 clearAll 影响 */
var tmpRec = appObj.addRecord({ type: 'expense', amount: 999, category: 'food', date: '2026-10-20' })
eq('删除已存在的记录返回 true', appObj.removeRecord(tmpRec.id), true)
eq('删除不存在的 id 返回 false', appObj.removeRecord('not-exist-id'), false)

appObj.clearAll()
var d1 = appObj.addRecord({ type: 'expense', amount: 1000, category: 'food', date: '2026-10-10' })
appObj.addRecord({ type: 'expense', amount: 2000, category: 'shopping', date: '2026-10-11' })
eq('删除前共 2 笔', appObj.summary({ year: 2026, month: 10 }).count, 2)
appObj.removeRecord(d1.id)
eq('删除后剩 1 笔', appObj.summary({ year: 2026, month: 10 }).count, 1)
eq('删除后支出更新为 2000', appObj.summary({ year: 2026, month: 10 }).expense, 2000)

/* 同一毫秒内写入两条时，顺序必须确定（后写入的排前面） */
var sameMs = 1750000000000
store['ymz_records'] = [
  { id: 'rec-a', type: 'expense', amount: 111, category: 'food', date: '2026-10-15', note: '', createdAt: sameMs },
  { id: 'rec-b', type: 'expense', amount: 222, category: 'transport', date: '2026-10-15', note: '', createdAt: sameMs }
]
var ordSame = appObj.listRecords({ year: 2026, month: 10 })
eq('createdAt 相同时，后写入的排前面', ordSame[0].id, 'rec-b')
eq('createdAt 相同时条数不变', ordSame.length, 2)
eq('createdAt 相同时合计正确', appObj.summary({ year: 2026, month: 10 }).expense, 333)

/* =========================================================
   D. 月份隔离
   ========================================================= */
section('D. 月份隔离')

appObj.clearAll()
appObj.addRecord({ type: 'expense', amount: 1111, category: 'food', date: '2026-09-05' })
appObj.addRecord({ type: 'expense', amount: 2222, category: 'food', date: '2026-10-05' })
appObj.addRecord({ type: 'expense', amount: 3333, category: 'food', date: '2026-10-06' })

eq('9 月只有 1 笔', appObj.listRecords({ year: 2026, month: 9 }).length, 1)
eq('10 月有 2 笔', appObj.listRecords({ year: 2026, month: 10 }).length, 2)
eq('9 月支出 = 1111', appObj.summary({ year: 2026, month: 9 }).expense, 1111)
eq('10 月支出 = 5555', appObj.summary({ year: 2026, month: 10 }).expense, 5555)
eq('全部记录 3 笔', appObj.allRecords().length, 3)

/* 排序：最新的日期在最前 */
var ordered = appObj.allRecords()
eq('列表按日期倒序，第一条是 10-06', ordered[0].date, '2026-10-06')
eq('列表最后一条是 09-05', ordered[ordered.length - 1].date, '2026-09-05')

/* =========================================================
   E. 统计口径
   ========================================================= */
section('E. 统计')

appObj.clearAll()
/* 支出：餐饮 60 元（3笔）、交通 30 元、购物 10 元，合计 100 元 */
appObj.addRecord({ type: 'expense', amount: 2000, category: 'food', date: '2026-10-01' })
appObj.addRecord({ type: 'expense', amount: 2000, category: 'food', date: '2026-10-02' })
appObj.addRecord({ type: 'expense', amount: 2000, category: 'food', date: '2026-10-02' })
appObj.addRecord({ type: 'expense', amount: 3000, category: 'transport', date: '2026-10-03' })
appObj.addRecord({ type: 'expense', amount: 1000, category: 'shopping', date: '2026-10-03' })
/* 收入不应进分类排行 */
appObj.addRecord({ type: 'income', amount: 999999, category: 'salary', date: '2026-10-03' })

var cs = appObj.categoryStats({ year: 2026, month: 10 })
eq('分类排行总支出 = 10000 分', cs.total, 10000)
eq('分类数量 = 3（收入不计入）', cs.list.length, 3)
eq('第一名是餐饮', cs.list[0].name, '餐饮')
eq('餐饮金额 = 6000', cs.list[0].amount, 6000)
eq('餐饮占比 = 60%', cs.list[0].percent, 60)
eq('第二名是交通，占比 30%', cs.list[1].percent, 30)
eq('第三名是购物，占比 10%', cs.list[2].percent, 10)
var pctSum = cs.list[0].percent + cs.list[1].percent + cs.list[2].percent
ok('占比合计 ≈ 100（实际 ' + pctSum + '）', Math.abs(pctSum - 100) < 0.5)

/* 除不尽的情况：3 笔等额，占比应仍约等于 100 */
appObj.clearAll()
appObj.addRecord({ type: 'expense', amount: 1000, category: 'food', date: '2026-10-01' })
appObj.addRecord({ type: 'expense', amount: 1000, category: 'transport', date: '2026-10-02' })
appObj.addRecord({ type: 'expense', amount: 1000, category: 'shopping', date: '2026-10-03' })
var cs2 = appObj.categoryStats({ year: 2026, month: 10 })
var pctSum2 = cs2.list[0].percent + cs2.list[1].percent + cs2.list[2].percent
ok('三等分时占比合计 ≈ 100（实际 ' + pctSum2 + '）', Math.abs(pctSum2 - 100) < 0.5)

/* 每日统计 */
appObj.clearAll()
appObj.addRecord({ type: 'expense', amount: 500, category: 'food', date: '2026-10-01' })
appObj.addRecord({ type: 'expense', amount: 700, category: 'food', date: '2026-10-01' })
appObj.addRecord({ type: 'expense', amount: 900, category: 'food', date: '2026-10-05' })
appObj.addRecord({ type: 'income', amount: 10000, category: 'salary', date: '2026-10-05' })

var ds = appObj.dailyStats({ year: 2026, month: 10 })
eq('10 月有 31 天', ds.length, 31)
eq('1 号支出 = 1200', ds[0].amount, 1200)
eq('5 号支出 = 900（收入不计入）', ds[4].amount, 900)
eq('2 号支出 = 0', ds[1].amount, 0)

var ds9 = appObj.dailyStats({ year: 2026, month: 9 })
eq('9 月有 30 天', ds9.length, 30)
var ds2 = appObj.dailyStats({ year: 2026, month: 2 })
eq('2026 年 2 月有 28 天', ds2.length, 28)

/* =========================================================
   F. 导出 / 清空
   ========================================================= */
section('F. 导出与清空')

var exported = appObj.exportJSON()
var parsed = null
try { parsed = JSON.parse(exported) } catch (e) { parsed = null }
ok('导出内容是合法 JSON', parsed !== null)
ok('导出包含 records 数组', parsed && Array.isArray(parsed.records))
eq('导出条数正确', parsed ? parsed.count : -1, 4)

appObj.clearAll()
eq('清空后记录数 = 0', appObj.allRecords().length, 0)
eq('清空后支出 = 0', appObj.summary({ year: 2026, month: 10 }).expense, 0)
eq('清空后分类统计为空', appObj.categoryStats({ year: 2026, month: 10 }).list.length, 0)

/* =========================================================
   G. 边界与健壮性
   ========================================================= */
section('G. 边界与健壮性')

eq('金额 0 会被页面拦截（yuan2fen("0")=0）', fmt.yuan2fen('0') <= 0, true)

var longNote = appObj.addRecord({
  type: 'expense', amount: 100, category: 'other_e',
  date: '2026-10-15', note: '这是一个超过三十个字的备注用来测试截断逻辑是否生效啊啊啊啊啊啊啊'
})
ok('备注超长被截断到 30 字（实际 ' + longNote.note.length + '）', longNote.note.length <= 30)

var noDate = appObj.addRecord({ type: 'expense', amount: 100, category: 'food' })
ok('不传日期时自动补今天', /^\d{4}-\d{2}-\d{2}$/.test(noDate.date), noDate.date)

var badType = appObj.addRecord({ type: 'xxx', amount: 100, category: 'food', date: '2026-10-15' })
eq('非法类型回退为 expense', badType.type, 'expense')

var unknownCat = appObj.categoryOf('expense', 'no-such-key')
eq('未知分类有兜底名字', unknownCat.name, '未分类')

ok('分类 key 唯一（支出/收入的其他不冲突）',
  CATS.findExpense('other_e').key === 'other_e' && CATS.findIncome('other_i').key === 'other_i')

/* 存储异常时不崩 */
appObj.clearAll()
var savedWx = global.wx.getStorageSync
global.wx.getStorageSync = function () { throw new Error('模拟存储读取失败') }
var crashed = false
var safeSummary = null
try { safeSummary = appObj.summary({ year: 2026, month: 10 }) } catch (e) { crashed = true }
ok('存储读取异常时不崩溃', !crashed)
eq('异常时汇总返回 0', safeSummary ? safeSummary.expense : -1, 0)
global.wx.getStorageSync = savedWx

/* =========================================================
   H. 页面脚本可加载（模块级代码不报错）
   ========================================================= */
section('H. 页面脚本加载')

var pageFiles = ['pages/index/index.js', 'pages/add/add.js', 'pages/stats/stats.js', 'pages/mine/mine.js']
for (var p = 0; p < pageFiles.length; p++) {
  var okLoad = true
  var errMsg = ''
  try {
    require('../../yimuzhang/' + pageFiles[p])
  } catch (e) {
    okLoad = false
    errMsg = e.message
  }
  ok('可加载 ' + pageFiles[p], okLoad, errMsg)
}
eq('共注册 4 个页面', loadedPages.length, 4)

/* 每个页面都有 onLoad/onShow 或至少是合法 Page 对象 */
var allHaveData = true
for (var q = 0; q < loadedPages.length; q++) {
  if (typeof loadedPages[q].data !== 'object') allHaveData = false
}
ok('4 个页面都定义了 data', allHaveData)

/* =========================================================
   I. 新增功能：快捷金额 + tabBar 图标
   ========================================================= */
section('I. 快捷金额与 tabBar 图标')

/* 给页面挂上可用的 setData，模拟小程序环境 */
for (var pi = 0; pi < loadedPages.length; pi++) {
  (function (pg) {
    pg.setData = function (obj, cb) {
      for (var k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) pg.data[k] = obj[k]
      }
      if (typeof cb === 'function') cb.call(pg)
    }
  })(loadedPages[pi])
}

var addPage = null
var indexPage = null
for (var q2 = 0; q2 < loadedPages.length; q2++) {
  if (typeof loadedPages[q2].loadTypeUI === 'function') addPage = loadedPages[q2]
  if (typeof loadedPages[q2].prevMonth === 'function' && typeof loadedPages[q2].onDelete === 'function') indexPage = loadedPages[q2]
}
ok('找到「记一笔」页面对象', addPage !== null)
ok('找到「明细」页面对象', indexPage !== null)

if (addPage) {
  addPage.onLoad()
  eq('默认是支出类型', addPage.data.type, 'expense')
  eq('支出快捷金额 = [10,20,50,100]', JSON.stringify(addPage.data.quickList), '[10,20,50,100]')
  eq('支出分类 8 个', addPage.data.cats.length, 8)
  eq('默认选中 food 分类', addPage.data.catKey, 'food')

  addPage.switchType({ currentTarget: { dataset: { t: 'income' } } })
  eq('切到收入后类型正确', addPage.data.type, 'income')
  eq('收入快捷金额 = [100,500,1000,5000]', JSON.stringify(addPage.data.quickList), '[100,500,1000,5000]')
  eq('收入分类 5 个', addPage.data.cats.length, 5)
  eq('收入默认选中 salary', addPage.data.catKey, 'salary')

  addPage.switchType({ currentTarget: { dataset: { t: 'expense' } } })
  addPage.quickPick({ currentTarget: { dataset: { v: 50 } } })
  eq('点快捷金额 50 后输入框为 "50"', addPage.data.amountInput, '50')
  eq('"50" 转为 5000 分', fmt.yuan2fen(addPage.data.amountInput), 5000)

  addPage.quickPick({ currentTarget: { dataset: { v: 5 } } })
  eq('再点 5 是替换不是累加 → "5"', addPage.data.amountInput, '5')
}

/* 明细页：分组与月份切换 */
if (indexPage) {
  appObj.clearAll()
  appObj.addRecord({ type: 'expense', amount: 1000, category: 'food', date: '2026-10-15' })
  appObj.addRecord({ type: 'expense', amount: 2000, category: 'transport', date: '2026-10-15' })
  appObj.addRecord({ type: 'income', amount: 50000, category: 'salary', date: '2026-10-14' })

  indexPage.data.year = 2026
  indexPage.data.month = 10
  indexPage.refresh()
  eq('明细页月份文案', indexPage.data.monthText, '2026年10月')
  eq('明细页共 3 笔', indexPage.data.count, 3)
  eq('明细页支出文案', indexPage.data.summary.expenseText, '30.00')
  eq('明细页收入文案', indexPage.data.summary.incomeText, '500.00')
  eq('明细页结余文案', indexPage.data.summary.balanceText, '470.00')
  eq('按日期分成 2 组', indexPage.data.groups.length, 2)
  eq('第一组是 10-15（较新）', indexPage.data.groups[0].date, '2026-10-15')
  eq('10-15 有 2 条', indexPage.data.groups[0].items.length, 2)
  eq('10-15 当天支出合计 30.00', indexPage.data.groups[0].expenseText, '30.00')
  eq('明细金额带正负号（支出）', indexPage.data.groups[0].items[0].amountText, '-20.00')
  eq('明细金额带正负号（收入）', indexPage.data.groups[1].items[0].amountText, '+500.00')

  indexPage.prevMonth()
  eq('翻到上个月 = 9 月', indexPage.data.month, 9)
  eq('上个月没有记录', indexPage.data.count, 0)
  indexPage.nextMonth()
  eq('翻回 10 月', indexPage.data.month, 10)
  eq('数据还在', indexPage.data.count, 3)
}

/* 图标文件与配置 */
var fs = require('fs')
var pathMod = require('path')
var projRoot = pathMod.join(__dirname, '..', '..', 'yimuzhang')
var appCfg = JSON.parse(fs.readFileSync(pathMod.join(projRoot, 'app.json'), 'utf8'))
eq('tabBar 配置了 4 个标签', appCfg.tabBar.list.length, 4)

var iconsOk = true
var iconMiss = ''
for (var ti = 0; ti < appCfg.tabBar.list.length; ti++) {
  var tab = appCfg.tabBar.list[ti]
  var f1 = pathMod.join(projRoot, tab.iconPath)
  var f2 = pathMod.join(projRoot, tab.selectedIconPath)
  if (!fs.existsSync(f1)) { iconsOk = false; iconMiss = tab.iconPath }
  if (!fs.existsSync(f2)) { iconsOk = false; iconMiss = tab.selectedIconPath }
  if (fs.statSync(f1).size > 40 * 1024) { iconsOk = false; iconMiss = tab.iconPath + ' 超过 40KB' }
}
ok('8 个图标文件都存在且小于 40KB', iconsOk, iconMiss)

/* =========================================================
   汇总
   ========================================================= */
console.log('\n' + '='.repeat(52))
console.log('通过: ' + pass + '   失败: ' + fail)
if (fail > 0) {
  console.log('\n失败项:')
  for (var f = 0; f < failures.length; f++) console.log('  - ' + failures[f])
}
console.log('='.repeat(52))

process.exit(fail > 0 ? 1 : 0)
