/**
 * 菜库静态数据：80 道家常菜（35 道初版 + 45 道两广特色菜 / 日常菜扩充）
 * 图片约定：/images/dishes/<id>.jpg（300x300）
 * 分类 key：meat 荤菜 / veg 素菜 / soup 汤羹 / staple 主食 / cold 凉菜
 *
 * 说明：菜品数据不入本地存储，页面每次直接从本文件读，省存储空间，
 *       将来要加菜只改这个文件。
 *
 * ★ 图片尺寸的由来：小程序主包上限 2MB，菜图是唯一的大头。
 *   80 张 300x300 JPEG(q75) 约 1.3MB，主包落在 1.4MB 上下；
 *   若用 320x320 q82（原规格）会到 1.9MB，贴死上限没有余量。
 */

var CATS = [
  { key: 'all', name: '全部' },
  { key: 'meat', name: '荤菜' },
  { key: 'veg', name: '素菜' },
  { key: 'soup', name: '汤羹' },
  { key: 'staple', name: '主食' },
  { key: 'cold', name: '凉菜' }
]

var DISHES = [
  /* ---------------- 荤菜 12 ---------------- */
  { id: 'hongshaorou', name: '红烧肉', cat: 'meat', main: '五花肉', tips: '冰糖炒出糖色，小火焖 40 分钟至软糯' },
  { id: 'tangcupaigu', name: '糖醋排骨', cat: 'meat', main: '猪肋排', tips: '排骨先焯后炸，糖醋汁按 1:2:3 收浓' },
  { id: 'gongbaojiding', name: '宫保鸡丁', cat: 'meat', main: '鸡腿肉、花生米', tips: '鸡丁抓淀粉滑油，临出锅再放花生米' },
  { id: 'kelejichi', name: '可乐鸡翅', cat: 'meat', main: '鸡中翅', tips: '两面煎黄后倒可乐没过，大火收汁' },
  { id: 'fanqiechaodan', name: '番茄炒蛋', cat: 'meat', main: '番茄、鸡蛋', tips: '蛋先炒散盛出，番茄出汁后再回锅' },
  { id: 'yuxiangrousi', name: '鱼香肉丝', cat: 'meat', main: '猪里脊、木耳、胡萝卜', tips: '泡椒剁碎打底，糖醋比例决定成败' },
  { id: 'huiguorou', name: '回锅肉', cat: 'meat', main: '五花肉、蒜苗', tips: '肉先煮后切薄片，煸到微卷再下豆瓣' },
  { id: 'qingzhengluyu', name: '清蒸鲈鱼', cat: 'meat', main: '鲈鱼', tips: '水开上锅蒸 8 分钟，出锅淋一勺热油' },
  { id: 'tudouniunan', name: '土豆炖牛腩', cat: 'meat', main: '牛腩、土豆', tips: '牛腩先焯水，小火炖 1 小时后再放土豆' },
  { id: 'jiaoyanpaigu', name: '椒盐排骨', cat: 'meat', main: '猪肋排', tips: '复炸一次更酥，出锅趁热撒椒盐' },
  { id: 'xiangguhuaji', name: '香菇滑鸡', cat: 'meat', main: '鸡腿肉、香菇', tips: '鸡块用生抽淀粉抓匀，泡香菇的水别倒' },
  { id: 'suanrongfensixia', name: '蒜蓉粉丝蒸虾', cat: 'meat', main: '基围虾、粉丝', tips: '虾开背去虾线，粉丝垫底吸汁' },

  /* ---------------- 素菜 9 ---------------- */
  { id: 'jiachangdoufu', name: '家常豆腐', cat: 'veg', main: '北豆腐、青红椒', tips: '豆腐先煎到两面金黄再烧，不容易碎' },
  { id: 'ganbiansijidou', name: '干煸四季豆', cat: 'veg', main: '四季豆、肉末', tips: '四季豆要煸到表皮起皱，务必熟透' },
  { id: 'suanrongxilanhua', name: '蒜蓉西兰花', cat: 'veg', main: '西兰花', tips: '焯水时加盐和几滴油，颜色才翠绿' },
  { id: 'shousibaocai', name: '手撕包菜', cat: 'veg', main: '圆白菜', tips: '手撕不用刀切，全程大火才有镬气' },
  { id: 'disanxian', name: '地三鲜', cat: 'veg', main: '茄子、土豆、青椒', tips: '三样分别过油，最后合炒勾薄芡' },
  { id: 'culiubaicai', name: '醋溜白菜', cat: 'veg', main: '白菜', tips: '醋分两次放：炝锅一次，出锅前再一次' },
  { id: 'xianggujingcai', name: '香菇青菜', cat: 'veg', main: '上海青、香菇', tips: '青菜焯水后立刻过凉，保持翠绿' },
  { id: 'hupiqingjiao', name: '虎皮青椒', cat: 'veg', main: '青椒', tips: '干锅把青椒压出虎皮，再下调料' },
  { id: 'qingchaotudousi', name: '清炒土豆丝', cat: 'veg', main: '土豆', tips: '切好泡水去淀粉，大火快炒才脆' },

  /* ---------------- 汤羹 5 ---------------- */
  { id: 'fanqiedantang', name: '番茄蛋汤', cat: 'soup', main: '番茄、鸡蛋', tips: '蛋液沿锅边细细淋入，蛋花才漂亮' },
  { id: 'dongguapaigutang', name: '冬瓜排骨汤', cat: 'soup', main: '排骨、冬瓜', tips: '排骨先焯水去浮沫，冬瓜后放' },
  { id: 'zicaidanhuatang', name: '紫菜蛋花汤', cat: 'soup', main: '紫菜、鸡蛋', tips: '水开后先关火再淋蛋液，蛋花更嫩' },
  { id: 'yumipaigutang', name: '玉米胡萝卜排骨汤', cat: 'soup', main: '排骨、玉米、胡萝卜', tips: '小火慢炖 1 小时，汤色清甜不油腻' },
  { id: 'suanlatang', name: '酸辣汤', cat: 'soup', main: '豆腐、木耳、鸡蛋', tips: '白胡椒粉和醋是灵魂，出锅前勾芡' },

  /* ---------------- 主食 5 ---------------- */
  { id: 'danchaofan', name: '蛋炒饭', cat: 'staple', main: '米饭、鸡蛋', tips: '用隔夜饭，粒粒分明不粘连' },
  { id: 'xihongshimian', name: '西红柿鸡蛋面', cat: 'staple', main: '面条、番茄、鸡蛋', tips: '番茄先炒出沙，汤才够浓' },
  { id: 'congyoubanmian', name: '葱油拌面', cat: 'staple', main: '面条、小葱', tips: '小葱冷油下锅慢炸到焦香，别炸糊' },
  { id: 'shouzhuabing', name: '手抓饼', cat: 'staple', main: '面饼、鸡蛋', tips: '饼皮煎到起层，磕个蛋翻面' },
  { id: 'jiaozi', name: '白菜猪肉饺子', cat: 'staple', main: '饺子皮、猪肉、白菜', tips: '白菜剁碎先杀水挤干，馅才不出汤' },

  /* ---------------- 凉菜 4 ---------------- */
  { id: 'liangbanhuanggua', name: '凉拌黄瓜', cat: 'cold', main: '黄瓜', tips: '拍碎比切片更入味，蒜末要多' },
  { id: 'liangbanmuer', name: '凉拌木耳', cat: 'cold', main: '黑木耳', tips: '木耳焯水后过冰水，口感更脆' },
  { id: 'pidandoufu', name: '皮蛋豆腐', cat: 'cold', main: '内酯豆腐、皮蛋', tips: '豆腐别搅，摆好盘直接淋汁' },
  { id: 'koushuiji', name: '口水鸡', cat: 'cold', main: '鸡腿肉', tips: '鸡肉煮熟后过冰水，鸡皮才弹' },

  /* ================= 2026-10 扩充：两广特色菜 + 日常菜 =================
   * 桂菜一份参考广西壮族自治区商务厅《2024 年桂菜名菜名小吃评议结果》
   * （十大名菜 + 十大名小吃）里挑出家里做得了的；
   * 广东菜按广府 / 客家 / 潮汕三条支线的公开菜谱整理。
   * 点心类（虾饺、糯米饭、龟苓膏、酸嘢）折进原有的主食 / 凉菜，不再新开分类。
   */

  /* ---------------- 桂菜 15 ---------------- */
  { id: 'gaofengningmengya', name: '高峰柠檬鸭', cat: 'meat', main: '鸭肉、酸柠檬、酸荞头', tips: '鸭肉先炒干水汽，酸柠檬后放才不涩' },
  { id: 'yangshuopijiuyu', name: '阳朔啤酒鱼', cat: 'meat', main: '漓江鱼、啤酒、番茄', tips: '鱼连鳞煎透，再用啤酒代水焖，鳞酥汤浓' },
  { id: 'lipuyukourou', name: '荔浦芋扣肉', cat: 'meat', main: '五花肉、荔浦芋头', tips: '芋头先炸至微黄，与肉同蒸吸油不散' },
  { id: 'quanzhoucuxueya', name: '全州醋血鸭', cat: 'meat', main: '麻鸭、鸭血、酸醋', tips: '鸭血兑醋水最后淋入，边倒边快速翻炒' },
  { id: 'wuzhouzhibaoji', name: '梧州纸包鸡', cat: 'meat', main: '三黄鸡、玉扣纸', tips: '鸡肉腌足两小时，纸包紧再炸才锁得住香' },
  { id: 'suansunchaoniurou', name: '酸笋炒牛肉', cat: 'meat', main: '牛里脊、酸笋', tips: '酸笋先干锅煸去酸水，牛肉逆纹切才嫩' },
  { id: 'liuzhouluosifen', name: '柳州螺蛳粉', cat: 'staple', main: '米粉、螺蛳汤、酸笋', tips: '螺蛳汤加紫苏和山奈熬足两小时' },
  { id: 'guilinmifen', name: '桂林米粉', cat: 'staple', main: '米粉、卤水、锅烧', tips: '卤水靠锅烧肉和卤菜两次吊味，越陈越香' },
  { id: 'nanninglaoyoufen', name: '南宁老友粉', cat: 'staple', main: '扁粉、酸笋、豆豉', tips: '酸笋豆豉蒜末先爆香，全程大火快炒' },
  { id: 'luosiyajiaobao', name: '螺蛳鸭脚煲', cat: 'soup', main: '鸭脚、田螺、酸笋', tips: '鸭脚先炸后煲，皮起皱才吸得住汤' },
  { id: 'gongchengyoucha', name: '恭城油茶', cat: 'soup', main: '老茶叶、生姜、炒米', tips: '茶叶生姜捶打出汁再煮，喝时配炒米花生' },
  { id: 'shaxiezhidoujiao', name: '沙蟹汁豆角', cat: 'veg', main: '豆角、沙蟹汁、蒜', tips: '豆角干煸起皱再下沙蟹汁，咸鲜带腥香' },
  { id: 'guangxisuanye', name: '广西酸嘢', cat: 'cold', main: '时令果蔬、米醋、辣椒', tips: '果蔬先盐杀水，醋水冰镇两小时更脆' },
  { id: 'wusenuomifan', name: '五色糯米饭', cat: 'staple', main: '糯米、红蓝草、枫叶', tips: '五种植物汁液分别染米，浸泡过夜再蒸' },
  { id: 'wuzhouguilinggao', name: '梧州龟苓膏', cat: 'cold', main: '龟板、土茯苓、甘草', tips: '熬好放凉自然凝结，苦味靠蜂蜜调和' },

  /* ---------------- 粤菜 · 广府 13 ---------------- */
  { id: 'baiqieji', name: '白切鸡', cat: 'meat', main: '清远鸡、姜葱', tips: '浸鸡要三提三放，关火焖熟皮才爽' },
  { id: 'mizhichashao', name: '蜜汁叉烧', cat: 'meat', main: '梅花肉、叉烧酱、蜂蜜', tips: '烤到八成刷蜜再回炉，焦糖层才亮' },
  { id: 'chizhizhengpaigu', name: '豉汁蒸排骨', cat: 'meat', main: '肋排、豆豉、蒜', tips: '排骨泡去血水，拌生粉锁汁再蒸' },
  { id: 'boluogulaorou', name: '菠萝咕咾肉', cat: 'meat', main: '梅花肉、菠萝、青红椒', tips: '肉复炸一次更酥，糖醋汁最后才裹' },
  { id: 'baizhuoxia', name: '白灼虾', cat: 'meat', main: '基围虾、姜葱、豉油', tips: '水里加姜葱料酒，虾一变红就捞出过冰水' },
  { id: 'luoboniunanbao', name: '萝卜牛腩煲', cat: 'meat', main: '牛腩、白萝卜、柱侯酱', tips: '牛腩炖软后再下萝卜，萝卜才不烂' },
  { id: 'haoyoushengcai', name: '蚝油生菜', cat: 'veg', main: '生菜、蚝油', tips: '生菜焯水加盐和油，沥干再生淋蚝油' },
  { id: 'shangtangwawacai', name: '上汤娃娃菜', cat: 'veg', main: '娃娃菜、皮蛋、火腿', tips: '用皮蛋咸蛋吊汤底，比味精鲜得自然' },
  { id: 'suanrongchaoxin', name: '蒜蓉炒菜心', cat: 'veg', main: '菜心、蒜蓉', tips: '菜心先焯后炒，梗和叶分开下锅' },
  { id: 'ganchaoniuhe', name: '干炒牛河', cat: 'staple', main: '河粉、牛肉、豆芽', tips: '河粉手撕散开，全程猛火不翻搅才不断' },
  { id: 'laweibaozifan', name: '腊味煲仔饭', cat: 'staple', main: '丝苗米、腊肠、腊肉', tips: '转小火后沿锅边淋油，锅巴才脆' },
  { id: 'yuntunmian', name: '云吞面', cat: 'staple', main: '竹升面、鲜虾、大地鱼', tips: '面煮好先过冷河，汤用大地鱼干吊' },
  { id: 'bawanghuapaigutang', name: '霸王花猪骨汤', cat: 'soup', main: '猪骨、霸王花、蜜枣', tips: '猪骨焯水后小火煲两小时，最后才放盐' },

  /* ---------------- 粤菜 · 客家 3 ---------------- */
  { id: 'kejianiandoufu', name: '客家酿豆腐', cat: 'meat', main: '嫩豆腐、猪肉末、鱼肉', tips: '豆腐挖孔后先煎定型，再下汤焖入味' },
  { id: 'yanjuji', name: '盐焗鸡', cat: 'meat', main: '三黄鸡、粗盐、沙姜', tips: '粗盐炒热后把鸡埋进去焗熟，沙姜油是灵魂' },
  { id: 'meicaikourou', name: '梅菜扣肉', cat: 'meat', main: '五花肉、梅菜', tips: '五花肉煮后抹老抽炸皮，再与梅菜同蒸' },

  /* ---------------- 粤菜 · 潮汕 3 ---------------- */
  { id: 'chaoshanhaolao', name: '潮汕蚝烙', cat: 'meat', main: '生蚝、番薯粉、鸡蛋', tips: '番薯粉浆要稀，油足才煎得外脆里嫩' },
  { id: 'chaoshanlue', name: '潮汕卤鹅', cat: 'meat', main: '狮头鹅、八角、南姜', tips: '卤水加南姜和香茅，卤完浸泡过夜才入味' },
  { id: 'shaguohaixianzhou', name: '砂锅海鲜粥', cat: 'staple', main: '米、虾、蟹、瑶柱', tips: '米先冷冻再煮容易开花，海鲜最后放' },

  /* ---------------- 粤菜 · 点心 1 ---------------- */
  { id: 'shuijingxiajiao', name: '水晶虾饺', cat: 'staple', main: '澄面、鲜虾、笋粒', tips: '澄面要用沸水烫熟，虾馅加肥肉才爽滑' },

  /* ---------------- 日常家常菜 10 ---------------- */
  { id: 'mapodoufu', name: '麻婆豆腐', cat: 'meat', main: '嫩豆腐、牛肉末、豆瓣酱', tips: '豆腐先用盐水泡，勾芡分三次才挂得住' },
  { id: 'tangculiji', name: '糖醋里脊', cat: 'meat', main: '猪里脊、番茄酱、白醋', tips: '里脊复炸定酥，糖醋汁按 1:2:3 调' },
  { id: 'qingjiaorousi', name: '青椒肉丝', cat: 'meat', main: '猪里脊、青椒', tips: '肉丝抓淀粉滑油，青椒断生就出锅' },
  { id: 'youmendaxia', name: '油焖大虾', cat: 'meat', main: '大虾、番茄酱、姜', tips: '虾头先煎出红油再焖，虾油才是精华' },
  { id: 'hongshaoqiezi', name: '红烧茄子', cat: 'veg', main: '茄子、蒜、生抽', tips: '茄子先用盐杀水再煎，省油不吸油' },
  { id: 'suanrongkongxincai', name: '蒜蓉空心菜', cat: 'veg', main: '空心菜、蒜', tips: '梗和叶分开下锅，全程大火十几秒' },
  { id: 'muerchaoshanyao', name: '木耳炒山药', cat: 'veg', main: '山药、木耳、胡萝卜', tips: '山药切片泡醋水，防氧化发黑' },
  { id: 'xihongshigedatang', name: '西红柿疙瘩汤', cat: 'soup', main: '面粉、番茄、鸡蛋', tips: '面粉边滴水边搅成小疙瘩，大小才均匀' },
  { id: 'pidanshourouzhou', name: '皮蛋瘦肉粥', cat: 'staple', main: '大米、皮蛋、猪瘦肉', tips: '米泡半小时再煮，皮蛋分两次放' },
  { id: 'liangbanhaidaisi', name: '凉拌海带丝', cat: 'cold', main: '海带丝、蒜、香醋', tips: '海带焯水后过冰水，口感才脆' }
]

