var app = getApp()
var fmt = require('../../utils/format.js')

Page({
  data: {
    year: 0,
    month: 0,
    monthText: '',
    isCurrentMonth: true,
    count: 0,
    summary: {
      expenseText: '0.00',
      incomeText: '0.00',
      balanceText: '0.00'
    },
    groups: []
  },

  onLoad: function () {
    var d = new Date()
    this.setData({
      year: d.getFullYear(),
      month: d.getMonth() + 1
    })
  },

  // 每次显示都重新算，从「记一笔」页保存后切回来就能立刻看到
  onShow: function () {
    this.refresh()
  },

  refresh: function () {
    var ym = { year: this.data.year, month: this.data.month }
    var s = app.summary(ym)
    var list = app.listRecords(ym)

    var now = new Date()
    var isCur = (ym.year === now.getFullYear() && ym.month === now.getMonth() + 1)

    // 按日期分组
    var order = []
    var map = {}
    for (var i = 0; i < list.length; i++) {
      var r = list[i]
      if (!map[r.date]) {
        map[r.date] = { date: r.date, items: [], expense: 0 }
        order.push(r.date)
      }
      var g = map[r.date]
      var cat = app.categoryOf(r.type, r.category)

      g.items.push({
        id: r.id,
        note: r.note,
        type: r.type,
        categoryName: cat.name,
        color: cat.color,
        amountText: (r.type === 'income' ? '+' : '-') + fmt.fen2yuan(r.amount)
      })

      if (r.type === 'expense') g.expense += r.amount
    }

    var groups = []
    for (var j = 0; j < order.length; j++) {
      var day = map[order[j]]
      groups.push({
        date: day.date,
        dateLabel: fmt.dateLabel(day.date),
        expenseText: fmt.fen2yuan(day.expense),
        items: day.items
      })
    }

    this.setData({
      monthText: fmt.ymLabel(ym.year, ym.month),
      isCurrentMonth: isCur,
      count: s.count,
      summary: {
        expenseText: fmt.fen2yuan(s.expense),
        incomeText: fmt.fen2yuan(s.income),
        balanceText: fmt.fen2yuan(s.balance)
      },
      groups: groups
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
  },

  onDelete: function (e) {
    var id = e.currentTarget.dataset.id
    var self = this
    wx.showModal({
      title: '删除这笔记录？',
      content: '删除后无法恢复',
      confirmText: '删除',
      confirmColor: '#E8564C',
      success: function (res) {
        if (!res.confirm) return
        app.removeRecord(id)
        wx.showToast({ title: '已删除', icon: 'none' })
        self.refresh()
      }
    })
  }
})
