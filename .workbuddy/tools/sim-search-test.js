/* 在模拟器里实测菜库页的搜索框。
   覆盖：内置菜能被搜到 / 自己加的菜也能被搜到 / 菜名命中排在主料命中前面 /
         搜不到时的提示 / 点分类会退出搜索。
   跑完自动清理，不留数据。 */
const fs = require('fs')
const automator = require('miniprogram-automator')
const EP = 'ws://127.0.0.1:9420'
const OUT = 'D:/新建文件夹/小程序/.workbuddy/sim'

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function main () {
  const mp = await automator.connect({ wsEndpoint: EP })
  console.log('[OK] 已连接模拟器')
  mp.on('console', m => console.log('[console.' + m.type + '] ' + (m.args || []).join(' ')))
  mp.on('exception', e => console.log('[异常] ' + JSON.stringify(e)))

  await sleep(6000)

  // 刚起的工具不一定立刻就有活跃页面（会报 getPageMetaByWebviewId 为 null），
  // 所以这里重试几次再往下走
  let onLibrary = false
  for (let i = 1; i <= 6 && !onLibrary; i++) {
    try {
      await mp.switchTab('/pages/library/library')
      onLibrary = true
    } catch (e) {
      console.log('[..] 第 ' + i + ' 次切页失败，再等等：' + (e && e.message))
      await sleep(3000)
    }
  }
  if (!onLibrary) throw new Error('切到菜库页失败，模拟器可能没准备好')
  await sleep(2000)

  // 先加一道名字很独特的自建菜，用来验证「自己加的菜也能被搜到」
  const seeded = await mp.evaluate(function () {
    var app = getApp()
    return app.saveDish({
      name: '清炒西葫芦',
      cat: 'veg',
      main: '西葫芦、蒜',
      tips: '自检用，稍后自动删',
      image: ''
    }).then(function () {
      return app.refreshDishes()
    }).then(function () {
      return app.customDishes().filter(function (d) { return d.name === '清炒西葫芦' }).length
    })
  })
  console.log('准备：已加一道自检菜「清炒西葫芦」→ ' + (seeded === 1 ? '成功' : '失败'))

  const r = await mp.evaluate(function () {
    var pages = getCurrentPages()
    var cur = pages[pages.length - 1]
    var out = {}

    function names (arr) {
      var n = []
      for (var i = 0; i < arr.length && i < 6; i++) n.push(arr[i].name)
      return n
    }

    out['① 初始（分类浏览）显示的菜数'] = cur.data.shown.length
    out['① 初始提示语'] = cur.data.tipText

    // 搜内置菜的主料词
    var h1 = cur.search('鸡')
    out['② 搜「鸡」命中'] = h1.length
    out['② 前几个是'] = names(h1)

    // 搜自己加的菜（内置菜库里没有「西葫芦」这几个字）
    var h2 = cur.search('葫芦')
    out['③ 搜「葫芦」（只有自己加的菜有）命中'] = h2.length
    out['③ 是'] = names(h2)

    // 搜一个只在内置菜里出现的词
    var h3 = cur.search('木耳')
    out['④ 搜「木耳」（内置菜）命中'] = h3.length
    out['④ 是'] = names(h3)

    // 走真实的 onSearch 通道，看提示语与空状态
    cur.onSearch({ detail: { value: 'zzzzqqq' } })
    out['⑤ 搜不存在的词 → 空状态文案'] = cur.data.emptyText
    out['⑤ 搜不存在的词 → 列表长度'] = cur.data.shown.length

    cur.onSearch({ detail: { value: '鸡' } })
    out['⑥ 走 onSearch 后提示语'] = cur.data.tipText
    out['⑥ 走 onSearch 后列表长度'] = cur.data.shown.length

    // 点分类应该退出搜索
    cur.switchCat({ currentTarget: { dataset: { cat: 'veg' } } })
    out['⑦ 点分类后 kw'] = JSON.stringify(cur.data.kw)
    out['⑦ 点分类后显示的是分类内容'] = cur.data.shown.length
    out['⑦ 点分类后提示语'] = cur.data.tipText

    return out
  })

  console.log('=== 搜索结果 ===')
  Object.keys(r).forEach(function (k) {
    console.log('  ' + k + ' → ' + JSON.stringify(r[k]))
  })

  // 截几张图看实际样子
  fs.mkdirSync(OUT, { recursive: true })

  async function shoot (kw, file) {
    await mp.evaluate(function (v) {
      var cur = getCurrentPages()[getCurrentPages().length - 1]
      if (v === null) cur.clearSearch()
      else cur.onSearch({ detail: { value: v } })
    }, kw)
    await sleep(1000)
    await mp.screenshot({ path: OUT + '/' + file })
    console.log('已截图 ' + file)
  }

  await shoot('鸡', 'search-1-搜鸡.png')
  await shoot('zzzz', 'search-2-搜不到.png')
  await shoot(null, 'search-3-清空后.png')

  // 清理自检菜
  const cleaned = await mp.evaluate(function () {
    var app = getApp()
    var hit = app.customDishes().filter(function (d) { return d.name === '清炒西葫芦' })[0]
    if (!hit) return '本来就没有'
    return app.deleteDish(hit.id).then(function () {
      return app.refreshDishes()
    }).then(function () {
      return '已删，残留 ' + app.customDishes().filter(function (d) { return d.name === '清炒西葫芦' }).length
    })
  })
  console.log('清理 → ' + cleaned)

  await mp.disconnect()
}

main().catch(e => { console.error('[失败] ' + (e && e.stack ? e.stack : e)); process.exit(1) })
