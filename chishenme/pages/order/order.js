var app = getApp()
var D = require('../../data/dishes.js')

/** 点菜页的展示顺序（不含「全部」） */
var ORDER_CATS = ['meat', 'veg', 'soup', 'staple', 'cold']

Page({

  data: {
    groups: [],
    kinds: 0,
    total: 0
  },

  onShow: function () {
    this.refresh()
  },

  /** 重建分组列表：每道菜带上当前份数与备注 */
  refresh: function () {
    var menu = app.menu()
    var noteMap = {}
    for (var m = 0; m < menu.length; m++) noteMap[menu[m].dishId] = menu[m].note

    var groups = []
    for (var i = 0; i < ORDER_CATS.length; i++) {
      var cat = ORDER_CATS[i]
      var src = D.byCat(cat)
      var rows = []
      for (var j = 0; j < src.length; j++) {
        rows.push({
          id: src[j].id,
          name: src[j].name,
          image: D.imageOf(src[j].id),
          note: noteMap[src[j].id] || '',
          qty: app.qtyOf(src[j].id)
        })
      }
      groups.push({ key: cat, name: D.catName(cat), rows: rows })
    }

    this.setData({
      groups: groups,
      kinds: app.menuKinds(),
      total: app.menuCount()
    })
  },

  plus: function (e) {
    app.stepQty(e.currentTarget.dataset.id, 1)
    this.refresh()
  },

  minus: function (e) {
    app.stepQty(e.currentTarget.dataset.id, -1)
    this.refresh()
  },

  /** 点菜名或份数 → 弹输入框改备注 */
  editNote: function (e) {
    var id = e.currentTarget.dataset.id
    var dish = D.byId(id)
    if (!dish) return

    var menu = app.menu()
    var cur = ''
    for (var i = 0; i < menu.length; i++) {
      if (menu[i].dishId === id) cur = menu[i].note
    }

    var that = this
    wx.showModal({
      title: dish.name + ' · 备注',
      editable: true,
      placeholderText: '例如：少放辣、多做一份',
      content: cur,
      success: function (res) {
        if (!res.confirm) return
        if (app.qtyOf(id) === 0) app.addToMenu(id) // 还没点就顺手点上
        app.setNote(id, res.content || '')
        that.refresh()
      }
    })
  },

  goMenu: function () {
    wx.switchTab({ url: '/pages/menu/menu' })
  },

  onShareAppMessage: function () {
    return {
      title: '今天吃啥？我一共点了 ' + this.data.kinds + ' 道菜',
      path: '/pages/library/library'
    }
  }
})
