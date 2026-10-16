# -*- coding: utf-8 -*-
"""
菜品图批量处理：原始竖版大图 -> 小程序可直接用的正方形压缩图

输入：chishenme-raw/<dishId>/<dishId>.png        (1024x1536，右下角自带 AI 水印)
输出：chishenme/images/dishes/<dishId>.jpg       (320x320, JPEG q82)

两个关键设计：
  1) 居中裁成正方形 —— 竖版图的水印在底部条带，居中裁切后正好被裁掉，成品无水印。
  2) 用 JPEG 而非 PNG —— 320px 照片型 PNG 约 100KB+，35 张会顶爆小程序主包 2MB 上限；
     JPEG q82 同尺寸约 20~30KB，35 张约 0.9MB，留足余量。

用法：python process-dishes.py
"""
import os
from PIL import Image

ROOT = r"D:/新建文件夹/小程序"
RAW = os.path.join(ROOT, "chishenme-raw")
OUT_DIR = os.path.join(ROOT, "chishenme/images/dishes")

OUT_SIZE = 320
QUALITY = 82


def find_raw(dish_id):
    d = os.path.join(RAW, dish_id)
    if not os.path.isdir(d):
        return None
    for fn in sorted(os.listdir(d)):
        if fn.lower().endswith(".png"):
            return os.path.join(d, fn)
    return None


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
