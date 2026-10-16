var app = getApp()
var D = require('../../data/dishes.js')

Page({

  data: {
    cats: [],
    activeCat: 'all',
    list: [],        // 当前分类下的全部菜
    shown: [],       // 真正渲染的那个数组：搜索时是搜索结果
    kw: '',          // 搜索词
    total: 0,
    tipText: '',
    emptyText: '',   // 搜不到时的提示，非空才显示
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

  /** 把菜品原始对象转成界面要用的形状（补上图片路径与收藏状态） */
  decorate: function (src) {
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
    return out
  },

  /** 按分类重建列表 */
  refresh: function (cat) {
    // 道数用 app.totalDishes()（内置 + 自建），不要用 D.TOTAL（那只是内置的 80 道）
    this.setData({
      list: this.decorate(D.byCat(cat)),
      activeCat: cat,
      total: app.totalDishes()
    })
    this.apply()
  },

  /**
   * 决定此刻该显示什么：有搜索词就显示搜索结果，否则显示当前分类。
   *
   * 单独抽出来是因为「收藏 / 取消收藏 / 删菜 / 从别的页切回来」都会动到底层数据，
   * 每一处都手写一遍显示逻辑，迟早会漏掉一个分支（并且不会报错，只是显示不对）。
   */
  apply: function () {
    var kw = this.data.kw
    var shown = kw ? this.search(kw) : this.data.list
    var total = app.totalDishes()

    var tipText = '长按菜品可收藏 / 取消收藏 · 本菜库共 ' + total + ' 道'
    var emptyText = ''
    if (kw) {
      if (shown.length) {
        tipText = '「' + kw + '」找到 ' + shown.length + ' 道'
      } else {
        tipText = ''
        emptyText = '没找到「' + kw + '」。换个词试试，或者直接加一道'
      }
    }

    this.setData({ shown: shown, total: total, tipText: tipText, emptyText: emptyText })
  },

  /**
   * 搜索结果。匹配和排序规则在数据层的 D.search 里 ——
   * 那边有 core-test 的断言守着，页面这层只负责把结果转成界面形状。
   */
  search: function (kw) {
    return this.decorate(D.search(kw))
  },

  onSearch: function (e) {
    // setData 会**同步**更新 this.data，所以紧接着的 apply() 能读到新的 kw
    this.setData({ kw: String((e.detail && e.detail.value) || '') })
    this.apply()
  },

  clearSearch: function () {
    this.setData({ kw: '' })
    this.apply()
  },

  switchCat: function (e) {
    // 点分类 = 明确退出搜索。否则用户切了分类却发现列表没变，只会觉得坏了
    this.setData({ kw: '' })
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
