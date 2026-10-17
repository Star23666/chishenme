var app = getApp()
var fmt = require('../../utils/format.js')

Page({

  data: {
    list: [],
    stats: { kinds: 0, total: 0, meat: 0, veg: 0, soup: 0, staple: 0, cold: 0 },
    dateText: '',
    mixText: '',     // 「两荤、一素、一汤、一主食」（数据层算好）
    totalText: '',   // 「一共 5 道菜、6 份」
    nextDay: false,  // 已过 22:30：这一页显示的是「明天」那份菜单
    cutoff: '',      // 分界点文本（'22:30'），提示条用
    empty: true,
    cloud: false,   // 云开发是否可用
    fam: null       // 当前家庭（云模式才有）
  },

  onLoad: function () {
    // 订阅 app 级的实时推送：家人在别处点了菜，这一页会自动刷新。
    // 注册一次就够（菜单是 tabBar 页，一直活着），所以放在 onLoad 而不是 onShow，
    // 否则来回切 tab 会把同一个回调重复塞进订阅列表。
    var that = this
    this._onMenuChange = function () { that.refresh() }
    app.onMenuChange(this._onMenuChange)
  },

  onUnload: function () {
    app.offMenuChange(this._onMenuChange)
  },

  onShow: function () {
    this.refresh()
  },

  refresh: function () {
    var list = app.menu()
    // ★ 标题按「菜单日」走，不是真实的今天：过了 22:30 菜单就翻篇了，
    //   这一页装的其实是明天那份，写「今天」会让人以为昨天点的菜丢了。
    var day = fmt.menuDayStr()
    this.setData({
      list: list,
      stats: app.menuStats(),
      // 配比和总数都从数据层拿（那里有单测）。用空格分隔，不用中点 ——
      // 「A · B」那种写法是模板味的来源之一。
      mixText: app.menuMixText(),
      totalText: app.menuTotalText(),
      dateText: fmt.dateLabel(day) + ' ' + fmt.weekday(day),
      nextDay: fmt.menuIsNextDay(),
      cutoff: fmt.cutoffText(),
      empty: list.length === 0,
      cloud: app.isCloud(),
      fam: app.family()
    })
  },

  minus: function (e) {
    app.stepQty(e.currentTarget.dataset.id, -1)
    this.refresh()
  },

  remove: function (e) {
    var id = e.currentTarget.dataset.id
    var dish = app.dishById(id)
    var that = this
    wx.showModal({
      title: '移出菜单',
      content: '把「' + (dish ? dish.name : '这道菜') + '」从今日菜单移除？',
      success: function (res) {
        if (!res.confirm) return
        app.removeFromMenu(id)
        that.refresh()
      }
    })
  },

  clearAll: function () {
    var that = this
    var which = this.data.nextDay ? '明天' : '今日'
    wx.showModal({
      title: '清空' + which + '菜单',
      content: this.data.fam
        ? (this.data.nextDay
            ? '会把这个房间明天那份菜单全部清掉，家里其他人也看不到了。确定吗？'
            : '会把这个房间今天点的菜全部清掉，家里其他人也看不到了。确定吗？')
        : '菜单里的菜会全部清掉，确定吗？',
      success: function (res) {
        if (!res.confirm) return
        app.clearMenu()
        that.refresh()
        wx.showToast({ title: '已清空', icon: 'none' })
      }
    })
  },

  /** 把菜单复制成文字，方便粘到家庭群里 */
  copyText: function () {
    wx.setClipboardData({
      data: app.menuText(),
      success: function () {
        wx.showToast({ title: '菜单已复制', icon: 'success' })
      }
    })
  },

  goLibrary: function () {
    wx.switchTab({ url: '/pages/library/library' })
  },

  goRandom: function () {
    wx.switchTab({ url: '/pages/random/random' })
  },

  goFamily: function () {
    wx.navigateTo({ url: '/pages/family/family' })
  },

  onShareAppMessage: function () {
    var list = this.data.list
    var fam = this.data.fam
    var names = []
    for (var i = 0; i < list.length && i < 5; i++) names.push(list[i].name)
    var title = list.length
      ? ('今晚吃：' + names.join('、') + (list.length > 5 ? ' 等 ' + list.length + ' 道菜' : ''))
      : '今天吃啥？一起点菜'

    // 已经建了房间：分享链接带上房间码，家人点一下就能进来一起点
    if (fam && fam.code) {
      return {
        title: title + '｜' + fam.name + '一起点',
        path: '/pages/family/family?room=' + fam.code
      }
    }
    return { title: title, path: '/pages/library/library' }
  },

  onShareTimeline: function () {
    var list = this.data.list
    return {
      title: list.length ? ('今晚吃 ' + list.length + ' 道菜，一起点') : '今天吃啥？'
    }
  }
})
