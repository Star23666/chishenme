/* 端到端验证：家人上传的菜图现在到底能不能显示。
 *
 * 背景：云存储权限是「仅创建者可读写」，而本环境是免费版改不了它 ——
 * 于是客户端直接读别人的 cloud:// 会报 STORAGE_EXCEED_AUTHORITY。
 * 修法是让云函数（admin）把 cloud:// 换成临时链接发下来。
 *
 * 这个脚本要证明三件事：
 *   ① 菜单里那张**别人传的**图，拿到手已经是 https:// 临时链接
 *   ② 这个链接**真的能取到图**（getImageInfo 拿到宽高，不是空响应）
 *   ③ 包内图 / 本机路径**没被误伤**（还是原来的 /images/... 路径）
 * 最后截一张菜单页，肉眼看一眼那张照片出来了没有。
 *
 * 先决条件：cli.bat auto --auto-port 9420 跑着；云函数已部署新版本。 */
const automator = require('miniprogram-automator')

const EP = 'ws://127.0.0.1:9420'
const SHOT = 'D:/新建文件夹/小程序/.workbuddy/tmp/temp-image-check.png'

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function main () {
  const mp = await automator.connect({ wsEndpoint: EP })
  console.log('[OK] 已连接模拟器')

  let ready = false
  for (let i = 0; i < 6 && !ready; i++) {
    await sleep(i === 0 ? 6000 : 2000)
    try { await mp.switchTab('/pages/menu/menu'); ready = true } catch (e) { console.log('  页面还没就绪，重试 ' + (i + 1) + '/6') }
  }
  if (!ready) throw new Error('页面一直没就绪')

  /* ---------- ① 菜库拉下来之后，菜单里拿到的图是什么 ---------- */
  const out = await mp.evaluate(function () {
    var a = getApp()
    var res = {}
    return a.refreshDishes().then(function () {
      var m = a.menu()
      res.menu = m.map(function (x) { return { name: x.name, image: x.image } })

      // ② 逐个把图真的取一遍，拿到宽高才算「取到了」
      var tasks = m.map(function (x) {
        return new Promise(function (resolve) {
          wx.getImageInfo({
            src: x.image,
            success: function (r) { resolve({ name: x.name, ok: true, w: r.width, h: r.height }) },
            fail: function (e) { resolve({ name: x.name, ok: false, err: (e && e.errMsg) || String(e) }) }
          })
        })
      })
      return Promise.all(tasks).then(function (r) { res.info = r; return res })
    })
  })

  console.log('\n=== ① 菜单里的图 ===')
  out.menu.forEach(function (x) { console.log('  ' + x.name + '  →  ' + x.image) })

  console.log('\n=== ② 每张图真的取一遍 ===')
  out.info.forEach(function (x) {
    console.log('  ' + (x.ok ? '✓' : '✗') + ' ' + x.name + '  ' +
      (x.ok ? x.w + '×' + x.h : x.err))
  })

  const cloudOnes = out.menu.filter(function (x) { return x.image.indexOf('cloud://') === 0 })
  const httpsOnes = out.menu.filter(function (x) { return x.image.indexOf('https://') === 0 })
  const localOnes = out.menu.filter(function (x) { return x.image.indexOf('/images/') === 0 })

  console.log('\n=== ③ 判读 ===')
  console.log('  还是 cloud:// 的（应该 0 个）：' + cloudOnes.length + '  ' +
    JSON.stringify(cloudOnes.map(function (x) { return x.name })))
  console.log('  换成 https:// 的（家人传的那张）：' + httpsOnes.length)
  console.log('  仍是包内路径的（没被误伤）：' + localOnes.length)
  const allLoaded = out.info.every(function (x) { return x.ok })
  console.log('  所有图都取到了吗：' + allLoaded)

  /* ---------- 截图，肉眼看一眼 ---------- */
  await mp.switchTab('/pages/menu/menu')
  await sleep(2500)
  await mp.screenshot({ path: SHOT })
  console.log('\n[截图] ' + SHOT)

  await mp.disconnect()

  const bad = []
  if (cloudOnes.length) bad.push('还有 ' + cloudOnes.length + ' 张没换成临时链接')
  if (!httpsOnes.length) bad.push('一张 https:// 都没有，说明临时链接没生效')
  if (!allLoaded) bad.push('有图取不到')
  if (bad.length) {
    console.error('\n[不通过] ' + bad.join('；'))
    process.exit(1)
  }
  console.log('\n[通过] 家人传的图已换成临时链接，且真的能取到')
}

main().catch(function (e) {
  console.error('[失败] ' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
