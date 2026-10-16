# chishenme · 微信小程序工作区

两个自己写给自己家用的微信小程序，外加一份 Vibe Coding 的流程笔记。
都是原生小程序（没有用框架），一台手机、一个 AppID 就能跑起来。

| 目录 | 是什么 |
|---|---|
| `chishenme/` | **今天吃啥** — 家庭点菜。35 道家常菜、摇一摇配「三菜一汤」、家人共用一个房间实时同步 |
| `yimuzhang/` | **一目账** — 个人记账。明细 / 记一笔 / 统计 / 我的 四个 tab |
| `vibe-coding-SOP.html` | 五阶段流程与上线检查清单（写这两个项目时总结的） |
| `今天吃啥-*.md` `一目账-*.md` | 使用说明、部署清单、开发计划 |
| `.workbuddy/verify/` | 自动化检查脚本，见下面「怎么验证」 |

---

## 首次运行

代码 clone 下来**不能直接跑**，缺两个故意没上传的文件（一个是云环境配置，
一个是开发者工具的个人设置，详见 `.gitignore` 里的说明）。补上这两步就行：

```bash
# 1. 云开发配置（不填就是本地模式，功能一样用，只是家人之间不同步）
cp chishenme/config.example.js chishenme/config.js

# 2. 开发者工具里打开项目，自己填 AppID
#    详情 → 基本信息 → AppID → 改成你自己的
```

用微信开发者工具分别「导入项目」，选 `chishenme/` 和 `yimuzhang/` 两个目录。

想开家庭共享（`chishenme`）的话，多花十分钟：顶部「云开发」→ 创建环境 →
把环境 ID 填进 `chishenme/config.js` 的 `CLOUD_ENV` → 建两个集合
`csm_families`、`csm_menus`（权限选「所有用户可读，仅创建者可读写」）→
右键 `cloudfunctions/csmMenu`「上传并部署」。完整步骤见《今天吃啥-部署清单.md》。

---

## 怎么验证

改完代码跑这几个脚本，一共 **455 项**断言。不需要连云环境，
云函数那部分是用内存假数据库把真实的云函数代码跑一遍。

```bash
NODE=node
PY=python

# 一目账
$NODE .workbuddy/verify/core-test.js          # 114 项
$NODE .workbuddy/verify/wxml-check.js         #  32 项
$PY   .workbuddy/tools/check-icon-colors.py   #   8 项

# 今天吃啥（合计 455 项）
$NODE .workbuddy/verify/chishenme/core-test.js     # 200 项
$NODE .workbuddy/verify/chishenme/wxml-check.js    #  71 项
$NODE .workbuddy/verify/chishenme/cloud-test.js    # 164 项
$PY   .workbuddy/verify/chishenme/check-images.py  #  20 项
```

其中两个最值钱的：

- **`wxml-check.js`**（三方一致性）—— 小程序一个页面由 4 个文件组成，
  最容易出的错是「四件套对不上」：`bindtap` 写了但 JS 里没这个函数、
  模板里用了 `{{foo}}` 但 `data` 里没有、`class` 在 WXSS 里没定义。
  这些开发者工具都不报，只有点到那个按钮才发现。这个脚本静态全揪出来。
- **`cloud-test.js`**（云函数离线测试）—— 云函数里跑着这个项目唯一可信的那部分逻辑，
  却偏偏是最难验证的（要连真实云环境、要多个微信号）。这里用 `Module._load`
  拦截 `wx-server-sdk` 塞一个内存假库，跑的是**真实的云函数代码**。

---

## 几条踩过坑才立下的规矩

代码里都留着注释，这里列最值得说的三条：

1. **金额一律用整数「分」存**，只用 `yuan2fen`/`fen2yuan` 转换。
   JS 里 `0.1 + 0.2 = 0.30000000000000004`，用浮点数记账迟早对不上账。

2. **云函数跑在 UTC**。日期一律 `Date.now() + 8h` 再取 UTC 字段，
   否则北京时间晚上 8 点以后点的菜会存成「明天」。

3. **微信 `<input>` 自带 `height:1.4rem`**。给它写了 `box-sizing:border-box`
   就必须同时写死 `height`，不然上下 padding 会把内容区挤成负值 ——
   **输入的文字整行被裁掉，而且只有真机才看得见**，模拟器和浏览器复刻都正常。

---

## 说明

个人自用项目，代码按现状提供，没做过多打磨。
`chishenme-raw/` 是菜品图的原始大图（35 张 PNG），成品图已经处理成
320×320 的 JPEG 放在 `chishenme/images/dishes/`。
