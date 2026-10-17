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
var media = require('./utils/media.js')
var config = require('./config.js')
var D = require('./data/dishes.js')

var VERSION = 2
var NOTE_MAX = 20

/** 自建菜的字段上限（和云函数里的常量保持一致，两边都截一次） */
var DISH_NAME_MAX = 12
var DISH_MAIN_MAX = 20
var DISH_TIPS_MAX = 40

/** watch 建不起来时退化成轮询的间隔 */
var POLL_MS = 15000

/** 菜单 tab 在 tabBar 里的下标，用来打角标 */
var TAB_MENU = 2

/**
 * 图片临时链接放多久算「该换了」。
 * 云端换来的链接默认 1 天过期，这里提前到 6 小时 —— 留足余量，
 * 免得用户刚好在过期的边界上切回前台看到一片裂图。
 */
var TEMP_STALE_MS = 6 * 60 * 60 * 1000

App({

  globalData: {
    version: VERSION,
    family: null,       // 当前家庭缓存
    watcher: null,      // 实时推送句柄
    pollTimer: null,    // 轮询兜底
    listeners: [],      // 页面订阅菜单变化的回调
    pending: 0,         // 在途的写请求数
    dishesLoaded: false, // 自建菜是否已经从服务端拉过
    tempAt: 0           // 图片临时链接是什么时候换的（只存内存，绝不落 storage）
  },

  onLaunch: function () {
    // 首次运行落版本号，将来数据结构变了可以据此迁移
    if (!storage.get(storage.KEY_VERSION, 0)) {
      storage.set(storage.KEY_VERSION, VERSION)
    }
    // 本地模式下的自建菜先装上，首屏就能看到（云端模式由 refreshFamily 之后拉）
    if (this.mode() !== 'cloud') this.refreshDishes()
    // 云模式：先把「我在哪个家庭」拉回来，后面 watch 才有房间码可用
    if (this.mode() === 'cloud') {
      this.refreshFamily().catch(function () { /* 没网/没建集合都不该拦住启动 */ })
      // 本地缓存里先认一下，让首屏就有房间信息
      var cached = storage.get(storage.KEY_FAMILY, null)
      if (cached && cached.code) this.globalData.family = cached
    }
  },

  onShow: function () {
    this.startWatch()
    this._refreshStaleTemp()
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

  /**
   * 我是不是这个家的房主。
   * ★ 本地模式没有「家」的概念，本机上的菜谱本来就只有自己看 ——
   *   这时候把「房主」当成自己，改删内置菜就能用，不会出现
   *   「配了云开发才多出一半功能」的割裂。
   * ★ 这里只用来决定「按钮显不显示」。真正拦阻的判定在云函数里。
   */
  isOwner: function () {
    if (this.mode() !== 'cloud') return true
    var f = this.family()
    return !!(f && f.isOwner)
  },

  /** 写入家庭缓存并联动 watch / 菜单刷新 */
  setFamily: function (fam) {
    if (fam && fam.code) {
      this.globalData.family = fam
      storage.set(storage.KEY_FAMILY, fam)
      if (fam.myName) storage.set(storage.KEY_NICK, fam.myName)
      this.startWatch()
      // 自建菜要先装好再拉菜单：菜单里的 dishId 未知就会被当成脏数据丢掉
      this.refreshDishes()
      this.refreshMenu()
    } else {
      this.globalData.family = null
      storage.set(storage.KEY_FAMILY, null)
      this.stopWatch()
      // 退出家庭后不能还留着上一个房间的菜
      this._saveMenu([])
      this._syncBadge()
      this._notify()
      // 自建菜是「房间里」的东西，退出去就不该再看见（本地模式的除外）
      this.refreshDishes()
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

  /**
   * 解散整个家庭（只有房主能做）。
   * 服务端把家庭和菜单都删干净之后，本机也必须跟着清 ——
   * 否则这台手机还留着一个已经不存在的房间，下次点菜会一路撞 NO_FAMILY。
   */
  dissolveFamily: function () {
    var self = this
    return cloud.call('dissolveFamily').then(function () {
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
    // ★ 用「菜单日」而不是真实的今天：菜单每天 22:30 翻篇
    //   （见 utils/format.js 的 menuDayStr）。两边必须一致，否则 22:30 后
    //   家人写的记录会被这里当成「昨天的」直接丢掉。
    var today = fmt.menuDayStr()
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
    }).catch(function (e) {
      // 房主把房间解散了 —— 其他成员迟早会撞上 NO_FAMILY。
      // 这时必须把本机的家庭缓存一起清掉，否则这台手机还会一直显示一个
      // 已经不存在的房间：点菜一路报错，用户根本不知道发生了什么。
      if (e && e.message === 'NO_FAMILY') self.setFamily(null)
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

  /** 全部菜品（内置 + 自建，副本，防止页面误改静态数据） */
  allDishes: function () {
    return D.byCat('all')
  },

  /** 按分类取菜；cat 为 'all' 或空取全部 */
  dishesByCat: function (cat) {
    return D.byCat(cat)
  },

  /** 单道菜（内置或自建都能查到） */
  dishById: function (id) {
    return D.byId(id)
  },

  /** 菜库总数（内置 + 自建）。页面上写「本菜库共 X 道」一律用它，别用 D.TOTAL */
  totalDishes: function () {
    return D.totalAll()
  },

  /* ==================== 用户自建菜 ====================
   *
   * 内置 80 道写死在包里、出厂只读；用户自己加的菜是另一条路：
   *   cloud 模式 -> 云数据库 csm_dishes，全家人共享
   *   local 模式 -> 本机存储，只有这台手机看得见
   * 两条路都归一成同一个形状后交给 data/dishes.js 的叠加层，
   * 所以菜单页、点菜页、收藏页、摇一摇**一行都不用改**。
   *
   * ★ 房主对内置菜的改动走的是**同一个集合、同一个叠加层**：
   *   那边的记录长着内置菜的 id（hongshaorou 这种），这边的长着 u 开头的 id，
   *   靠一个 builtin 标记分开，见下面「房主对内置菜的改动」一段。
   */

  /** 自建菜清单（副本） */
  customDishes: function () {
    return D.customList()
  },

  /** 这道菜是不是用户自己加的 */
  isCustomDish: function (id) {
    return D.isCustom(id)
  },

  /**
   * 能不能编辑 / 删除这道菜。
   *   - 自己加的菜：能
   *   - 内置的 80 道：房主能（改名字 / 做法 / 分类，或者藏起来）
   *   - 别人加的菜：不能
   * ★ 这只是界面上的方便（决定要不要显示那两个按钮），真正的拦阻在云函数里 ——
   *   改一行 wxml 就能让按钮出现，但服务端照样会拒绝。
   */
  canEditDish: function (id) {
    var d = D.byId(id)
    if (!d) return false
    if (D.isCustom(id)) return d.mine !== false
    // 内置菜：只有房主能改。本地模式下 isOwner() 恒为真
    return D.isBuiltin(id) && this.isOwner()
  },

  /** 给新菜预留一个 id（传图时要用它命名云存储文件） */
  newDishId: function () {
    return D.newCustomId()
  },

  /** 本地模式下自建菜的原始列表（云模式下始终为空，别在这里判断模式） */
  _localDishes: function () {
    var l = storage.get(storage.KEY_DISHES, [])
    return (l instanceof Array) ? l : []
  },

  /**
   * 把任意来源的自建菜归一化后装进菜库。
   * 归一化放在这里而不是各处：谁调的都得过这一关，
   * 免得某个字段缺失就在页面上变成 undefined。
   */
  _applyDishes: function (raw) {
    var list = []
    var arr = (raw instanceof Array) ? raw : []
    var legal = {}
    for (var c = 0; c < D.CATS.length; c++) legal[D.CATS[c].key] = true
    for (var i = 0; i < arr.length; i++) {
      var r = arr[i]
      if (!r || !r.id || !r.name) continue
      list.push({
        id: r.id,
        name: r.name,
        cat: legal[r.cat] ? r.cat : 'meat',
        main: r.main || '',
        tips: r.tips || '',
        image: r.image || '',
        // 本地模式的记录里没有 mine 字段 —— 本机上的菜当然都是自己的
        mine: r.mine !== false,
        creatorName: r.creatorName || '',
        createdAt: r.createdAt || 0
      })
    }
    D.setCustom(list)
    this.globalData.dishesLoaded = true
    this._notify()
    // ★ 云端模式下必须重拉一次菜单：刚才那批菜单快照可能比自建菜先到，
    //   里面属于自建菜的条目会被当成「菜谱里没有的脏数据」丢掉。
    //   自建菜一到，就得让菜单按新菜库重算一遍。
    if (this.mode() === 'cloud' && this.family()) this.refreshMenu()
    return list.length
  },

  /** 重新拉一遍自建菜和房主的内置菜改动 */
  refreshDishes: function () {
    var self = this
    if (this.mode() === 'cloud') {
      if (!this.family()) {
        this._applyTempUrls(null)
        this._applyOverrides({})
        D.setCustom([])
        this._notify()
        return Promise.resolve(0)
      }
      return cloud.call('listDishes').then(function (data) {
        // ★ 临时链接先装。它只决定「图显示成什么」，跟可见性无关，早装晚装
        //   都不会让菜多一道少一道；装在 _applyDishes 之前是为了让紧接着那次
        //   setData 出去时，图上就已经是能用的链接，而不是先裂一下再补。
        self._applyTempUrls(data && data.temp)
        // ★ 覆盖层必须先装。它决定「哪些菜可见」，而 _applyDishes 末尾会
        //   重拉一次菜单（刚才那批菜单快照可能比菜库先到）；晚装一步的话，
        //   被房主藏起来的菜会在菜单里多显示一会儿，然后自己消失。
        self._applyOverrides((data && data.overrides) || {})
        return self._applyDishes((data && data.list) || [])
      }).catch(function (e) {
        // 集合还没建、网络抖动：**保留已经装好的那份**，别把菜清空。
        // 清空的话用户会以为自己的菜丢了，比一次拉取失败严重得多。
        if (e && e.message === 'NO_FAMILY') {
          self._applyTempUrls(null)
          self._applyOverrides({})
          D.setCustom([])
          self.setFamily(null)
        }
        return -1
      })
    }
    // 本地模式：自建菜和覆盖层都从本机读。图是本机路径 / 包内路径，没有临时链接可言
    this._applyTempUrls(null)
    this._applyOverrides(this._localOverrides())
    return Promise.resolve(this._applyDishes(this._localDishes()))
  },

  /**
   * 装入图片临时链接映射，并记下装入时间（用于判断过没过期）。
   *
   * ★ 只在内存里，**绝不写 storage** —— 链接默认 1 天过期，落库就变成死链，
   *   而且是那种「过一天才发作、还看不出是谁写进去的」的坏账。
   */
  _applyTempUrls: function (map) {
    this.globalData.tempAt = Date.now()
    return D.setTempUrls(map)
  },

  /**
   * 临时链接会过期，App 又可能在后头放很久。切回前台时如果已经放了很久，
   * 就重拉一次菜库把链接换成新的。
   *
   * ★ 只在「之前换过、而且确实过期了」时才拉：tempAt 为 0 表示还没换过，
   *   那条路启动时本来就会走一次 refreshDishes，这里再拉一遍纯属重复请求。
   */
  _refreshStaleTemp: function () {
    if (this.mode() !== 'cloud' || !this.family()) return
    var at = this.globalData.tempAt
    if (!at || Date.now() - at < TEMP_STALE_MS) return
    // 拉不到就算了，继续用旧链接；下次切回前台还会再试
    this.refreshDishes().catch(function () { /* 有意为空 */ })
  },

  /**
   * 把用户刚选的临时图片变成能长期保存的引用。
   *   云模式 -> 上传到云存储，拿到 cloud:// 文件 ID
   *   本地模式 -> 复制进本机用户目录，拿到重启后仍有效的路径
   */
  /**
   * 把选好的照片准备好，返回一个能直接存进菜记录的引用：
   *   云端模式 -> cloud:// 文件 ID
   *   本地模式 -> 本机长期路径
   *
   * ★ 传不上去时**返回空串，而不是 reject**。
   *   照片是锦上添花，菜名 / 分类 / 主料 / 小贴士才是用户真正填了半天的东西。
   *   因为网络抖动就让整个保存失败、让用户从头再填一遍，那才是真的
   *   「做到一半不能用」—— 项目铁律里明确不许出现这种情况。
   *   返回空串，调用方就能照常把菜存下来，只是这道菜暂时用默认占位图。
   *   （云函数和本地分支都有「没带新图就沿用旧图」的防呆，所以改菜时
   *     照片传失败不会把原来那张也弄丢。）
   */
  prepareDishImage: function (tempPath, dishId) {
    var id = dishId || D.newCustomId()
    if (!tempPath) return Promise.resolve('')
    if (this.mode() === 'cloud') {
      // 路径里带时间戳：同一道菜换图时不能覆盖旧文件
      // （旧文件还在的话，已经发出去的分享/缓存可能还指着它）
      var path = 'dishes/' + id + '-' + Date.now() + media.extOf(tempPath)
      return cloud.uploadFile(path, tempPath).then(function (fileID) {
        return fileID || ''
      }).catch(function (e) {
        // 留一行日志方便排查，但绝不把它抛出去
        console.warn('[加菜] 照片上传失败：' + cloud.friendly(e))
        return ''
      })
    }
    return Promise.resolve(media.persist(tempPath, id))
  },

  /**
   * 新增或修改一道菜。
   *   - id 是 u 开头的自建菜 id（或者压根没传 id）-> 走自建菜那条路
   *   - id 是内置菜的 id（hongshaorou 这种）-> 给房主记一条改动
   * payload: { id?, name, cat, main, tips, image }，image 必须是已经准备好
   * 的长期引用（先调 prepareDishImage）。
   * 返回 Promise<保存后的记录>。
   */
  saveDish: function (payload) {
    var p = payload || {}
    var name = String(p.name || '').trim()
    if (!name) return Promise.reject(new Error('给这道菜起个名字'))
    var id = p.id || D.newCustomId()
    var rec = {
      id: id,
      name: name.slice(0, DISH_NAME_MAX),
      cat: p.cat || 'meat',
      main: String(p.main || '').trim().slice(0, DISH_MAIN_MAX),
      tips: String(p.tips || '').trim().slice(0, DISH_TIPS_MAX),
      image: p.image || ''
    }
    var self = this
    // ★ 内置菜是「改一道本来就有的菜」，不是新加一道。
    //   createDish / updateDish 都只认自建菜（云函数会把不合格的 id 就地重造成
    //   u 开头的新 id），拿内置 id 去调这两个会一路走到「这道菜已经不在了」——
    //   看起来像「改不了」，其实是走错了接口。
    var isBuiltin = D.isBuiltin(id)

    if (this.mode() === 'cloud') {
      // ★ 三个 action 名都必须**字面量写出来**，不能拼：
      //   wxml-check.js 的 G5 靠正则扫 app.js，确认「前端调的每个 action
      //   云函数里都真的存在」。写成 cloud.call(isBuiltin ? 'a' : 'b') 就扫不到了，
      //   将来云函数改名 / 漏改时那条检查会静默失效。
      var req
      if (isBuiltin) req = cloud.call('updateBuiltin', rec)
      else if (p.id) req = cloud.call('updateDish', rec)
      else req = cloud.call('createDish', rec)
      return req.then(function () {
        return self.refreshDishes()
      }).then(function () {
        return rec
      })
    }

    // 本地模式下的内置菜改动：另存一份记录，不和自建菜混在一起
    if (isBuiltin) return this._saveLocalBuiltin(id, rec)

    // 本地模式：整表读出来改完写回去（数据量很小，不值得做增量）
    var list = this._localDishes()
    var out = []
    var prev = null
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) { prev = list[i]; break }
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j] && list[j].id !== id) out.push(list[j])
    }
    out.push({
      id: id, name: rec.name, cat: rec.cat, main: rec.main, tips: rec.tips,
      // ★ 没带新图时沿用旧的那张。云函数里有同样的防呆，本地这条分支也得有 ——
      //   否则改一次菜名，照片就变回占位图了。（core-test 抓到过一次）
      image: rec.image || (prev ? (prev.image || '') : ''),
      mine: true,
      creatorName: this.myName() || '',
      createdAt: prev ? (prev.createdAt || Date.now()) : Date.now()
    })
    if (!storage.set(storage.KEY_DISHES, out)) {
      return Promise.reject(new Error('本机存储写不进去了，先清一点空间'))
    }
    this._applyDishes(out)
    return Promise.resolve(rec)
  },

  /**
   * 把一道菜从菜库里去掉。
   *   - 自己加的菜：真的从库里删掉（连带云存储里的图和今天菜单里的条目）
   *   - 内置的 80 道：**删不掉** —— 数据和图都打在小程序包里，没法只删一台
   *     手机上的那一份。所以走 hideBuiltin，改成对全家隐藏，房主随时能恢复。
   */
  deleteDish: function (id) {
    if (!this.canEditDish(id)) return Promise.reject(new Error('这道菜删不了'))
    if (D.isBuiltin(id)) return this.hideBuiltin(id)
    var self = this

    if (this.mode() === 'cloud') {
      return cloud.call('deleteDish', { id: id }).then(function () {
        return self.refreshDishes()
      }).then(function () {
        self.dropDishFromMenu(id)
        return true
      })
    }

    var list = this._localDishes()
    var out = []
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id !== id) out.push(list[i])
    }
    storage.set(storage.KEY_DISHES, out)
    this._applyDishes(out)
    this.dropDishFromMenu(id)
    return Promise.resolve(true)
  },

  /**
   * 菜被删掉之后，今天的菜单里也不能再留着它。
   * 云模式下服务端已经跟着清了，这里主要管本地那份镜像与本机模式。
   */
  dropDishFromMenu: function (id) {
    var raw = this._rawMenu()
    var out = []
    var changed = false
    for (var i = 0; i < raw.length; i++) {
      if (raw[i].dishId === id) { changed = true; continue }
      out.push(raw[i])
    }
    if (!changed) return false
    this._saveMenu(out)
    this._syncBadge()
    this._notify()
    if (this.mode() === 'cloud') this._push('setQty', { dishId: id, qty: 0 })
    return true
  },

  /* ==================== 房主对内置菜的改动 ====================
   *
   * 内置的 80 道菜写死在 data/dishes.js 里，图片也打在小程序包里，
   * 物理上删不掉 —— 所以这里能做的只有两件事：
   *   改：记一条覆盖（名字 / 主料 / 要点 / 分类 / 换图），叠在原菜上显示
   *   删：记一条「藏起来」，对全家人都不出现，房主随时能恢复
   *
   * 覆盖记录和自建菜存在**同一个集合** csm_dishes 里，靠 builtin 标记分开：
   * 自建菜的 dishId 一定以 u 开头，内置菜的 dishId 就是它自己的英文 id
   * （hongshaorou 这种）。两种记录都经 data/dishes.js 的叠加层生效，
   * 所以菜单页、点菜页、收藏页、摇一摇依然一行都不用改。
   */

  /** 本地模式下房主对内置菜的改动（云模式下始终为空，别在这里判断模式） */
  _localOverrides: function () {
    var m = storage.get(storage.KEY_BUILTIN, null)
    if (!m || typeof m !== 'object' || (m instanceof Array)) return {}
    return m
  },

  /** 把覆盖层归一化后装进菜库 */
  _applyOverrides: function (raw) {
    return D.setOverrides(raw)
  },

  /** 本地模式：把房主对一道内置菜的改动记在本机 */
  _saveLocalBuiltin: function (id, rec) {
    var m = this._localOverrides()
    var prev = m[id] || {}
    m[id] = {
      name: rec.name,
      cat: rec.cat,
      main: rec.main,
      tips: rec.tips,
      // ★ 没带新图时保留旧的那张。空串表示「没换过图，还用包里那张原图」——
      //   无脑覆盖的话，改一次菜名就把房主之前换的图弄丢了。
      image: rec.image || prev.image || '',
      // 改一道已经藏起来的菜，不该顺手把它放出来
      hidden: prev.hidden === true
    }
    if (!storage.set(storage.KEY_BUILTIN, m)) {
      return Promise.reject(new Error('本机存储写不进去了，先清一点空间'))
    }
    this._applyOverrides(m)
    this._notify()
    return Promise.resolve(rec)
  },

  /** 被房主藏起来的内置菜（「恢复内置菜」那个入口用） */
  hiddenBuiltin: function () {
    return D.hiddenBuiltin('all')
  },

  /** 被房主藏起来的内置菜有几道 */
  hiddenBuiltinCount: function () {
    return D.hiddenCount()
  },

  /** 这道内置菜被房主改过吗（藏起来的不算） */
  isEditedBuiltin: function (id) {
    return D.isEdited(id)
  },

  /**
   * 把一道内置菜从菜库里藏起来（房主专属，对全家生效）。
   * 云模式下服务端会顺手把今天菜单里的那道菜也摘掉。
   */
  hideBuiltin: function (id) {
    var self = this
    if (this.mode() === 'cloud') {
      return cloud.call('hideBuiltin', { id: id }).then(function () {
        return self.refreshDishes()
      }).then(function () {
        self.dropDishFromMenu(id)
        return true
      })
    }
    var m = this._localOverrides()
    var prev = m[id] || {}
    // ★ 只把 hidden 打开，房主之前改过的名字 / 换过的图都留着 ——
    //   万一恢复回来，看到的还是他改过的那个样子，而不是又变回出厂设置。
    m[id] = {
      name: prev.name || '',
      cat: prev.cat || '',
      main: (prev.main === undefined) ? null : prev.main,
      tips: (prev.tips === undefined) ? null : prev.tips,
      image: prev.image || '',
      hidden: true
    }
    if (!storage.set(storage.KEY_BUILTIN, m)) {
      return Promise.reject(new Error('本机存储写不进去了，先清一点空间'))
    }
    this._applyOverrides(m)
    this.dropDishFromMenu(id)
    this._notify()
    return Promise.resolve(true)
  },

  /**
   * 把一道被藏起来的内置菜恢复成原样（房主专属）。
   *
   * ★ 恢复之后它会重新出现在菜库里，但**不会**自动回到今天的菜单 ——
   *   藏起来的时候已经顺手把菜单条目摘掉了。要吃就再点一次，
   *   这样不会让一道菜凭空出现在菜单里。
   */
  restoreBuiltin: function (id) {
    if (!this.isOwner()) return Promise.reject(new Error('NOT_OWNER'))
    var self = this
    if (this.mode() === 'cloud') {
      return cloud.call('restoreBuiltin', { id: id }).then(function () {
        return self.refreshDishes()
      }).then(function () {
        return true
      })
    }
    var m = this._localOverrides()
    delete m[id]
    storage.set(storage.KEY_BUILTIN, m)
    this._applyOverrides(m)
    this._notify()
    return Promise.resolve(true)
  },

  /* ==================== 今日菜单 ==================== */

  /**
   * 读原始菜单。菜单日一过就自动作废 —— 上一份菜单不该留在这一份里。
   * 这里不写存储（只是读），真正清空发生在下次写入时。
   *
   * ★ 判的是 fmt.menuDayStr()（每天 22:30 翻篇），不是 todayStr()。
   */
  _rawMenu: function () {
    if (storage.get(storage.KEY_MENU_DATE, '') !== fmt.menuDayStr()) return []
    var list = storage.get(storage.KEY_MENU, [])
    return (list instanceof Array) ? list : []
  },

  /** 保存并打上「菜单日」的日期戳 */
  _saveMenu: function (list) {
    storage.set(storage.KEY_MENU_DATE, fmt.menuDayStr())
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
    return '今天吃啥 · ' + fmt.mdLabel(fmt.menuDayStr()) +
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
    // ★ 前三项走 byCat（已含自建菜），第四项「随便再来一道」也必须走 byCat，
    //   不能像以前那样直接拿 D.DISHES —— 那是**出厂**的 80 道，房主藏起来的菜
    //   还在里面，摇一摇会摇出一道根本不存在的菜（加不进去，只是白摇一次）。
    var plan = [D.byCat('meat'), D.byCat('veg'), D.byCat('soup'), D.byCat('all')]
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
