/**
 * 选图 / 让图片活过重启。
 *
 * 职责只有两件事，都不涉及网络和存储：
 *   chooseImage()  让用户挑一张照片（相册或拍照）
 *   persist()      把临时文件复制到本机用户目录，得到一个重启后依然有效的路径
 *
 * ★ 为什么需要 persist：wx.chooseMedia 给的是**临时文件**路径，
 *   小程序一重启就失效。本地模式（没接云开发）下菜图只能落在这台手机上，
 *   不复制一份的话，加完菜重启一次照片就变成碎图了。
 *   云端模式用不着它 —— 那边是上传到云存储拿 cloud:// 文件 ID。
 */

/** 从文件路径里取扩展名（默认 .jpg） */
function extOf(p) {
  var s = String(p || '')
  var q = s.indexOf('?')
  if (q >= 0) s = s.slice(0, q)
  var m = s.match(/\.([A-Za-z0-9]{2,5})$/)
  return m ? ('.' + m[1].toLowerCase()) : '.jpg'
}

/**
 * 让用户选一张图。
 * resolve 出临时文件路径；用户取消时 reject 一个 message 为 'CANCEL' 的错误。
 * ★ 取消不是错误，调用方应当静默忽略 —— 所以这里刻意把取消和真失败区分开。
 */
function chooseImage() {
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || typeof wx.chooseMedia !== 'function') {
      reject(new Error('当前环境不支持选图'))
      return
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      // compressed：不压缩的话现在手机随手一张就是 5MB+，
      // 云端占用和加载时间都会很难看
      sizeType: ['compressed'],
      success: function (res) {
        var f = res && res.tempFiles && res.tempFiles[0]
        if (f && f.tempFilePath) resolve(f.tempFilePath)
        else reject(new Error('CANCEL'))
      },
      fail: function () { reject(new Error('CANCEL')) }
    })
  })
}

/**
 * 把临时图片复制到本机用户目录，返回长期有效的路径。
 * 万一文件系统不可用（存储受限、基础库太老），退回临时路径 ——
 * 本次运行仍然能用，只是重启后失效，总比整个加菜流程失败好。
 */
function persist(tempPath, name) {
  try {
    var fs = wx.getFileSystemManager()
    var dir = wx.env.USER_DATA_PATH + '/dishes'
    try { fs.mkdirSync(dir, true) } catch (e) { /* 已存在 */ }
    var dest = dir + '/' + name + extOf(tempPath)
    try { fs.unlinkSync(dest) } catch (e) { /* 没这个文件 */ }
    fs.copyFileSync(tempPath, dest)
    return dest
  } catch (e) {
    return tempPath
  }
}

module.exports = {
  extOf: extOf,
  chooseImage: chooseImage,
  persist: persist
}