/* 索引，避免每次线性查找 */
var MAP = {}
var CACHE_BY_CAT = {}
for (var i = 0; i < DISHES.length; i++) {
  var d = DISHES[i]
  MAP[d.id] = d
  if (!CACHE_BY_CAT[d.cat]) CACHE_BY_CAT[d.cat] = []
  CACHE_BY_CAT[d.cat].push(d)
}

var CAT_NAME = {}
for (var j = 0; j < CATS.length; j++) CAT_NAME[CATS[j].key] = CATS[j].name

/* ==================== 用户自建菜（运行时叠加层） ====================
 *
 * 内置的 80 道菜是**只读**的，永远不动。用户自己加的菜是另一层，
 * 在运行时通过 setCustom() 装进来，三个读取函数（byId / byCat / imageOf）
 * 自动把两层合起来。
 *
 * ★ 为什么把合并做在这一层，而不是让每个页面自己去查两次 ——
 *   菜单、点菜页、菜库页、收藏页、摇一摇全都在用 byId/byCat/imageOf。
 *   合并放在这里，这五个页面对「自建菜」的存在**一行都不用改**；
 *   散在页面里做的话，加一个新页面就会漏一处，而且漏了不会报错。
 *
 * 自建菜的形状（由 app.js 统一归一化后传进来）：
 *   { id, name, cat, main, tips, image, mine, creatorName, createdAt }
 *   - image 云端模式下是 cloud:// 文件 ID，本地模式下是本机持久化路径
 *   - mine  表示「是不是我自己加的」，只有自己加的才给编辑 / 删除
 */
