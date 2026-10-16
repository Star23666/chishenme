# -*- coding: utf-8 -*-
"""
一目账 · tabBar 图标生成器

纯 Python 绘制 + 手写 PNG 编码，不依赖 Pillow 等第三方库。
做法：在 6 倍分辨率下逐像素判断「是否在图形内」，再降采样成 81x81，
      得到带抗锯齿的透明 PNG。同一套形状分别上灰色和蓝色，得到普通态和选中态。
"""

import os
import zlib
import struct
import base64

SIZE = 81          # 微信官方推荐 tabBar 图标尺寸
SS = 6             # 超采样倍数（越大边缘越平滑）

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(ROOT, 'yimuzhang', 'images')

NORMAL = (138, 143, 153)   # #8A8F99  与 app.json 的 tabBar.color 一致
ACTIVE = (79, 124, 255)    # #4F7CFF  与 tabBar.selectedColor 一致


# ---------------- 基础图元 ----------------

def inside_rrect(u, v, x0, y0, x1, y1, r):
    """判断点 (u,v) 是否落在圆角矩形内（坐标都是 0~1 的归一化值）"""
    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    hw = max((x1 - x0) / 2.0 - r, 0.0)
    hh = max((y1 - y0) / 2.0 - r, 0.0)
    dx = max(abs(u - cx) - hw, 0.0)
    dy = max(abs(v - cy) - hh, 0.0)
    return dx * dx + dy * dy <= r * r


# ---------------- 四个图标的形状 ----------------

def icon_list(u, v):
    """明细：三条圆头横线"""
    for cy in (0.275, 0.50, 0.725):
        if inside_rrect(u, v, 0.20, cy - 0.05, 0.80, cy + 0.05, 0.05):
            return True
    return False


def icon_add(u, v):
    """记一笔：粗加号"""
    if inside_rrect(u, v, 0.445, 0.16, 0.555, 0.84, 0.055):
        return True
    if inside_rrect(u, v, 0.16, 0.445, 0.84, 0.555, 0.055):
        return True
    return False


def icon_stats(u, v):
    """统计：三根高低不同的柱子"""
    bars = ((0.20, 0.36, 0.58), (0.42, 0.58, 0.40), (0.64, 0.80, 0.22))
    for x0, x1, top in bars:
        if inside_rrect(u, v, x0, top, x1, 0.82, 0.05):
            return True
    return False


def icon_mine(u, v):
    """我的：一个圆头 + 一个半圆肩膀"""
    if (u - 0.5) ** 2 + (v - 0.33) ** 2 <= 0.155 ** 2:
        return True
    if v <= 0.80 and (u - 0.5) ** 2 + (v - 0.80) ** 2 <= 0.275 ** 2:
        return True
    return False


# ---------------- 渲染 ----------------

def coverage(fn):
    """超采样渲染出 alpha 蒙版，返回 SIZE x SIZE 的 0~255 整数矩阵"""
    n = SIZE * SS
    inv = 1.0 / n
    total = float(SS * SS)

    hits = [[0] * SIZE for _ in range(SIZE)]
    for py in range(n):
        v = (py + 0.5) * inv
        row = hits[py // SS]
        for px in range(n):
            u = (px + 0.5) * inv
            if fn(u, v):
                row[px // SS] += 1

    alpha = []
    for y in range(SIZE):
        out = []
        for x in range(SIZE):
            out.append(int(round(hits[y][x] * 255.0 / total)))
        alpha.append(out)
    return alpha


def png_bytes(alpha, rgb):
    """把 alpha 蒙版上色，编码成 RGBA PNG"""
    r, g, b = rgb
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)                      # 每行开头的 filter 字节
        for x in range(SIZE):
            raw += bytes((r, g, b, alpha[y][x]))

    def chunk(typ, data):
        return (struct.pack('>I', len(data)) + typ + data +
                struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff))

    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    out += chunk(b'IEND', b'')
    return out


