/* 菜库网格的**布局**断言：到底排成了几列。
 *
 * 为什么需要它：v1.7.0 改版时 `.dish-card` 写成
 *     width: calc(50% - 9rpx)  +  奇数项 margin-right: 18rpx
 * 加起来正好 100%，flex 一取整就越界 → **每行只放得下一道菜**，
 * 整页变成单列。而当时是这么验收的：**看了一眼截图，以为那是两列**。
 * 静态检查（wxml-check）只验类名和变量，量不到布局；
 * 布局只能真的去量。
 *
 * 所以这个脚本就干一件事：把 `.dish-card` 的几何量出来，
 * 断言第 1、2 张卡在**同一行**且**左右并排**。任何一边不成立就退出码 1。
 *
 * ★ 只读：不点任何东西，不改数据。
 * ★ 不写死环境 ID / openid / fileID（要提交进公开仓库）。
 *
 * 先决条件：cli.bat auto --project <chishenme> --auto-port 9420 跑着。 */
const automator = require('miniprogram-automator')

const EP = 'ws://127.0.0.1:9420'
const SHOT = 'D:/新建文件夹/小程序/.workbuddy/tmp/dish-grid.png'
const WANT_COLS = 2

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

automator.connect({ wsEndpoint: EP }).then(async (mp) => {
  let ok = false
  for (let i = 0; i < 6 && !ok; i++) {
    await sleep(i === 0 ? 6000 : 2000)
    try { await mp.switchTab('/pages/library/library'); ok = true } catch (e) { console.log('  页面还没就绪 ' + (i + 1) + '/6') }
  }
  if (!ok) throw new Error('菜库页一直没就绪')

  const run = (fn, arg) => mp.evaluate(fn, arg)
  await run(function () { getCurrentPages().slice(-1)[0].refresh() })
  await sleep(2200)

  const raw = await run(function () {
    var q = wx.createSelectorQuery()
    return new Promise(function (resolve) {
      q.selectAll('.dish-card').boundingClientRect(function (rects) {
        var cards = (rects || []).map(function (r) {
          return { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width) }
        })
        resolve(JSON.stringify({ cards: cards.slice(0, 8), total: cards.length }))
      }).exec()
    })
  })

  const g = JSON.parse(raw)
  const cards = g.cards

  console.log('\n=== 菜库网格 ===')
  console.log('  一共 ' + g.total + ' 张卡，前 ' + cards.length + ' 张的几何：')
  cards.forEach(function (c, i) {
    console.log('    #' + (i + 1) + '  left=' + c.left + '  top=' + c.top + '  w=' + c.w)
  })

  if (cards.length < WANT_COLS) {
    console.error('\n[不通过] 卡片太少（' + cards.length + ' 张），量不出来')
    process.exit(1)
  }

  /* 同一行：top 相同；并排：left 不同 */
  const sameRow = cards[0].top === cards[1].top
  const sideBySide = cards[1].left > cards[0].left
  const gap = cards[1].left - (cards[0].left + cards[0].w)

  console.log('\n=== 判读 ===')
  console.log('  第 1、2 张在同一行：' + sameRow)
  console.log('  第 1、2 张左右并排：' + sideBySide)
  console.log('  中间的缝：' + gap + 'px')
  console.log('  → 期望 ' + WANT_COLS + ' 列')

  await mp.screenshot({ path: SHOT })
  console.log('\n[截图] ' + SHOT)

  await mp.disconnect()

  const bad = []
  if (!sameRow) bad.push('第 1、2 张不在同一行（每行只放得下一道 → 变成单列了）')
  if (!sideBySide) bad.push('第 2 张没排在第 1 张右边')
  if (gap <= 0) bad.push('两张卡贴在一起或重叠（缝 ' + gap + 'px）')

  if (bad.length) {
    console.error('\n[不通过] ' + bad.join('；'))
    console.error('  ★ 宽度别用「宽 + 外边距凑 100%」——一取整就越界。')
    console.error('    用 width: calc((100% - 缝) / 2) + justify-content: space-between。')
    process.exit(1)
  }
  console.log('\n[通过] 菜库是 ' + WANT_COLS + ' 列，缝 ' + gap + 'px')
}).catch(function (e) {
  console.error('[失败] ' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