var CUSTOM = []
var CUSTOM_MAP = {}
var CUSTOM_BY_CAT = {}

/** 没传照片的自建菜用这张占位图（在 images/ 根目录，不参与菜品图规格检查） */
var NO_PHOTO = '/images/dish-placeholder.png'

function rebuildCustom() {
  CUSTOM_MAP = {}
  CUSTOM_BY_CAT = {}
  for (var i = 0; i < CUSTOM.length; i++) {
    var c = CUSTOM[i]
    if (!c || !c.id) continue
    CUSTOM_MAP[c.id] = c
    if (!CUSTOM_BY_CAT[c.cat]) CUSTOM_BY_CAT[c.cat] = []
    CUSTOM_BY_CAT[c.cat].push(c)
  }
}

module.exports = {
  CATS: CATS,
  DISHES: DISHES,
  TOTAL: DISHES.length,

  byId: function (id) {
    return MAP[id] || CUSTOM_MAP[id] || null
  },

  byCat: function (cat) {
    var all = (!cat || cat === 'all')
    var base = all ? DISHES.slice() : (CACHE_BY_CAT[cat] || []).slice()
    if (!CUSTOM.length) return base
    // 自建菜排在内置菜后面：菜库里「我加的」总在末尾，位置可预期
    var extra = all ? CUSTOM.slice() : (CUSTOM_BY_CAT[cat] || []).slice()
    return base.concat(extra)
  },

  catName: function (cat) {
    return CAT_NAME[cat] || '其他'
  },

  imageOf: function (id) {
    var c = CUSTOM_MAP[id]
    if (c) return c.image || NO_PHOTO
    return '/images/dishes/' + id + '.jpg'
  },

  /**
   * 按关键词找菜（内置的 80 道和自己加的菜一起找）。
   *
   * 只看「菜名」和「主料」两处 —— 这两个是用户记得住的；
   * 搜「要点」那种长句子基本没人会用，还会把结果搅乱。
   *
   * ★ 菜名命中的必须排在主料命中的前面：搜「鸡」的时候想要的是
   *   「宫保鸡丁」，而不是随便哪道主料里带个鸡字的菜。
   *
   * ★ 这条规则放在数据层、不放在页面里，是因为它写错了**不会报错**，
   *   只会「搜出来的顺序怪怪的」，很难被注意到。放这儿才能被
   *   core-test 的断言长期守住。
   */
  search: function (kw) {
    var k = String(kw || '').trim().toLowerCase()
    var all = DISHES.slice().concat(CUSTOM)
    if (!k) return all        // 空关键词 = 没有筛选条件

    var byName = []
    var byMain = []
    for (var i = 0; i < all.length; i++) {
      var d = all[i]
      if (String(d.name || '').toLowerCase().indexOf(k) >= 0) {
        byName.push(d)
      } else if (String(d.main || '').toLowerCase().indexOf(k) >= 0) {
        byMain.push(d)
      }
    }
    return byName.concat(byMain)
  },

  /* ---------- 自建菜 ---------- */

  /** 装入用户自建菜（整批替换，不是追加） */
  setCustom: function (list) {
    CUSTOM = (list instanceof Array) ? list.slice() : []
    rebuildCustom()
    return CUSTOM.length
  },

  /** 自建菜副本 */
  customList: function () {
    return CUSTOM.slice()
  },

  /** 这道菜是不是用户自己加的（内置菜返回 false） */
  isCustom: function (id) {
    return !!CUSTOM_MAP[id]
  },

  /** 菜库总数 = 内置 + 自建。注意 TOTAL 仍是内置菜数，别混用 */
  totalAll: function () {
    return DISHES.length + CUSTOM.length
  },

  /**
   * 生成自建菜的 id。
   * ★ 前缀必须区分于内置菜（内置 id 全是英文单词），
   *   否则将来某次扩菜真加了一道叫 u51a2b 的菜就会撞车。
   *   末尾那串随机数是防「同一毫秒加两道菜」生成同一个 id。
   */
  newCustomId: function () {
    return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36)
  }
}
