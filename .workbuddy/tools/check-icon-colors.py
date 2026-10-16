# -*- coding: utf-8 -*-
"""解码生成的 PNG，逐个核对尺寸、颜色、透明通道、抗锯齿"""

import os
import json
import zlib
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
PROJ = os.path.join(ROOT, 'yimuzhang')
IMG = os.path.join(PROJ, 'images')


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', '魔数错误 ' + path
    pos = 8
    idat = b''
    w = h = ct = None
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        crc = struct.unpack('>I', data[pos + 8 + ln:pos + 12 + ln])[0]
        assert crc == zlib.crc32(typ + body) & 0xffffffff, 'CRC 错误 ' + path
        if typ == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', body[:10])
            assert bd == 8, '位深不是 8'
        elif typ == b'IDAT':
            idat += body
        pos += 12 + ln

    raw = zlib.decompress(idat)
    stride = w * 4
    rows = []
    for y in range(h):
        f = raw[y * (stride + 1)]
        assert f == 0, '期望 filter 0，实际 %d' % f
        rows.append(raw[y * (stride + 1) + 1: y * (stride + 1) + 1 + stride])
    return w, h, ct, rows


def analyze(path):
    w, h, ct, rows = read_png(path)
    assert ct == 6, '不是 RGBA(颜色类型应为 6)，实际 %d' % ct

    full = {}       # 完全不透明像素的颜色计数
    partial = 0     # 半透明像素（抗锯齿证据）
    transparent = 0
    for row in rows:
        for x in range(w):
            r, g, b, a = row[x * 4:x * 4 + 4]
            if a == 0:
                transparent += 1
            elif a == 255:
                full[(r, g, b)] = full.get((r, g, b), 0) + 1
            else:
                partial += 1
    return w, h, full, partial, transparent


cfg = json.load(open(os.path.join(PROJ, 'app.json'), encoding='utf-8'))
tab = cfg['tabBar']

def hex2rgb(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))

NORMAL = hex2rgb(tab['color'])
ACTIVE = hex2rgb(tab['selectedColor'])
print('app.json 里声明的颜色：未选中 %s -> %s   选中 %s -> %s'
      % (tab['color'], NORMAL, tab['selectedColor'], ACTIVE))
print('')

ok = True
for item in tab['list']:
    for key, expect, tag in (('iconPath', NORMAL, '未选中'),
                             ('selectedIconPath', ACTIVE, '选中')):
        rel = item[key]
        p = os.path.join(PROJ, rel)
        w, h, full, partial, transparent = analyze(p)

        # 主色应当是唯一的实色，且与配置一致
        main = max(full.items(), key=lambda kv: kv[1])[0] if full else None
        solid = len(full)
        color_ok = (main == expect) and (solid == 1)

        if not (w == 81 and h == 81 and color_ok and partial > 0 and transparent > 0):
            ok = False

        print('%-22s %dx%d  主色 %-16s %s  实色种类 %d  半透明像素 %-4d  全透明像素 %-5d %s'
              % (rel, w, h, str(main), 'OK ' if color_ok else 'BAD', solid,
                 partial, transparent, tag))

print('')
print('全部通过' if ok else '存在问题')
