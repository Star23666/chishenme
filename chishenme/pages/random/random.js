var app = getApp()
var D = require('../../data/dishes.js')

var TICKS = 14      // 滚动次数
var TICK_MS = 80    // 每次间隔

/* 摇一摇的手感参数
 * ★ 静止时合加速度 ≈ 1g。走路颠簸一般 1.3~1.6g，真摇手机会冲到 2g 以上，
 *   所以阈值取 1.75，并且要**连续 2 个采样点**都超过才认 —— 防走路误触。
 * ★ 这几个数只能靠真机调：iOS 与 Android 的加速度计灵敏度不一样，
 *   同一个阈值在两边的手感会有差别。
 */
var SHAKE_G = 1.75
var SHAKE_HITS = 2
var SHAKE_COOLDOWN_MS = 700

Page({

  data: {
    mode: 'one',          // one = 随机一道；combo = 三菜一汤
    cats: [],
    activeCat: 'all',
    rolling: false,
    rollName: '',
    result: null,         // 单道模式结果
    combo: [],            // 组合模式结果
    hasResult: false,
    shakeReady: false     // 加速度计可用（不可用就只显示按钮，不吹「摇一摇」）
  },

  onLoad: function () {
    this.setData({ cats: D.CATS })
  },

  onShow: function () {
    this.startShake()
  },

  onHide: function () {
    this.stopRoll()
    this.stopShake()
  },

  onUnload: function () {
    this.stopRoll()
    this.stopShake()
  },

  /* ---------- 摇一摇：真的听得见摇动 ----------
   * 这一页叫「摇一摇」，之前却只能点按钮 —— 名字承诺的和做的不一致。
   * 这里接加速度计，摇手机等于点「摇一摇」。
   *
   * ★ 三件必须做的事：
   *   1. **只在页面可见时监听**（onShow 开、onHide/onUnload 关），
   *      否则切走之后还在耗电；
   *   2. 拿不到加速度计（部分模拟器 / 旧机型）时**静默退回按钮**：
   *      不弹错、不打断使用，只是不显示「摇一摇手机」那句提示；
   *   3. 节流 + 连续采样确认，否则走两步路就自己摇起来了。
   */
  startShake: function () {
    if (this._accelOn) return
    var that = this
    this._hits = 0
    this._accelHandler = function (a) { that.onAccel(a) }
    try {
      wx.startAccelerometer({
        interval: 'ui',
        success: function () {
          that._accelOn = true
          wx.onAccelerometerChange(that._accelHandler)
          if (!that.data.shakeReady) that.setData({ shakeReady: true })
        },
        fail: function () {
          that._accelOn = false
          that._accelHandler = null
          if (that.data.shakeReady) that.setData({ shakeReady: false })
        }
      })
    } catch (e) {
      this._accelOn = false
      this._accelHandler = null
    }
  },

  stopShake: function () {
    if (!this._accelOn) return
    this._accelOn = false
    if (this._accelHandler && wx.offAccelerometerChange) {
      wx.offAccelerometerChange(this._accelHandler)
    }
    this._accelHandler = null
    wx.stopAccelerometer({ fail: function () {} })
  },

  /** 加速度回调：够猛、而且连续够猛，才算「摇了一下」 */
  onAccel: function (a) {
    if (this.data.rolling) return

    var mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
    if (mag <= SHAKE_G) {
      this._hits = 0
      return
    }
    this._hits = (this._hits || 0) + 1
    if (this._hits < SHAKE_HITS) return
    this._hits = 0

    var now = Date.now()
    if (now - (this._lastShakeAt || 0) < SHAKE_COOLDOWN_MS) return
    this._lastShakeAt = now

    // 短震一下：手上有回应，才知道「摇到了」
    wx.vibrateShort({ type: 'medium', fail: function () {} })
    this.shake()
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
