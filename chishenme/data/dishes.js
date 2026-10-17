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

/* 按 id 索引，避免每次线性查找 */
var MAP = {}
for (var i = 0; i < DISHES.length; i++) MAP[DISHES[i].id] = DISHES[i]

var CAT_NAME = {}
for (var j = 0; j < CATS.length; j++) CAT_NAME[CATS[j].key] = CATS[j].name

/* ★ 这里原本还有一个「按分类预先算好的索引」CACHE_BY_CAT。
   加了「房主能改内置菜的分类」之后必须去掉：那个索引是按**出厂分类**建的，
   房主把一道荤菜改成素菜后，按素菜筛会被索引用出厂分类挡在外面（点分类看不见），
   按荤菜筛又会出现（明明已经改成素菜了）。两处都不报错，只是菜莫名多出来 / 不见了。
   现在改成 80 道菜线性扫一遍 —— 这个量级代价可以忽略，换来的是分类永远跟改动一致。 */

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

/* ==================== 房主对内置菜的改动 / 隐藏 ====================
 *
 * 内置的 80 道菜写死在 DISHES 里，图片也打在小程序包里 —— 物理上删不掉。
 * 但「把红烧肉改叫外婆红烧肉」「这道菜我家不做，别让它出现在菜单里」都是
 * 真实需求，所以再叠一层：房主的改动记成一条覆盖，byId / byCat / imageOf /
 * search 都会把它叠上去，页面照旧一行不用改。
 *
 * ★ 三条不能破的规矩：
 *   1. **绝不改 DISHES 里的对象**。它们是模块级静态数据，D.TOTAL 和图片规格
 *      检查都指着它们。要改动就生成一个新对象返回，绝不原地改。
 *   2. 「删除」的语义是**隐藏**，不是真删。菜还在包里、图还在包里，
 *      只是不再出现在任何地方；房主随时能恢复。
 *   3. 隐藏对**所有人**生效（连 byId 都返回 null），所以菜单、收藏、点菜页、
 *      摇一摇不用各自写一遍过滤 —— 和自建菜那层同一个思路，漏一处就会
 *      让一道已经藏起来的菜从某个入口冒出来。
 *
 * 覆盖记录的形状（由 app.js 归一化后传进来）：
 *   { name, cat, main, tips, image, hidden }
 *   - hidden === true 表示「藏起来」；其余字段是房主的改法
 *   - main / tips 为 null 表示「没改这两项」，空串表示「房主清空了它」
 */
var OVERRIDES = {}

/** 这道内置菜是不是被房主藏起来了 */
function isHidden(id) {
  var o = OVERRIDES[id]
  return !!(o && o.hidden === true)
}

/**
 * 把房主的改动叠到一道内置菜上。
 * 没改过就**原样返回引用**（调用方只读它），改过则返回一个新对象。
 */
function applyOverride(d) {
  var o = OVERRIDES[d.id]
  if (!o) return d
  return {
    id: d.id,
    // 菜名和分类是必填项，空值一律当作「没改」（云函数也不接受空菜名）
    name: o.name || d.name,
    cat: o.cat || d.cat,
    // 主料 / 要点可以是空串（房主真的清空了它），所以只认 null / undefined 为「没改」
    main: (o.main === undefined || o.main === null) ? d.main : o.main,
    tips: (o.tips === undefined || o.tips === null) ? d.tips : o.tips,
    // 房主给这道内置菜换的图（cloud:// 或本机路径）。空串表示还用包里那张原图
    image: o.image || '',
    edited: true
  }
}

/** 可见的内置菜（已叠上改动、已剔掉隐藏） */
function builtinList(cat) {
  var all = (!cat || cat === 'all')
  var out = []
  for (var i = 0; i < DISHES.length; i++) {
    var d = applyOverride(DISHES[i])
    if (isHidden(d.id)) continue
    if (!all && d.cat !== cat) continue
    out.push(d)
  }
  return out
}

/** 自建菜里属于某个分类的那批 */
function customOf(cat) {
  var all = (!cat || cat === 'all')
  return all ? CUSTOM.slice() : (CUSTOM_BY_CAT[cat] || []).slice()
}

/** 藏起来的内置菜有几道 */
function countHidden() {
  var n = 0
  for (var i = 0; i < DISHES.length; i++) {
    if (isHidden(DISHES[i].id)) n++
  }
  return n
}

