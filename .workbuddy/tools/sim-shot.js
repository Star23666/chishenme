/* 连接微信开发者工具的自动化端口，给模拟器截图。
   用途：当「图标不显示」这类问题只跑脚本查不出来时，直接看真实画面。 */
const fs = require('fs')
const automator = require('miniprogram-automator')

const BASE = 'D:/新建文件夹/小程序/.workbuddy/sim'
const EP = 'ws://127.0.0.1:9420'

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function connectRetry (tries) {
  let last
  for (let i = 1; i <= tries; i++) {
    try {
      const mp = await automator.connect({ wsEndpoint: EP })
      console.log('[OK] 第 ' + i + ' 次尝试连上模拟器')
      return mp
    } catch (e) {
      last = e
      console.log('[..] 第 ' + i + ' 次连接失败：' + (e && e.message))
      await sleep(3000)
    }
  }
  throw last
}

async function main () {
  fs.mkdirSync(BASE, { recursive: true })
  const mp = await connectRetry(20)

  mp.on('console', m => {
    console.log('[console.' + m.type + '] ' + (m.args || []).join(' '))
  })
  mp.on('exception', e => {
    console.log('[异常] ' + JSON.stringify(e))
  })

  const sys = await mp.systemInfo()
  console.log('基础库 ' + sys.version + ' | 机型 ' + sys.model + ' | ' + sys.platform)

  const page = await mp.currentPage()
  console.log('当前页面 ' + page.path)

  await mp.screenshot({ path: BASE + '/1-首页.png' })
  console.log('已截图 1-首页.png')

  // 逐个切换 tab，每切一个截一张 —— 看图标在「未选中/选中」两种状态下各是什么样
  const tabs = ['pages/library/library', 'pages/order/order',
    'pages/menu/menu', 'pages/random/random', 'pages/fav/fav']
  for (let i = 0; i < tabs.length; i++) {
    try {
      await mp.switchTab('/' + tabs[i])
      await sleep(900)
      await mp.screenshot({ path: BASE + '/' + (i + 2) + '-tab' + i + '.png' })
      console.log('已截图 tab' + i + ' → ' + tabs[i])
    } catch (e) {
      console.log('切 tab' + i + ' 失败：' + (e && e.message))
    }
  }

  await mp.disconnect()
  console.log('[完成] 截图都在 ' + BASE)
}

main().catch(e => {
  console.error('[失败] ' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
