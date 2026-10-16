/* 对照实验：模拟器里上传一张「大文件」，看 cgi fail 是不是文件大小引起的。
   同一个环境下，小文件（70 字节）已验证成功，这里只改「大小」这一个变量。 */
const automator = require('miniprogram-automator')
const EP = 'ws://127.0.0.1:9420'

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function main () {
  const mp = await automator.connect({ wsEndpoint: EP })
  console.log('[OK] 已连接模拟器')
  await mp.switchTab('/pages/library/library')
  await sleep(2000)

  // 依次测 1MB / 3MB / 8MB，看在哪一档开始失败
  const sizes = [1, 3, 8]
  const results = await mp.evaluate(function (list) {
    var fs = wx.getFileSystemManager()
    var out = []

    function one (mb) {
      var p = wx.env.USER_DATA_PATH + '/big-' + mb + 'mb.bin'
      var rec = { mb: mb }
      try {
        var buf = new ArrayBuffer(mb * 1024 * 1024)
        // 填点非零字节，避免某些实现把全零文件短路优化
        var u8 = new Uint8Array(buf)
        for (var i = 0; i < u8.length; i += 4096) u8[i] = 0x41
        fs.writeFileSync(p, buf)
        rec.size = fs.statSync(p).size
      } catch (e) {
        rec.err = 'write: ' + (e && e.message)
        out.push(rec)
        return Promise.resolve()
      }

      return wx.cloud.uploadFile({
        cloudPath: 'dishes/bigtest-' + mb + 'mb-' + Date.now() + '.bin',
        filePath: p
      }).then(function (res) {
        rec.ok = true
        rec.statusCode = res.statusCode
        return wx.cloud.deleteFile({ fileList: [res.fileID] }).then(function () {
          rec.cleaned = true
        }).catch(function () { rec.cleaned = false })
      }).catch(function (e) {
        rec.ok = false
        rec.errCode = e && e.errCode
        rec.errMsg = e && e.errMsg
        rec.message = e && e.message
      }).then(function () {
        try { fs.unlinkSync(p) } catch (x) { /* ignore */ }
        out.push(rec)
      })
    }

    return list.reduce(function (chain, mb) {
      return chain.then(function () { return one(mb) })
    }, Promise.resolve()).then(function () { return out })
  }, sizes)

  console.log('=== 大文件上传对照 ===')
  results.forEach(function (r) {
    console.log(JSON.stringify(r))
  })

  await mp.disconnect()
}

main().catch(e => { console.error('[失败] ' + (e && e.stack ? e.stack : e)); process.exit(1) })
