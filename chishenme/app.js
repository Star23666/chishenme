/**
 * 今天吃啥 · 数据服务层（核心）
 *
 * 铁律：页面不直接碰 wx.getStorageSync，一律调用这里的 getApp().xxx()
 * 铁律：页面不直接调 wx.cloud，一律走这里的家庭方法
 * —— 这两条保证了「加云开发」只改了这个文件 + 新增一个页面，5 个老页面基本没动。
 *
 * 菜单数据模型：
 *   { dishId: 'hongshaorou', qty: 1, note: '少放辣', byNames: ['小明'], addedAt: 1750000000000 }
 * 存储时只存 dishId，展示时再和 data/dishes.js 拼起来（省存储、改菜名不用迁移数据）。
 *
 * ── 两种运行模式 ──
 *   local：config.CLOUD_ENV 为空 → 数据只在本机（老行为，一字未改）
 *   cloud：填了 envId → 菜单存在云数据库，家人实时共享
 *
 * ★ 完全向后兼容：没配云开发时自动回落 local，不会出现「改到一半不能用」的阶段。
 * ★ 云端模式下本地缓存仍然存在，它扮演两个角色：
 *     1. 乐观更新的落点（点一下立刻有反馈，不用等网络）
 *     2. watch 推送结果的镜像（写回同一批 storage key）
 *   所以 menu() / menuCount() / qtyOf() / menuStats() 这些读方法**一行都不用改**。
 */

var storage = require('./utils/storage.js')
var fmt = require('./utils/format.js')
var cloud = require('./utils/cloud.js')
var config = require('./config.js')
var D = require('./data/dishes.js')

var VERSION = 2
var NOTE_MAX = 20

/** watch 建不起来时退化成轮询的间隔 */
var POLL_MS = 15000

/** 菜单 tab 在 tabBar 里的下标，用来打角标 */
var TAB_MENU = 2