def verify_png(data, path):
    """自检：校验魔数、IHDR 尺寸、每个 chunk 的 CRC"""
    assert data[:8] == b'\x89PNG\r\n\x1a\n', '魔数不对: ' + path
    pos = 8
    ihdr = None
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        crc = struct.unpack('>I', data[pos + 8 + ln:pos + 12 + ln])[0]
        assert crc == zlib.crc32(typ + body) & 0xffffffff, 'CRC 不对: ' + path
        if typ == b'IHDR':
            ihdr = struct.unpack('>IIBBBBB', body)
        pos += 12 + ln
    assert ihdr is not None, '缺少 IHDR: ' + path
    assert ihdr[0] == SIZE and ihdr[1] == SIZE, '尺寸不对: ' + path
    assert ihdr[2] == 8 and ihdr[3] == 6, '不是 8 位 RGBA: ' + path
    return True


# ---------------- 主流程 ----------------

ICONS = [
    ('tab-list',  icon_list,  '明细'),
    ('tab-add',   icon_add,   '记一笔'),
    ('tab-stats', icon_stats, '统计'),
    ('tab-mine',  icon_mine,  '我的'),
]


def main():
    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)

    made = []
    for name, fn, label in ICONS:
        alpha = coverage(fn)
        # 统计一下覆盖率，防止画出个空图或全满图
        inked = sum(1 for row in alpha for a in row if a > 128)
        ratio = inked / float(SIZE * SIZE)

        png_normal = png_bytes(alpha, NORMAL)
        png_active = png_bytes(alpha, ACTIVE)

        p1 = os.path.join(OUT_DIR, name + '.png')
        p2 = os.path.join(OUT_DIR, name + '-on.png')
        with open(p1, 'wb') as f:
            f.write(png_normal)
        with open(p2, 'wb') as f:
            f.write(png_active)

        verify_png(png_normal, p1)
        verify_png(png_active, p2)

        made.append((name, label, png_normal, png_active))
        print('  OK  %-12s %-8s  %4d B / %4d B   图形占比 %.1f%%'
              % (name, label, len(png_normal), len(png_active), ratio * 100))

    # 生成一个预览页，方便肉眼确认图标画得对不对
    def b64(b):
        return 'data:image/png;base64,' + base64.b64encode(b).decode('ascii')

    cards = []
    for name, label, pn, pa in made:
        cards.append(
            '<div class="card">'
            '<div class="row">'
            '<img src="%s" width="81" height="81">'
            '<img src="%s" width="81" height="81">'
            '<img src="%s" width="162" height="162" class="big">'
            '<img src="%s" width="162" height="162" class="big">'
            '</div>'
            '<div class="label">%s<span class="fn">%s.png / %s-on.png</span></div>'
            '</div>' % (b64(pn), b64(pa), b64(pn), b64(pa), label, name, name))

    html = '''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<title>一目账 · 图标预览</title>
<style>
body{margin:0;padding:48px 24px;background:#F5F6F8;color:#1F2329;
 font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;}
h1{font-size:22px;font-weight:600;margin:0 0 8px;max-width:900px;margin-left:auto;margin-right:auto;}
p.sub{color:#6b7280;font-size:13.5px;margin:0 auto 36px;max-width:900px;line-height:1.7;}
.grid{display:flex;flex-wrap:wrap;gap:20px;justify-content:center;max-width:900px;margin:0 auto;}
.card{background:#fff;border:1px solid #e6e4de;border-radius:14px;padding:22px 26px;text-align:center;}
.row{display:flex;align-items:flex-end;gap:18px;justify-content:center;height:170px;}
.row img{display:block;}
.big{border-left:1px dashed #e6e4de;padding-left:18px;}
.label{font-size:14px;font-weight:600;margin-top:16px;}
.fn{display:block;font-size:11.5px;color:#9aa0aa;font-weight:400;margin-top:4px;
 font-family:Consolas,monospace;}
</style></head><body>
<h1>一目账 · tabBar 图标预览</h1>
<p class="sub">每个图标有四个：前两个是 81px 原始尺寸（灰色=未选中 / 蓝色=选中），
后两个放大到 162px 方便看清细节。图标是纯代码算出来的，背景透明。</p>
<div class="grid">
''' + '\n'.join(cards) + '''
</div></body></html>'''

    preview = os.path.join(ROOT, '一目账-图标预览.html')
    with open(preview, 'w', encoding='utf-8') as f:
        f.write(html)

    print('\n  生成 8 个 PNG -> %s' % OUT_DIR)
    print('  预览页 -> %s' % preview)


if __name__ == '__main__':
    main()
