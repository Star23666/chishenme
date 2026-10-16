var app = getApp()
var fmt = require('../../utils/format.js')

Page({
  data: {
    total: 0,
    dayCount: 0,
    expenseText: '0.00',
    incomeText: '0.00',
    balanceText: '0.00'
  },

  onShow: function () {
    this.refresh()
  },

  refresh: function () {
    var all = app.allRecords()

    var dayMap = {}
    var expense = 0
    var income = 0

    for (var i = 0; i < all.length; i++) {
      var r = all[i]
      dayMap[r.date] = 1
      if (r.type === 'income') income += r.amount
      else expense += r.amount
    }

    var dayCount = 0
    for (var k in dayMap) {
      if (dayMap.hasOwnProperty(k)) dayCount++
    }

    this.setData({
      total: all.length,
      dayCount: dayCount,
      expenseText: fmt.fen2yuan(expense),
      incomeText: fmt.fen2yuan(income),
      balanceText: fmt.fen2yuan(income - expense)
    })
  },

  exportData: function () {
    if (this.data.total === 0) {
      wx.showToast({ title: '还没有数据可导出', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: app.exportJSON(),
      success: function () {
        wx.showToast({ title: '已复制，粘贴到备忘录保存', icon: 'none', duration: 2000 })
      }
    })
  },

  clearData: function () {
    var self = this
    if (this.data.total === 0) {
      wx.showToast({ title: '本来就是空的', icon: 'none' })
      return
    }
    wx.showModal({
      title: '清空全部数据？',
      content: '共 ' + this.data.total + ' 条记录将被永久删除，无法恢复。建议先导出备份。',
      confirmText: '确认清空',
      confirmColor: '#E8564C',
      success: function (res) {
        if (!res.confirm) return
        app.clearAll()
        wx.showToast({ title: '已清空', icon: 'none' })
        self.refresh()
      }
    })
  }
})
