/** 日期与文本格式化工具 */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

/** 菜单每天几点「翻篇」：到点之后算新的一份菜单（22.5 = 22:30） */
var MENU_CUTOFF_H = 22.5

/** 把时间戳转成东八区的 'yyyy-mm-dd' */
function dayOf(ms) {
  var d = new Date(ms + 8 * 3600 * 1000)
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate())
}

/**
 * '2026-10-15' —— 真实的今天。
 *
 * ★ 固定按东八区（UTC+8）算，不看设备本地时区。
 * 原因：云函数跑在 UTC 时区，如果客户端用本地时区、服务端用 UTC，
 *       晚上 8 点以后两边会算出不同的「今天」，菜单就会串天。
 *       统一成 UTC+8 之后，国内用户的行为不变，两边也永远一致。
 */
function todayStr(now) {
  return dayOf(typeof now === 'number' ? now : Date.now())
}

/**
 * 菜单归属的日期（「菜单日」）。
 *
 * ★ 菜单的一天不是 00:00~24:00，而是 **00:00~22:30**。
 *   做法是把一天的分界线从 0 点挪到 22:30 —— 等价于算日期前多往后推
 *   24 - 22.5 = 1.5 小时：
 *     22:29 -> 推到当天 23:59 -> 还是今天    （今天这份菜单还有效）
 *     22:30 -> 推到次日 00:00 -> 变成明天    （今天这份作废 = 清空）
 *     次日 08:00 -> 推到次日 09:30 -> 还是次日（新菜单就属于这一天）
 *
 *   所以「22:30 清空」不需要真去删任何数据：读写两边都用这个日期当键，
 *   到点自然对不上。老数据留在库里（3 天后由云函数清掉），
 *   只是不再属于「当前这一份菜单」而已。
 *
 * ★ 客户端与云函数**必须用同一套**。只改一边的话，22:30 之后点菜会以
 *   「今天」的日期写进库，而读的时候按「明天」筛 —— 菜沉在数据库里、
 *   界面上不显示，且两边都不报错（最典型的沉默故障）。
 *
 * ★ 传 now 只为让单测能钉死时刻，不传就是此刻。
 */
function menuDayStr(now) {
  var base = typeof now === 'number' ? now : Date.now()
  return dayOf(base + (24 - MENU_CUTOFF_H) * 3600 * 1000)
}

/** 现在是不是已经过了分界点（菜单已经翻到「明天」那一份了） */
function menuIsNextDay(now) {
  var base = typeof now === 'number' ? now : Date.now()
  return menuDayStr(base) !== todayStr(base)
}

/**
 * 分界点的显示文本，如 '22:30'。
 *
 * ★ 给界面提示用。别在 wxml / js 里另外写一遍「22:30」——
 *   改了 MENU_CUTOFF_H 而漏改文案，提示就会骗人。
 */
function cutoffText() {
  var h = Math.floor(MENU_CUTOFF_H)
  return pad2(h) + ':' + pad2(Math.round((MENU_CUTOFF_H - h) * 60))
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

/** 今天 / 明天 / 昨天 / 10月13日（相对的是**真实的今天**） */
function dateLabel(s, now) {
  var base = typeof now === 'number' ? now : Date.now()
  if (s === todayStr(base)) return '今天'
  if (s === dayOf(base - 24 * 3600 * 1000)) return '昨天'
  if (s === dayOf(base + 24 * 3600 * 1000)) return '明天'
  return mdLabel(s)
}

/** 'HH:mm'（同样按东八区） */
function nowTime(now) {
  var base = typeof now === 'number' ? now : Date.now()
  var d = new Date(base + 8 * 3600 * 1000)
  return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes())
}

module.exports = {
  pad2: pad2,
  MENU_CUTOFF_H: MENU_CUTOFF_H,
  todayStr: todayStr,
  menuDayStr: menuDayStr,
  menuIsNextDay: menuIsNextDay,
  cutoffText: cutoffText,
  mdLabel: mdLabel,
  weekday: weekday,
  dateLabel: dateLabel,
  nowTime: nowTime
}
