/**
 * 云开发调用的唯一出口。
 *
 * 职责很窄：初始化、判断可用性、把云函数调用包成 Promise。
 * 业务逻辑一律不放这里——那是 app.js 的事。
 */

var config = require('../config.js')

var _inited = false
var _usable = false

/** 云能力是否可用（配置里填了 envId 且运行环境支持 wx.cloud） */
function enabled() {
  return !!(config.CLOUD_ENV && typeof wx !== 'undefined' && wx.cloud)
}

/** 只初始化一次；失败就永久降级，不反复重试 */
function init() {
  if (_inited) return _usable
  _inited = true
  _usable = false
  if (!enabled()) return false
  try {
    wx.cloud.init({
      env: config.CLOUD_ENV,
      traceUser: true
    })
    _usable = true
  } catch (e) {
    _usable = false
  }
  return _usable
}

/** 数据库引用（只有云端模式才返回，否则 null） */
function db() {
  if (!init()) return null
  try {
    return wx.cloud.database()
  } catch (e) {
    return null
  }
}

/**
 * 调云函数。
 * 约定：云函数一律返回 { ok: true, data } 或 { ok: false, msg }。
 * 成功 resolve(data)，失败 reject(Error)，调用方用 .catch 兜底。
 */
function call(action, payload) {
  return new Promise(function (resolve, reject) {
    if (!init()) {
      reject(new Error('CLOUD_DISABLED'))
      return
    }
    wx.cloud.callFunction({
      name: config.CLOUD_FUNCTION,
      data: { action: action, payload: payload || {} },
      success: function (res) {
        var r = res && res.result
        if (r && r.ok) {
          resolve(r.data)
        } else {
          reject(new Error((r && r.msg) || 'CLOUD_ERROR'))
        }
      },
      fail: function (err) {
        // 把 errCode 一起带上：微信的 errMsg 有时很含糊，
        // 但错误码是稳定的（-501000 云函数不存在、-502005 集合不存在），
        // 翻译成人话时主要靠它。
        var msg = (err && (err.errMsg || err.message)) || 'CLOUD_FAIL'
        var code = err && err.errCode
        reject(new Error(code ? (msg + ' [' + code + ']') : msg))
      }
    })
  })
}

/**
 * 上传一个本机文件到云存储，resolve 出文件 ID（形如 cloud://xxx/yyy.jpg）。
 *
 * ★ 图片上传也只能放在这里。项目有条铁律：全项目只有这个文件能直接碰 wx.cloud
 *   （wxml-check.js 的 G1 会扫全项目，页面里写一个 wx.cloud.uploadFile 就会红）。
 *
 * cloudPath 是云存储里的路径，同一路径重复上传会覆盖，所以文件名必须带时间戳/随机数。
 */
function uploadFile(cloudPath, filePath) {
  return new Promise(function (resolve, reject) {
    if (!init()) {
      reject(new Error('CLOUD_DISABLED'))
      return
    }
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: function (res) {
        if (res && res.fileID) resolve(res.fileID)
        else reject(new Error('图片上传失败，换一张试试'))
      },
      fail: function (err) {
        reject(new Error(friendly(err)))
      }
    })
  })
}

/**
 * 把云开发抛回的英文错误码翻译成人话。
 *
 * 这里的每一条都是「第一次开通云开发的人一定会遇到」的顺序：
 *   还没开通 -> 环境 ID 填错 -> 云函数没部署 -> 集合没建 -> 权限没配好。
 * 按这个顺序提示，用户一步一步往下走就行，不用去猜错误码。
 */
