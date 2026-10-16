# -*- coding: utf-8 -*-
"""
把从维基下载到的菜图候选拼成对比图，方便一眼挑出可用的。

为什么需要它：45 道菜最多 225 张候选，逐张点开看不现实；
拼成「一行一道菜、一行 5 个候选」的对比图，一次能看 8 道。

用法：python make-candidate-sheet.py
输出：.workbuddy/tmp/dish-sheets/sheet-XX.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:/新建文件夹/小程序"
CAND = os.path.join(ROOT, ".workbuddy/tmp/dish-candidates")
OUT = os.path.join(ROOT, ".workbuddy/tmp/dish-sheets")

THUMB = 200          # 每个候选缩略图边长
LABEL_W = 230        # 左侧菜名列宽
PER_SHEET = 8        # 每张对比图放几道菜
MAX_COLS = 8         # 每道菜最多展示几张候选
PAD = 8

DISH_ORDER = [
    ("gaofengningmengya", "高峰柠檬鸭"), ("yangshuopijiuyu", "阳朔啤酒鱼"),
    ("lipuyukourou", "荔浦芋扣肉"), ("quanzhoucuxueya", "全州醋血鸭"),
    ("wuzhouzhibaoji", "梧州纸包鸡"), ("suansunchaoniurou", "酸笋炒牛肉"),
    ("liuzhouluosifen", "柳州螺蛳粉"), ("guilinmifen", "桂林米粉"),
    ("nanninglaoyoufen", "南宁老友粉"), ("luosiyajiaobao", "螺蛳鸭脚煲"),
    ("gongchengyoucha", "恭城油茶"), ("shaxiezhidoujiao", "沙蟹汁豆角"),
    ("guangxisuanye", "广西酸嘢"), ("wusenuomifan", "五色糯米饭"),
    ("wuzhouguilinggao", "梧州龟苓膏"),
    ("baiqieji", "白切鸡"), ("mizhichashao", "蜜汁叉烧"),
    ("chizhizhengpaigu", "豉汁蒸排骨"), ("boluogulaorou", "菠萝咕咾肉"),
    ("baizhuoxia", "白灼虾"), ("luoboniunanbao", "萝卜牛腩煲"),
    ("haoyoushengcai", "蚝油生菜"), ("shangtangwawacai", "上汤娃娃菜"),
    ("suanrongchaoxin", "蒜蓉炒菜心"), ("ganchaoniuhe", "干炒牛河"),
    ("laweibaozifan", "腊味煲仔饭"), ("yuntunmian", "云吞面"),
    ("bawanghuapaigutang", "霸王花猪骨汤"), ("kejianiandoufu", "客家酿豆腐"),
    ("yanjuji", "盐焗鸡"), ("meicaikourou", "梅菜扣肉"),
    ("chaoshanhaolao", "潮汕蚝烙"), ("chaoshanlue", "潮汕卤鹅"),
    ("shaguohaixianzhou", "砂锅海鲜粥"), ("shuijingxiajiao", "水晶虾饺"),
    ("mapodoufu", "麻婆豆腐"), ("tangculiji", "糖醋里脊"),
    ("qingjiaorousi", "青椒肉丝"), ("youmendaxia", "油焖大虾"),
    ("hongshaoqiezi", "红烧茄子"), ("suanrongkongxincai", "蒜蓉空心菜"),
    ("muerchaoshanyao", "木耳炒山药"), ("xihongshigedatang", "西红柿疙瘩汤"),
    ("pidanshourouzhou", "皮蛋瘦肉粥"), ("liangbanhaidaisi", "凉拌海带丝"),
]


def font(size):
    for p in (r"C:/Windows/Fonts/msyh.ttc", r"C:/Windows/Fonts/simhei.ttf"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def square_thumb(path):
    """居中裁方并缩到 THUMB，统一尺寸才好对比构图"""
    try:
        im = Image.open(path).convert("RGB")
    except Exception:
        return None
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return im.resize((THUMB, THUMB), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    f_lab = font(26)
    f_idx = font(22)

    rows = []
    for did, cn in DISH_ORDER:
        d = os.path.join(CAND, did)
        files = sorted(os.listdir(d)) if os.path.isdir(d) else []
        files = [f for f in files if os.path.getsize(os.path.join(d, f)) > 4000]
        # ★ 优先展示高精度命中的（w 开头 = 文件名里真的含这道菜名），
        #   它们排前面，但编号仍然按「展示顺序」从 1 开始，方便回报挑选结果。
        files.sort(key=lambda f: (not f.startswith("w"), f))
        rows.append((did, cn, [os.path.join(d, f) for f in files[:MAX_COLS]]))

    made = 0
    for s in range(0, len(rows), PER_SHEET):
        chunk = rows[s:s + PER_SHEET]
        cols = max((len(r[2]) for r in chunk), default=1)
        W = LABEL_W + cols * (THUMB + PAD) + PAD
        H = len(chunk) * (THUMB + PAD) + PAD + 40
        sheet = Image.new("RGB", (W, H), (245, 245, 247))
        dr = ImageDraw.Draw(sheet)
        dr.text((PAD, PAD), "sheet %d · 每行一道菜，左起为候选 1~5" % (made + 1),
                fill=(60, 60, 60), font=f_lab)
        y = PAD + 40
        for did, cn, files in chunk:
            dr.text((PAD + 4, y + 64), cn, fill=(20, 20, 20), font=f_lab)
            dr.text((PAD + 4, y + 100), did, fill=(130, 130, 130), font=f_idx)
            if not files:
                dr.text((LABEL_W + 10, y + 84), "无候选 → AI 生成",
                        fill=(200, 60, 60), font=f_lab)
            for i, fp in enumerate(files):
                t = square_thumb(fp)
                x = LABEL_W + PAD + i * (THUMB + PAD)
                if t is None:
                    dr.rectangle([x, y, x + THUMB, y + THUMB], fill=(220, 220, 220))
                    continue
                sheet.paste(t, (x, y))
                dr.rectangle([x, y, x + 34, y + 30], fill=(0, 0, 0))
                dr.text((x + 8, y + 2), str(i + 1), fill=(255, 255, 255), font=f_idx)
            y += THUMB + PAD
        p = os.path.join(OUT, "sheet-%02d.png" % (made + 1))
        sheet.save(p)
        made += 1
        print("  " + p)

    print("-" * 50)
    print("共 %d 张对比图，输出到 %s" % (made, OUT))


if __name__ == "__main__":
    main()
