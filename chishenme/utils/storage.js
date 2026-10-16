/**
 * 本地存储的唯一出口。
 *
 * 铁律：全项目只有这个文件可以直接调用 wx.setStorageSync / wx.getStorageSync，
 *       其它文件一律走 app.js 的数据服务方法。
 *       好处：将来要换成云开发数据库，只改这里 + app.js，5 个页面零改动。
 *
 * 所有读写都包了 try/catch：存储满了、被禁用了，也不能让小程序白屏。
 */

var KEY_MENU = 'csm_menu'            // 今日菜单 [{dishId,qty,note,byNames,addedAt}]
var KEY_MENU_DATE = 'csm_menu_date'  // 菜单所属日期，用于跨天自动清空
var KEY_FAV = 'csm_fav'              // 收藏的 dishId 数组
var KEY_VERSION = 'csm_version'      // 数据版本号，为将来迁移预留
var KEY_FAMILY = 'csm_family'        // 我所在的家庭（云模式才写），{code,name,myName,...}
var KEY_NICK = 'csm_nick'            // 我的称呼，本地存一份用于预填输入框
var KEY_DISHES = 'csm_dishes'        // 本地模式下的自建菜（云模式走云数据库，不写这里）

function get(key, def) {
  try {
    var v = wx.getStorageSync(key)
    if (v === '' || v === null || v === undefined) return def
    return v
  } catch (e) {
    return def
  }
}

function set(key, val) {
  try {
    wx.setStorageSync(key, val)
    return true
  } catch (e) {
    return false
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key)
  } catch (e) { /* 忽略 */ }
}

module.exports = {
  KEY_MENU: KEY_MENU,
  KEY_MENU_DATE: KEY_MENU_DATE,
  KEY_FAV: KEY_FAV,
  KEY_VERSION: KEY_VERSION,
  KEY_FAMILY: KEY_FAMILY,
  KEY_NICK: KEY_NICK,
  KEY_DISHES: KEY_DISHES,
  get: get,
  set: set,
  remove: remove
}
