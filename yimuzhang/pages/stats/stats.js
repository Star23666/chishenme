var app = getApp()
var fmt = require('../../utils/format.js')

Page({
  data: {
    year: 0,
    month: 0,
    monthText: '',
    isCurrentMonth: true,
    totalText: '0.00',
    avgText: '0.00',
    peakText: '0.00',
    cats: [],
    days: []
  },

  onLoad: function () {
    var d = new Date()
    this.setData({
      year: d.getFullYear(),
      month: d.getMonth() + 1
    })
  },

  onShow: function () {
    this.refresh()
  },

  refresh: function () {
    var ym = { year: this.data.year, month: this.data.month }
    var st = app.categoryStats(ym)
    var daily = app.dailyStats(ym)

    var now = new Date()
    var isCur = (ym.year === now.getFullYear() && ym.month === now.getMonth() + 1)

    // 日均：本月按「已过天数」算，翻看历史月份按「整月天数」算
    var daysInMonth = fmt.daysInMonth(ym.year, ym.month)
    var denom = isCur ? now.getDate() : daysInMonth
    var avg = denom > 0 ? Math.round(st.total / denom) : 0

    // 单日最高
    var max = 0
    for (var i = 0; i < daily.length; i++) {
      if (daily[i].amount > max) max = daily[i].amount
    }

    // 柱状图：把金额换算成 0-100 的高度百分比
    var days = []
    for (var j = 0; j < daily.length; j++) {
      var d = daily[j]
      var h = max > 0 ? Math.round(d.amount * 100 / max) : 0
      if (d.amount > 0 && h < 4) h = 4
      days.push({
        day: d.day,
        h: h,
        // 只在 1 号和每 5 天标数字，避免 31 个标签挤在一起
        label: (d.day === 1 || d.day % 5 === 0) ? String(d.day) : ''
      })
    }

    this.setData({
      monthText: fmt.ymLabel(ym.year, ym.month),
      isCurrentMonth: isCur,
      totalText: fmt.fen2yuan(st.total),
      avgText: fmt.fen2yuan(avg),
      peakText: fmt.fen2yuan(max),
      cats: st.list,
      days: days
    })
  },

  prevMonth: function () {
    var y = this.data.year
    var m = this.data.month - 1
    if (m < 1) {
      m = 12
      y = y - 1
    }
    this.setData({ year: y, month: m }, this.refresh)
  },

  nextMonth: function () {
    if (this.data.isCurrentMonth) return
    var y = this.data.year
    var m = this.data.month + 1
    if (m > 12) {
      m = 1
      y = y + 1
    }
    this.setData({ year: y, month: m }, this.refresh)
  }
})
