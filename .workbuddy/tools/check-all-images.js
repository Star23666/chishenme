/* 菜图到底能不能取到 —— 全量只读探测。
 *
 * 为什么还要一个脚本：`verify-temp-image.js` 只看**菜单里**那几道菜，
 * 而「渲染层报 Failed to load image」可能出在别的页面（菜库 / 收藏 / 点菜）。
 * 而且菜单可能是空的 —— 那这个脚本就什么都验不出来（真的发生过）。
 *
 * 这个脚本换个思路：不看菜单，直接把**菜库里每一道菜**都过一遍。
 *   · 菜库页的 `decorate()` 内部就是 `D.imageOf(id)`，
 *     所以拿到的 image 就是界面真正会去加载的那串路径
 *     （临时链接换成功的会是 https://，没换成的会原样留 cloud://）。
 *   · 拿到之后逐张 `wx.getImageInfo` —— 能取到宽高才算真的能显示。
 *   · 按「https:// / cloud:// / 包内路径 / 本机路径」分类计数，
 *     并把**取不到的那几张**连 errMsg 一起列出来。
 *
 * ★ 纯只读：不传文件、不写数据库、不改任何东西，只截图。
 * ★ 不写死环境 ID / openid / fileID（要提交进公开仓库）。
 *
 * 先决条件：cli.bat auto --project <chishenme> --auto-port 9420 跑着。 */
const automator = require('miniprogram-automator')

const EP = 'ws://127.0.0.1:9420'
const SHOT = 'D:/新建文件夹/小程序/.workbuddy/tmp/all-images-check.png'

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

function kindOf (u) {
  if (typeof u !== 'string' || !u) return '空'
  if (u.indexOf('https://') === 0) return 'https临时链接'
  if (u.indexOf('cloud://') === 0) return 'cloud原始ID'
  if (u.indexOf('/images/') === 0) return '包内路径'
  return '本机路径'
}

async function main () {
  const mp = await automator.connect({ wsEndpoint: EP })
  console.log('[OK] 已连接模拟器')

  let page = null
  for (let i = 0; i < 6 && !page; i++) {
    await sleep(i === 0 ? 6000 : 2000)
    try { page = await mp.switchTab('/pages/library/library') } catch (e) { console.log('  页面还没就绪，重试 ' + (i + 1) + '/6') }
  }
  if (!page) throw new Error('菜库页一直没就绪')
  await sleep(2500)

  const raw = await mp.evaluate(function () {
    var a = getApp()
    var pages = getCurrentPages()
    var p = pages[pages.length - 1]

    /* decorate() 就是页面自己转数据的那步，内部走 D.imageOf(id)。
       借它来拿「界面上真正会加载的那串路径」，比在外面猜可靠。 */
    if (typeof p.decorate !== 'function') return JSON.stringify({ err: '当前页没有 decorate()，可能不在菜库页' })

    /* ★ 先刷一遍菜库，确保临时链接映射已经装好 —— 否则会把「还没装」
       误判成「换不到」（假警报，最浪费时间的错误）。 */
    return a.refreshDishes().then(function () {
      var all = a.allDishes()
      var items = []
      for (var i = 0; i < all.length; i++) {
        var d = p.decorate([all[i]])[0]
        items.push({ id: d.id, name: d.name, image: d.image })
      }

      /* 逐张真取一遍，能取到宽高才算真的能显示 */
      var tasks = items.map(function (x) {
        return new Promise(function (resolve) {
          wx.getImageInfo({
            src: x.image,
            success: function (r) { x.ok = true; x.size = r.width + '×' + r.height; resolve() },
            fail: function (e) { x.ok = false; x.err = (e && e.errMsg) || String(e); resolve() }
          })
        })
      })
      return Promise.all(tasks).then(function () {
        return JSON.stringify({ total: all.length, items: items })
      })
    })
  })

  const out = JSON.parse(raw)
  if (out.err) throw new Error(out.err)

  console.log('\n=== 菜库共 ' + out.total + ' 道，逐张取图 ===')
  const bad = out.items.filter(x => !x.ok)
  bad.forEach(x => console.log('  ✗ ' + x.name + '  [' + kindOf(x.image) + ']  ' + x.err + '\n      ' + x.image))

  const buckets = {}
  out.items.forEach(x => { const k = kindOf(x.image); buckets[k] = (buckets[k] || 0) + 1 })

  console.log('\n=== 图路径分布 ===')
  Object.keys(buckets).forEach(k => console.log('  ' + k + '：' + buckets[k] + ' 张'))

  const stillCloud = out.items.filter(x => kindOf(x.image) === 'cloud原始ID')
  console.log('\n=== 判读 ===')
  console.log('  取不到的：' + bad.length + ' 张')
  console.log('  还留着 cloud:// 的：' + stillCloud.length + ' 张  ' +
    JSON.stringify(stillCloud.map(x => x.name)))
  console.log('  → cloud:// 还留着 = 云函数没能把它换成临时链接（文件不存在 / 权限 / 没部署新云函数）')
  console.log('  → 这些正是渲染层报 Failed to load image ...net::OK 的来源')

  await mp.switchTab('/pages/library/library')
  await sleep(2000)
  await mp.screenshot({ path: SHOT })
  console.log('\n[截图] ' + SHOT)

  await mp.disconnect()

  if (bad.length) {
    console.error('\n[不通过] 有 ' + bad.length + ' 张图取不到')
    process.exit(1)
  }
  console.log('\n[通过] 菜库里每一张图都真的取到了')
}

main().catch(function (e) {
  console.error('[失败] ' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
