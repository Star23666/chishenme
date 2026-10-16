/**
 * ===== 一目账 · 数据服务层（整个小程序的核心）=====
 *
 * 设计约定（后续加功能必须遵守）：
 *   1. 页面只调用这里的方法，绝不直接调用 wx.getStorageSync。
 *      将来要从「本地存储」升级到「云数据库」，只改这个文件就够了。
 *   2. 金额内部一律是「分」为单位的整数，只在返回给页面前不转换。
 */

var storage = require('./utils/storage.js')
var fmt = require('./utils/format.js')
var CATS = require('./utils/categories.js')

App({
  globalData: {
    version: '1.0.0'
  },

  onLaunch: function () {
    if (!storage.getVersion()) {
      storage.setVersion(1)
    }
  },

  /* ---------------- 写入 ---------------- */

  /**
   * 新增一笔记录
   * @param {Object} input {type, amount(分), category, date, note}
   * @return {Object} 补全 id / createdAt 后的完整记录
   */
  addRecord: function (input) {
    input = input || {}
    var list = storage.readRecords()

    var rec = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      type: input.type === 'income' ? 'income' : 'expense',
      amount: Math.round(Number(input.amount) || 0),
      category: input.category || 'other_e',
      date: input.date || fmt.todayStr(),
      note: String(input.note || '').slice(0, 30),
      createdAt: Date.now()
    }

    list.push(rec)
    storage.writeRecords(list)
    return rec
  },

  /**
   * 删除一笔记录
   * @return {Boolean} 是否真的删掉了
   */
  removeRecord: function (id) {
    var list = storage.readRecords()
    var next = []
    var removed = false
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        removed = true
      } else {
        next.push(list[i])
      }
    }
    if (removed) storage.writeRecords(next)
    return removed
  },

  /* ---------------- 查询 ---------------- */

  /**
   * 内部排序：日期倒序；同一天内新的在前。
   * 三条排序依据依次为 日期 → createdAt → 存入顺序，
   * 最后一条是为了处理「同一毫秒内写入两条」的情况，
   * 否则 createdAt 相同会导致显示顺序不确定。
   */
  sortDesc: function (pairs) {
    pairs.sort(function (a, b) {
      if (a.rec.date === b.rec.date) {
        if (b.rec.createdAt !== a.rec.createdAt) {
          return b.rec.createdAt - a.rec.createdAt
        }
        return b.idx - a.idx
      }
      return a.rec.date < b.rec.date ? 1 : -1
    })
    var out = []
    for (var i = 0; i < pairs.length; i++) out.push(pairs[i].rec)
    return out
  },

  /** 全部记录，按日期倒序、同一天内新的在前 */
  allRecords: function () {
    var raw = storage.readRecords()
    var pairs = []
    for (var i = 0; i < raw.length; i++) {
      pairs.push({ rec: raw[i], idx: i })
    }
    return this.sortDesc(pairs)
  },

  /**
   * 按月查记录
   * @param {Object} ym {year, month} 省略则返回全部
   */
  listRecords: function (ym) {
    if (!ym || !ym.year || !ym.month) {
      return this.allRecords()
    }

    var raw = storage.readRecords()
    var prefix = ym.year + '-' + fmt.pad2(ym.month)
    var pairs = []
    for (var i = 0; i < raw.length; i++) {
      if (String(raw[i].date).indexOf(prefix) === 0) {
        pairs.push({ rec: raw[i], idx: i })
      }
    }

    return this.sortDesc(pairs)
  },

  /**
   * 某月汇总
   * @return {Object} {expense, income, balance, count}  单位：分
   */
  summary: function (ym) {
    var list = this.listRecords(ym)
    var expense = 0
    var income = 0
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === 'income') income += list[i].amount
      else expense += list[i].amount
    }
    return {
      expense: expense,
      income: income,
      balance: income - expense,
      count: list.length
    }
  },

  /**
   * 某月「支出」的分类排行
   * @return {Object} {list:[{key,name,color,amount,percent}], total}
   */
  categoryStats: function (ym) {
    var list = this.listRecords(ym)
    var map = {}
    var order = []
    var total = 0

    for (var i = 0; i < list.length; i++) {
      var r = list[i]
      if (r.type !== 'expense') continue
      if (!map[r.category]) {
        map[r.category] = 0
        order.push(r.category)
      }
      map[r.category] += r.amount
      total += r.amount
    }

    var arr = []
    for (var j = 0; j < order.length; j++) {
      var key = order[j]
      var c = CATS.findExpense(key)
      arr.push({
        key: key,
        name: c.name,
        color: c.color,
        amount: map[key],
        amountText: fmt.fen2yuan(map[key]),
        percent: total > 0 ? Math.round(map[key] * 1000 / total) / 10 : 0
      })
    }

    arr.sort(function (a, b) {
      return b.amount - a.amount
    })

    return { list: arr, total: total }
  },

  /**
   * 某月每天的支出合计（用于趋势图）
   * @return {Array} [{day:1, amount:0}, ...]  金额单位：分
   */
  dailyStats: function (ym) {
    var days = fmt.daysInMonth(ym.year, ym.month)
    var arr = []
    var i
    for (i = 1; i <= days; i++) {
      arr.push({ day: i, amount: 0 })
    }

    var list = this.listRecords(ym)
    for (i = 0; i < list.length; i++) {
      var r = list[i]
      if (r.type !== 'expense') continue
      var d = parseInt(String(r.date).slice(8, 10), 10)
      if (d >= 1 && d <= days) arr[d - 1].amount += r.amount
    }

    return arr
  },

  /* ---------------- 工具 ---------------- */

  /** 取分类信息，页面上色 / 显示名字用 */
  categoryOf: function (type, key) {
    return CATS.find(type, key)
  },

  /** 导出全部数据为 JSON 字符串 */
  exportJSON: function () {
    var payload = {
      app: '一目账',
      version: storage.getVersion() || 1,
      exportedAt: new Date().toISOString(),
      count: storage.readRecords().length,
      records: this.allRecords()
    }
    return JSON.stringify(payload, null, 2)
  },

  /** 清空全部记录 */
  clearAll: function () {
    storage.writeRecords([])
  }
})
