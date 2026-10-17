/* 把小程序所有页面走一遍，同时盯着控制台，看能不能当场复现
 * 「[渲染层网络层错误] Failed to load image ... net::OK」。
 *
 * 为什么要这么干：这条报错**不进 WeappLog**（翻了所有日志文件，一条都没有），
 * 只出现在开发者工具的控制台面板里。所以要么问用户把完整那行发过来，
 * 要么自己把页面走一遍看它会不会自己冒出来 —— 后者更省事，也不打扰用户。
 *
 * 输出：捕获到的 console / exception 全部原样打出来（不过滤），
 *       有 `Failed to load image` 的话把**完整 URL** 单独拎出来。
 *
 * ★ 纯只读：只切页面、只截图，不改任何数据。
 * ★ 不写死环境 ID / openid / fileID。 */
const automator = require('miniprogram-automator')

const EP = 'ws://127.0.0.1:9420'

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

const lines = []

function main () {
  return automator.connect({ wsEndpoint: EP }).then(function (mp) {
    console.log('[OK] 已连接模拟器')

    mp.on('console', function (m) {
      if (!m) return
      const text = (m.type ? '[' + m.type + '] ' : '') + (m.args ? m.args.join(' ') : JSON.stringify(m))
      lines.push(text)
    })
    mp.on('exception', function (e) {
      lines.push('[exception] ' + (e && e.message ? e.message : JSON.stringify(e)))
    })

    const tabs = [
      '/pages/library/library',
      '/pages/order/order',
      '/pages/menu/menu',
      '/pages/random/random',
      '/pages/fav/fav'
    ]

    let chain = Promise.resolve()
    tabs.forEach(function (url) {
      chain = chain.then(function () {
        console.log('  → ' + url)
        return mp.switchTab(url).catch(function () {})
      }).then(function () { return sleep(2200) })
    })

    /* 编辑页不是 tab，单独进一次（它是唯一直接渲染 preview 的页面） */
    chain = chain.then(function () {
      return mp.evaluate(function () {
        var c = getApp().customDishes()
        return c.length ? c[0].id : ''
      }).then(function (id) {
        if (!id) { console.log('  → 没有自建菜，跳过编辑页'); return }
        console.log('  → /pages/edit/edit?id=' + id)
        return mp.navigateTo('/pages/edit/edit?id=' + id).catch(function (e) {
          console.log('    编辑页进不去：' + e.message)
        })
      }).then(function () { return sleep(2500) })
    })

    return chain.then(function () {
      return sleep(1500)
    }).then(function () {
      console.log('\n=== 捕获到的控制台消息（共 ' + lines.length + ' 条）===')
      lines.slice(0, 60).forEach(function (l) { console.log('  ' + l) })

      const hit = lines.filter(function (l) { return /Failed to load image/i.test(l) })
      console.log('\n=== 判读 ===')
      if (!hit.length) {
        console.log('  这一轮没有复现出 Failed to load image。')
        console.log('  → 说明当前代码 + 已部署的云函数下，正常走一遍页面不会报这个错。')
      } else {
        console.log('  ★ 复现了 ' + hit.length + ' 条：')
        hit.forEach(function (l) { console.log('    ' + l) })
      }

      return mp.disconnect()
    })
  }).catch(function (e) {
    console.error('[失败] ' + (e && e.stack ? e.stack : e))
    process.exit(1)
  })
}

main()
