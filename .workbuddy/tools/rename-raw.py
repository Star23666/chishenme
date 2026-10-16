# -*- coding: utf-8 -*-
"""
把 AI 生图产出的散乱文件，按菜名归位成 chishenme-raw/<dishId>/<dishId>.png

为什么需要它：
  ImageGen 的 output_dir 在并行调用时不会各自生效，所有图会落到同一个目录，
  且文件名是「提示词前若干字 + 时间戳」，很乱。好在文件名里一定包含菜名，
  所以按菜名匹配即可稳定归位。

用法：python rename-raw.py
"""
import os
import shutil

ROOT = r"D:/新建文件夹/小程序"
RAW = os.path.join(ROOT, "chishenme-raw")

# 菜名 -> dishId（长名字放前面，避免「番茄蛋汤」被「番茄」类误伤）
NAME2ID = [
    ("玉米胡萝卜排骨汤", "yumipaigutang"),
    ("蒜蓉粉丝蒸虾", "suanrongfensixia"),
    ("清炒土豆丝", "qingchaotudousi"),
    ("凉拌黄瓜", "liangbanhuanggua"),
    ("拍黄瓜", "liangbanhuanggua"),          # 模型偶尔写成「拍黄瓜」，同一道菜
    ("凉拌木耳", "liangbanmuer"),
    ("白菜猪肉饺子", "jiaozi"),
    ("西红柿鸡蛋面", "xihongshimian"),
    ("土豆炖牛腩", "tudouniunan"),
    ("干煸四季豆", "ganbiansijidou"),
    ("蒜蓉西兰花", "suanrongxilanhua"),
    ("冬瓜排骨汤", "dongguapaigutang"),
    ("紫菜蛋花汤", "zicaidanhuatang"),
    ("清蒸鲈鱼", "qingzhengluyu"),
    ("椒盐排骨", "jiaoyanpaigu"),
    ("糖醋排骨", "tangcupaigu"),
    ("香菇滑鸡", "xiangguhuaji"),
    ("香菇青菜", "xianggujingcai"),
    ("家常豆腐", "jiachangdoufu"),
    ("手撕包菜", "shousibaocai"),
    ("虎皮青椒", "hupiqingjiao"),
    ("醋溜白菜", "culiubaicai"),
    ("宫保鸡丁", "gongbaojiding"),
    ("可乐鸡翅", "kelejichi"),
    ("番茄炒蛋", "fanqiechaodan"),
    ("番茄蛋汤", "fanqiedantang"),
    ("鱼香肉丝", "yuxiangrousi"),
    ("口水鸡", "koushuiji"),
    ("皮蛋豆腐", "pidandoufu"),
    ("葱油拌面", "congyoubanmian"),
    ("手抓饼", "shouzhuabing"),
    ("酸辣汤", "suanlatang"),
    ("蛋炒饭", "danchaofan"),
    ("地三鲜", "disanxian"),
    ("回锅肉", "huiguorou"),
    ("红烧肉", "hongshaorou"),
]
VALID_IDS = {v for _, v in NAME2ID}


def main():
    moved, skipped, unknown = 0, 0, []

    for dirpath, _dirs, files in os.walk(RAW):
        for fn in files:
            if not fn.lower().endswith(".png"):
                continue
            src = os.path.join(dirpath, fn)
            stem = os.path.splitext(fn)[0]

            # 已经是规整命名的，跳过
            if stem in VALID_IDS and os.path.basename(dirpath) == stem:
                skipped += 1
                continue

            hit = None
            for name, did in NAME2ID:
                if name in stem:
                    hit = did
                    break

            if hit is None:
                unknown.append(src)
                continue

            dst_dir = os.path.join(RAW, hit)
            os.makedirs(dst_dir, exist_ok=True)
            dst = os.path.join(dst_dir, hit + ".png")
            shutil.move(src, dst)
            moved += 1
            print("  %-18s <- %s" % (hit, fn))

    print("-" * 60)
    print("归位 %d 个，已规整跳过 %d 个" % (moved, skipped))
    if unknown:
        print("!! 无法识别 %d 个：" % len(unknown))
        for u in unknown:
            print("   " + u)

    have = sorted(d for d in os.listdir(RAW) if os.path.isdir(os.path.join(RAW, d)))
    print("当前已收齐 %d / 35 道：" % len(have))
    print("  " + ", ".join(have))


if __name__ == "__main__":
    main()
