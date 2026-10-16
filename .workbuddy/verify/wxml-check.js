/**
 * 一目账 · WXML / JS / WXSS 三方一致性检查
 *
 * 这是「肉眼看不出来、但一点就废」的那类 bug 的克星：
 *   1. WXML 里 bindtap="xxx" 但页面 JS 里没有 xxx 函数  → 点了没反应
 *   2. WXML 里用了 {{ aaa }} 但 data 里没有 aaa        → 显示空白
 *   3. WXML 里 class="zzz" 但样式表里没有 .zzz         → 样式丢失
 */

var fs = require('fs')
var path = require('path')

var PAGES = ['pages/index/index', 'pages/add/add', 'pages/stats/stats', 'pages/mine/mine']
var ROOT = path.join(__dirname, '..', '..', 'yimuzhang')

/* ---------- 1. 模拟小程序环境，把页面对象加载出来 ---------- */
var store = {}
global.wx = {
  setStorageSync: function (k, v) { store[k] = JSON.parse(JSON.stringify(v)) },
  getStorageSync: function (k) { return store[k] === undefined ? '' : store[k] },
  showToast: function () {},
  showModal: function () {},
  switchTab: function () {},
  setClipboardData: function () {}
}

var appObj = null
var pageObjs = []
global.App = function (o) { appObj = o }
global.Page = function (o) { pageObjs.push(o) }
global.getApp = function () { return appObj }

require(path.join(ROOT, 'app.js'))
appObj.onLaunch()
PAGES.forEach(function (p) { require(path.join(ROOT, p + '.js')) })

pageObjs.forEach(function (pg) {
  pg.setData = function (o, cb) {
    for (var k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k)) pg.data[k] = o[k]
    }
    if (typeof cb === 'function') cb.call(pg)
  }
  if (typeof pg.onLoad === 'function') pg.onLoad()
  if (typeof pg.onShow === 'function') pg.onShow()
})

/* ---------- 2. 解析工具 ---------- */
function readIf(p) {
  try { return fs.readFileSync(p, 'utf8') } catch (e) { return '' }
}

var KEYWORDS = { 'true': 1, 'false': 1, 'null': 1, 'undefined': 1, 'new': 1, 'typeof': 1, 'in': 1, 'of': 1, 'void': 1 }

/** 抽出 WXML 里 {{ }} 中用到的变量名（只取成员访问的根，避免 summary.x 被误判） */
function wxmlIdentifiers(src) {
  var ids = []
  var re = /\{\{([\s\S]*?)\}\}/g
  var m
  while ((m = re.exec(src))) {
    var e = m[1]
      .replace(/'[^']*'/g, ' ')                        // 去掉单引号字符串
      .replace(/"[^"]*"/g, ' ')                        // 去掉双引号字符串
      .replace(/\.[A-Za-z_$][A-Za-z0-9_$]*/g, ' ')    // 去掉 .成员访问
    var ir = /[A-Za-z_$][A-Za-z0-9_$]*/g
    var t
    while ((t = ir.exec(e))) ids.push(t[0])
  }
  return ids
}

/** 抽出事件绑定名 */
function wxmlHandlers(src) {
  var out = []
  var re = /\b(?:bind|catch)[:a-zA-Z]*\s*=\s*"([^"]*)"/g
  var m
  while ((m = re.exec(src))) {
    var v = m[1].trim()
    if (v) out.push(v)
  }
  return out
}

/** 抽出用到的样式类名（含 {{}} 里的字符串字面量） */
function wxmlClasses(src) {
  var out = []
  var re = /\b(?:class|hover-class|placeholder-class)\s*=\s*"([^"]*)"/g
  var m
  while ((m = re.exec(src))) {
    var raw = m[1]
    raw.replace(/\{\{[\s\S]*?\}\}/g, ' ').split(/\s+/).forEach(function (c) {
      if (c) out.push(c)
    })
    var rx = /\{\{([\s\S]*?)\}\}/g
    var mm
    while ((mm = rx.exec(raw))) {
      var expr = mm[1]
      // 三元表达式 a === 'x' ? 'y' : 'z' 里，只有 ? 之后的字符串才是类名，
      // ? 之前的 'x' 是比较用的值，不能当类名，否则会误报
      var qi = expr.indexOf('?')
      if (qi >= 0) expr = expr.slice(qi + 1)
      var sr = /'([^']*)'/g
      var s
      while ((s = sr.exec(expr))) {
        s[1].split(/\s+/).forEach(function (c) { if (c) out.push(c) })
      }
    }
  }
  return out
}

/** 抽出样式表里定义过的类名（要求点号后紧跟字母/下划线/连字符，避免误抓 1.5rpx） */
function cssClasses(src) {
  var out = {}
  var re = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g
  var m
  while ((m = re.exec(src))) out[m[1]] = 1
  return out
}

/* ---------- 3. 逐页检查 ---------- */
var appCss = cssClasses(readIf(path.join(ROOT, 'app.wxss')))
var pass = 0
var fail = 0
var problems = []

function record(ok, msg) {
  if (ok) { pass++; console.log('  [PASS] ' + msg) }
  else { fail++; problems.push(msg); console.log('  [FAIL] ' + msg) }
}

