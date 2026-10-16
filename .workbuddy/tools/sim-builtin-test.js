/* 在真实模拟器里端到端验证「房主改 / 删内置的 80 道菜」。
   先决条件：开发者工具已开服务端口，且已用
     cli.bat auto --project <chishenme> --auto-port 9420
   起了自动化模式（自动化端口 ws://127.0.0.1:9420）。

   检查内容（全部走 app.js 的真实链路，不是直接调云函数）：
     1) 模拟器里有没有家庭、我是不是房主（不是房主就现建一个）
     2) 改内置菜：名字 + 分类一起改，验「按分类筛也跟着挪」
     3) 收起来：byId 查不到、总数 -1、菜库页出现「已被你收起来」入口
     4) 恢复：回到原样
   另外会截两张图：收起来时的菜库页、恢复后的菜库页。

   ⚠️ 会**真实写云数据库**：改一道内置菜（hongshaorou）、把它收起来、再恢复。
      跑完会自动恢复原样，净效果为零，但请只在开发环境跑，别在生产房间里跑。 */
const fs = require('fs')
const automator = require('miniprogram-automator')

const EP = 'ws://127.0.0.1:9420'
const OUT = 'D:/新建文件夹/小程序/.workbuddy/sim'

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function main () {
  fs.mkdirSync(OUT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: EP })
  console.log('[OK] 已连接模拟器')

  const logs = []
  mp.on('console', m => {
    const s = '[console.' + m.type + '] ' + (m.args || []).join(' ')
    logs.push(s)
    console.log(s)
  })
  mp.on('exception', e => console.log('[异常] ' + JSON.stringify(e)))

  // 页面可能还没就绪（刚连上时 getPageMetaByWebviewId 会返回 null），重试几次
  let ready = false
  for (let i = 0; i < 6 && !ready; i++) {
    await sleep(i === 0 ? 6000 : 2000)
    try {
      await mp.switchTab('/pages/library/library')
      ready = true
    } catch (e) {
      console.log('  页面还没就绪，重试 ' + (i + 1) + '/6')
    }
  }
  if (!ready) throw new Error('菜库页一直没就绪，先确认模拟器开着')
  await sleep(1500)

  /* ---------- 阶段一：改 + 收起来 ---------- */
  const phase1 = await mp.evaluate(function () {
    var a = getApp()
    var BUILTIN = 'hongshaorou'
    var steps = []
    function log (s, v) { steps.push({ step: s, v: v }) }
    function snap (tag) {
      var d = a.dishById(BUILTIN)
      steps.push({
        step: tag,
        v: {
          可见: !!d,
          菜名: d ? d.name : null,
          分类: d ? d.cat : null,
          总数: a.totalDishes(),
          已藏: a.hiddenBuiltinCount(),
          能编辑: a.canEditDish(BUILTIN)
        }
      })
    }
    function inCat (cat) {
      var l = a.dishesByCat(cat)
      for (var i = 0; i < l.length; i++) if (l[i].id === BUILTIN) return true
      return false
    }

    return Promise.resolve()
      .then(function () {
        var f = a.family()
        log('① 环境', { 模式: a.mode(), 家庭: f ? f.code : null, 是房主: a.isOwner() })
        if (!f) {
          log('  没有家庭 —— 用模拟器自己的 openid 现建一个', '')
          return a.createFamily('自检家', '房主')
        }
      })
      .then(function () {
        log('  建完家庭后：是房主 = ' + a.isOwner(), '')
        snap('② 起点（没动过）')
      })
      .then(function () {
        // 名字和分类一起改：分类改了才能验「按分类筛也跟着挪」
        return a.saveDish({
          id: BUILTIN, name: '自检·红烧肉', cat: 'veg', main: '黑猪五花肉', tips: '自检改过的要点'
        })
      })
      .then(function () {
        snap('③ 改完之后')
        log('④ 分类挪过去了没', { 荤菜里: inCat('meat'), 素菜里: inCat('veg') })
        // 先把它加进今天的菜单，等下验「收起来时菜单里那条也一起摘掉」
        a.addToMenu(BUILTIN)
        /*
         * ★ 前置条件必须问**服务端**，不能看本地缓存。
         *   本地那份菜单会被 watch 推来的快照整份替换掉，而乐观更新和快照
         *   谁后到并不确定 —— 拿本地缓存断言「菜单里有它」，会时对时错；
         *   一旦碰巧是 0，后面「收起来时它被摘掉了」就变成在验空气了。
         */
        return new Promise(function (resolve) {
          var tries = 0
          ;(function poll () {
            wx.cloud.database().collection('csm_menus')
              .where({ familyCode: a.family().code, dishId: BUILTIN }).get()
              .then(function (r) {
                if (r.data.length > 0) return resolve(r.data.length)
                if (++tries > 20) return resolve(0)
                setTimeout(poll, 300)
              }, function () { resolve(-1) })
          })()
        })
      })
      .then(function (n) {
        log('⑤ 云端菜单里有几条（前置条件，应该 ≥1）', n)
        if (!n || n < 1) log('  ⚠️ 菜单里没有这条菜，下面的「摘除」验证不作数', '')
        return a.deleteDish(BUILTIN)
      })
      .then(function () {
        snap('⑥ 收起来之后')
        log('⑦ 本地菜单里还剩几份（应该是 0）', a.qtyOf(BUILTIN))
        log('⑧ 「已隐藏」名单', a.hiddenBuiltin().map(function (x) { return x.name }))
        log('⑨ 收起来之后还能不能编辑（应该是 false，点不开了）', a.canEditDish(BUILTIN))
        // ★ 直接读云端的菜单集合：证明服务端真的把那条摘了，
        //   而不是只在本地把它过滤掉了
        return wx.cloud.database().collection('csm_menus')
          .where({ familyCode: a.family().code, dishId: BUILTIN }).get()
          .then(function (r) {
            log('⑩ 云端菜单里还剩几条（应该是 0）', r.data.length)
          })
          .catch(function (e) {
            log('⑩ 读云端菜单失败', (e && e.errMsg) || String(e))
          })
      })
      .then(function () {
        return steps
      })
      .catch(function (e) {
        log('异常中断', (e && e.message) || String(e))
        return steps
      })
  })
  console.log('=== 阶段一：改 + 收起来 ===')
  phase1.forEach(function (s) { console.log('  ' + s.step + ' → ' + JSON.stringify(s.v)) })

  /* ---------- 收起来的状态下看一眼菜库页 ---------- */
  /*
   * ★ 切走再切回来，是走菜库页 onShow -> refreshDishes -> refresh -> refreshHidden
   *   这条真实路径。刚连上时页面已经渲染过了，不切一下它不会自己重算，
   *   直接查 .hidden-bar 会得出「提示条没出来」的错误结论。
   */
  await mp.switchTab('/pages/order/order')
  await sleep(800)
  await mp.switchTab('/pages/library/library')
  await sleep(2200)
  const page = await mp.currentPage()
  const bar = await page.$('.hidden-bar')
  let barText = ''
  if (bar) barText = (await bar.text()).trim()
  console.log('=== 菜库页「已被你收起来」入口 === ' + (bar ? '在 ✓  「' + barText + '」' : '不在 ✗'))
  // 入口在列表最下面，先滚到底再截图，否则截不到
  await mp.evaluate(function () { wx.pageScrollTo({ scrollTop: 99999, duration: 0 }) })
  await sleep(700)
  await mp.screenshot({ path: OUT + '/builtin-hidden.png' })
  console.log('已截图 builtin-hidden.png')

  // 点开「已隐藏」弹层看一眼（原生 showModal 自动点不了，所以只验到弹层渲染这一层）
  if (bar) {
    await bar.tap()
    await sleep(900)
    const rows = await page.$$('.restore-row')
    console.log('=== 恢复弹层里的条目数 === ' + rows.length)
    await mp.screenshot({ path: OUT + '/builtin-restore-sheet.png' })
    console.log('已截图 builtin-restore-sheet.png')
    const closeBtn = await page.$('.restore-close')
    if (closeBtn) { await closeBtn.tap(); await sleep(700) }
  }

  /* ---------- 阶段二：恢复 ---------- */
  const phase2 = await mp.evaluate(function () {
    var a = getApp()
    var BUILTIN = 'hongshaorou'
    var steps = []
    function log (s, v) { steps.push({ step: s, v: v }) }

    return a.restoreBuiltin(BUILTIN)
      .then(function () {
        var d = a.dishById(BUILTIN)
        log('⑧ 恢复之后', {
          可见: !!d,
          菜名: d ? d.name : null,
          分类: d ? d.cat : null,
          总数: a.totalDishes(),
          已藏: a.hiddenBuiltinCount(),
          能编辑: a.canEditDish(BUILTIN)
        })
        log('  出厂数据还是原样吗（名字/分类应该回到「红烧肉 / meat」）',
          { 名字: d ? d.name : null, 分类: d ? d.cat : null })
        return steps
      })
      .catch(function (e) {
        log('异常中断', (e && e.message) || String(e))
        return steps
      })
  })
  console.log('=== 阶段二：恢复 ===')
  phase2.forEach(function (s) { console.log('  ' + s.step + ' → ' + JSON.stringify(s.v)) })

  await mp.switchTab('/pages/order/order')
  await sleep(800)
  await mp.switchTab('/pages/library/library')
  await sleep(2200)
  const bar2 = await (await mp.currentPage()).$('.hidden-bar')
  console.log('=== 恢复后入口应该消失 === ' + (bar2 ? '还在 ✗' : '没了 ✓'))
  await mp.screenshot({ path: OUT + '/builtin-restored.png' })
  console.log('已截图 builtin-restored.png')

  const errs = logs.filter(function (s) { return s.indexOf('console.error') >= 0 })
  console.log('=== 页面报错条数 === ' + errs.length)

  await mp.disconnect()
  console.log('[完成] 输出在 ' + OUT)
}

main().catch(function (e) {
  console.error('[失败] ' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
