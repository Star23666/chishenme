var app = getApp()
var D = require('../../data/dishes.js')

Page({

  data: {
    list: [],
    empty: true,
    total: 0
  },

  onShow: function () {
    this.refresh()
  },

  refresh: function () {
    var src = app.favDishes()
    var out = []
    for (var i = 0; i < src.length; i++) {
      out.push({
        id: src[i].id,
        name: src[i].name,
        main: src[i].main,
        catName: D.catName(src[i].cat),
        image: D.imageOf(src[i].id),
        qty: app.qtyOf(src[i].id)
      })
    }
    this.setData({
      list: out,
      empty: out.length === 0,
      total: D.TOTAL
    })
  },

  unFav: function (e) {
    app.toggleFav(e.currentTarget.dataset.id)
    this.refresh()
    wx.showToast({ title: '已取消收藏', icon: 'none' })
  },

  add: function (e) {
    app.addToMenu(e.currentTarget.dataset.id)
    this.refresh()
    wx.showToast({ title: '已加入菜单', icon: 'success' })
  },

  goLibrary: function () {
    wx.switchTab({ url: '/pages/library/library' })
  },

  onShareAppMessage: function () {
    return {
      title: '我在「今天吃啥」收藏了 ' + this.data.list.length + ' 道家常菜',
      path: '/pages/library/library'
    }
  }
})