function friendly(err) {
  // ★ 微信的失败回调有两种形态，这里必须都认：
  //   1) cloud.call 里我们自己包的 Error —— 只有 message
  //   2) wx.cloud.uploadFile 之类的**原始 fail 参数** { errCode, errMsg }
  //   以前只读 message，于是 (2) 的真实错误全被吞掉，用户只能看到
  //   一句没用的兜底文案。真机上传失败就是这么被藏起来的。
  var m = ''
  if (typeof err === 'string') m = err
  else if (err) m = err.errMsg || err.message || ''
  // 只剩错误码时也别丢：-10090 这种码本身就是线索
  if (!m && err && err.errCode !== undefined && err.errCode !== null) {
    m = String(err.errCode)
  }

  // 我们自己抛的（app.js / 云函数约定）
  if (m === 'CLOUD_DISABLED') return '还没配置云开发'
  if (m === 'NO_FAMILY') return '你还没加入家庭'
  if (m === 'NOT_OWNER') return '只有房主能做这个'
  if (m === 'NOT_MINE') return '只能改自己加的菜'

  // 云函数还没部署（-501000）—— 开通云开发后最常见的一步
  if (m.indexOf('-501000') >= 0 ||
      m.indexOf('FunctionName') >= 0 ||
      m.indexOf('function not found') >= 0 ||
      m.indexOf('FUNCTION_NOT_FOUND') >= 0) {
    return '云函数还没部署（部署清单第 4 步）'
  }

  // ★ 云函数是旧版本：前端调了一个旧云函数里还没有的 action，
  //   微信的原话是「未知操作: xxx」。这句话直接弹给用户等于什么都没说，
  //   而真实原因只有一个 —— 改了云函数，但忘了重新上传部署。
  //   （云函数是单独部署的，不会跟着小程序代码一起上传，这一步最容易漏。）
  if (m.indexOf('未知操作') >= 0 || /unknown action|unhandled action/i.test(m)) {
    return '云函数还是旧版本，重新部署一次（部署清单第 4 步）'
  }

  // 环境刚开通，云 API 还没就绪 —— 官方要求等约 10 分钟
  if (m.indexOf('invalid scope') >= 0 ||
      m.indexOf('cloud init error') >= 0 ||
      m.indexOf('Cloud API isn\'t enabled') >= 0) {
    return '云环境刚开通，要等约 10 分钟才能用'
  }

  // 环境 ID 填错了或环境被删了
  if (m.indexOf('-501007') >= 0 ||
      m.indexOf('env not exists') >= 0 ||
      m.indexOf('environment not found') >= 0 ||
      m.indexOf('invalid env') >= 0) {
    return '环境 ID 填错了，检查 config.js'
  }

  // 集合没建
  if (m.indexOf('collection not exist') >= 0 || m.indexOf('-502005') >= 0) {
    return '云数据库的集合还没建（部署清单第 3 步）'
  }

  // 权限没配好 —— 表现为「什么都收不到」，最容易漏
  if (m.indexOf('permission denied') >= 0 ||
      m.indexOf('UNAUTHORIZED') >= 0 ||
      m.indexOf('-502003') >= 0) {
    return '数据库权限没配好（部署清单第 3 步）'
  }

  // ★ 照片传不上去。真机上微信客户端给的是「cgi fail(1,-10090)」这种
  //   完全没有可读信息的客户端错误码 —— 官方那张云开发错误码表里都查不到它。
  //   它几乎总是网络 / 客户端侧的问题，所以提示要指向「换个环境重试」，
  //   别让用户以为是小程序写坏了。
  if (m.indexOf('cgi fail') >= 0 ||
      m.indexOf('-10090') >= 0 ||
      m.indexOf('uploadFile') >= 0) {
    return '照片没传上去，换张图或换个网络再试'
  }

  // 上传的文件超过云存储单文件上限
  if (m.indexOf('-403001') >= 0 ||
      /exceed.*size|size.*limit|too large|file.*too big/i.test(m)) {
    return '这张照片太大了，换张小一点的'
  }

  if (m.indexOf('timeout') >= 0 || m.indexOf('NETWORK') >= 0 ||
      m.indexOf('ERR_INTERNET') >= 0) {
    return '网络不太好，稍后再试'
  }

  // 云函数返回的中文提示直接透传
  return m || '出了点问题'
}

module.exports = {
  enabled: enabled,
  init: init,
  db: db,
  call: call,
  uploadFile: uploadFile,
  friendly: friendly
}
