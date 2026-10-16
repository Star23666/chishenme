# -*- coding: utf-8 -*-
"""把生成的图标转成字符画，用来肉眼核对形状是否正确"""

import os
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('gi', os.path.join(HERE, 'gen-icons.py'))
gi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gi)

W, H = 46, 23   # 字符画分辨率（字符高宽比约 2:1，所以宽度取高度的两倍）

for name, fn, label in gi.ICONS:
    print('')
    print('--- %s  (%s.png) ---' % (label, name))
    for ry in range(H):
        line = ''
        for rx in range(W):
            cnt = 0
            for sy in range(3):
                for sx in range(3):
                    u = (rx + (sx + 0.5) / 3.0) / W
                    v = (ry + (sy + 0.5) / 3.0) / H
                    if fn(u, v):
                        cnt += 1
            line += '#' if cnt >= 5 else ('+' if cnt >= 2 else '.')
        print('  ' + line)

# 顺带核对 PNG 文件本身
print('\n--- 文件核对 ---')
d = os.path.join(gi.ROOT, 'yimuzhang', 'images')
files = sorted(os.listdir(d))
assert len(files) == 8, '应该有 8 个文件，实际 %d 个' % len(files)
for f in files:
    p = os.path.join(d, f)
    data = open(p, 'rb').read()
    gi.verify_png(data, p)
    print('  OK  %-20s %5d B' % (f, len(data)))
print('  8 个 PNG 全部通过魔数/尺寸/CRC 校验（81x81, 8位 RGBA）')
