/**
 * 菜库静态数据：35 道家常菜
 * 图片约定：/images/dishes/<id>.jpg（320x320）
 * 分类 key：meat 荤菜 / veg 素菜 / soup 汤羹 / staple 主食 / cold 凉菜
 *
 * 说明：菜品数据不入本地存储，页面每次直接从本文件读，省存储空间，
 *       将来要加菜只改这个文件。
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
  { id: 'koushuiji', name: '口水鸡', cat: 'cold', main: '鸡腿肉', tips: '鸡肉煮熟后过冰水，鸡皮才弹' }
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

module.exports = {
  CATS: CATS,
  DISHES: DISHES,
  TOTAL: DISHES.length,

  byId: function (id) {
    return MAP[id] || null
  },

  byCat: function (cat) {
    if (!cat || cat === 'all') return DISHES.slice()
    return (CACHE_BY_CAT[cat] || []).slice()
  },

  catName: function (cat) {
    return CAT_NAME[cat] || '其他'
  },

  imageOf: function (id) {
    return '/images/dishes/' + id + '.jpg'
  }
}
