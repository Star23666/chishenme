# -*- coding: utf-8 -*-
"""
把所有菜品图拼成一张总览大图，用于肉眼核对每张图内容是否正确。

★ 菜单从 dishes.js 里解析，**不写死**。原来这份名单是手抄的 35 条，
  扩到 80 道之后必须改代码才能出图 —— 而出图工具坏了不会报错，
  只会默默产出一张少了一半菜的旧图。改成解析后，加多少菜都自动跟上。

用法：python make-contact-sheet.py
输出：今天吃啥-菜品总览.jpg
"""
import os
import re

from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:/新建文件夹/小程序"
APP = os.path.join(ROOT, "chishenme")
SRC = os.path.join(APP, "images/dishes")
DISHES_JS = os.path.join(APP, "data/dishes.js")
OUT = os.path.join(ROOT, "今天吃啥-菜品总览.jpg")

CAT_ORDER = ["meat", "veg", "soup", "staple", "cold"]
CAT_NAME = {"meat": "荤菜", "veg": "素菜", "soup": "汤羹", "staple": "主食", "cold": "凉菜"}

COLS, THUMB, GAP, LABEL_H = 10, 150, 8, 24
PAD = 16


def load_font(size):
    for p in (r"C:/Windows/Fonts/msyh.ttc", r"C:/Windows/Fonts/simhei.ttf"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def parse_dishes():
    """从 dishes.js 里按出现顺序抠出 (id, name, cat)"""
    txt = open(DISHES_JS, encoding="utf-8").read()
    rows = re.findall(
        r"\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*cat:\s*'([^']+)'", txt)
    return rows


def main():
    items = parse_dishes()
    # 按分类分组，组内保持文件里的出现顺序
    grouped = []
    for c in CAT_ORDER:
        for did, name, cat in items:
            if cat == c:
                grouped.append((did, name, c))
    # 兜底：万一有菜用了未登记的分类，别让它静默消失
    for did, name, cat in items:
        if cat not in CAT_ORDER:
            grouped.append((did, name, cat))

    f_title = load_font(28)
    f_cat = load_font(22)
    f_label = load_font(15)

    rows_n = (len(grouped) + COLS - 1) // COLS
    cw, ch = THUMB + GAP, THUMB + LABEL_H + GAP
    W = COLS * cw - GAP + PAD * 2
    H = rows_n * ch - GAP + PAD * 2 + 50

    canvas = Image.new("RGB", (W, H), (247, 248, 250))
    d = ImageDraw.Draw(canvas)
    d.text((PAD, 14),
           "今天吃啥 · 菜品总览（%d 道，按荤 / 素 / 汤 / 主食 / 凉菜排列）" % len(grouped),
           fill=(31, 35, 41), font=f_title)

    y0 = 52 + PAD
    missing, last_cat = [], None
    for i, (did, name, cat) in enumerate(grouped):
        r, c = divmod(i, COLS)
        x = PAD + c * cw
        y = y0 + r * ch
        p = os.path.join(SRC, did + ".jpg")
        if not os.path.exists(p):
            missing.append(did)
            d.rectangle([x, y, x + THUMB, y + THUMB], fill=(255, 220, 220))
        else:
            im = Image.open(p).convert("RGB").resize((THUMB, THUMB), Image.LANCZOS)
            canvas.paste(im, (x, y))
            d.rectangle([x, y, x + THUMB, y + THUMB], outline=(228, 230, 234))
        if cat != last_cat:
            # 分类切换处画一条竖线，方便一眼看出分组
            d.line([x - GAP // 2, y, x - GAP // 2, y + THUMB], fill=(255, 112, 67), width=2)
            last_cat = cat
        tw = d.textlength(name, font=f_label)
        d.text((x + (THUMB - tw) / 2, y + THUMB + 4), name, fill=(90, 96, 112), font=f_label)

    canvas.save(OUT, "JPEG", quality=86, optimize=True)
    print("写出 %s" % OUT)
    print("尺寸 %dx%d，%.1f KB，共 %d 道"
          % (W, H, os.path.getsize(OUT) / 1024.0, len(grouped)))
    if missing:
        print("缺图（%d）：%s" % (len(missing), ", ".join(missing)))
    else:
        print("全部菜品都有图")


if __name__ == "__main__":
    main()
