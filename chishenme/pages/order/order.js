var app = getApp()
var D = require('../../data/dishes.js')

/** 点菜页的展示顺序（不含「全部」） */
var ORDER_CATS = ['meat', 'veg', 'soup', 'staple', 'cold']

Page({

  data: {
    groups: [],
    kinds: 0,
    total: 0,
    kw: '',          // 搜索关键词（空 = 不筛）
    hitCount: 0      // 当前筛出来多少道（搜索无结果时用它出空状态）
  },

  onShow: function () {
    this.refresh()
  },

  /** 搜索框输入 */
  onSearch: function (e) {
    // setData 会**同步**更新 this.data，所以紧接着的 refresh() 能读到新的 kw
    this.setData({ kw: String((e.detail && e.detail.value) || '') })
    this.refresh()
  },

  clearSearch: function () {
    this.setData({ kw: '' })
    this.refresh()
  },

  /** 重建分组列表：每道菜带上当前份数与备注 */
  refresh: function () {
    var menu = app.menu()
    var noteMap = {}
    for (var m = 0; m < menu.length; m++) noteMap[menu[m].dishId] = menu[m].note

    // ★ 命中规则用 D.match（和菜库共用同一套），不在这里另写一遍 ——
    //   两边各写一遍就会出现「菜库搜得到、点菜页搜不到」，而且不报错。
    var kw = this.data.kw
    var groups = []
    var hitCount = 0

    for (var i = 0; i < ORDER_CATS.length; i++) {
      var cat = ORDER_CATS[i]
      var src = D.byCat(cat)
      var rows = []
      for (var j = 0; j < src.length; j++) {
        if (!D.match(src[j], kw)) continue
        rows.push({
          id: src[j].id,
          name: src[j].name,
          image: D.imageOf(src[j].id),
          note: noteMap[src[j].id] || '',
          qty: app.qtyOf(src[j].id)
        })
      }
      // 搜空了的分组整段不显示，免得留一串空标题
      if (!rows.length) continue
      groups.push({ key: cat, name: D.catName(cat), rows: rows })
      hitCount += rows.length
    }

    this.setData({
      groups: groups,
      hitCount: hitCount,
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
