/**
 * 金额 / 日期 格式化工具
 *
 * ★ 核心约定：金额一律用「分」为单位的整数在内部流转，
 *   只在显示时转成「元」的字符串。
 *   原因：JS 浮点数算钱会出错，0.1 + 0.2 !== 0.3
 */

/** 补零：5 -> "05" */
function pad2(n) {
  n = Number(n) || 0
  return n < 10 ? '0' + n : '' + n
}

/** 分 -> 元字符串。 2550 -> "25.50" ， -30 -> "-0.30" */
function fen2yuan(fen) {
  var n = Math.round(Number(fen) || 0)
  var sign = n < 0 ? '-' : ''
  var a = Math.abs(n)
  return sign + Math.floor(a / 100) + '.' + pad2(a % 100)
}

/**
 * 元字符串 -> 分。  "25.5" -> 2550 ， "0.01" -> 1
 * 全程按字符串解析，不经过浮点乘法，所以不会有精度损失。
 * 输入非法（含非数字、超过两位小数）时返回 NaN。
 */
function yuan2fen(input) {
  if (input === null || input === undefined) return NaN
  var s = String(input).trim()
  if (s === '') return NaN
  if (!/^\d*(\.\d{0,2})?$/.test(s)) return NaN

  var parts = s.split('.')
  var intPart = parts[0] === '' ? '0' : parts[0]
  var decPart = ((parts[1] || '') + '00').slice(0, 2)
  return parseInt(intPart, 10) * 100 + parseInt(decPart, 10)
}

/** 今天，格式 YYYY-MM-DD */
function todayStr() {
  var d = new Date()
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

/** 某年某月有多少天。month 为 1-12 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

/** "2026-10-15" -> "今天 · 10月15日" / "昨天 · 10月14日" / "10月13日" */
function dateLabel(dateStr) {
  var p = String(dateStr).split('-')
  var m = parseInt(p[1], 10)
  var d = parseInt(p[2], 10)
  var base = m + '月' + d + '日'

  if (dateStr === todayStr()) return '今天 · ' + base

  var y = new Date()
  y.setDate(y.getDate() - 1)
  var yStr = y.getFullYear() + '-' + pad2(y.getMonth() + 1) + '-' + pad2(y.getDate())
  if (dateStr === yStr) return '昨天 · ' + base

  return base
}

/** 2026, 10 -> "2026年10月" */
function ymLabel(year, month) {
  return year + '年' + month + '月'
}

module.exports = {
  pad2: pad2,
  fen2yuan: fen2yuan,
  yuan2fen: yuan2fen,
  todayStr: todayStr,
  daysInMonth: daysInMonth,
  dateLabel: dateLabel,
  ymLabel: ymLabel
}
