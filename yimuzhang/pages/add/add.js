var app = getApp()
var fmt = require('../../utils/format.js')
var CATS = require('../../utils/categories.js')

// 快捷金额：支出多为小额日常，收入是大额，分开配更顺手
var QUICK = {
  expense: [10, 20, 50, 100],
  income: [100, 500, 1000, 5000]
}

Page({
  data: {
    type: 'expense',
    cats: [],
    catKey: '',
    quickList: [],
    amountInput: '',
    date: '',
    dateTouched: false,
    note: ''
  },

  onLoad: function () {
    this.setData({ date: fmt.todayStr() })
    this.loadTypeUI('expense')
  },

  // 每次切回本页都把日期拉回今天，但前提是用户本次还没手动选过日期，
  // 否则会把他特意选的日期冲掉。修的是「工具开着过夜，日期还是昨天」这个坑。
  onShow: function () {
    if (!this.data.dateTouched) {
      this.setData({ date: fmt.todayStr() })
    }
  },

  // 切换「支出/收入」时，分类和快捷金额都要跟着换
  loadTypeUI: function (type) {
    var raw = CATS.list(type)
    var arr = []
    for (var i = 0; i < raw.length; i++) {
      arr.push({
        key: raw[i].key,
        name: raw[i].name,
        color: raw[i].color,
        initial: raw[i].name.charAt(0)
      })
    }
    this.setData({
      cats: arr,
      catKey: arr.length > 0 ? arr[0].key : '',
      quickList: QUICK[type] || QUICK.expense
    })
  },

  // 点快捷金额：直接把数字填进输入框（替换，不是累加）
  quickPick: function (e) {
    this.setData({ amountInput: String(e.currentTarget.dataset.v) })
  },

  switchType: function (e) {
    var t = e.currentTarget.dataset.t
    if (t === this.data.type) return
    this.setData({ type: t })
    this.loadTypeUI(t)
  },

  pickCat: function (e) {
    this.setData({ catKey: e.currentTarget.dataset.key })
  },

  onAmount: function (e) {
    this.setData({ amountInput: e.detail.value })
  },

  onNote: function (e) {
    this.setData({ note: e.detail.value })
  },

  onDate: function (e) {
    this.setData({ date: e.detail.value, dateTouched: true })
  },

  save: function () {
    // 金额：字符串 -> 分（不经过浮点运算，所以 25.50 一定等于 2550）
    var fen = fmt.yuan2fen(this.data.amountInput)
    if (isNaN(fen) || fen <= 0) {
      wx.showToast({ title: '请输入正确的金额', icon: 'none' })
      return
    }
    if (!this.data.catKey) {
      wx.showToast({ title: '请选择分类', icon: 'none' })
      return
    }

    app.addRecord({
      type: this.data.type,
      amount: fen,
      category: this.data.catKey,
      date: this.data.date,
      note: this.data.note
    })

    wx.showToast({ title: '已记一笔', icon: 'success', duration: 900 })

    // 清空表单，方便连续记账
    this.setData({ amountInput: '', note: '' })

    // 跳回明细页，立刻看到刚记的这笔
    setTimeout(function () {
      wx.switchTab({ url: '/pages/index/index' })
    }, 600)
  }
})
