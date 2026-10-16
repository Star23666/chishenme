var app = getApp()
var D = require('../../data/dishes.js')

Page({

  data: {
    cats: [],
    activeCat: 'all',
    list: [],
    total: 0,
    detail: null,
    detailVisible: false
  },

  onLoad: function () {
    this.setData({ cats: D.CATS, total: D.TOTAL })
    this.refresh('all')
  },

  onShow: function () {
    // 收藏可能在「收藏页」被改过，回到本页重新同步标记
    this.refresh(this.data.activeCat)
  },

  /** 按分类重建列表（附带图片路径与收藏状态） */
  refresh: function (cat) {
    var src = D.byCat(cat)
    var out = []
    for (var i = 0; i < src.length; i++) {
      out.push({
        id: src[i].id,
        name: src[i].name,
        cat: src[i].cat,
        main: src[i].main,
        tips: src[i].tips,
        image: D.imageOf(src[i].id),
        fav: app.isFav(src[i].id)
      })
    }
    this.setData({ list: out, activeCat: cat })
  },

  switchCat: function (e) {
    this.refresh(e.currentTarget.dataset.cat)
  },

  openDetail: function (e) {
    var dish = D.byId(e.currentTarget.dataset.id)
    if (!dish) return
    this.setData({
      detail: {
        id: dish.id,
        name: dish.name,
        catName: D.catName(dish.cat),
        main: dish.main,
        tips: dish.tips,
        image: D.imageOf(dish.id),
        fav: app.isFav(dish.id)
      },
      detailVisible: true
    })
  },

  closeDetail: function () {
    this.setData({ detailVisible: false })
  },

  /** 弹层内部点击不穿透到遮罩 */
  noop: function () {},

  /** 长按卡片：收藏 / 取消收藏 */
  tapLong: function (e) {
    var on = app.toggleFav(e.currentTarget.dataset.id)
    wx.showToast({ title: on ? '已收藏' : '已取消收藏', icon: 'none' })
    this.refresh(this.data.activeCat)
  },

  toggleFavInDetail: function () {
    var d = this.data.detail
    if (!d) return
    var on = app.toggleFav(d.id)
    wx.showToast({ title: on ? '已收藏' : '已取消收藏', icon: 'none' })
    this.setData({ 'detail.fav': on })
    this.refresh(this.data.activeCat)
  },

  addCurrent: function () {
    var d = this.data.detail
    if (!d) return
    app.addToMenu(d.id)
    this.setData({ detailVisible: false })
    wx.showToast({ title: '已加入菜单', icon: 'success' })
  },

  onShareAppMessage: function () {
    // ★ 别把道数写死。菜库会一直加菜，写死的数字迟早变成假消息
    //   （曾经这里是「进来挑 35 道家常菜」）。
    return {
      title: '今天吃啥？进来挑 ' + D.TOTAL + ' 道菜',
      path: '/pages/library/library'
    }
  }
})
