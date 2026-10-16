# -*- coding: utf-8 -*-
"""
把挑中的网图归位到 chishenme-raw/，让 process-dishes.py 能统一处理。

输入：.workbuddy/tmp/dish-picks.json   { "dishId": "候选文件名或绝对路径", ... }

做三件事：
  1. 清空 chishenme-raw/<dishId>/（避免上一轮留下的图被误当成首选素材）；
  2. 原图压到长边 1024px 再存 —— 成品只有 300px，1024 完全够重新出图；
     ★ 不压的话 45 张网图约 34MB，会白撑大公开仓库（原 35 张 AI 图已经有 74MB 了）；
  3. 统一命名为 <dishId>.jpg。

用法：python apply-dish-picks.py
"""
import json
import os
import shutil
import sys

from PIL import Image

ROOT = r"D:/新建文件夹/小程序"
CAND = os.path.join(ROOT, ".workbuddy/tmp/dish-candidates")
RAW = os.path.join(ROOT, "chishenme-raw")
PICKS = os.path.join(ROOT, ".workbuddy/tmp/dish-picks.json")

MAX_SIDE = 1024
QUALITY = 88


def main():
    if not os.path.exists(PICKS):
        print("还没挑图：%s 不存在" % PICKS)
        sys.exit(2)
    picks = json.load(open(PICKS, encoding="utf-8"))

    done, missing, skipped = [], [], []
    for did, ref in sorted(picks.items()):
        # _ 开头是说明字段；__AI__ 表示这道菜走 AI，图已经直接放在 chishenme-raw/ 下了，
        # 归位脚本不要碰它（碰了会把 AI 原图清空）。
        if did.startswith("_"):
            continue
        if not isinstance(ref, str) or ref.startswith("__"):
            skipped.append(did)
            continue
        src = ref if os.path.isabs(ref) else os.path.join(CAND, did, ref)
        if not os.path.exists(src):
            missing.append("%s -> %s" % (did, ref))
            continue
        d = os.path.join(RAW, did)
        # ★ 必须清空：find_raw 取「排序后第一个」，上一轮的旧图会顶掉新选的
        if os.path.isdir(d):
            shutil.rmtree(d)
        os.makedirs(d, exist_ok=True)

        im = Image.open(src).convert("RGB")
        w, h = im.size
        s = min(w, h)
        # 先居中裁方：出图本来就要裁方，先裁掉还能省一次重采样
        im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
        if s > MAX_SIDE:
            im = im.resize((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        dst = os.path.join(d, did + ".jpg")
        im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        done.append((did, os.path.getsize(dst)))

    total = sum(s for _, s in done)
    for did, s in done:
        print("  [OK] %-22s %6.1f KB" % (did, s / 1024.0))
    print("-" * 52)
    print("归位 %d 张，合计 %.1f MB（长边 %dpx / q%d）"
          % (len(done), total / 1024.0 / 1024.0, MAX_SIDE, QUALITY))
    if skipped:
        print("走 AI 生成（已在位，未动）：" + "、".join(skipped))
    if missing:
        print("找不到源文件：")
        for m in missing:
            print("    " + m)


if __name__ == "__main__":
    main()
