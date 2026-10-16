# -*- coding: utf-8 -*-
"""把所有菜品图拼成一张总览大图，用于肉眼核对每张图内容是否正确。"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:/新建文件夹/小程序"
SRC = os.path.join(ROOT, "chishenme/images/dishes")
OUT = os.path.join(ROOT, "今天吃啥-菜品总览.jpg")

# dishId -> 中文名（按分类顺序）
ITEMS = [
    # 荤菜
    ("hongshaorou", "红烧肉"), ("tangcupaigu", "糖醋排骨"), ("gongbaojiding", "宫保鸡丁"),
    ("kelejichi", "可乐鸡翅"), ("fanqiechaodan", "番茄炒蛋"), ("yuxiangrousi", "鱼香肉丝"),
    ("huiguorou", "回锅肉"), ("qingzhengluyu", "清蒸鲈鱼"), ("tudouniunan", "土豆炖牛腩"),
    ("jiaoyanpaigu", "椒盐排骨"), ("xiangguhuaji", "香菇滑鸡"), ("suanrongfensixia", "蒜蓉粉丝蒸虾"),
    # 素菜
    ("jiachangdoufu", "家常豆腐"), ("ganbiansijidou", "干煸四季豆"), ("suanrongxilanhua", "蒜蓉西兰花"),
    ("shousibaocai", "手撕包菜"), ("disanxian", "地三鲜"), ("culiubaicai", "醋溜白菜"),
    ("xianggujingcai", "香菇青菜"), ("hupiqingjiao", "虎皮青椒"), ("qingchaotudousi", "清炒土豆丝"),
    # 汤羹
    ("fanqiedantang", "番茄蛋汤"), ("dongguapaigutang", "冬瓜排骨汤"), ("zicaidanhuatang", "紫菜蛋花汤"),
    ("yumipaigutang", "玉米胡萝卜排骨汤"), ("suanlatang", "酸辣汤"),
    # 主食
    ("danchaofan", "蛋炒饭"), ("xihongshimian", "西红柿鸡蛋面"), ("congyoubanmian", "葱油拌面"),
    ("shouzhuabing", "手抓饼"), ("jiaozi", "白菜猪肉饺子"),
    # 凉菜
    ("liangbanhuanggua", "凉拌黄瓜"), ("liangbanmuer", "凉拌木耳"), ("pidandoufu", "皮蛋豆腐"),
    ("koushuiji", "口水鸡"),
]

COLS, THUMB, GAP, LABEL_H = 7, 190, 10, 26
PAD = 16


def load_font(size):
    for p in [r"C:/Windows/Fonts/msyh.ttc", r"C:/Windows/Fonts/simhei.ttf", r"C:/Windows/Fonts/simsun.ttc"]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    rows = (len(ITEMS) + COLS - 1) // COLS
    cw = THUMB + GAP
    ch = THUMB + LABEL_H + GAP
    W = COLS * cw - GAP + PAD * 2
    H = rows * ch - GAP + PAD * 2 + 44

    canvas = Image.new("RGB", (W, H), (247, 248, 250))
    d = ImageDraw.Draw(canvas)
    f_title = load_font(26)
    f_label = load_font(16)

    d.text((PAD, 14), "今天吃啥 · 菜品总览（35 道 / 分类顺序：荤菜·素菜·汤羹·主食·凉菜）",
           fill=(31, 35, 41), font=f_title)

    y0 = 46 + PAD
    missing = []
    for i, (did, name) in enumerate(ITEMS):
        r, c = divmod(i, COLS)
        x = PAD + c * cw
        y = y0 + r * ch
        p = os.path.join(SRC, did + ".jpg")
        if not os.path.exists(p):
            missing.append(did)
            d.rectangle([x, y, x + THUMB, y + THUMB], fill=(255, 220, 220))
            continue
        im = Image.open(p).convert("RGB").resize((THUMB, THUMB), Image.LANCZOS)
        canvas.paste(im, (x, y))
        d.rectangle([x, y, x + THUMB, y + THUMB], outline=(230, 232, 236))
        tw = d.textlength(name, font=f_label)
        d.text((x + (THUMB - tw) / 2, y + THUMB + 5), name, fill=(90, 96, 112), font=f_label)

    canvas.save(OUT, "JPEG", quality=88, optimize=True)
    print("写出", OUT)
    print("尺寸 %sx%s, %.1f KB" % (W, H, os.path.getsize(OUT) / 1024.0))
    if missing:
        print("缺图：" + ", ".join(missing))


if __name__ == "__main__":
    main()
