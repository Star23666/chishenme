/* 在模拟器里直接测一次 wx.cloud.uploadFile，拿到最真实的失败信息。
   目的是定位真机上「cgi fail(1,-10090)」到底发生在哪一步。 */
const automator = require('miniprogram-automator')
const EP = 'ws://127.0.0.1:9420'

async function main () {
  const mp = await automator.connect({ wsEndpoint: EP })
  console.log('[OK] 已连接模拟器')

  mp.on('console', m => console.log('[console.' + m.type + '] ' + (m.args || []).join(' ')))

  // ★ wx.cloud.init 是懒加载的（app.js 里第一次调云能力才 init）。
  //   先切到菜库页并等一会儿，让页面 onShow 把云初始化跑完，否则这里会报
  //   「Cloud API isn't enabled, please call wx.cloud.init first」。
  await mp.switchTab('/pages/library/library')
  await new Promise(r => setTimeout(r, 2000))

  const r = await mp.evaluate(function () {
    var fs = wx.getFileSystemManager()
    var p = wx.env.USER_DATA_PATH + '/selftest.png'
    // 1x1 PNG
    var b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    var out = {}

    try {
      fs.writeFileSync(p, b64, 'base64')
      out.write = 'ok'
      out.path = p
      try { out.size = fs.statSync(p).size } catch (e) { out.size = '?' }
    } catch (e) {
      out.write = 'fail: ' + (e && e.message)
      return out
    }

    return wx.cloud.uploadFile({
      cloudPath: 'dishes/selftest-' + Date.now() + '.png',
      filePath: p
    }).then(function (res) {
      out.upload = { ok: true, fileID: res.fileID, statusCode: res.statusCode }
      return wx.cloud.deleteFile({ fileList: [res.fileID] }).then(function () {
        out.cleanup = 'ok'
        return out
      }).catch(function (e) {
        out.cleanup = 'fail: ' + ((e && e.errMsg) || '')
        return out
      })
    }).catch(function (e) {
      var raw = ''
      try { raw = JSON.stringify(e) } catch (x) { raw = String(e) }
      out.upload = {
        ok: false,
        errCode: e && e.errCode,
        errMsg: e && e.errMsg,
        message: e && e.message,
        keys: e ? Object.keys(e) : [],
        raw: raw
      }
      return out
    })
  })

  console.log('=== 上传实测 ===')
  console.log(JSON.stringify(r, null, 2))

  // 顺便看看 wx.cloud 的版本信息
  const env = await mp.evaluate(function () {
    try {
      return { hasUploadFile: typeof wx.cloud.uploadFile, hasDeleteFile: typeof wx.cloud.deleteFile }
    } catch (e) { return { err: String(e) } }
  })
  console.log('=== wx.cloud 能力 === ' + JSON.stringify(env))

  await mp.disconnect()
}

main().catch(e => { console.error('[失败] ' + (e && e.stack ? e.stack : e)); process.exit(1) })
