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
    // 房主专属：藏起来的内置菜还能找回来
    isOwner: false,
    hiddenTip: '',        // 菜库底部那行入口，非空才显示
    hiddenList: [],       // 「已隐藏的内置菜」弹层里的列表
    restoreVisible: false,
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
    this.refreshHidden()
    this.apply()
  },

  /**
   * 房主专属：那行「藏起来的内置菜」的入口。
   *
   * ★ 一定要有它。房主删掉一道内置菜之后，下一个动作多半是
   *   「咦，我那道菜去哪了」—— 入口必须在菜库这一页上，就在列表下面，
   *   不用去别的地方找。藏了几道也顺带说清楚。
   */
  refreshHidden: function () {
    var owner = app.isOwner()
    var n = owner ? app.hiddenBuiltinCount() : 0
    this.setData({
      isOwner: owner,
      hiddenTip: n ? '已被你收起来的内置菜 ' + n + ' 道 · 点这里恢复' : ''
    })
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
    var isCustom = app.isCustomDish(dish.id)
    this.setData({
      detail: {
        id: dish.id,
        name: dish.name,
        catName: D.catName(dish.cat),
        main: dish.main,
        tips: dish.tips,
        image: D.imageOf(dish.id),
        fav: app.isFav(dish.id),
        // 自己加的菜能改；内置的 80 道房主也能改（改名字 / 做法，或者收起来）。
        // 别人加的菜、以及家人眼里的内置菜，都不给这两个按钮。
        mine: app.canEditDish(dish.id),
        // 内置菜和自建菜「删除」的含义不一样，弹窗文案要分开
        builtin: !isCustom,
        // 房主改过的内置菜给一行小字。家人看到菜名变了会以为小程序出了问题，
        // 说一句「房主改过」比让他自己去猜便宜得多。
        editedText: (!isCustom && dish.edited)
          ? (app.isOwner() ? '你改过这道菜' : '房主改过这道菜')
          : ''
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
    // ★ 内置菜是删不掉的（数据写死在包里、图片也打在主包里），
    //   「删除」对它其实是「对全家收起来」。这两件事在用户心里完全不一样 ——
    //   说成「删除」的话，房主会以为自己把一道菜永久弄没了，下次就不敢用了。
    wx.showModal({
      title: d.builtin ? '把「' + d.name + '」收起来？' : '删掉「' + d.name + '」？',
      content: d.builtin
        ? '全家人将看不到这道菜，也点不到它。它不会真的消失，你随时能在菜库下面的「已被你收起来的内置菜」里恢复。'
        : '它会从菜库和今天的菜单里一起消失，家里人也就点不到这道菜了。',
      confirmText: d.builtin ? '收起来' : '删除',
      cancelText: '算了',
      confirmColor: '#D9483B',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: d.builtin ? '收起中' : '删除中', mask: true })
        app.deleteDish(d.id).then(function () {
          wx.hideLoading()
          that.setData({ detailVisible: false })
          that.refresh(that.data.activeCat)
          wx.showToast({ title: d.builtin ? '已收起来，随时能恢复' : '已删除', icon: 'none' })
        }).catch(function (e) {
          wx.hideLoading()
          wx.showToast({ title: app.errText(e) || '没删掉，再试一次', icon: 'none' })
        })
      }
    })
  },

  /* ---------------- 恢复被收起来的内置菜（房主专属） ---------------- */

  /** 打开「已被你收起来的内置菜」弹层 */
  openRestore: function () {
    var raw = app.hiddenBuiltin()
    var list = []
    for (var i = 0; i < raw.length; i++) {
      list.push({
        id: raw[i].id,
        name: raw[i].name,
        catName: D.catName(raw[i].cat),
        // 走 imageOf：房主给这道菜换过图的话，这里看到的也是他换的那张
        image: D.imageOf(raw[i].id)
      })
    }
    this.setData({ hiddenList: list, restoreVisible: true })
  },

  closeRestore: function () {
    this.setData({ restoreVisible: false })
  },

  /** 恢复其中的一道 */
  doRestore: function (e) {
    var ds = e.currentTarget.dataset
    var that = this
    wx.showModal({
      title: '恢复「' + (ds.name || '这道菜') + '」？',
      content: '它会回到菜库里，全家人又能点到它。你之前改过的名字和照片也会一起还原。',
      confirmText: '恢复',
      cancelText: '算了',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: '恢复中', mask: true })
        app.restoreBuiltin(ds.id).then(function () {
          wx.hideLoading()
          that.refresh(that.data.activeCat)
          wx.showToast({ title: '已恢复', icon: 'none' })
          // 名单变了，重开一次；都恢复完了就把弹层关掉
          if (app.hiddenBuiltinCount()) that.openRestore()
          else that.setData({ restoreVisible: false, hiddenList: [] })
        }).catch(function (err) {
          wx.hideLoading()
          wx.showToast({ title: app.errText(err) || '没恢复成功', icon: 'none' })
        })
      }
    })
  },

  /**
   * 全部恢复。
   * ★ 串行执行，不用 Promise.all 并发：每恢复一道都会往服务端写一次，
   *   并发发出去容易出现「读到一半的名单」，而且失败了也说不清是哪一道。
   */
  restoreAll: function () {
    var that = this
    var raw = app.hiddenBuiltin()
    if (!raw.length) return
    var ids = []
    for (var i = 0; i < raw.length; i++) ids.push(raw[i].id)

    wx.showModal({
      title: '把这 ' + ids.length + ' 道都恢复？',
      content: '它们都会回到菜库里。你之前对它们做过的改动（改的名字、换的照片）也会一起还原。',
      confirmText: '全部恢复',
      cancelText: '算了',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: '恢复中', mask: true })
        var chain = Promise.resolve()
        for (var j = 0; j < ids.length; j++) {
          // 用闭包把 j 固定住，否则回调跑到最后全用的是最后一个 id
          chain = chain.then((function (id) {
            return function () { return app.restoreBuiltin(id) }
          })(ids[j]))
        }
        chain.then(function () {
          wx.hideLoading()
          that.setData({ restoreVisible: false, hiddenList: [] })
          that.refresh(that.data.activeCat)
          wx.showToast({ title: '都恢复了', icon: 'none' })
        }).catch(function (err) {
          // 中途失败：已经恢复的那几道是真恢复了，重新拉一遍保持界面和服务端一致
          wx.hideLoading()
          that.refresh(that.data.activeCat)
          wx.showToast({ title: app.errText(err) || '有几道没恢复成功', icon: 'none' })
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
