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
    this.setData({ cats: D.CATS })
  },

  onShow: function () {
    // ★ 每次回到本页都先从服务端同步一次自建菜。
    //   家里人刚加的菜、或者别人把某道菜删了，切回来就得看见 ——
    //   菜库不像菜单那样有实时推送，只能靠这一下拉齐。
    var that = this
    app.refreshDishes().then(function () {
      that.refresh(that.data.activeCat)
    })
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
    // 道数用 app.totalDishes()（内置 + 自建），不要用 D.TOTAL（那只是内置的 80 道）
    this.setData({ list: out, activeCat: cat, total: app.totalDishes() })
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
        fav: app.isFav(dish.id),
        // 只有自己加的菜才给「编辑 / 删除」。内置菜和别人加的菜都不给。
        mine: app.canEditDish(dish.id)
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

  /* ---------------- 自建菜的增删改 ---------------- */

  goAdd: function () {
    wx.navigateTo({ url: '/pages/edit/edit' })
  },

  editDish: function () {
    var d = this.data.detail
    if (!d || !d.mine) return
    this.setData({ detailVisible: false })
    wx.navigateTo({ url: '/pages/edit/edit?id=' + d.id })
  },

  deleteDish: function () {
    var d = this.data.detail
    if (!d || !d.mine) return
    var that = this
    wx.showModal({
      title: '删掉「' + d.name + '」？',
      content: '它会从菜库和今天的菜单里一起消失，家里人也就点不到这道菜了。',
      confirmText: '删除',
      cancelText: '算了',
      confirmColor: '#D9483B',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        app.deleteDish(d.id).then(function () {
          wx.hideLoading()
          that.setData({ detailVisible: false })
          that.refresh(that.data.activeCat)
          wx.showToast({ title: '已删除', icon: 'none' })
        }).catch(function (e) {
          wx.hideLoading()
          wx.showToast({ title: app.errText(e) || '没删掉，再试一次', icon: 'none' })
        })
      }
    })
  },

  onShareAppMessage: function () {
    // ★ 别把道数写死。菜库会一直加菜，写死的数字迟早变成假消息
    //   （曾经这里是「进来挑 35 道家常菜」）。
    return {
      title: '今天吃啥？进来挑 ' + this.data.total + ' 道菜',
      path: '/pages/library/library'
    }
  }
})
