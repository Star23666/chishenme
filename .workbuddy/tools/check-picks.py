# -*- coding: utf-8 -*-
"""
挑选结果复核图：把 dish-picks.json 里选中的图排成一张，人工过一眼。

为什么要单独一张：候选对比图一行 8 张、每张 200px，看构图可以，看
「这道菜到底对不对」不够。挑选结果复核图把每张放到 300px，
一眼能看出「选到的是人群 / 菜单 / 蒸笼」这类错配。

用法：python check-picks.py
输出：.workbuddy/tmp/picked-check.png
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:/新建文件夹/小程序"
CAND = os.path.join(ROOT, ".workbuddy/tmp/dish-candidates")
PICKS = os.path.join(ROOT, ".workbuddy/tmp/dish-picks.json")
OUT = os.path.join(ROOT, ".workbuddy/tmp/picked-check.png")

NAMES = [
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

T, LBL, PAD, COLS = 300, 30, 8, 9


def font(size):
    for p in (r"C:/Windows/Fonts/msyh.ttc",):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    picks = json.load(open(PICKS, encoding="utf-8"))
    rows = (len(NAMES) + COLS - 1) // COLS
    W = COLS * (T + PAD) + PAD
    H = rows * (T + LBL + PAD) + PAD + 44
    cv = Image.new("RGB", (W, H), (245, 245, 247))
    d = ImageDraw.Draw(cv)
    f1, f2, f3 = font(26), font(21), font(23)
    d.text((PAD, PAD), "挑选结果复核 · 绿框=用网图 / 红块=转 AI 生成", fill=(40, 40, 40), font=f1)

    n_web = n_ai = n_miss = 0
    for i, (did, cn) in enumerate(NAMES):
        r, c = divmod(i, COLS)
        x = PAD + c * (T + PAD)
        y = PAD + 44 + r * (T + LBL + PAD)
        ref = picks.get(did, "")
        if ref == "__AI__":
            n_ai += 1
            d.rectangle([x, y, x + T, y + T], fill=(250, 226, 226), outline=(200, 80, 80))
            d.text((x + 8, y + T // 2 - 44), "AI 生成", fill=(190, 50, 50), font=f3)
            d.text((x + 8, y + T // 2 - 10), cn, fill=(190, 50, 50), font=f2)
            continue
        p = os.path.join(CAND, did, ref)
        if not os.path.exists(p):
            n_miss += 1
            d.rectangle([x, y, x + T, y + T], fill=(255, 235, 200), outline=(200, 150, 60))
            d.text((x + 8, y + T // 2), "缺文件 " + ref, fill=(180, 110, 20), font=f2)
            continue
        n_web += 1
        im = Image.open(p).convert("RGB")
        w, h = im.size
        s = min(w, h)
        im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
        cv.paste(im.resize((T, T), Image.LANCZOS), (x, y))
        d.rectangle([x, y, x + T, y + T], outline=(60, 170, 90), width=3)
        d.text((x + 2, y + T + 3), "%s" % cn, fill=(30, 30, 30), font=f2)
        d.text((x + 2, y + T + 26), ref, fill=(150, 150, 150), font=font(17))

    cv.save(OUT)
    print("写出 %s  %dx%d" % (OUT, W, H))
    print("网图 %d 张 / AI 生成 %d 张 / 缺文件 %d 张" % (n_web, n_ai, n_miss))


if __name__ == "__main__":
    main()
