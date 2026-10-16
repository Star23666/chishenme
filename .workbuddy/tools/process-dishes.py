# -*- coding: utf-8 -*-
"""
菜品图批量处理：原始竖版大图 -> 小程序可直接用的正方形压缩图

输入：chishenme-raw/<dishId>/*.png | *.jpg | *.jpeg   (竖版大图，AI 图右下角带水印)
输出：chishenme/images/dishes/<dishId>.jpg            (300x300, JPEG q75)

三个关键设计：
  1) 居中裁成正方形 —— 竖版图的水印在底部条带，居中裁切后正好被裁掉，成品无水印。
     从网上（维基共享资源）来的图也走同一条路：构图不统一的，裁方之后统一。
  2) 用 JPEG 而非 PNG —— 300px 照片型 PNG 约 100KB+，80 张会顶爆小程序主包 2MB 上限。
  3) ★ 300x300 / q75 是为「80 道菜」重新定的规格。
     原来是 320x320 / q82：35 张 837KB，平均 23.9KB。
     按原规格扩到 80 张要 1.9MB，贴死 2MB 上限、一点余量都没有。
     降到 300x300 / q75 后平均约 16KB，80 张约 1.3MB，主包落在 1.4MB 上下。
     菜卡在手机上的显示宽度约 165px，300px 仍有余量，肉眼几乎看不出差别。

用法：python process-dishes.py
"""
import os
from PIL import Image

ROOT = r"D:/新建文件夹/小程序"
RAW = os.path.join(ROOT, "chishenme-raw")
OUT_DIR = os.path.join(ROOT, "chishenme/images/dishes")

OUT_SIZE = 300
QUALITY = 75

EXTS = (".png", ".jpg", ".jpeg", ".webp")


def find_raw(dish_id):
    """取第一个可用原图。★ 优先 png —— AI 生成的大图是 png，通常是首选素材。"""
    d = os.path.join(RAW, dish_id)
    if not os.path.isdir(d):
        return None
    files = [f for f in sorted(os.listdir(d)) if f.lower().endswith(EXTS)]
    files.sort(key=lambda f: (not f.lower().endswith(".png"), f))
    return os.path.join(d, files[0]) if files else None


def process_one(dish_id):
    src = find_raw(dish_id)
    if src is None:
        return None
    im = Image.open(src).convert("RGB")
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    im = im.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    os.makedirs(OUT_DIR, exist_ok=True)
    dst = os.path.join(OUT_DIR, dish_id + ".jpg")
    im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return os.path.getsize(dst)


def main():
    ids = sorted(
        d for d in os.listdir(RAW)
        if os.path.isdir(os.path.join(RAW, d)) and not d.startswith("_")
    )
    total, missing = 0, []
    for did in ids:
        size = process_one(did)
        if size is None:
            missing.append(did)
            print("  [缺失] %-20s 找不到原图" % did)
        else:
            total += size
            print("  [OK]  %-20s %6.1f KB" % (did, size / 1024.0))

    print("-" * 48)
    print("成功 %d / %d 张，合计 %.1f KB (%.2f MB)"
          % (len(ids) - len(missing), len(ids), total / 1024.0, total / 1024.0 / 1024.0))
    if missing:
        print("缺失：" + ", ".join(missing))
    print("输出目录：" + OUT_DIR)


if __name__ == "__main__":
    main()
