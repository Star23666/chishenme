var app = getApp()
var D = require('../../data/dishes.js')
var media = require('../../utils/media.js')

/**
 * 加菜 / 改菜。
 *
 * 两种用法：
 *   /pages/edit/edit             新建一道自己的菜
 *   /pages/edit/edit?id=<菜品id>  改已有的
 *     - id 是 u 开头的自建菜：只有自己加的才让进
 *     - id 是内置菜（hongshaorou 这种）：只有房主才让进
 *
 * ★ 页面只管收集输入和显示，保存逻辑全在 app.js ——
 *   页面直接调 wx.cloud 会破坏架构铁律（wxml-check 的 G1 会红）。
 */
Page({

  data: {
    id: '',
    isNew: true,
    isBuiltin: false, // 改的是内置的 80 道之一（提示语不一样）
    name: '',
    cat: 'meat',
    main: '',
    tips: '',
    image: '',      // 已保存的图片引用（cloud:// 或本机路径）；内置菜为空串表示用包里那张
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
      // 内置菜只有房主能改，别人加的菜谁都不能改 ——
      // 就算有人手拼 URL 进来，这里也拦住。（真正拦得住的地方是云函数）
      if (!d || !app.canEditDish(id)) {
        wx.showToast({ title: '这道菜改不了', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 800)
        return
      }
      init.isBuiltin = !app.isCustomDish(id)
      init.name = d.name
      init.cat = d.cat
      init.main = d.main || ''
      init.tips = d.tips || ''
      // ★ image 和 preview 是两件事，别混：
      //   image   是「要存进记录里的图片引用」。内置菜的图在包里，这里必须是
      //           空串 —— 把包内路径存进记录，将来换图 / 换设备就对不上了。
      //   preview 是「界面上显示哪张」。统一走 imageOf：内置菜看到包里那张，
      //           自建菜没传图时看到占位图，而不是一片空白。
      init.image = d.image || ''
      init.preview = D.imageOf(id)
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
    var wantedPhoto = !!(d.picked && d.preview)
    var prep = wantedPhoto
      ? app.prepareDishImage(d.preview, d.id || app.newDishId())
      : Promise.resolve(d.image)

    // 照片没传上时 prepareDishImage 返回空串（不报错）。
    // 用它和「本来就没选图」区分开：选了却拿到空串 = 传丢了。
    var photoLost = false

    prep.then(function (image) {
      photoLost = wantedPhoto && !image
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
      if (!photoLost) {
        wx.showToast({ title: d.isNew ? '已加入菜库' : '改好了', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 600)
        return
      }
      // ★ 菜已经存住了，只是照片没跟上。这件事必须说清楚 ——
      //   否则用户以为照片也存好了，回头才发现这道菜是张空图。
      //   照片失败绝不能连累保存，这里是「告知」而不是「报错」。
      wx.showModal({
        title: d.isNew ? '菜加好了，照片没传上' : '改好了，新照片没传上',
        content: d.isNew
          ? '照片上传失败，这道菜先用了默认图。等网络好的时候，点开这道菜再「编辑」一次就能补上。'
          : '照片上传失败，这道菜还用着原来那张。等网络好的时候，再「编辑」一次就能补上。',
        showCancel: false,
        confirmText: '知道了',
        complete: function () { wx.navigateBack() }
      })
    }).catch(function (e) {
      wx.hideLoading()
      that.setData({ saving: false })
      if (e && e.message === 'CANCEL') return
      wx.showToast({ title: app.errText(e) || '没保存成功', icon: 'none' })
    })
  }
})
