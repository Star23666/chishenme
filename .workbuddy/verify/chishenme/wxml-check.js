/**
 * 今天吃啥 · 三方一致性静态检查
 *
 * 小程序的页面由 4 个文件组成，最容易出的错就是「四件套对不上」：
 *   - WXML 里 bindtap 写了函数名，JS 里忘了写       → 点了没反应
 *   - WXML 里用了 {{foo}}，data 里没有 foo          → 页面显示空白
 *   - WXML 里 class="bar"，WXSS 里没有 .bar         → 样式丢失
 *   - 页面直接调 wx.getStorageSync（破坏数据服务层）  → 将来换云数据库要全改
 *
 * 这些错误开发工具不会报，只有点到那个按钮才发现。这个脚本把它们全部静态揪出来。
 *
 * 运行： node .workbuddy/verify/chishenme/wxml-check.js
 */

var path = require('path')
var fs = require('fs')

var ROOT = path.resolve(__dirname, '..', '..', '..')
var APP_DIR = path.join(ROOT, 'chishenme')

/* ---------------- 复用 wx 伪造环境，真正加载页面拿到 data / 方法名 ---------------- */

var store = {}
global.wx = {
  setStorageSync: function (k, v) { store[k] = v },
  getStorageSync: function (k) { return store[k] === undefined ? '' : store[k] },
  removeStorageSync: function (k) { delete store[k] },
  showToast: function () {}, showModal: function () {},
  switchTab: function () {}, setClipboardData: function () {}
}

var appObj = null
global.App = function (o) { appObj = o }
var loaded = []
global.Page = function (o) { loaded.push(o) }
global.getApp = function () { return appObj }

// 这套检查只针对本地模式下的页面结构。
// config.js 里的 CLOUD_ENV 是用户会去改的值，这里显式钉死，
// 免得用户一填 envId、检查结果就变（云端逻辑由 cloud-test.js 覆盖）。
require(path.join(APP_DIR, 'config.js')).CLOUD_ENV = ''

require(path.join(APP_DIR, 'app.js'))

/*
 * 页面列表**从 app.json 读**，不再写死。
 * 之前写死了 5 个，加了「家庭页」之后这一页就完全不在检查范围内了——
 * 检查器自己成了盲区，比不检查更危险。
 */
var appJsonRaw = read(path.join(APP_DIR, 'app.json'))
var appJson = JSON.parse(appJsonRaw)

var PAGES = []
var dirPaths = {}
for (var pi = 0; pi < appJson.pages.length; pi++) {
  var full = path.join(APP_DIR, appJson.pages[pi])
  var name = path.basename(full)
  PAGES.push(name)
  dirPaths[name] = path.dirname(full)
}

var pageObjs = {}
for (var i = 0; i < PAGES.length; i++) {
  var n = loaded.length
  require(path.join(dirPaths[PAGES[i]], PAGES[i] + '.js'))
  pageObjs[PAGES[i]] = loaded[n]
}

/* ---------------- 断言机 ---------------- */

var pass = 0, fail = 0, failures = [], section = ''
function S(t) { section = t; console.log('\n' + t) }
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name) }
  else {
    fail++
    failures.push(section + ' \u203a ' + name + (extra ? '  [' + extra + ']' : ''))
    console.log('  \u2717 ' + name + (extra ? '  [' + extra + ']' : ''))
  }
}

/* ---------------- 解析工具 ---------------- */

var RESERVED = { 'true': 1, 'false': 1, 'null': 1, 'undefined': 1, 'new': 1, 'typeof': 1, 'in': 1, 'instanceof': 1 }

/** 取 WXML 里所有 bind / catch 绑定的处理函数名（忽略动态绑定） */
function handlersOf(wxml) {
  var out = []
  var re = /\b(?:bind|catch|capture-bind|capture-catch)[a-zA-Z]+\s*=\s*"([^"]*)"/g
  var m
  while ((m = re.exec(wxml))) {
    var v = m[1].trim()
    if (!v || v.indexOf('{{') >= 0) continue
    out.push(v)
  }
  return out
}

/** 取 WXML 里所有 wx:for-item / wx:for-index 自定义别名 */
function localsOf(wxml) {
  var locals = { item: 1, index: 1 }
  var re = /wx:for-(?:item|index)\s*=\s*"([^"]*)"/g
  var m
  while ((m = re.exec(wxml))) {
    var v = m[1].trim()
    if (v) locals[v] = 1
  }
  return locals
}

/** 取 {{ }} 表达式里出现的根标识符（item.name 的根是 item，不是 name） */
function rootVarsOf(wxml) {
  var out = []
  var re = /\{\{([\s\S]*?)\}\}/g
  var m
  while ((m = re.exec(wxml))) {
    var expr = m[1]
    // 去掉字符串字面量，避免把 'on' 这类当成变量
    expr = expr.replace(/'[^']*'/g, ' ').replace(/"[^"]*"/g, ' ')
    // 去掉点号属性访问，只留根：item.name -> item；list.length -> list
    expr = expr.replace(/\.[A-Za-z_$][A-Za-z0-9_$]*/g, '')
    var ids = expr.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []
    for (var i = 0; i < ids.length; i++) out.push(ids[i])
  }
  return out
}

