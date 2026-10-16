/** 日期与文本格式化工具 */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

/**
 * '2026-10-15'
 *
 * ★ 固定按东八区（UTC+8）算，不看设备本地时区。
 * 原因：云函数跑在 UTC 时区，如果客户端用本地时区、服务端用 UTC，
 *       晚上 8 点以后两边会算出不同的「今天」，菜单就会串天。
 *       统一成 UTC+8 之后，国内用户的行为不变，两边也永远一致。
 */
function todayStr() {
  var d = new Date(Date.now() + 8 * 3600 * 1000)
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate())
}

/** '2026-10-15' -> '10月15日' */
function mdLabel(s) {
  var p = String(s || '').split('-')
  if (p.length !== 3) return s || ''
  return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日'
}

/** '2026-10-15' -> '周四' */
function weekday(s) {
  var p = String(s || '').split('-')
  if (p.length !== 3) return ''
  var y = parseInt(p[0], 10)
  var m = parseInt(p[1], 10)
  var d = parseInt(p[2], 10)
  if (!y || !m || !d) return ''
  // 用 UTC 构造，避免本地时区把日期推前一天
  var dt = new Date(Date.UTC(y, m - 1, d))
  return '周' + '日一二三四五六'.charAt(dt.getUTCDay())
}

/** 今天 / 昨天 / 10月13日 */
function dateLabel(s) {
  var t = todayStr()
  if (s === t) return '今天'
  var d = new Date(Date.now() + 8 * 3600 * 1000 - 24 * 3600 * 1000)
  var y = d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate())
  if (s === y) return '昨天'
  return mdLabel(s)
}

/** 'HH:mm'（同样按东八区） */
function nowTime() {
  var d = new Date(Date.now() + 8 * 3600 * 1000)
  return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes())
}

module.exports = {
  pad2: pad2,
  todayStr: todayStr,
  mdLabel: mdLabel,
  weekday: weekday,
  dateLabel: dateLabel,
  nowTime: nowTime
}
