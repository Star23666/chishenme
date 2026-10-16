/* 在真实模拟器里端到端验证「自己加菜」的链路。
   先决条件：开发者工具已开服务端口，且已用
     cli.bat auto --project <chishenme> --auto-port 9420
   起了自动化模式（自动化端口 ws://127.0.0.1:9420）。

   检查内容：
     1) csm_families / csm_menus / csm_dishes 三个集合是否真的建好了（客户端直连读一次）
     2) app 层的自建菜叠加层装上了没有
     3) 菜库页「＋ 加菜」入口渲染出来没有
     4) 云函数 createDish / updateDish / deleteDish 走一遍闭环

   ⚠️ 第 4 步会**真实写云数据库**：建一道叫「自检测试菜」的菜，跑完立刻删掉，
      并会先清掉上一轮同名残留。净效果为零，但请只在开发环境跑，别在生产房间里跑。 */
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

  const sys = await mp.systemInfo()
  console.log('基础库 ' + sys.version + ' | 机型 ' + sys.model + ' | ' + sys.platform)

  await mp.switchTab('/pages/library/library')
  await sleep(1800)
  await mp.screenshot({ path: OUT + '/dish-check.png' })
  console.log('已截图 dish-check.png')

  // 1) 三个集合能不能读（客户端直连，读权限生效）
  const cols = await mp.evaluate(function () {
    var names = ['csm_families', 'csm_menus', 'csm_dishes']
    var out = {}
    return (function () {
      var i = 0
      function step () {
        if (i >= names.length) return out
        var c = names[i]
        i++
        return wx.cloud.database().collection(c).limit(5).get()
          .then(function (r) { out[c] = { ok: true, n: r.data.length } })
          .catch(function (e) {
            out[c] = {
              ok: false,
              code: e && e.errCode,
              err: (e && e.errMsg) || (e && e.message) || String(e)
            }
          })
          .then(step)
      }
      return step()
    })()
  })
  console.log('=== 集合可读性 ===')
  console.log(JSON.stringify(cols, null, 2))

  // 2) app 层自建菜状态
  const appState = await mp.evaluate(function () {
    var a = getApp()
    return {
      mode: a.mode(),
      total: a.totalDishes(),
      custom: a.customDishes().length,
      familyCode: a.globalData.family ? a.globalData.family.code : null,
      dishesLoaded: !!a.globalData.dishesLoaded
    }
  })
  console.log('=== app 状态 ===')
  console.log(JSON.stringify(appState, null, 2))

  // 3) 菜库页「＋ 加菜」按钮在不在
  const page = await mp.currentPage()
  const addBtn = await page.$('.add-dish')
  console.log('=== 菜库页「＋ 加菜」按钮 === ' + (addBtn ? '找到了 ✓' : '没找到 ✗'))
  if (addBtn) {
    console.log('按钮文字：' + (await addBtn.text()))
  }

  // 4) 页面级报错汇总
  const errs = logs.filter(function (s) { return s.indexOf('console.error') >= 0 })
  console.log('=== 页面报错条数 === ' + errs.length)

  // 5) 端到端：建 -> 查 -> 改 -> 删 -> 复查（用完即删，净效果为零）
  console.log('=== 端到端自检（建/查/改/删） ===')
  const e2e = await mp.evaluate(function () {
    var NAME = '自检测试菜'
    var steps = []
    var createdId = null

    function log (s, v) { steps.push({ step: s, v: v }) }
    function call (action, payload) {
      return wx.cloud.callFunction({
        name: 'csmMenu',
        data: { action: action, payload: payload || {} }
      }).then(function (r) { return r.result })
    }
    // 注意：publicDish 对外暴露的字段名是 id（不是 dishId）
    function idOf (r) { return r && r.ok && r.data && r.data.dish ? r.data.dish.id : null }

    // 先清掉上一轮可能残留的测试菜，保证这次跑完环境是干净的
    return call('listDishes', {})
      .then(function (r) {
        var list = (r && r.ok && r.data.list) || []
        var old = list.filter(function (d) { return String(d.name).indexOf(NAME) === 0 })
        log('⓪ 清理旧残留', { 发现: old.length })
        return old.reduce(function (chain, d) {
          return chain.then(function () { return call('deleteDish', { id: d.id }) })
        }, Promise.resolve())
      })
      .then(function () {
        return call('createDish', { name: NAME, cat: 'veg', main: '自检', tips: '端到端自检，稍后自动删除' })
      })
      .then(function (r) {
        createdId = idOf(r)
        log('① 新建', r && r.ok
          ? { ok: true, id: createdId, name: r.data.dish.name, mine: r.data.dish.mine, image: r.data.dish.image }
          : r)
        return call('listDishes', {})
      })
      .then(function (r) {
        var list = (r && r.ok && r.data.list) || []
        var found = list.filter(function (d) { return d.id === createdId })
        log('② 菜库里能看到', { 总数: list.length, 命中: found.length, mine: found[0] && found[0].mine })
        return call('updateDish', { id: createdId, name: NAME + '改', cat: 'veg' })
      })
      .then(function (r) {
        log('③ 改菜名', r && r.ok ? { name: r.data.dish.name, image: r.data.dish.image || '(空=保持原样)' } : r)
        return call('deleteDish', { id: createdId })
      })
      .then(function (r) {
        log('④ 删除', r && r.ok ? { ok: true } : r)
        return call('listDishes', {})
      })
      .then(function (r) {
        var list = (r && r.ok && r.data.list) || []
        var remains = list.filter(function (d) { return d.id === createdId })
        log('⑤ 删除后复查', { 残留: remains.length, 总数: list.length })
        return { steps: steps, createdId: createdId }
      })
      .catch(function (e) {
        log('异常中断', (e && e.errMsg) || (e && e.message) || String(e))
        return { steps: steps, createdId: createdId, aborted: true }
      })
  })
  e2e.steps.forEach(function (s) {
    console.log('  ' + s.step + ' → ' + JSON.stringify(s.v))
  })
  if (e2e.aborted) console.log('  ⚠️ 中途异常，可能留下测试菜：' + e2e.createdId)

  await mp.disconnect()
  console.log('[完成] 输出在 ' + OUT)
}

main().catch(function (e) {
  console.error('[失败] ' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