/**
 * 取 WXML 里用到的 class 名。
 * 重点：三元表达式里的「比较值」不是类名，只有 ? 之后的字面量才是。
 *      class="{{type === 'x' ? 'a' : ''}}"  → 只有 a 是类名，x 不是。
 */
function classesOf(wxml) {
  var out = []
  var re = /class\s*=\s*"([^"]*)"/g
  var m
  while ((m = re.exec(wxml))) {
    var val = m[1]
    // 静态部分
    var staticPart = val.replace(/\{\{[\s\S]*?\}\}/g, ' ')
    staticPart.split(/\s+/).forEach(function (t) {
      if (t) out.push(t)
    })
    // 表达式部分：只取第一个 ? 之后的字面量
    var must = val.match(/\{\{[\s\S]*?\}\}/g) || []
    for (var k = 0; k < must.length; k++) {
      var expr = must[k]
      var q = expr.indexOf('?')
      if (q < 0) continue
      var tail = expr.slice(q + 1)
      var lits = tail.match(/'([^']*)'|"([^"]*)"/g) || []
      for (var j = 0; j < lits.length; j++) {
        var s = lits[j].slice(1, -1).trim()
        if (s && s.indexOf(' ') < 0) out.push(s)
      }
    }
  }
  return out
}

/** 取 WXSS 里定义过的所有 class 名（只看选择器部分，不看属性值） */
function classesInWxss(css) {
  var set = {}
  var clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  var parts = clean.split('}')
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i]
    var brace = seg.indexOf('{')
    if (brace < 0) continue
    var selector = seg.slice(0, brace)
    var re = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g
    var m
    while ((m = re.exec(selector))) set[m[1]] = true
  }
  return set
}

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

/** 去掉 JS 注释，避免注释里提到的 API 被误判成真实调用 */
function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/* ==================== A. 事件绑定 → 函数 ==================== */

S('A. 事件绑定 → 页面函数')

for (var a = 0; a < PAGES.length; a++) {
  var pg = PAGES[a]
  var wxml = read(path.join(dirPaths[pg], pg + '.wxml')) || ''
  var obj = pageObjs[pg] || {}
  var hs = handlersOf(wxml)
  var bad = []
  for (var h = 0; h < hs.length; h++) {
    if (typeof obj[hs[h]] !== 'function') bad.push(hs[h])
  }
  ok(pg + '.wxml 的 ' + hs.length + ' 个事件绑定都有对应函数', bad.length === 0, bad.join(', '))
}

/* ==================== B. 模板变量 → data ==================== */

S('B. 模板变量 → 页面 data')

for (var b = 0; b < PAGES.length; b++) {
  var pg2 = PAGES[b]
  var wxml2 = read(path.join(dirPaths[pg2], pg2 + '.wxml')) || ''
  var data = (pageObjs[pg2] || {}).data || {}
  var locals = localsOf(wxml2)
  var vars = rootVarsOf(wxml2)
  var missing = {}
  for (var v = 0; v < vars.length; v++) {
    var name = vars[v]
    if (RESERVED[name] || locals[name]) continue
    if (data[name] === undefined) missing[name] = true
  }
  var keys = Object.keys(missing)
  ok(pg2 + '.wxml 引用的变量都在 data 里', keys.length === 0, keys.join(', '))
}

/* ==================== C. 样式类 → 样式表 ==================== */

S('C. 样式类 → 样式表')

var appCss = classesInWxss(read(path.join(APP_DIR, 'app.wxss')) || '')

for (var c = 0; c < PAGES.length; c++) {
  var pg3 = PAGES[c]
  var wxml3 = read(path.join(dirPaths[pg3], pg3 + '.wxml')) || ''
  var pageCss = classesInWxss(read(path.join(dirPaths[pg3], pg3 + '.wxss')) || '')
  var used = classesOf(wxml3)
  var undef = {}
  for (var u = 0; u < used.length; u++) {
    var cn = used[u]
    if (pageCss[cn] || appCss[cn]) continue
    undef[cn] = true
  }
  var uk = Object.keys(undef)
  ok(pg3 + '.wxml 用到的 ' + used.length + ' 个 class 都有样式', uk.length === 0, uk.join(', '))
}

/* ==================== D. 四件套齐全 & app.json 注册 ==================== */

S('D. 页面四件套与注册')

for (var d = 0; d < PAGES.length; d++) {
  var pg4 = PAGES[d]
  var d4 = dirPaths[pg4]
  ok(pg4 + '.js 存在', fs.existsSync(path.join(d4, pg4 + '.js')))
  ok(pg4 + '.wxml 存在', fs.existsSync(path.join(d4, pg4 + '.wxml')))
  ok(pg4 + '.wxss 存在', fs.existsSync(path.join(d4, pg4 + '.wxss')))
  ok(pg4 + '.json 存在', fs.existsSync(path.join(d4, pg4 + '.json')))
}

