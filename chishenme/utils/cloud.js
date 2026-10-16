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
 * 把云开发抛回的英文错误码翻译成人话。
 *
 * 这里的每一条都是「第一次开通云开发的人一定会遇到」的顺序：
 *   还没开通 -> 环境 ID 填错 -> 云函数没部署 -> 集合没建 -> 权限没配好。
 * 按这个顺序提示，用户一步一步往下走就行，不用去猜错误码。
 */
function friendly(err) {
  var m = (err && err.message) || ''

  // 我们自己抛的（app.js / 云函数约定）
  if (m === 'CLOUD_DISABLED') return '还没配置云开发'
  if (m === 'NO_FAMILY') return '你还没加入家庭'
  if (m === 'NOT_OWNER') return '只有房主能做这个'

  // 云函数还没部署（-501000）—— 开通云开发后最常见的一步
  if (m.indexOf('-501000') >= 0 ||
      m.indexOf('FunctionName') >= 0 ||
      m.indexOf('function not found') >= 0 ||
      m.indexOf('FUNCTION_NOT_FOUND') >= 0) {
    return '云函数还没部署（部署清单第 4 步）'
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
  friendly: friendly
}