App({

  globalData: {
    version: VERSION,
    family: null,       // 当前家庭缓存
    watcher: null,      // 实时推送句柄
    pollTimer: null,    // 轮询兜底
    listeners: [],      // 页面订阅菜单变化的回调
    pending: 0          // 在途的写请求数
  },

  onLaunch: function () {
    // 首次运行落版本号，将来数据结构变了可以据此迁移
    if (!storage.get(storage.KEY_VERSION, 0)) {
      storage.set(storage.KEY_VERSION, VERSION)
    }
    // 云模式：先把「我在哪个家庭」拉回来，后面 watch 才有房间码可用
    if (this.mode() === 'cloud') {
      var self = this
      this.refreshFamily().catch(function () { /* 没网/没建集合都不该拦住启动 */ })
      // 本地缓存里先认一下，让首屏就有房间信息
      var cached = storage.get(storage.KEY_FAMILY, null)
      if (cached && cached.code) this.globalData.family = cached
    }
  },

  onShow: function () {
    this.startWatch()
  },

  onHide: function () {
    // 长连接必须主动释放，否则切后台还占着实时推送连接数
    this.stopWatch()
  },

  /* ==================== 模式与家庭 ==================== */

  /** 'cloud' | 'local'。判断依据是「envId 填了且 wx.cloud 真的可用」 */
  mode: function () {
    return cloud.init() ? 'cloud' : 'local'
  },

  isCloud: function () {
    return this.mode() === 'cloud'
  },

  /** 把云函数抛回的英文错误码翻译成人话（页面直接用它做 toast） */
  errText: function (e) {
    return cloud.friendly(e)
  },

  /** 当前家庭（云模式才有），没有返回 null */
  family: function () {
    if (this.globalData.family && this.globalData.family.code) return this.globalData.family
    var f = storage.get(storage.KEY_FAMILY, null)
    if (f && f.code) {
      this.globalData.family = f
      return f
    }
    return null
  },

  /** 我在这个家里的称呼 */
  myName: function () {
    var f = this.family()
    if (f && f.myName) return f.myName
    return storage.get(storage.KEY_NICK, '') || ''
  },

  /** 写入家庭缓存并联动 watch / 菜单刷新 */
  setFamily: function (fam) {
    if (fam && fam.code) {
      this.globalData.family = fam
      storage.set(storage.KEY_FAMILY, fam)
      if (fam.myName) storage.set(storage.KEY_NICK, fam.myName)
      this.startWatch()
      this.refreshMenu()
    } else {
      this.globalData.family = null
      storage.set(storage.KEY_FAMILY, null)
      this.stopWatch()
      // 退出家庭后不能还留着上一个房间的菜
      this._saveMenu([])
      this._syncBadge()
      this._notify()
    }
  },

  createFamily: function (name, nickname) {
    var self = this
    return cloud.call('createFamily', { name: name || '', nickname: nickname || '' })
      .then(function (fam) {
        self.setFamily(fam)
        return fam
      })
  },

  joinFamily: function (code, nickname) {
    var self = this
    return cloud.call('joinFamily', { code: code || '', nickname: nickname || '' })
      .then(function (fam) {
        self.setFamily(fam)
        return fam
      })
  },

  /** 加入前先看看这个房间叫什么、几个人（避免输错码进错家） */
  peekFamily: function (code) {
    return cloud.call('peekFamily', { code: code || '' })
  },

  leaveFamily: function () {
    var self = this
    return cloud.call('leaveFamily').then(function () {
      self.setFamily(null)
      return true
    })
  },

  renameSelf: function (nickname) {
    var self = this
    return cloud.call('renameSelf', { nickname: nickname || '' }).then(function (fam) {
      self.setFamily(fam)
      return fam
    })
  },

  /** 从服务端拉一遍「我在哪个家庭」（换手机、清缓存后靠它恢复） */
  refreshFamily: function () {
    var self = this
    if (this.mode() !== 'cloud') return Promise.resolve(null)
    return cloud.call('myFamily').then(function (fam) {
      if (fam && fam.code) {
        self.setFamily(fam)
      } else if (self.globalData.family) {
        self.setFamily(null)
      }
      return fam
    })
  },

  /* ==================== 实时同步 ==================== */

  /** 页面订阅菜单变化（onShow 注册、onHide 注销） */
  onMenuChange: function (fn) {
    if (typeof fn !== 'function') return
    var ls = this.globalData.listeners
    if (ls.indexOf(fn) < 0) ls.push(fn)
  },

  offMenuChange: function (fn) {
    var ls = this.globalData.listeners
    var i = ls.indexOf(fn)
    if (i >= 0) ls.splice(i, 1)
  },

  _notify: function () {
    var ls = this.globalData.listeners.slice()
    for (var i = 0; i < ls.length; i++) {
      try { ls[i]() } catch (e) { /* 单个页面出问题不能拖垮别人 */ }
    }
  },

  /**
   * 建立实时监听。
   * 注意 where 里只按房间码过滤、**不按日期过滤**：
   * 日期过滤是写死的，跨零点后老连接就再也收不到新记录了；
   * 改成客户端自己按日期筛，跨天不用重建连接。
   */
  startWatch: function () {
    if (this.mode() !== 'cloud') return
    var fam = this.family()
    if (!fam) return
    if (this.globalData.watcher) return

    var d = cloud.db()
    if (!d) return

    var self = this
    try {
      var watcher = d.collection(config.COL_MENUS).where({ familyCode: fam.code }).watch({
        onChange: function (snap) {
          self._stopPolling()
          self._applySnapshot(snap && snap.docs ? snap.docs : [])
          self._notify()
        },
        onError: function () {
          // 权限没配好、集合没建、连接断了 —— 都走这里
          self._closeWatcher()
          self._startPolling()
        }
      })
      this.globalData.watcher = watcher
      this._stopPolling()
    } catch (e) {
      this._closeWatcher()
      this._startPolling()
    }
  },

  stopWatch: function () {
    this._closeWatcher()
    this._stopPolling()
  },

  _closeWatcher: function () {
    var w = this.globalData.watcher
    if (!w) return
    this.globalData.watcher = null
    try { w.close() } catch (e) { /* 已经关了 */ }
  },

  /** watch 不可用时的兜底：定时拉一次。UI 晚十几秒，但功能不丢。 */
  _startPolling: function () {
    if (this.globalData.pollTimer) return
    if (this.mode() !== 'cloud' || !this.family()) return
    var self = this
    this.globalData.pollTimer = setInterval(function () {
      self.refreshMenu()
    }, POLL_MS)
  },

  _stopPolling: function () {
    if (!this.globalData.pollTimer) return
    try { clearInterval(this.globalData.pollTimer) } catch (e) { /* 忽略 */ }
    this.globalData.pollTimer = null
  },

  /**
   * 把服务端快照写回本地缓存。
   * 关键：写的是同一批 storage key，所以下面那些读方法完全不用改。
   */
  _applySnapshot: function (docs) {
    var today = fmt.todayStr()
    var list = []
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i]
      if (!d) continue
      if (d.date !== today) continue            // 云端只按房间过滤，日期在这筛
      if (!D.byId(d.dishId)) continue            // 菜谱里没有的脏数据直接丢
      list.push({
        dishId: d.dishId,
        qty: d.qty > 0 ? d.qty : 1,
        note: d.note || '',
        byNames: (d.byNames instanceof Array) ? d.byNames : [],
        addedAt: d.addedAt || 0
      })
    }
    list.sort(function (a, b) { return (a.addedAt || 0) - (b.addedAt || 0) })
    this._saveMenu(list)
    this._syncBadge()
  },

  /** 主动拉一次（watch 兜底 / 页面 onShow 时对齐） */
  refreshMenu: function () {
    if (this.mode() !== 'cloud' || !this.family()) return Promise.resolve(false)
    var self = this
    return cloud.call('listMenu').then(function (data) {
      var raw = (data && data.list) || []
      var list = []
      for (var i = 0; i < raw.length; i++) {
        if (!D.byId(raw[i].dishId)) continue
        list.push({
          dishId: raw[i].dishId,
          qty: raw[i].qty > 0 ? raw[i].qty : 1,
          note: raw[i].note || '',
          byNames: (raw[i].byNames instanceof Array) ? raw[i].byNames : [],
          addedAt: raw[i].addedAt || 0
        })
      }
      self._saveMenu(list)
      self._syncBadge()
      self._notify()
      return true
    }).catch(function () {
      return false
    })
  },

  /**
   * 把一次写操作同步到云端。
   * 失败不静默：弹提示 + 立刻重新拉一次服务端真值，把乐观更新纠正回来。
   */
  _push: function (action, payload) {
    if (this.mode() !== 'cloud' || !this.family()) return
    var self = this
    this.globalData.pending++
    cloud.call(action, payload || {}).then(function () {
      self.globalData.pending--
    }).catch(function (e) {
      self.globalData.pending--
      try {
        wx.showToast({ title: cloud.friendly(e), icon: 'none' })
      } catch (err) { /* 测试环境没有 toast */ }
      self.refreshMenu()
    })
  },

  /** 菜单 tab 角标，走到哪个页面都能看见「今天家里点了几道」 */
  _syncBadge: function () {
    if (typeof wx === 'undefined' || typeof wx.setTabBarBadge !== 'function') return
    var n = this.menuCount()
    try {
      if (n > 0) {
        wx.setTabBarBadge({ index: TAB_MENU, text: n > 99 ? '99+' : String(n) })
      } else if (typeof wx.removeTabBarBadge === 'function') {
        wx.removeTabBarBadge({ index: TAB_MENU })
      }
    } catch (e) { /* tabBar 还没就绪 */ }
  },

  /* ==================== 菜库 ==================== */

  /** 全部分类 */
  cats: function () {
    return D.CATS
  },

  /** 全部菜品（副本，防止页面误改静态数据） */
  allDishes: function () {
    return D.DISHES.slice()
  },

  /** 按分类取菜；cat 为 'all' 或空取全部 */
  dishesByCat: function (cat) {
    return D.byCat(cat)
  },

  /** 单道菜 */
  dishById: function (id) {
    return D.byId(id)
  },

  totalDishes: function () {
    return D.TOTAL
  },

  /* ==================== 今日菜单 ==================== */

  /**
   * 读原始菜单。跨天自动作废 —— 昨天点的菜不该出现在今天。
   * 这里不写存储（只是读），真正清空发生在下次写入时。
   */
  _rawMenu: function () {
    if (storage.get(storage.KEY_MENU_DATE, '') !== fmt.todayStr()) return []
    var list = storage.get(storage.KEY_MENU, [])
    return (list instanceof Array) ? list : []
  },

  /** 保存并打上今天的日期戳 */
  _saveMenu: function (list) {
    storage.set(storage.KEY_MENU_DATE, fmt.todayStr())
    storage.set(storage.KEY_MENU, list)
  },

  /** 判断这条记录里有没有谁点过 */
  _byOf: function (item) {
    var a = (item && item.byNames instanceof Array) ? item.byNames : []
    return a
  },

  /** 把称呼并进 byNames（去重、保持加入顺序） */
  _addName: function (arr, name) {
    var out = (arr instanceof Array) ? arr.slice() : []
    if (name && out.indexOf(name) < 0) out.push(name)
    return out
  },

  /** 菜单（已拼上菜名/分类/图片路径），按加入顺序返回 */
  menu: function () {
    var raw = this._rawMenu()
    var out = []
    for (var i = 0; i < raw.length; i++) {
      var d = D.byId(raw[i].dishId)
      if (!d) continue // 菜品被删掉了，忽略脏数据
      var by = this._byOf(raw[i])
      out.push({
        dishId: d.id,
        name: d.name,
        cat: d.cat,
        catName: D.catName(d.cat),
        main: d.main,
        tips: d.tips,
        image: D.imageOf(d.id),
        qty: raw[i].qty > 0 ? raw[i].qty : 1,
        note: raw[i].note || '',
        // WXML 里不能调数组方法，所以这里就把文本拼好
        byText: by.join('、'),
        hasBy: by.length > 0,
        addedAt: raw[i].addedAt || 0
      })
    }
    return out
  },

  /** 菜单里一共几道（按份数累加） */
  menuCount: function () {
    var raw = this._rawMenu()
    var n = 0
    for (var i = 0; i < raw.length; i++) n += (raw[i].qty > 0 ? raw[i].qty : 1)
    return n
  },

  /** 菜单里一共几种（去重后） */
  menuKinds: function () {
    return this._rawMenu().length
  },

  /** 某道菜在菜单里的份数，0 表示没点 */
  qtyOf: function (dishId) {
    var raw = this._rawMenu()
    for (var i = 0; i < raw.length; i++) {
      if (raw[i].dishId === dishId) return raw[i].qty > 0 ? raw[i].qty : 1
    }
    return 0
  },

  /**
   * 纯本地的加菜（乐观更新），不碰网络。
   * 拆出来是为了让「一次加多道」能合并成一次请求。
   */
  _addLocal: function (dishId, note) {
    if (!D.byId(dishId)) return false
    var isCloud = this.mode() === 'cloud'
    var me = isCloud ? this.myName() : ''
    var raw = this._rawMenu()
    var found = false
    for (var i = 0; i < raw.length; i++) {
      if (raw[i].dishId === dishId) {
        raw[i].qty = (raw[i].qty > 0 ? raw[i].qty : 1) + 1
        if (note) raw[i].note = String(note).slice(0, NOTE_MAX)
        if (me) raw[i].byNames = this._addName(raw[i].byNames, me)
        found = true
        break
      }
    }
    if (!found) {
      raw.push({
        dishId: dishId,
        qty: 1,
        note: note ? String(note).slice(0, NOTE_MAX) : '',
        byNames: me ? [me] : [],
        addedAt: Date.now()
      })
    }
    this._saveMenu(raw)
    this._syncBadge()
    return true
  },

  /** 加入菜单（已存在则份数 +1） */
  addToMenu: function (dishId, note) {
    if (!this._addLocal(dishId, note)) return false
    if (this.mode() === 'cloud') this._push('addDish', { dishId: dishId, note: note || '', qty: 1 })
    return true
  },

  /** 一次加入多道（摇一摇配菜用）。云端合并成一次请求，省 3 个来回。 */
  addManyToMenu: function (ids) {
    if (!(ids instanceof Array)) return 0
    var n = 0
    var added = []
    for (var i = 0; i < ids.length; i++) {
      if (this._addLocal(ids[i])) {
        n++
        added.push(ids[i])
      }
    }
    if (n && this.mode() === 'cloud' && this.family()) {
      this._push('addMany', { dishIds: added })
    }
    return n
  },

  /** 设置份数；qty <= 0 表示从菜单移除 */
  setQty: function (dishId, qty) {
    var isCloud = this.mode() === 'cloud'
    var me = isCloud ? this.myName() : ''
    var raw = this._rawMenu()
    var out = []
    var found = false
    for (var i = 0; i < raw.length; i++) {
      if (raw[i].dishId === dishId) {
        found = true
        if (qty > 0) {
          raw[i].qty = qty
          if (me) raw[i].byNames = this._addName(raw[i].byNames, me)
          out.push(raw[i])
        }
      } else {
        out.push(raw[i])
      }
    }
    if (!found && qty > 0 && D.byId(dishId)) {
      out.push({ dishId: dishId, qty: qty, note: '', byNames: me ? [me] : [], addedAt: Date.now() })
    }
    this._saveMenu(out)
    this._syncBadge()
    if (isCloud) this._push('setQty', { dishId: dishId, qty: qty })
    return true
  },

  /** 份数 +1 / -1，减到 0 自动移除 */
  stepQty: function (dishId, delta) {
    var cur = this.qtyOf(dishId)
    var next = cur + delta
    if (next < 0) next = 0
    this.setQty(dishId, next)
    return next
  },

  /** 改备注 */
  setNote: function (dishId, note) {
    var raw = this._rawMenu()
    for (var i = 0; i < raw.length; i++) {
      if (raw[i].dishId === dishId) {
        raw[i].note = note ? String(note).slice(0, NOTE_MAX) : ''
        this._saveMenu(raw)
        if (this.mode() === 'cloud') this._push('setNote', { dishId: dishId, note: note || '' })
        return true
      }
    }
    return false
  },

  /** 从菜单移除 */
  removeFromMenu: function (dishId) {
    return this.setQty(dishId, 0)
  },

  /** 清空今日菜单（家里谁都能清） */
  clearMenu: function () {
    this._saveMenu([])
    this._syncBadge()
    if (this.mode() === 'cloud') this._push('clearMenu', {})
    return true
  },

  /**
   * 菜单统计。
   * 注意：小程序的 WXML 里不能调用 ARRAY 方法，所以分类计数在这里算好。
   */
  menuStats: function () {
    var list = this.menu()
    var s = { kinds: list.length, total: 0, meat: 0, veg: 0, soup: 0, staple: 0, cold: 0 }
    for (var i = 0; i < list.length; i++) {
      s.total += list[i].qty
      if (s[list[i].cat] !== undefined) s[list[i].cat] += list[i].qty
    }
    return s
  },

  /** 菜单纯文本，用于转发/复制 */
  menuText: function () {
    var list = this.menu()
    if (!list.length) return '今天还没点菜～'
    var names = []
    for (var i = 0; i < list.length; i++) {
      var t = list[i].name
      if (list[i].qty > 1) t += ' x' + list[i].qty
      if (list[i].note) t += '（' + list[i].note + '）'
      if (list[i].hasBy) t += '〔' + list[i].byText + '〕'
      names.push(t)
    }
    var s = this.menuStats()
    return '今天吃啥 · ' + fmt.mdLabel(fmt.todayStr()) +
      '\n共 ' + s.total + ' 道：' + names.join('、') +
      '\n（荤 ' + s.meat + ' · 素 ' + s.veg + ' · 汤 ' + s.soup + ' · 主食 ' + s.staple + ' · 凉菜 ' + s.cold + '）'
  },

  /* ==================== 收藏 ==================== */

  favIds: function () {
    var l = storage.get(storage.KEY_FAV, [])
    return (l instanceof Array) ? l : []
  },

  isFav: function (dishId) {
    return this.favIds().indexOf(dishId) >= 0
  },

  /** 切换收藏，返回切换后的状态（true=已收藏） */
  toggleFav: function (dishId) {
    if (!D.byId(dishId)) return false
    var l = this.favIds()
    var i = l.indexOf(dishId)
    if (i >= 0) {
      l.splice(i, 1)
    } else {
      l.push(dishId)
    }
    storage.set(storage.KEY_FAV, l)
    return l.indexOf(dishId) >= 0
  },

  /** 收藏的菜品详情列表（顺手过滤掉已下架的脏 id） */
  favDishes: function () {
    var ids = this.favIds()
    var out = []
    for (var i = 0; i < ids.length; i++) {
      var d = D.byId(ids[i])
      if (d) out.push(d)
    }
    return out
  },

  /* ==================== 随机选菜 ==================== */

  /** 从某个分类里随机抽一道；cat 传 'all' 或空表示全菜库 */
  randomOne: function (cat) {
    var pool = D.byCat(cat)
    if (!pool.length) return null
    return pool[Math.floor(Math.random() * pool.length)]
  },

  /** 内部：排除已选后随机抽一道 */
  _pick: function (pool, used) {
    var left = []
    for (var i = 0; i < pool.length; i++) {
      if (used.indexOf(pool[i].id) < 0) left.push(pool[i])
    }
    if (!left.length) return null
    return left[Math.floor(Math.random() * left.length)]
  },

  /**
   * 配一套「三菜一汤」：1 荤 + 1 素 + 1 汤 + 1 任意（不与前面重复）
   * 返回菜品数组，可能不足 4 道（理论上不会，本菜库每类都够）
   */
  randomCombo: function () {
    var used = []
    var out = []
    var plan = [D.byCat('meat'), D.byCat('veg'), D.byCat('soup'), D.DISHES.slice()]
    for (var i = 0; i < plan.length; i++) {
      var d = this._pick(plan[i], used)
      if (d) {
        out.push(d)
        used.push(d.id)
      }
    }
    return out
  }
})
