/* 「菜图不显示」的排查脚本 —— 一次把该问的全问完。
 *
 * 起因：菜单页报了
 *   [渲染层网络层错误] Failed to load image
 *   http://127.0.0.1:11571/__pageframe__/pages/menu/cloud://.../dishes/xxx.jpg
 *   net::OK
 * 注意 URL 形状：`__pageframe__/pages/menu/` 前缀说明渲染层把 cloud:// 当成了
 * **相对路径**。但**别就此收工** —— 社区里同形的记录是「工具不肯解析」，
 * 我们那次真正的病根是云存储权限。必须先证明文件到底取不取得到。
 *
 * 关键设计：**把每张云图都问一遍，并标出哪些是自己建的**。
 * 一张一张地问「能读吗」说明不了什么；「自己建的能读、别人建的读不到」
 * 才直接指向云存储权限。
 *
 * 六步：
 *   ① 菜单里现在的图长什么样（修好之后应该是 https:// 临时链接）
 *   ② 用 listDishes 列出每道菜的云图 + mine（是不是我建的）
 *   ③ 一次问所有云图，逐个报 status
 *   ④ 拿一个**故意编的、不存在的**路径对照：
 *        两条错误不一样（EXCEED_AUTHORITY vs FILE_NONEXIST）→ 先查权限后查存在
 *        → 图确实在云上，问题纯在权限
 *   ⑤ 我自己传一张小图再读回来（对照组「能读」的样本），读完删掉不留垃圾
 *   ⑥ 我是谁（房主吗）
 *
 * ★ 本脚本要提交进公开仓库，所以**绝不写死环境 ID / openid / fileID** ——
 *   全部在运行时从数据库里现找。
 *
 * 先决条件：cli.bat auto --project <chishenme> --auto-port 9420 跑着。 */
const automator = require('miniprogram-automator')

