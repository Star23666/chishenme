var app = getApp()
var D = require('../../data/dishes.js')
var media = require('../../utils/media.js')

/**
 * 加菜 / 改菜。
 *
 * 两种用法：
 *   /pages/edit/edit            新建
 *   /pages/edit/edit?id=<菜品id> 改已有的（只有自己加的才让进）
 *
 * ★ 页面只管收集输入和显示，保存逻辑全在 app.js ——
 *   页面直接调 wx.cloud 会破坏架构铁律（wxml-check 的 G1 会红）。
 */
Page({

  data: {
    id: '',
    isNew: true,
    name: '',
    cat: 'meat',
    main: '',
    tips: '',
    image: '',      // 已保存的图片引用（cloud:// 或本机路径）
    preview: '',    // 界面上显示的那张：新选的临时图优先
    picked: false,  // 这次是不是重选了图
    cats: [],
    saving: false
  },

  onLoad: function (opt) {
    // 分类里去掉「全部」——它不是真分类，存不进数据库
    var cats = []
    for (var i = 0; i < D.CATS.length; i++) {
      if (D.CATS[i].key === 'all') continue
      cats.push({ key: D.CATS[i].key, name: D.CATS[i].name })
    }

    var id = (opt && opt.id) || ''
    var init = { id: id, isNew: !id, cats: cats, cat: cats[0].key }

    if (id) {
      var d = D.byId(id)
      // 内置菜不给改，别人加的也不给改 —— 就算有人手拼 URL 进来，这里也拦住
      if (!d || !app.canEditDish(id)) {
        wx.showToast({ title: '这道菜改不了', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 800)
        return
      }
      init.name = d.name
      init.cat = d.cat
      init.main = d.main || ''
      init.tips = d.tips || ''
      init.image = d.image || ''
      init.preview = d.image || ''
    }

    this.setData(init)
    wx.setNavigationBarTitle({ title: id ? '改一道菜' : '加一道菜' })
  },

  /* ---------------- 图片 ---------------- */

  pickImage: function () {
    var that = this
    media.chooseImage().then(function (tempPath) {
      that.setData({ preview: tempPath, picked: true })
    }).catch(function (e) {
      // 用户自己按了取消，什么都不用说
      if (e && e.message === 'CANCEL') return
      wx.showToast({ title: app.errText(e) || '换个相册试试', icon: 'none' })
    })
  },

  /* ---------------- 表单 ---------------- */

  onName: function (e) { this.setData({ name: e.detail.value }) },
  onMain: function (e) { this.setData({ main: e.detail.value }) },
  onTips: function (e) { this.setData({ tips: e.detail.value }) },

  pickCat: function (e) {
    this.setData({ cat: e.currentTarget.dataset.cat })
  },

  /* ---------------- 保存 ---------------- */

  save: function () {
    var that = this
    var d = this.data
    if (d.saving) return

    var name = String(d.name || '').trim()
    if (!name) {
      wx.showToast({ title: '给这道菜起个名字', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中', mask: true })

    // 只有这次重选了图才需要处理图片；否则沿用原来那张
    var prep = Promise.resolve(d.image)
    if (d.picked && d.preview) {
      prep = app.prepareDishImage(d.preview, d.id || app.newDishId())
    }

    prep.then(function (image) {
      var payload = {
        name: name,
        cat: d.cat,
        main: d.main,
        tips: d.tips,
        image: image
      }
      // ★ 只有「改已有的菜」才带 id。
      //   新建时也带上，云函数会当成更新去找记录，然后报「这道菜已经不在了」。
      if (!d.isNew) payload.id = d.id
      return app.saveDish(payload)
    }).then(function () {
      wx.hideLoading()
      wx.showToast({ title: d.isNew ? '已加入菜库' : '改好了', icon: 'success' })
      setTimeout(function () { wx.navigateBack() }, 600)
    }).catch(function (e) {
      wx.hideLoading()
      that.setData({ saving: false })
      if (e && e.message === 'CANCEL') return
      wx.showToast({ title: app.errText(e) || '没保存成功', icon: 'none' })
    })
  }
})