/* ==================== 云存储图片的「临时链接」 ====================
 *
 * ── 为什么需要这一层 ──
 * 云存储有自己的一套权限，跟数据库权限无关。如果它是「仅创建者及管理员可读写」，
 * 那么**家人之间互相看不到对方上传的菜图** —— 客户端直接读别人的 cloud:// 会报
 * `STORAGE_EXCEED_AUTHORITY`，在开发者工具里表现成一行
 * `Failed to load image .../cloud://... net::OK`，极其不像「权限问题」。
 *
 * 而我们的云开发是**免费环境，控制台不给改存储权限**（会提示升级付费版）。
 * 于是换个方向：**云函数是管理员身份，安全规则只管客户端，管不着他**。
 * 让云函数调 getTempFileURL 把 cloud:// 换成带签名的 https 临时链接，
 * 随 listDishes 一起发下来，这里负责**显示时替换**。
 *
 * ── 两条不能破的规矩 ──
 *   1. **临时链接绝不写进任何持久化的数据**（本机缓存 / 云端记录一条都不行）。
 *      它默认 1 天就过期，写进去过一天就变成一堆死链，而且没人会想到来这儿找原因。
 *      所以只管「读时替换」，CUSTOM / OVERRIDES 里存的永远是原样的 cloud://。
 *   2. 映射里没有的一律**原样返回** —— 包内路径、本机路径、以及这次没换成功的
 *      cloud:// 全走这条路。最差也只是「这张图暂时看不到」，不会让整页崩掉。
 */
var TEMP_URL = {}

/**
 * 装入云端发下来的 { fileID: 临时链接 } 映射（整批替换，不是追加）。
 * 只认 https:// 开头的字符串：云端换失败的那些位置会是空值，别让它们进映射，
 * 否则 imageOf 会返回一个空串，图片变成一片空白而看不出是为什么。
 * 返回装进去几条，方便测试断言。
 */
function setTempUrls(map) {
  TEMP_URL = {}
  if (!map || typeof map !== 'object' || (map instanceof Array)) return 0
  var n = 0
  for (var k in map) {
    var v = map[k]
    if (typeof v === 'string' && v.indexOf('https://') === 0) {
      TEMP_URL[k] = v
      n++
    }
  }
  return n
}

/** 显示用：能换成临时链接就换，换不了（不在映射里）就原样返回 */
function tempOf(raw) {
  if (!raw) return raw
  return TEMP_URL[raw] || raw
}

/** 当前装了几条映射 */
function tempUrlCount() {
  var n = 0
  for (var k in TEMP_URL) n++
  return n
}

/* ==================== 搜索：命中规则 ====================
 *
 * ★ 为什么单独抽出来：
 *   菜库是「扁平列表 + 菜名优先排序」，点菜页是「按分类分组后再筛」——
 *   两者不能共用一个返回值，但**命中规则必须是同一套**。
 *   规则复制一份到页面里，就会出现「菜库搜得到、点菜页搜不到」这种
 *   谁也不报错的怪现象。所以规则只写在这里，search() 和页面都调它。
 */

/** 关键词归一：去首尾空格、转小写；空串 = 不筛选 */
function keywordOf(kw) {
  return String(kw || '').trim().toLowerCase()
}

/** 这道菜算不算命中（菜名或主料含关键词）。空关键词一律算命中。 */
function hits(d, k) {
  if (!k) return true
  return String((d && d.name) || '').toLowerCase().indexOf(k) >= 0 ||
    String((d && d.main) || '').toLowerCase().indexOf(k) >= 0
}