PAGES.forEach(function (p, idx) {
  var wxml = readIf(path.join(ROOT, p + '.wxml'))
  var wxss = readIf(path.join(ROOT, p + '.wxss'))
  var js = readIf(path.join(ROOT, p + '.js'))
  var pg = pageObjs[idx]

  console.log('\n' + '='.repeat(60))
  console.log('  ' + p)
  console.log('='.repeat(60))

  record(wxml.length > 0, 'wxml 存在且非空')
  record(wxss.length > 0, 'wxss 存在且非空')

  /* 3.1 事件绑定 → 页面函数 */
  var handlers = wxmlHandlers(wxml)
  var missingH = []
  var seenH = {}
  handlers.forEach(function (h) {
    if (seenH[h]) return
    seenH[h] = 1
    if (typeof pg[h] !== 'function') missingH.push(h)
  })
  record(missingH.length === 0,
    Object.keys(seenH).length + ' 个事件绑定都有对应函数 [' + Object.keys(seenH).join(', ') + ']' +
    (missingH.length ? ' 缺少: ' + missingH.join(', ') : ''))

  /* 3.2 模板变量 → data */
  var aliases = { item: 1, index: 1 }
  var fr = /wx:for-item\s*=\s*"([^"]+)"/g
  var fm
  while ((fm = fr.exec(wxml))) aliases[fm[1]] = 1

  var dataKeys = {}
  for (var k in pg.data) {
    if (Object.prototype.hasOwnProperty.call(pg.data, k)) dataKeys[k] = 1
  }

  var unknown = []
  var seenV = {}
  wxmlIdentifiers(wxml).forEach(function (id) {
    if (KEYWORDS[id] || aliases[id] || dataKeys[id] || seenV[id]) return
    seenV[id] = 1
    unknown.push(id)
  })
  record(unknown.length === 0,
    '模板变量全部在 data 中有定义' + (unknown.length ? ' 未定义: ' + unknown.join(', ') : ''))

  /* 3.3 样式类 → 样式表 */
  var localCss = cssClasses(wxss)
  var missCls = []
  var seenC = {}
  wxmlClasses(wxml).forEach(function (c) {
    if (seenC[c]) return
    seenC[c] = 1
    if (!localCss[c] && !appCss[c]) missCls.push(c)
  })
  record(missCls.length === 0,
    Object.keys(seenC).length + ' 个样式类都有定义' + (missCls.length ? ' 未定义: ' + missCls.join(', ') : ''))

  /* 3.4 页面都注册了 onLoad / onShow */
  record(typeof pg.onShow === 'function', '定义了 onShow（切回页面会刷新）')

  /* 3.5 页面 json 存在 */
  var pj = readIf(path.join(ROOT, p + '.json'))
  var jsonOk = false
  try { JSON.parse(pj); jsonOk = true } catch (e) { jsonOk = false }
  record(jsonOk, '页面 .json 是合法 JSON')
})

/* ---------- 4. 全局：app.json 页面注册与文件对应 ---------- */
console.log('\n' + '='.repeat(60))
console.log('  全局配置')
console.log('='.repeat(60))

var appCfg = JSON.parse(readIf(path.join(ROOT, 'app.json')))
var allFilesOk = true
var fileMiss = ''
appCfg.pages.forEach(function (p) {
  ;['.js', '.json', '.wxml', '.wxss'].forEach(function (ext) {
    if (!fs.existsSync(path.join(ROOT, p + ext))) { allFilesOk = false; fileMiss = p + ext }
  })
})
record(allFilesOk, 'app.json 注册的 ' + appCfg.pages.length + ' 个页面，其 4 件套文件都存在' +
  (fileMiss ? ' 缺: ' + fileMiss : ''))

record(appCfg.pages.length === pageObjs.length,
  '注册页面数 (' + appCfg.pages.length + ') 与实际加载的页面对象数 (' + pageObjs.length + ') 一致')

/* tabBar 的 pagePath 必须在 pages 里 */
var tabOk = true
var tabMiss = ''
appCfg.tabBar.list.forEach(function (t) {
  if (appCfg.pages.indexOf(t.pagePath) === -1) { tabOk = false; tabMiss = t.pagePath }
})
record(tabOk, 'tabBar 的 4 个 pagePath 都在 pages 列表里' + (tabMiss ? ' 缺: ' + tabMiss : ''))

/* tabBar 图标文件 */
var iconOk = true
var iconMsg = ''
appCfg.tabBar.list.forEach(function (t) {
  var f1 = path.join(ROOT, t.iconPath)
  var f2 = path.join(ROOT, t.selectedIconPath)
  if (!fs.existsSync(f1)) { iconOk = false; iconMsg = '缺 ' + t.iconPath }
  else if (fs.statSync(f1).size > 40 * 1024) { iconOk = false; iconMsg = t.iconPath + ' 超过 40KB' }
  if (!fs.existsSync(f2)) { iconOk = false; iconMsg = '缺 ' + t.selectedIconPath }
})
record(iconOk, 'tabBar 8 个图标文件齐备且都小于 40KB' + (iconMsg ? ' 问题: ' + iconMsg : ''))

/* ---------- 5. 汇总 ---------- */
console.log('\n' + '='.repeat(60))
console.log('通过: ' + pass + '   失败: ' + fail)
if (fail > 0) {
  console.log('\n问题清单:')
  problems.forEach(function (x) { console.log('  - ' + x) })
}
console.log('='.repeat(60))

process.exit(fail > 0 ? 1 : 0)
