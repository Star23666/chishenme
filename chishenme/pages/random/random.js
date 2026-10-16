var app = getApp()
var D = require('../../data/dishes.js')

var TICKS = 14      // 滚动次数
var TICK_MS = 80    // 每次间隔

Page({

  data: {
    mode: 'one',          // one = 随机一道；combo = 三菜一汤
    cats: [],
    activeCat: 'all',
    rolling: false,
    rollName: '',
    result: null,         // 单道模式结果
    combo: [],            // 组合模式结果
    hasResult: false
  },

  onLoad: function () {
    this.setData({ cats: D.CATS })
  },

  onHide: function () {
    this.stopRoll()
  },

  onUnload: function () {
    this.stopRoll()
  },

  /** 定时器必须清掉，否则切页后还在跑，白白耗电 */
  stopRoll: function () {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    if (this.data.rolling) this.setData({ rolling: false })
  },

  switchMode: function (e) {
    this.stopRoll()
    this.setData({
      mode: e.currentTarget.dataset.mode,
      result: null,
      combo: [],
      hasResult: false
    })
  },

  switchCat: function (e) {
    this.stopRoll()
    this.setData({
      activeCat: e.currentTarget.dataset.cat,
      result: null,
      hasResult: false
    })
  },

  shake: function () {
    if (this.data.rolling) return

    var that = this
    var cat = this.data.mode === 'combo' ? 'all' : this.data.activeCat
    var pool = D.byCat(cat)
    if (!pool.length) {
      wx.showToast({ title: '这个分类暂时没有菜', icon: 'none' })
      return
    }

    this.setData({ rolling: true, hasResult: false, result: null, combo: [] })

    var ticks = 0
    this._timer = setInterval(function () {
      ticks++
      var d = pool[Math.floor(Math.random() * pool.length)]
      that.setData({ rollName: d.name })
      if (ticks >= TICKS) {
        clearInterval(that._timer)
        that._timer = null
        that.settle()
      }
    }, TICK_MS)
  },

  /** 出结果 */
  settle: function () {
    if (this.data.mode === 'one') {
      var d = app.randomOne(this.data.activeCat)
      this.setData({
        rolling: false,
        rollName: '',
        hasResult: !!d,
        result: d ? {
          id: d.id,
          name: d.name,
          catName: D.catName(d.cat),
          main: d.main,
          tips: d.tips,
          image: D.imageOf(d.id)
        } : null
      })
      return
    }

    var raw = app.randomCombo()
    var out = []
    for (var i = 0; i < raw.length; i++) {
      out.push({
        id: raw[i].id,
        name: raw[i].name,
        catName: D.catName(raw[i].cat),
        image: D.imageOf(raw[i].id)
      })
    }
    this.setData({
      rolling: false,
      rollName: '',
      combo: out,
      hasResult: out.length > 0
    })
  },

  addOne: function () {
    var r = this.data.result
    if (!r) return
    app.addToMenu(r.id)
    wx.showToast({ title: '已加入菜单', icon: 'success' })
  },

  addCombo: function () {
    var ids = []
    for (var i = 0; i < this.data.combo.length; i++) ids.push(this.data.combo[i].id)
    if (!ids.length) return
    app.addManyToMenu(ids)
    wx.showToast({ title: '已加入 ' + ids.length + ' 道', icon: 'success' })
  },

  goMenu: function () {
    wx.switchTab({ url: '/pages/menu/menu' })
  },

  onShareAppMessage: function () {
    return {
      title: '选择困难？摇一摇决定今天吃啥',
      path: '/pages/library/library'
    }
  }
})