module.exports = {
  CATS: CATS,
  DISHES: DISHES,
  TOTAL: DISHES.length,

  byId: function (id) {
    if (CUSTOM_MAP[id]) return CUSTOM_MAP[id]
    var d = MAP[id]
    if (!d) return null
    // ★ 藏起来的内置菜在这里就断掉，别让调用方自己去判断 ——
    //   菜单、收藏、摇一摇全靠这个 null 来当成「这道菜不存在了」
    if (isHidden(id)) return null
    return applyOverride(d)
  },

  byCat: function (cat) {
    // 自建菜排在内置菜后面：菜库里「我加的」总在末尾，位置可预期
    return builtinList(cat).concat(customOf(cat))
  },

  catName: function (cat) {
    return CAT_NAME[cat] || '其他'
  },

  /**
   * 这道菜该显示哪张图。
   *
   * ★ 所有页面（菜单 / 菜库 / 点菜 / 摇一摇 / 收藏 / edit 的预览）
   *   都只经这一个函数取图，所以「cloud:// → 临时链接」的替换放在这里，
   *   六处调用一行都不用改，将来加页面也不会漏。
   *
   * 只有「可能存着 cloud://」的两条分支要走替换；包内路径是本地的，
   * 绕过去更省事（而且临时链接永远不会以 /images/ 开头，不会误伤）。
   */
  imageOf: function (id) {
    var c = CUSTOM_MAP[id]
    if (c) return c.image ? tempOf(c.image) : NO_PHOTO
    // 房主给内置菜换过图就用那张；没换过（image 为空串）仍然用包里那张原图
    var o = OVERRIDES[id]
    if (o && o.image) return tempOf(o.image)
    return '/images/dishes/' + id + '.jpg'
  },

  /**
   * 按关键词找菜（内置的 80 道和自己加的菜一起找，藏起来的不算）。
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
    var k = keywordOf(kw)
    var all = builtinList('all').concat(CUSTOM)
    if (!k) return all        // 空关键词 = 没有筛选条件

    var byName = []
    var byMain = []
    for (var i = 0; i < all.length; i++) {
      var d = all[i]
      if (!hits(d, k)) continue
      // 菜名命中的排前面，只有主料命中的排后面
      if (String((d && d.name) || '').toLowerCase().indexOf(k) >= 0) byName.push(d)
      else byMain.push(d)
    }
    return byName.concat(byMain)
  },

  /**
   * 这道菜是否命中关键词 —— 给「先按分类分组、再筛」的页面用（点菜页）。
   * ★ 和 search() 共用同一个 hits()，所以两边结论永远一致：
   *   不会出现「菜库能搜到、点菜页搜不到」。
   */
  match: function (dish, kw) {
    return hits(dish, keywordOf(kw))
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

  /** 这道菜是不是内置的 80 道之一 */
  isBuiltin: function (id) {
    return !!MAP[id]
  },

  /* ---------- 云存储图片的临时链接 ---------- */

  /**
   * 装入云端换好的 { fileID: 临时链接 }。
   * 约定：**只用于显示**，永远不要把这个映射里的值写进任何存储。
   */
  setTempUrls: function (map) {
    return setTempUrls(map)
  },

  /** 当前有几条临时链接（测试用） */
  tempUrlCount: function () {
    return tempUrlCount()
  },

  /* ---------- 房主对内置菜的改动 ---------- */

  /**
   * 装入覆盖层（整批替换）。
   * 不认识的 id 直接丢掉 —— 那是别的房间留下的、或者已经下架的内置菜，
   * 留着只会在别处变成一个莫名其妙的空条目。
   */
  setOverrides: function (map) {
    OVERRIDES = {}
    var src = map || {}
    for (var id in src) {
      if (!Object.prototype.hasOwnProperty.call(src, id)) continue
      var o = src[id]
      if (!o || !MAP[id]) continue
      OVERRIDES[id] = {
        name: (o.name === undefined || o.name === null) ? '' : String(o.name),
        cat: (o.cat === undefined || o.cat === null) ? '' : String(o.cat),
        main: (o.main === undefined || o.main === null) ? null : String(o.main),
        tips: (o.tips === undefined || o.tips === null) ? null : String(o.tips),
        image: o.image ? String(o.image) : '',
        hidden: o.hidden === true
      }
    }
    return Object.keys(OVERRIDES).length
  },

  /** 这道内置菜被房主藏起来了吗 */
  isHidden: function (id) {
    return isHidden(id)
  },

  /** 这道内置菜被房主改过吗（藏起来的不算「改过」） */
  isEdited: function (id) {
    var o = OVERRIDES[id]
    return !!(o && o.hidden !== true)
  },

  /** 房主给这道内置菜记下的改动（没有就是 null） */
  overrideOf: function (id) {
    var o = OVERRIDES[id]
    if (!o) return null
    return {
      name: o.name, cat: o.cat, main: o.main, tips: o.tips,
      image: o.image, hidden: o.hidden
    }
  },

  /**
   * 被房主藏起来的内置菜列表 —— 专门给「恢复内置菜」那个入口用。
   * 别的地方一律拿不到它们（byId / byCat / search 都不含）。
   */
  hiddenBuiltin: function (cat) {
    var all = (!cat || cat === 'all')
    var out = []
    for (var i = 0; i < DISHES.length; i++) {
      var raw = DISHES[i]
      if (!isHidden(raw.id)) continue
      var d = applyOverride(raw)
      if (!all && d.cat !== cat) continue
      // ★ 显式复制一份。applyOverride 在「只藏起来、没改任何字段」时确实会
      //   返回新对象，但这里不依赖那个巧合 —— 万一将来 isHidden 的判定变了
      //   而它返回了原对象，往上写 hidden 就等于改到了静态数据。
      out.push({
        id: d.id,
        name: d.name,
        cat: d.cat,
        main: d.main,
        tips: d.tips,
        image: d.image || '',
        hidden: true
      })
    }
    return out
  },

  /** 藏起来的内置菜有几道 */
  hiddenCount: function () {
    return countHidden()
  },

  /**
   * 菜库总数 = 可见的内置菜 + 自建。
   * ★ 注意 TOTAL 仍然是内置菜的**出厂**数量（80），别拿它当总数用。
   *   隐藏了几道之后，菜库页上的数字得跟着变小，所以这里必须减去隐藏数。
   */
  totalAll: function () {
    return DISHES.length - countHidden() + CUSTOM.length
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
