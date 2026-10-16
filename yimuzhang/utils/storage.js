/**
 * 本地存储封装
 * 页面不直接调用 wx.setStorageSync，一律通过这里，
 * 将来要从本地存储换成云数据库，只需要改这一个文件。
 */

var KEY_RECORDS = 'ymz_records'
var KEY_VERSION = 'ymz_version'

/** 读取全部记录，返回数组（异常时返回空数组，保证页面不崩） */
function readRecords() {
  try {
    var v = wx.getStorageSync(KEY_RECORDS)
    return Array.isArray(v) ? v : []
  } catch (e) {
    return []
  }
}

/** 覆盖写入全部记录 */
function writeRecords(list) {
  try {
    wx.setStorageSync(KEY_RECORDS, Array.isArray(list) ? list : [])
    return true
  } catch (e) {
    return false
  }
}

/** 数据版本号，用于将来做数据迁移 */
function getVersion() {
  try {
    return wx.getStorageSync(KEY_VERSION) || 0
  } catch (e) {
    return 0
  }
}

function setVersion(v) {
  try {
    wx.setStorageSync(KEY_VERSION, v)
  } catch (e) {
    /* 忽略写入失败 */
  }
}

module.exports = {
  KEY_RECORDS: KEY_RECORDS,
  readRecords: readRecords,
  writeRecords: writeRecords,
  getVersion: getVersion,
  setVersion: setVersion
}
