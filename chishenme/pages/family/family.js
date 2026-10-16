/**
 * 一起点菜 · 家庭房间页
 *
 * 这一页解决「家人点菜了，我怎么才能知道」：
 * 把菜单从「一台设备自己看」变成「一个房间共享」。
 *
 * 三种视图，靠 data 里的几个开关切换：
 *   1. cloud=false  → 云开发还没配，给出配置指路
 *   2. fam=null     → 还没进房间，显示「创建 / 加入」两个 tab
 *   3. fam 有值     → 显示房间码、成员、我的称呼；普通成员能退出，房主能解散
 *
 * 被分享进来的链接形如 /pages/family/family?room=ABC234，
 * onLoad 直接读 room 并预览房间名，家人点一下「加入」就完事。
 */

var app = getApp()

Page({

  data: {
    cloud: false,        // 云开发是否可用
    fam: null,           // 当前家庭
    nick: '',            // 我的称呼（未进房间时用来填表单）

    tab: 'create',       // create | join

    // 创建表单
    fName: '我的家',
    // 加入表单
    jCode: '',
    jPre: null,          // 房间码预览 {name, memberCount, full}

    busy: false,

    // 邀请链接带进来的房间码
    inviteCode: '',
    inviteName: '',
    inviteErr: '',
    inviteBlocked: ''
  },

  onLoad: function (options) {
    var nick = app.myName() || ''
    this.setData({
      cloud: app.isCloud(),
      fam: app.family(),
      nick: nick
    })
    var room = (options && options.room) ? String(options.room).toUpperCase() : ''
    if (room) this.handleInvite(room)
  },

  onShow: function () {
    var self = this
    this.setData({ cloud: app.isCloud(), fam: app.family() })

    // 回到这一页时跟服务端对一次账。
    // 房主解散房间之后，其他成员本机还留着旧房间的缓存 ——
    // 只有重新拉一次才会消失，否则他们会一直看到一个已经不存在的房间。
    if (app.isCloud()) {
      app.refreshFamily().then(function () {
        self.setData({ fam: app.family() })
      }).catch(function () { /* 没网就先用缓存，不要因此清掉房间 */ })
    }
  },

  /* ---------------- 邀请链接 ---------------- */

  handleInvite: function (room) {
    var self = this
    var fam = app.family()
    this.setData({ inviteCode: room, tab: 'join', jCode: room })

    // 已经在这个房间里 → 没必要再点一次
    if (fam && fam.code === room) {
      wx.showToast({ title: '你已经在这个房间啦', icon: 'none' })
      setTimeout(function () { self.goMenu() }, 900)
      return
    }
    // 已经在别的房间 → 明确告诉他要先退出，不能静默失败
    if (fam) {
      this.setData({
        inviteBlocked: '你已经在「' + (fam.name || '一个家庭') + '」里了，要先退出才能加入新房间'
      })
      return
    }
    if (!app.isCloud()) return

    app.peekFamily(room).then(function (info) {
      self.setData({ jPre: info || null, inviteName: (info && info.name) || '', inviteErr: '' })
    }).catch(function (e) {
      self.setData({ jPre: null, inviteName: '', inviteErr: app.errText(e) })
    })
  },

  /* ---------------- 表单输入 ---------------- */

  onInput: function (e) {
    var f = e.currentTarget.dataset.field
    var v = e.detail.value
    var patch = {}
    patch[f] = v
    this.setData(patch)

    // 房间码凑满 6 位就自动去问一下这房间叫什么，省得输错进错家
    if (f === 'jCode') {
      var code = String(v || '').toUpperCase().replace(/\s/g, '')
      this.setData({ jCode: code })
      if (code.length === 6) this.peek(code)
      else this.setData({ jPre: null })
    }
  },

  peek: function (code) {
    var self = this
    if (!app.isCloud()) return
    app.peekFamily(code).then(function (info) {
      self.setData({ jPre: info || null })
    }).catch(function () {
      self.setData({ jPre: null })
    })
  },

  switchTab: function (e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  /* ---------------- 建房间 / 加入 ---------------- */

  doCreate: function () {
    if (this.data.busy) return
    var self = this
    var name = String(this.data.fName || '').trim()
    var nick = String(this.data.nick || '').trim()
    if (!nick) {
      wx.showToast({ title: '先给自己起个称呼', icon: 'none' })
      return
    }
    this.setData({ busy: true })
    app.createFamily(name, nick).then(function (fam) {
      self.setData({ busy: false, fam: fam })
      wx.showToast({ title: '房间建好了', icon: 'success' })
    }).catch(function (e) {
      self.setData({ busy: false })
      wx.showToast({ title: app.errText(e), icon: 'none' })
    })
  },

  doJoin: function () {
    if (this.data.busy) return
    var self = this
    var code = String(this.data.jCode || '').toUpperCase().replace(/\s/g, '')
    var nick = String(this.data.nick || '').trim()
    if (code.length !== 6) {
      wx.showToast({ title: '房间码是 6 位', icon: 'none' })
      return
    }
    if (!nick) {
      wx.showToast({ title: '先给自己起个称呼', icon: 'none' })
      return
    }
    this.setData({ busy: true })
    app.joinFamily(code, nick).then(function (fam) {
      self.setData({ busy: false, fam: fam, inviteBlocked: '', inviteErr: '' })
      wx.showToast({ title: '加入成功', icon: 'success' })
    }).catch(function (e) {
      self.setData({ busy: false })
      wx.showToast({ title: app.errText(e), icon: 'none' })
    })
  },

  /* ---------------- 房间内的操作 ---------------- */

  copyCode: function () {
    var fam = this.data.fam
    if (!fam) return
    wx.setClipboardData({
      data: fam.code,
      success: function () {
        wx.showToast({ title: '房间码已复制', icon: 'success' })
      }
    })
  },

  doRename: function () {
    var self = this
    var fam = this.data.fam
    wx.showModal({
      title: '改我的称呼',
      editable: true,
      placeholderText: '例如：爸爸、妈妈、小明',
      content: (fam && fam.myName) || '',
      success: function (res) {
        if (!res.confirm) return
        var v = String(res.content || '').trim()
        if (!v) {
          wx.showToast({ title: '称呼不能为空', icon: 'none' })
          return
        }
        app.renameSelf(v).then(function (f) {
          self.setData({ fam: f, nick: app.myName() })
          wx.showToast({ title: '改好了', icon: 'success' })
        }).catch(function (e) {
          wx.showToast({ title: app.errText(e), icon: 'none' })
        })
      }
    })
  },

  doLeave: function () {
    var self = this
    wx.showModal({
      title: '退出房间',
      content: '退出后就看不到家人点的菜了，房间码还在，随时能再进来。',
      success: function (res) {
        if (!res.confirm) return
        app.leaveFamily().then(function () {
          self.setData({ fam: null, jCode: '', jPre: null })
          wx.showToast({ title: '已退出', icon: 'none' })
        }).catch(function (e) {
          wx.showToast({ title: app.errText(e), icon: 'none' })
        })
      }
    })
  },

  /**
   * 解散房间（房主）。
   *
   * 这是全项目唯一一个**不可逆**的操作：房间码作废、所有人的菜单一起没，
   * 而且家里其他人纯粹是被动的 —— 他们什么都没点，房间就没了。
   * 所以挡两道：第一道把后果说清楚，第二道才真的删。
   * 只弹一次的话，很容易被顺手点掉。
   */
  doDissolve: function () {
    var self = this
    var fam = this.data.fam
    // 非房主连弹窗都不弹：这个按钮本来就不该出现在他眼前
    if (!fam || !fam.isOwner) return

    wx.showModal({
      title: '解散「' + (fam.name || '这个房间') + '」',
      content: '房间码 ' + fam.code + ' 会作废，家里其他人下次打开就不在这个房间了，今天的菜单也会一起删掉。',
      confirmText: '继续',
      cancelText: '算了',
      success: function (res) {
        if (!res.confirm) return
        self.confirmDissolve()
      }
    })
  },

  /** 第二道确认：到这里才会真的调云函数 */
  confirmDissolve: function () {
    var self = this
    wx.showModal({
      title: '真的要解散吗',
      content: '这一步没有办法撤销，房间也找不回来了。',
      confirmText: '解散',
      cancelText: '再想想',
      confirmColor: '#D9483B',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: '正在解散…', mask: true })
        app.dissolveFamily().then(function () {
          wx.hideLoading()
          self.setData({ fam: null, jCode: '', jPre: null, inviteCode: '', inviteName: '' })
          wx.showToast({ title: '房间已解散', icon: 'none' })
        }).catch(function (e) {
          wx.hideLoading()
          wx.showToast({ title: app.errText(e), icon: 'none' })
        })
      }
    })
  },

  goMenu: function () {
    wx.switchTab({ url: '/pages/menu/menu' })
  },

  /* ---------------- 转发 ---------------- */

  onShareAppMessage: function () {
    var fam = this.data.fam
    var code = fam ? fam.code : this.data.inviteCode
    if (!code) {
      return { title: '今天吃啥？一起点菜', path: '/pages/library/library' }
    }
    return {
      title: '来「' + ((fam && fam.name) || '我家') + '」一起点菜（房间码 ' + code + '）',
      path: '/pages/family/family?room=' + code
    }
  }
})
