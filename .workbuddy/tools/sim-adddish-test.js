/* 在模拟器里走一遍**完整加菜流程**（含图片上传），路径和真机点「加入菜库」完全一致：
     app.newDishId() -> app.prepareDishImage() -> app.saveDish() -> app.refreshDishes() -> app.deleteDish()
   用来确认 app 层串联没问题（单测 uploadFile / createDish 各自都过，但组合起来没验过）。
   跑完自动清理，不留数据。 */
const automator = require('miniprogram-automator')
const EP = 'ws://127.0.0.1:9420'

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function main () {
  const mp = await automator.connect({ wsEndpoint: EP })
  console.log('[OK] 已连接模拟器')
  await mp.switchTab('/pages/library/library')
  await sleep(2000)

  const r = await mp.evaluate(function () {
    var app = getApp()
    var fs = wx.getFileSystemManager()
    var p = wx.env.USER_DATA_PATH + '/addtest.png'
    var b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    var NAME = '自检带图菜'
    var out = { steps: [] }

    function log (s, v) { out.steps.push({ step: s, v: v }) }

    log('模式', app.mode())
    try {
      fs.writeFileSync(p, b64, 'base64')
      log('① 造一张本地图', { path: p, size: fs.statSync(p).size })
    } catch (e) {
      log('① 造图失败', String(e && e.message))
      return out
    }

    var id = app.newDishId()
    log('② 生成菜品 id', id)

    return app.prepareDishImage(p, id)
      .then(function (fileID) {
        log('③ 上传云存储', { fileID: fileID })
        return app.saveDish({ name: NAME, cat: 'meat', main: '自检', tips: '', image: fileID })
      })
      .then(function () {
        return app.refreshDishes()
      })
      .then(function () {
        var hit = app.customDishes().filter(function (d) { return d.name === NAME })[0]
        log('④ 菜库里查得到', hit ? { id: hit.id, image: hit.image, mine: hit.mine } : null)
        if (!hit) return null
        return app.deleteDish(hit.id)
      })
      .then(function () {
        return app.refreshDishes()
      })
      .then(function () {
        var remains = app.customDishes().filter(function (d) { return d.name === NAME })
        log('⑤ 清理后残留', remains.length)
        try { fs.unlinkSync(p) } catch (e) { /* ignore */ }
        return out
      })
      .catch(function (e) {
        log('异常中断', { message: e && e.message, name: e && e.name })
        return out
      })
  })

  r.steps.forEach(function (s) {
    console.log('  ' + s.step + ' → ' + JSON.stringify(s.v))
  })

  // ---- 第二段：照片传不上去时的降级路径 ----
  // 用一个**根本不存在的文件路径**强制上传失败，验证「照片丢了菜还在」。
  const r2 = await mp.evaluate(function () {
    var app = getApp()
    var NAME = '自检无图菜'
    var out = { steps: [] }

    function log (s, v) { out.steps.push({ step: s, v: v }) }

    var bad = wx.env.USER_DATA_PATH + '/definitely-not-here-' + Date.now() + '.jpg'
    log('① 故意给一个不存在的文件', bad)

    return app.prepareDishImage(bad, app.newDishId())
      .then(function (image) {
        log('② prepareDishImage 返回', image === '' ? '(空串 = 优雅降级 ✓)' : '「' + image + '」(不该有值)')
        return app.saveDish({ name: NAME, cat: 'veg', main: '降级自检', tips: '', image: image })
      })
      .then(function () {
        return app.refreshDishes()
      })
      .then(function () {
        var hit = app.customDishes().filter(function (d) { return d.name === NAME })[0]
        log('③ 菜有没有存下来', hit
          ? { id: hit.id, image: hit.image || '(空 = 用默认图)', mine: hit.mine }
          : '✗ 没存下来')
        if (!hit) return null
        return app.deleteDish(hit.id)
      })
      .then(function () {
        return app.refreshDishes()
      })
      .then(function () {
        log('④ 清理后残留', app.customDishes().filter(function (d) { return d.name === NAME }).length)
        return out
      })
      .catch(function (e) {
        log('✗ 竟然抛出来了（降级失败）', String(e && e.message))
        return out
      })
  })

  console.log('=== 降级路径：照片传不上去时 ===')
  r2.steps.forEach(function (s) {
    console.log('  ' + s.step + ' → ' + JSON.stringify(s.v))
  })

  // ---- 第三段：真的走一遍加菜页的 save()（用户点的就是这个按钮）----
  console.log('=== 加菜页 save() 真实走一遍（照片传不上去） ===')
  const pageLogs = []
  mp.on('console', function (m) {
    const s = '[页面 console.' + m.type + '] ' + (m.args || []).join(' ')
    pageLogs.push(s)
  })
  mp.on('exception', function (e) { pageLogs.push('[页面异常] ' + JSON.stringify(e)) })

  try {
    await mp.navigateTo('/pages/edit/edit')
    await sleep(1500)

    // ★ automator 的 page.callMethod 在这套版本上会报「this.save is not a function」，
    //   所以改成在逻辑层直接拿页面实例调用 —— 更贴近真实按钮触发的路径。
    const saveRun = await mp.evaluate(function () {
      var pages = getCurrentPages()
      var cur = pages[pages.length - 1]
      var out = { route: cur && cur.route, hasSave: typeof (cur && cur.save) }
      if (!cur || typeof cur.save !== 'function') return out

      var bad = wx.env.USER_DATA_PATH + '/nope-' + Date.now() + '.jpg'
      cur.setData({
        name: '自检页面菜',
        cat: 'meat',
        main: '页面自检',
        tips: '',
        picked: true,
        preview: bad
      })
      try {
        cur.save()
        out.called = true
      } catch (e) {
        out.err = String(e && e.message)
      }
      return out
    })
    console.log('  触发页面 save() → ' + JSON.stringify(saveRun))

    // 上传一个不存在的文件可能要等失败，给足时间
    await sleep(12000)

    const after = await mp.evaluate(function () {
      var app = getApp()
      var hit = app.customDishes().filter(function (d) { return d.name === '自检页面菜' })[0]
      return hit ? { id: hit.id, image: hit.image || '(空=默认图)', mine: hit.mine } : null
    })
    console.log('  页面按钮走完后，菜库里 → ' + JSON.stringify(after))

    if (after && after.id) {
      const cleaned = await mp.evaluate(function (id) {
        var app = getApp()
        return app.deleteDish(id).then(function () {
          return app.refreshDishes()
        }).then(function () {
          return app.customDishes().filter(function (d) { return d.name === '自检页面菜' }).length
        })
      }, after.id)
      console.log('  清理后残留 → ' + cleaned)
    }
  } catch (e) {
    console.log('  （页面级验证被跳过：' + (e && e.message) + '）')
  }

  console.log('  --- 页面控制台输出 ---')
  pageLogs.forEach(function (s) { console.log('  ' + s) })

  await mp.disconnect()
}

main().catch(e => { console.error('[失败] ' + (e && e.stack ? e.stack : e)); process.exit(1) })