// 注意：PAGES 本身是从 app.json 推出来的，所以「数量相等」是同义反复，没有检查价值。
// 这里换两个真正会失败的：有没有重复注册、有没有少到离谱。
var dupPages = []
var seenPage = {}
for (var du = 0; du < appJson.pages.length; du++) {
  var pp = appJson.pages[du]
  if (seenPage[pp]) dupPages.push(pp)
  seenPage[pp] = true
}
ok('app.json 没有重复注册页面', dupPages.length === 0, dupPages.join(', '))
ok('app.json 至少注册了 5 个页面', appJson.pages.length >= 5, 'actual=' + appJson.pages.length)

var notRegistered = []
for (var r = 0; r < PAGES.length; r++) {
  if (appJson.pages.indexOf('pages/' + PAGES[r] + '/' + PAGES[r]) < 0) notRegistered.push(PAGES[r])
}
ok('每个页面都在 app.json 的 pages 里', notRegistered.length === 0, notRegistered.join(', '))

var missingFiles = []
for (var s = 0; s < appJson.pages.length; s++) {
  var base = path.join(APP_DIR, appJson.pages[s])
  ;['.js', '.wxml', '.wxss', '.json'].forEach(function (ext) {
    if (!fs.existsSync(base + ext)) missingFiles.push(appJson.pages[s] + ext)
  })
}
ok('app.json 里每个页面文件都存在', missingFiles.length === 0, missingFiles.join(', '))

/* ==================== E. tabBar 配置与图标 ==================== */

S('E. tabBar 配置与图标')

var tb = appJson.tabBar
ok('tabBar 有 5 个标签', tb && tb.list.length === 5, tb ? 'actual=' + tb.list.length : 'no tabBar')
/*
 * ★ 这里原来把颜色**写死**成 '#8A8F99'，于是改配色要同时改三个地方
 *   （app.wxss / app.json / 图标生成器），还要再回来改这个检查器 ——
 *   这正是「改了检查才能过」的检查器，迟早被顺手改坏。
 *   改成从图标生成器里抠出真值来比：app.json 与 gen-tab-icons.py 必须一致，
 *   而图标 PNG 与 app.json 是否一致由 check-images.py 负责。
 *   三处的关系就闭合成一条链，没有第四处需要人工同步。
 */
function iconGenColor (varName) {
  var src = read(path.join(ROOT, '.workbuddy', 'tools', 'gen-tab-icons.py')) || ''
  var m = src.match(new RegExp(varName + '\\s*=\\s*\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)'))
  if (!m) return null
  var h = function (n) {
    var s = Number(n).toString(16)
    return s.length < 2 ? '0' + s : s
  }
  return ('#' + h(m[1]) + h(m[2]) + h(m[3])).toUpperCase()
}
var genNormal = iconGenColor('NORMAL')
var genActive = iconGenColor('ACTIVE')
ok('能读出图标生成器里的颜色（NORMAL/ACTIVE）', !!genNormal && !!genActive,
  'NORMAL=' + genNormal + ' ACTIVE=' + genActive)
ok('tabBar 未选中色 = 图标生成器 NORMAL',
  !!genNormal && String(tb.color).toUpperCase() === genNormal, tb.color + ' vs ' + genNormal)
ok('tabBar 选中色 = 图标生成器 ACTIVE',
  !!genActive && String(tb.selectedColor).toUpperCase() === genActive,
  tb.selectedColor + ' vs ' + genActive)