const EP = 'ws://127.0.0.1:9420'

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function main () {
  const mp = await automator.connect({ wsEndpoint: EP })
  console.log('[OK] 已连接模拟器')

  let ready = false
  for (let i = 0; i < 6 && !ready; i++) {
    await sleep(i === 0 ? 6000 : 2000)
    try { await mp.switchTab('/pages/menu/menu'); ready = true } catch (e) { console.log('  页面还没就绪，重试 ' + (i + 1) + '/6') }
  }
  if (!ready) throw new Error('页面一直没就绪')

  const raw = await mp.evaluate(function () {
    var res = {}
    var a = getApp()

    function ghostOf (fileID) {
      var cut = fileID.lastIndexOf('/')
      return fileID.slice(0, cut + 1) + '__no_such_file__.jpg'
    }
    function ask (list) {
      if (!list.length) return Promise.resolve([])
      return wx.cloud.getTempFileURL({ fileList: list }).then(function (t) {
        return (t.fileList || []).map(function (x) {
          return { tail: String(x.fileID).split('/').pop(), status: x.status, errMsg: x.errMsg, hasUrl: !!x.tempFileURL }
        })
      }, function (e) { return [{ thrown: (e && e.errMsg) || String(e) }] })
    }

    /* ① 菜单里现在的图 */
    res.menu = a.menu().map(function (m) { return { name: m.name, image: m.image } })

    /* ② 拿每道菜的云图 + mine
       ★ 走 app 自己的方法，**不要在这里直接调 wx.cloud.callFunction** ——
          automator 会报 `getOwnPropertyDescriptor ... nv_constructor` 这种看不懂的错，
          而且必炸（直连云函数的返回值过不了它那层代理）。
          客户端本来也不该直连，云函数里的东西 app 都已经装好了。 */
    var customs = a.customDishes ? a.customDishes() : []
    var cloud = []
    for (var i = 0; i < customs.length; i++) {
      var im = customs[i].image
      if (typeof im === 'string' && im.indexOf('cloud://') === 0) {
        cloud.push({ id: customs[i].id, name: customs[i].name, image: im, mine: customs[i].mine !== false })
      }
    }
    res.cloud = cloud
    res.dishTotal = customs.length

    var notMine = null
    for (var j = 0; j < cloud.length; j++) if (!cloud[j].mine) { notMine = cloud[j]; break }

    return Promise.resolve().then(function () {
      if (!cloud.length) return null
      /* ③ 一次问所有云图 */
      return ask(cloud.map(function (x) { return x.image })).then(function (r) {
        res.statuses = r.map(function (x, k) {
          x.name = cloud[k].name
          x.mine = cloud[k].mine
          return x
        })
        /* ④ 挑一张**不是自己建的**来做幽灵对照；没有就用第一张 */
        var pick = notMine || cloud[0]
        res.pick = { name: pick.name, mine: pick.mine }
        return ask([ghostOf(pick.image)]).then(function (g) {
          res.ghost = g[0]
          /* 顺手单独再问一次那张「不是我的」——批量结果混着容易看漏 */
          if (!notMine) return null
          return ask([notMine.image]).then(function (single) { res.notMineSingle = single[0] })
        })
      })
    }).then(function () {
      /* ⑤ 自己传一张 1×1 的小图再读回来 */
      var b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      var p = wx.env.USER_DATA_PATH + '/perm-probe.png'
      try { wx.getFileSystemManager().writeFileSync(p, b64, 'base64') } catch (e) { res.writeErr = String(e) }
      return wx.cloud.uploadFile({ cloudPath: 'probe/perm-' + Date.now() + '.png', filePath: p })
        .then(function (u) {
          return ask([u.fileID]).then(function (r) {
            res.selfRead = r[0]
            return wx.cloud.deleteFile({ fileList: [u.fileID] }).then(function (d) {
              res.probeDeleted = (d.fileList || []).map(function (x) { return x.status })
            }, function () {})
          })
        }, function (e) { res.uploadErr = (e && e.errMsg) || String(e) })
    }).then(function () {
      /* ⑥ 我是谁 */
      return wx.cloud.database().collection('csm_families').limit(1).get().then(function (r) {
        var f = (r.data || [])[0] || {}
        var fam = a.family()
        res.family = { code: f.code, owner: f.owner, isOwner: fam && fam.isOwner }
      }, function (e) { res.familyErr = (e && e.errMsg) || String(e) })
    })
    // ★ 回**字符串**而不是对象。automator 序列化小程序侧的返回值时会碰到
    //   数据层自己的 proxy，报 `getOwnPropertyDescriptor ... nv_constructor`
    //   这种看不懂的错，而且每次必炸。转成 JSON 字符串就完全绕开了。
    .then(function () { return JSON.stringify(res) })
  })

  const out = JSON.parse(raw)
  const line = s => console.log('  ' + s)

  console.log('\n=== ① 菜单里现在的图 ===')
  out.menu.forEach(m => line(m.name + '  →  ' + (m.image || '(空)')))
  const stillCloud = out.menu.filter(m => String(m.image).indexOf('cloud://') === 0)
  const nHttps = out.menu.filter(m => String(m.image).indexOf('https://') === 0).length
  line('还是 cloud:// 的有 ' + stillCloud.length + ' 张；已经换成 https:// 的有 ' + nHttps + ' 张')

  console.log('\n=== ②③ 每张云图单独问一遍 ===')
  if (out.listErr) line('listDishes 失败：' + out.listErr)
  line('菜库共 ' + out.dishTotal + ' 道，其中挂着云图的有 ' + (out.cloud || []).length + ' 道')
  ;(out.statuses || []).forEach(x => {
    line((x.mine ? '[我建的]  ' : '[家人建的]') + ' ' + x.name + '  →  ' +
      (x.status === 0 ? '能读 ✓' : '读不到 ✗  ' + x.errMsg))
  })
  if (out.notMineSingle) {
    line('单问那张「家人建的」：' + JSON.stringify(out.notMineSingle))
  }

  console.log('\n=== ④ 幽灵路径对照（' + (out.pick ? out.pick.name : '—') + '）===')
  line(JSON.stringify(out.ghost))

  console.log('\n=== ⑤ 自己传一张再读回来（对照）===')
  line('selfRead : ' + JSON.stringify(out.selfRead || out.uploadErr))
  line('deleted  : ' + JSON.stringify(out.probeDeleted))

  console.log('\n=== ⑥ 身份 ===')
  line(JSON.stringify(out.family))

  /* ---------- 判读 ---------- */
  console.log('\n=== 判读 ===')
  const st = out.statuses || []
  const mine = st.filter(x => x.mine)
  const other = st.filter(x => !x.mine)
  const mineOk = mine.length > 0 && mine.every(x => x.status === 0)
  const otherBad = other.length > 0 && other.every(x => x.status !== 0)

  if (mineOk && otherBad) {
    line('★ 自己建的都能读、家人建的都读不到')
    line('  → 云存储权限是「仅创建者及管理员可读写」')
    line('  → 而且免费版环境**改不了这个开关**（控制台会拦，提示升级付费版）')
    line('  → 正确做法：由云函数换临时链接，见 README「照片是怎么送到手机上的」')
  } else if (other.length === 0 && mineOk) {
    line('这次没有「家人建的」图可比，判不出权限；换个家人的账号再跑一次')
  } else if (st.length && st.every(x => x.status === 0)) {
    line('所有云图都读得到 → 权限没问题。要是界面还显示不出来，')
    line('那多半是开发者工具自己的渲染问题：**先确认真机是否正常，再决定改不改代码**')
  } else {
    line('结果不典型，逐条看上面对应的 errMsg：')
    st.filter(x => x.status !== 0).forEach(x => line('  ' + x.name + ' → ' + x.errMsg))
  }

  await mp.disconnect()
}

main().catch(function (e) {
  console.error('[失败] ' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