var badTab = []
var badSlash = []
for (var t = 0; t < tb.list.length; t++) {
  var it = tb.list[t]
  if (appJson.pages.indexOf(it.pagePath) < 0) badTab.push(it.text + ':pagePath')
  /* ★ 图标路径必须以 / 开头。
     不写斜杠时，模拟器按「相对当前页面」去解析路径，5 个图标会整排渲染成
     「图片加载失败」的碎图，而页面文字完全正常 —— 所以极易被误判成
     「图标没生成」或「工具坏了」。
     菜图一直用的是 '/images/dishes/xxx.jpg'（带斜杠），从来没出过问题，
     两种写法的差别就在这一个字符。别把这行检查删掉。 */
  if (it.iconPath.charAt(0) !== '/') badSlash.push(it.text + ':' + it.iconPath)
  if (it.selectedIconPath.charAt(0) !== '/') badSlash.push(it.text + ':' + it.selectedIconPath)
  if (!fs.existsSync(path.join(APP_DIR, it.iconPath.replace(/^\//, '')))) badTab.push(it.text + ':' + it.iconPath)
  if (!fs.existsSync(path.join(APP_DIR, it.selectedIconPath.replace(/^\//, '')))) badTab.push(it.text + ':' + it.selectedIconPath)
}
ok('tabBar 的 pagePath 与图标文件都有效', badTab.length === 0, badTab.join(', '))
ok('tabBar 图标路径都以 / 开头（不带斜杠会渲染成碎图）', badSlash.length === 0, badSlash.join(', '))

var needIcons = ['tab-library', 'tab-order', 'tab-menu', 'tab-random', 'tab-fav']
var missIcon = []
for (var ii = 0; ii < needIcons.length; ii++) {
  ;['', '-on'].forEach(function (sfx) {
    var f = path.join(APP_DIR, 'images', needIcons[ii] + sfx + '.png')
    if (!fs.existsSync(f)) missIcon.push(needIcons[ii] + sfx + '.png')
  })
}
ok('10 个 tabBar 图标 PNG 都在', missIcon.length === 0, missIcon.join(', '))

/* ==================== F. 架构铁律 ==================== */

S('F. 架构铁律：页面不直接碰本地存储')

var allJs = []
function walk(dir) {
  var items = fs.readdirSync(dir)
  for (var i = 0; i < items.length; i++) {
    var p = path.join(dir, items[i])
    var st = fs.statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.js$/.test(p)) allJs.push(p)
  }
}
walk(APP_DIR)

var offenders = []
for (var j = 0; j < allJs.length; j++) {
  var rel = path.relative(APP_DIR, allJs[j]).replace(/\\/g, '/')
  if (rel === 'utils/storage.js') continue          // 唯一允许的地方
  var src = stripJsComments(fs.readFileSync(allJs[j], 'utf8'))
  if (/wx\.(get|set|remove)StorageSync/.test(src)) offenders.push(rel)
}
ok('只有 utils/storage.js 直接调用 wx.xxxStorageSync', offenders.length === 0, offenders.join(', '))

// 页面不许自己拼图片路径，必须走 data/dishes.js 的 imageOf
var hardPath = []
for (var k = 0; k < allJs.length; k++) {
  var rel2 = path.relative(APP_DIR, allJs[k]).replace(/\\/g, '/')
  if (rel2.indexOf('pages/') !== 0) continue
  var src2 = stripJsComments(fs.readFileSync(allJs[k], 'utf8'))
  if (/['"]\/images\/dishes\//.test(src2)) hardPath.push(rel2)
}
ok('页面没有硬编码菜品图片路径（统一走 dishes.js）', hardPath.length === 0, hardPath.join(', '))

/* ==================== F2. 微信组件默认样式陷阱 ==================== */

S('F2. 微信组件默认样式陷阱：input 必须显式给高度')

/*
 * 微信 <input> 的基础库默认样式是：
 *   input { display:block; height:1.4rem; min-height:1.4rem;
 *           overflow:hidden; white-space:nowrap; }
 *
 * 如果样式块里同时写了 box-sizing:border-box 和「上下 padding」，
 * 内容区高度 = 1.4rem(22.4px) − 上下 padding，很容易算成负值 ——
 * 输入的文字会被整行裁掉。
 *
 * ★ 这个 bug 极其隐蔽，**只有真机才暴露**：
 *   - 开发者工具模拟器：正常
 *   - 浏览器复刻渲染：正常（浏览器里 <input> 没有默认高度）
 *   - 411 项自动检查：全绿
 *   2026-10-16 就是这么踩的，用户在真机上完全看不到自己输入的字。
 *
 * 规则：凡是作用在 <input> 上的样式块，只要带 box-sizing:border-box，
 *       就必须显式写 height（垂直居中交给组件自身，别再用上下 padding）。
 * 注意 min-height 不算数 —— 那正是默认值本身，没解决问题。
 */

var inputClasses = {}
for (var pgName in dirPaths) {
  var wxmlSrc = read(path.join(dirPaths[pgName], pgName + '.wxml'))
  if (!wxmlSrc) continue
  var iRe = /<input\b[^>]*>/g
  var iM
  while ((iM = iRe.exec(wxmlSrc))) {
    var cAttr = iM[0].match(/class\s*=\s*"([^"]*)"/)
    if (!cAttr) continue
    var cToks = cAttr[1].split(/\s+/)
    for (var ci = 0; ci < cToks.length; ci++) if (cToks[ci]) inputClasses[cToks[ci]] = 1
  }
}

var cssFiles = []
function walkCss(dir) {
  var items = fs.readdirSync(dir)
  for (var i = 0; i < items.length; i++) {
    var p = path.join(dir, items[i])
    var st = fs.statSync(p)
    if (st.isDirectory()) walkCss(p)
    else if (/\.wxss$/.test(p)) cssFiles.push(p)
  }
}
walkCss(APP_DIR)

var riskyInput = []
for (var cf = 0; cf < cssFiles.length; cf++) {
  var cfRel = path.relative(APP_DIR, cssFiles[cf]).replace(/\\/g, '/')
  var cssClean = fs.readFileSync(cssFiles[cf], 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
  var cssParts = cssClean.split('}')
  for (var cb = 0; cb < cssParts.length; cb++) {
    var seg = cssParts[cb]
    var br = seg.indexOf('{')
    if (br < 0) continue
    var sel = seg.slice(0, br)
    var body = seg.slice(br + 1)
    var nameRe = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g
    var nm
    var hitsInput = false
    while ((nm = nameRe.exec(sel))) if (inputClasses[nm[1]]) hitsInput = true
    if (!hitsInput) continue
    if (!/box-sizing\s*:\s*border-box/.test(body)) continue
    if (!/(?<![\w-])height\s*:/.test(body)) {
      riskyInput.push(cfRel + ' › ' + sel.trim().replace(/\s+/g, ' '))
    }
  }
}

ok('作用在 <input> 上的 border-box 样式块都显式写了 height',
  riskyInput.length === 0, riskyInput.join(' | '))

/* ==================== G. 云开发铁律 ==================== */

S('G. 云开发铁律')

// G1. 只有 utils/cloud.js 能直接碰 wx.cloud
var cloudOffenders = []
for (var g1 = 0; g1 < allJs.length; g1++) {
  var rel3 = path.relative(APP_DIR, allJs[g1]).replace(/\\/g, '/')
  if (rel3 === 'utils/cloud.js') continue
  var src3 = stripJsComments(fs.readFileSync(allJs[g1], 'utf8'))
  if (/wx\.cloud\b/.test(src3)) cloudOffenders.push(rel3)
}
ok('只有 utils/cloud.js 直接调用 wx.cloud', cloudOffenders.length === 0, cloudOffenders.join(', '))

// G2. config.js 是唯一的配置出口，关键字都在
var configSrc = read(path.join(APP_DIR, 'config.js')) || ''
var needKeys = ['CLOUD_ENV', 'CLOUD_FUNCTION', 'COL_FAMILIES', 'COL_MENUS', 'MAX_MEMBERS']
var missKeys = needKeys.filter(function (k) { return configSrc.indexOf(k) < 0 })
ok('config.js 导出了 ' + needKeys.length + ' 个配置项', missKeys.length === 0, missKeys.join(', '))

// G3. envId 只能出现在 config.js，不能散落各处
/*
 * ★ 只看**非空**的赋值。
 *   仓库里还有一个 config.example.js（模板，CLOUD_ENV 留空），
 *   它写的是 `CLOUD_ENV: ''` —— 那是给人抄的空白模板，不是泄漏。
 *   但示例文件是**会进仓库**的，所以它同样在检查范围内：
 *   谁要是把真环境 ID 填进模板里，这里立刻报出来。
 */
var envSpread = []
for (var g3 = 0; g3 < allJs.length; g3++) {
  var rel4 = path.relative(APP_DIR, allJs[g3]).replace(/\\/g, '/')
  if (rel4 === 'config.js') continue
  var src4 = stripJsComments(fs.readFileSync(allJs[g3], 'utf8'))
  if (/CLOUD_ENV\s*[:=]\s*['"][^'"]+['"]/.test(src4)) envSpread.push(rel4)
}
ok('环境 ID 只在 config.js 里定义一次（模板文件里只允许留空）', envSpread.length === 0, envSpread.join(', '))

// G4. 客户端和云函数必须用同一套 UTC+8 算法，否则晚上 8 点后两边对"今天"的理解不一致
var fmtSrc = read(path.join(APP_DIR, 'utils', 'format.js')) || ''
ok('客户端 format.js 用 UTC+8 算日期', /8\s*\*\s*3600\s*\*\s*1000/.test(fmtSrc))

var cfIndexPath = path.join(APP_DIR, 'cloudfunctions', 'csmMenu', 'index.js')
var cfSrc = read(cfIndexPath)
ok('云函数 index.js 存在', !!cfSrc)
cfSrc = cfSrc || ''
var cfNoComment = stripJsComments(cfSrc)
ok('云函数用 UTC+8 算日期', /8\s*\*\s*3600\s*\*\s*1000/.test(cfNoComment))

// 云函数跑在 UTC，裸用 getFullYear/getMonth/getDate 会把晚上的单子算成明天
var tzBad = cfNoComment.match(/\.get(FullYear|Month|Date|Day|Hours)\s*\(/g) || []
ok('云函数没有裸用本地时区取日期（全部走 getUTC*）', tzBad.length === 0, tzBad.join(', '))

ok('云函数导出了 main 入口', /exports\.main\s*=/.test(cfSrc))

/*
 * G4b. ★ 菜单的「翻篇时刻」两边必须一模一样。
 *
 * 菜单每天 22:30 作废是靠「日期当键」实现的：写的时候按这个时刻算属于哪天，
 * 读的时候也按它算当前是哪天。两边只要差一点，22:30 之后点的菜就会被以
 * 一个日期写进去、以另一个日期读出来 —— 菜沉在库里、界面不显示，
 * 而且**两边都不报错**（本项目最难查的那一类故障）。
 *
 * 所以这里直接把两边的 MENU_CUTOFF_H 抠出来比数值，而不是靠人记得同步改。
 */
function cutoffOf(src) {
  var m = String(src).match(/MENU_CUTOFF_H\s*=\s*([0-9.]+)/)
  return m ? parseFloat(m[1]) : null
}
var cutClient = cutoffOf(stripJsComments(fmtSrc))
var cutCloud = cutoffOf(cfNoComment)
ok('客户端定义了菜单翻篇时刻 MENU_CUTOFF_H', cutClient !== null)
ok('云函数定义了菜单翻篇时刻 MENU_CUTOFF_H', cutCloud !== null)
ok('★ 两边的翻篇时刻完全一致（差一点就是沉默丢菜单）',
  cutClient !== null && cutClient === cutCloud,
  '客户端 ' + cutClient + ' / 云函数 ' + cutCloud)

// 菜单相关的读写必须全部走 menuDayStr，不能混用 todayStr
var menuFns = ['addDish', 'setQty', 'setNote', 'clearMenu', 'listMenu']
var mixedTz = []
menuFns.forEach(function (fn) {
  var m = cfNoComment.match(new RegExp('(async\\s+)?function\\s+' + fn + '\\s*\\([\\s\\S]*?\\n\\}'))
  if (m && /todayStr\s*\(/.test(m[0])) mixedTz.push(fn)
})
ok('云函数的菜单读写没混用 todayStr（一律 menuDayStr）', mixedTz.length === 0, mixedTz.join(', '))

/*
 * G4c. ★ 订阅消息的模板 ID，客户端和云函数必须**完全一致**。
 *
 * 客户端拿它去 requestSubscribeMessage（相当于「订哪个模板」），
 * 云函数拿它去 subscribeMessage.send（相当于「发哪个模板」）。
 * 两边不一致的表现是最恶劣的一种：**发送静默失败** ——
 * 点菜的人毫无感觉，收不到的人也不知道，界面上什么都不报。
 * 所以这里直接把两边的值抠出来比。
 *
 * ★ 这段必须放在 cfNoComment 赋值**之后**（var 提升会让前面读到 undefined，
 *   结果就是「云函数 null」，看起来像没配）。
 * config.js 不入库（里面有环境 ID），它不存在时跳过，不算失败。
 */
function tmplIdOf (src, key) {
  var m = String(src).match(new RegExp(key + "\\s*[:=]\\s*'([^']+)'"))
  return m ? m[1] : null
}
var cfgTmpl = tmplIdOf(configSrc, 'SUBSCRIBE_TMPL_ID')
var cfTmpl = tmplIdOf(cfNoComment, 'SUBSCRIBE_TPL')
if (cfgTmpl) {
  ok('★ 订阅消息模板 ID 客户端与云函数一致', cfgTmpl === cfTmpl,
    '客户端 ' + cfgTmpl + ' / 云函数 ' + cfTmpl)
} else {
  ok('config.js 里没有配订阅消息模板 ID（跳过一致性检查）', true)
}
var cloudCfg = read(path.join(APP_DIR, 'cloudfunctions', 'csmMenu', 'config.json')) || ''
ok('云函数声明了 subscribeMessage.send 权限（漏了会报「无权限调用」）',
  cloudCfg.indexOf('subscribeMessage.send') >= 0)

/*
 * G4e. ★ 字号下限：小字不许低于 24rpx（375 屏上约 12px）。
 *
 * 这个 app 是给家里人用的、包含长辈。1.5.6 把最小两档从 10.5 / 11.5px
 * 抬到了 12 / 13px —— 这种「默认就看得清」的事，很容易被后来的人
 * 为了「一屏塞下更多」又改小回去，所以要钉住。
 */
var appRawCss = read(path.join(APP_DIR, 'app.wxss')) || ''
var tagPx = (appRawCss.match(/--t-tag:\s*(\d+)rpx/) || [])[1]
var capPx = (appRawCss.match(/--t-cap:\s*(\d+)rpx/) || [])[1]
ok('最小字号档 --t-tag 不低于 24rpx（约 12px）', !!tagPx && Number(tagPx) >= 24, '--t-tag: ' + tagPx)
ok('--t-cap 不低于 24rpx', !!capPx && Number(capPx) >= 24, '--t-cap: ' + capPx)

// 页面里写死的字号（不走令牌的那些）也不许低于下限
var smallLiteral = []
var cssFiles = ['app.wxss']
fs.readdirSync(path.join(APP_DIR, 'pages')).forEach(function (d) {
  cssFiles.push(path.join('pages', d, d + '.wxss'))
})
cssFiles.forEach(function (rel) {
  var src = read(path.join(APP_DIR, rel)) || ''
  var re = /font-size:\s*(\d+)rpx/g
  var m
  while ((m = re.exec(src)) !== null) {
    if (Number(m[1]) < 24) smallLiteral.push(rel + ' → ' + m[1] + 'rpx')
  }
})
ok('没有任何低于 24rpx 的写死字号', smallLiteral.length === 0, smallLiteral.join('; '))

/*
 * G4f. ★ 文字对比度下限（WCAG AA：正文 ≥4.5，非正文 ≥3）。
 *
 * 为什么要有这条：1.5.8 之前 `--c-ink-3` 是 #8A8F99，对纸底只有 **2.98:1**，
 * `--c-ink-4` 只有 **1.87:1** —— 而这两档被用了 48 处（分类、主料、几份、说明、占位符）。
 * 前几轮一直在"调色"，但没人真的**算过**，所以谁也没发现小字根本没达标。
 *
 * 这条断言把"改浅一点试试"这种手滑挡在门口：
 * 想调淡就得先看这里为什么红。
 */
function lumOf (hex) {
  var h = String(hex).replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  var f = function (i) {
    var v = parseInt(h.substr(i, 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4)
}
function contrastOf (a, b) {
  var la = lumOf(a), lb = lumOf(b)
  var hi = Math.max(la, lb), lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}
function colorToken (name) {
  var m = appRawCss.match(new RegExp('--c-' + name + ':\\s*(#[0-9A-Fa-f]{3,8})'))
  return m ? m[1] : null
}
var COLOR_PAIRS = [
  ['ink', 'bg', 4.5, '正文'],
  ['ink-2', 'bg', 4.5, '次要文字'],
  ['ink-3', 'bg', 4.5, '弱文字'],
  ['ink-3', 'surface-sunk', 4.5, '弱文字在暖底上'],
  ['ink-3', 'surface', 4.5, '弱文字在弹层白底上'],
  ['ink-2', 'surface', 4.5, '次要文字在弹层白底上'],
  ['brand-ink', 'bg', 4.5, '灶红（用主色的字）'],
  ['danger', 'bg', 4.5, '危险文字'],
  ['ink', 'brand', 4.5, '主按钮（墨压橙）'],
  // ★ ink-4 有意豁免到 4.5：它只做占位符，必须比真值弱。
  //   但给个 3.5 的地板，防止被一路改淡回当初的 1.87。
  ['ink-4', 'bg', 3.5, '占位符（豁免到 3.5）']
]
var cFails = []
COLOR_PAIRS.forEach(function (p) {
  var fg = colorToken(p[0]), bg = colorToken(p[1])
  if (!fg || !bg) { cFails.push(p[0] + '/' + p[1] + ' 令牌缺失'); return }
  var r = contrastOf(fg, bg)
  if (r < p[2]) cFails.push(p[0] + '/' + p[1] + ' = ' + r.toFixed(2) + ' < ' + p[2])
})
ok('★ 全部文字对比度达标（WCAG AA）', cFails.length === 0, cFails.join('; '))

// 把实测值打出来，方便以后改色时直接对照
var cLine = []
COLOR_PAIRS.forEach(function (p) {
  var fg = colorToken(p[0]), bg = colorToken(p[1])
  if (fg && bg) cLine.push(p[0] + '/' + p[1] + ' ' + contrastOf(fg, bg).toFixed(2))
})
console.log('      对比度实测：' + cLine.join('  '))

/*
 * G4g. ★ 间距必须踩在 8rpx（4pt）网格上。
 *
 * 1.5.9 之前有 **28 个不同取值**（22/24/26/28 四个几乎分不出），
 * 整体看着"哪里都差一点点"却说不清哪不对。归网格之后应当只剩个位数档位。
 *
 * 允许的取值：0 / 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64 / 96 / 112 / 168
 *   + var(--gutter)（页面槽宽，唯一的语义例外）
 *   + 负数（-8rpx、-1rpx 这种是刻意做的边缘重合，不算节奏）
 *
 * ★★ 另外必须守住 `--gutter` **有定义**：它一没了，所有 `padding: 0 var(--gutter)`
 *    会退化成 0，整站内容直接贴边 —— 而且不报错、只有真机看得出来。
 */
var SPACE_OK = [0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 96, 112, 168]
var gutterDefined = /--gutter:\s*[\d.]+rpx/.test(appRawCss)
ok('★ --gutter 有定义（没了会让所有横向内边距退化成 0）', gutterDefined,
  gutterDefined ? '' : 'app.wxss 的 page{} 里找不到 --gutter')

var spaceVals = {}
var spaceBad = []
var cssList = ['app.wxss']
fs.readdirSync(path.join(APP_DIR, 'pages')).forEach(function (d) {
  cssList.push(path.join('pages', d, d + '.wxss'))
})
cssList.forEach(function (rel) {
  var src = read(path.join(APP_DIR, rel)) || ''
  var body = String(src).replace(/\/\*[\s\S]*?\*\//g, '')
  var re = /(?:padding|margin)(?:-(?:top|right|bottom|left))?\s*:\s*([^;]+);/g
  var m
  while ((m = re.exec(body)) !== null) {
    m[1].split(/\s+/).forEach(function (t) {
      if (!t) return
      if (t === 'var(--gutter)') { spaceVals[t] = (spaceVals[t] || 0) + 1; return }
      var mv = t.match(/^(-?)(\d+)rpx$/)
      if (!mv) return                      // 0 / auto / calc(...) 之类跳过
      var n = Number(mv[2])
      spaceVals[t] = (spaceVals[t] || 0) + 1
      if (mv[1] === '-') return            // 负值是刻意的边缘重合
      if (n === 0) return
      if (SPACE_OK.indexOf(n) < 0) spaceBad.push(rel + ': ' + t)
    })
  }
})
ok('★ 间距全部踩在 8rpx 网格上', spaceBad.length === 0, spaceBad.slice(0, 6).join('; '))
var kindCount = Object.keys(spaceVals).length
ok('间距取值种类 ≤ 16（归网格前是 28）', kindCount <= 16, '现在 ' + kindCount + ' 种')
console.log('      间距取值：' + Object.keys(spaceVals).sort().join('  '))

// G5. ★ 最关键的一条：前端调的每个 action，云函数里都得真的有这个 case
var cfActions = {}
var reCase = /case\s+'([A-Za-z_][A-Za-z0-9_]*)'\s*:/g
var mc
while ((mc = reCase.exec(cfNoComment))) cfActions[mc[1]] = true

var calledActions = {}
var appSrc = stripJsComments(read(path.join(APP_DIR, 'app.js')) || '')
var famSrc = stripJsComments(read(path.join(APP_DIR, 'pages', 'family', 'family.js')) || '')
var allFront = appSrc + '\n' + famSrc
var reCall = /(?:cloud\.call|this\._push)\s*\(\s*'([A-Za-z_][A-Za-z0-9_]*)'/g
var mcall
while ((mcall = reCall.exec(allFront))) calledActions[mcall[1]] = true

var ghost = Object.keys(calledActions).filter(function (a) { return !cfActions[a] })
ok('前端调用的 ' + Object.keys(calledActions).length + ' 个 action 云函数里都存在',
  ghost.length === 0, ghost.join(', '))

var unused = Object.keys(cfActions).filter(function (a) { return !calledActions[a] })
console.log('    （云函数里前端暂未调用的 action：' + (unused.join(', ') || '无') + '）')

// G6. 四个写操作都必须能推到云端，漏一个就是"本地改了云端没改"
var mustPush = ['addDish', 'setQty', 'setNote', 'clearMenu']
var missPush = mustPush.filter(function (a) { return !calledActions[a] })
ok('加菜/改份数/改备注/清空 四个写操作都会同步到云端', missPush.length === 0, missPush.join(', '))

// G7. 解散房间（唯一的不可逆操作）的两条硬约束
/*
 * ① 房主校验必须在云函数里。客户端那个「是房主才显示解散按钮」只是界面上的
 *    方便，改一行 wxml 就绕过去了 —— 真正拦得住的地方只有服务端。
 * ② 先删菜单，再删家庭。菜单只按 familyCode 归类，房间码是找到它们的唯一线索；
 *    顺序反过来的话，万一删菜单失败，那批菜单就成了谁也清不掉的孤儿数据。
 */
ok('云函数里有 dissolveFamily 这个 action', !!cfActions.dissolveFamily)

var dsIdx = cfNoComment.indexOf('async function dissolveFamily')
var dsBody = dsIdx >= 0 ? cfNoComment.slice(dsIdx, dsIdx + 700) : ''
ok('能找到 dissolveFamily 的函数体', dsIdx >= 0)
ok('解散在服务端校验了房主，不是只靠界面藏按钮',
  /owner\s*!==\s*openid/.test(dsBody), dsBody.slice(0, 90))
ok('解散时先删菜单再删家庭（顺序反了会留下清不掉的孤儿菜单）',
  dsBody.indexOf('MENU') >= 0 && dsBody.indexOf('FAM') >= 0 &&
  dsBody.indexOf('MENU') < dsBody.indexOf('FAM'))

// G8. 房主解散之后，其他成员的手机必须能自己发现「房间没了」
/*
 * 解散是房主单方面的动作，其他成员什么都没做，他们的手机里还缓存着
 * 那个已经不存在的房间。不主动对账的话，他们会一直点一个报错的菜单，
 * 而且完全不知道房间已经没了 —— 这类「静默失效」最难排查。
 */
ok('拉菜单撞上 NO_FAMILY 时会顺手清掉本机的家庭缓存',
  /NO_FAMILY/.test(appSrc) && /setFamily\(null\)/.test(appSrc))

var onShowAt = famSrc.indexOf('onShow')
var famOnShow = onShowAt >= 0 ? famSrc.slice(onShowAt, onShowAt + 700) : ''
ok('家庭页 onShow 会跟服务端对一次账（否则解散了家人那边还显示旧房间）',
  famOnShow.indexOf('refreshFamily') >= 0, famOnShow.slice(0, 80))

/* ---------------- 汇总 ---------------- */

console.log('\n' + '='.repeat(56))
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail) {
  console.log('\n  失败清单：')
  for (var fi = 0; fi < failures.length; fi++) console.log('    - ' + failures[fi])
}
console.log('='.repeat(56))
process.exit(fail ? 1 : 0)
