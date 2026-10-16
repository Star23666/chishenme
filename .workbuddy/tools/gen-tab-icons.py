# -*- coding: utf-8 -*-
"""
今天吃啥 · tabBar 图标生成器（5 个图标 × 2 态 = 10 个 PNG）

沿用「一目账」那套做法：纯 Python 逐像素判断 + 手写 PNG 编码，不依赖第三方库。
6 倍超采样再降采样，得到带抗锯齿的透明 PNG。

形状：
  菜库   -> 四宫格
  点菜   -> 一只碗
  菜单   -> 一张清单
  摇一摇 -> 骰子
  收藏   -> 心形
"""

import os
import zlib
import struct
import base64

SIZE = 81          # 微信官方推荐 tabBar 图标尺寸
SS = 6             # 超采样倍数

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(ROOT, 'chishenme', 'images')

NORMAL = (138, 143, 153)   # #8A8F99  与 app.json 的 tabBar.color 一致
ACTIVE = (255, 112, 67)    # #FF7043  与 tabBar.selectedColor 一致


# ---------------- 基础图元 ----------------

def inside_rrect(u, v, x0, y0, x1, y1, r):
    """点 (u,v) 是否落在圆角矩形内（坐标均为 0~1 归一化值）"""
    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    hw = max((x1 - x0) / 2.0 - r, 0.0)
    hh = max((y1 - y0) / 2.0 - r, 0.0)
    dx = max(abs(u - cx) - hw, 0.0)
    dy = max(abs(v - cy) - hh, 0.0)
    return dx * dx + dy * dy <= r * r


def inside_circle(u, v, cx, cy, r):
    return (u - cx) ** 2 + (v - cy) ** 2 <= r * r


def inside_tri(u, v, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1 = sign((u, v), a, b)
    d2 = sign((u, v), b, c)
    d3 = sign((u, v), c, a)
    neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (neg and pos)


# ---------------- 五个图标的形状 ----------------

def icon_library(u, v):
    """菜库：四宫格，代表一整个菜品集合"""
    for x0 in (0.13, 0.53):
        for y0 in (0.13, 0.53):
            if inside_rrect(u, v, x0, y0, x0 + 0.34, y0 + 0.34, 0.075):
                return True
    return False


def icon_order(u, v):
    """点菜：一只碗（上沿横条 + 下半圆）"""
    if inside_rrect(u, v, 0.07, 0.335, 0.93, 0.445, 0.055):
        return True
    if v >= 0.44 and inside_circle(u, v, 0.5, 0.44, 0.36):
        return True
    return False


def icon_menu(u, v):
    """菜单：一张清单（外框 + 三条横线）"""
    if inside_rrect(u, v, 0.19, 0.09, 0.81, 0.91, 0.11) \
            and not inside_rrect(u, v, 0.26, 0.16, 0.74, 0.84, 0.06):
        return True
    for cy in (0.33, 0.50, 0.67):
        if inside_rrect(u, v, 0.33, cy - 0.035, 0.67, cy + 0.035, 0.035):
            return True
    return False


def icon_random(u, v):
    """摇一摇：骰子（圆角方框 + 五个点）"""
    if inside_rrect(u, v, 0.10, 0.10, 0.90, 0.90, 0.16) \
            and not inside_rrect(u, v, 0.185, 0.185, 0.815, 0.815, 0.09):
        return True
    for cx, cy in ((0.30, 0.30), (0.70, 0.30), (0.50, 0.50), (0.30, 0.70), (0.70, 0.70)):
        if inside_circle(u, v, cx, cy, 0.068):
            return True
    return False


def icon_fav(u, v):
    """收藏：心形（两个圆 + 一个倒三角）"""
    if inside_circle(u, v, 0.30, 0.33, 0.175):
        return True
    if inside_circle(u, v, 0.70, 0.33, 0.175):
        return True
    return inside_tri(u, v, (0.5, 0.90), (0.115, 0.42), (0.885, 0.42))


# ---------------- 渲染 ----------------

def coverage(fn):
    """超采样渲染 alpha 蒙版，返回 SIZE x SIZE 的 0~255 整数矩阵"""
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

    return [[int(round(hits[y][x] * 255.0 / total)) for x in range(SIZE)] for y in range(SIZE)]


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
    """自检：魔数、IHDR 尺寸、每个 chunk 的 CRC"""
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
    ('tab-library', icon_library, '菜库'),
    ('tab-order',   icon_order,   '点菜'),
    ('tab-menu',    icon_menu,    '菜单'),
    ('tab-random',  icon_random,  '摇一摇'),
    ('tab-fav',     icon_fav,     '收藏'),
]


def ascii_art(alpha, w=27):
    """把图标打成字符画，方便直接肉眼核对形状对不对"""
    lines = []
    for y in range(0, SIZE, 3):
        line = ''
        for x in range(0, SIZE, 1):
            a = alpha[y][x]
            line += '#' if a > 170 else ('+' if a > 60 else '.')
        lines.append(line)
    return '\n'.join(lines)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    made = []
    for name, fn, label in ICONS:
        alpha = coverage(fn)
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
        print('  OK  %-12s %-6s %4d B / %4d B   图形占比 %.1f%%'
              % (name, label, len(png_normal), len(png_active), ratio * 100))

    # 字符画自检
    print('\n----- 形状字符画（# 实心 / + 半透明边缘）-----')
    for name, fn, label in ICONS:
        print('\n[%s] %s' % (label, name))
        print(ascii_art(coverage(fn)))

    # 预览页
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
<title>今天吃啥 · 图标预览</title>
<style>
body{margin:0;padding:48px 24px;background:#F5F6F8;color:#1F2329;
 font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;}
h1{font-size:22px;font-weight:600;margin:0 auto 8px;max-width:980px;}
p.sub{color:#6b7280;font-size:13.5px;margin:0 auto 36px;max-width:980px;line-height:1.7;}
.grid{display:flex;flex-wrap:wrap;gap:20px;justify-content:center;max-width:980px;margin:0 auto;}
.card{background:#fff;border:1px solid #e6e4de;border-radius:14px;padding:22px 26px;text-align:center;}
.row{display:flex;align-items:flex-end;gap:18px;justify-content:center;height:170px;}
.row img{display:block;}
.big{border-left:1px dashed #e6e4de;padding-left:18px;}
.label{font-size:14px;font-weight:600;margin-top:16px;}
.fn{display:block;font-size:11.5px;color:#9aa0aa;font-weight:400;margin-top:4px;
 font-family:Consolas,monospace;}
</style></head><body>
<h1>今天吃啥 · tabBar 图标预览</h1>
<p class="sub">每个图标四个：前两个 81px 原始尺寸（灰=未选中 / 橙=选中），后两个放大到 162px 看细节。纯代码生成，背景透明。</p>
<div class="grid">
''' + '\n'.join(cards) + '''
</div></body></html>'''

    preview = os.path.join(ROOT, '今天吃啥-图标预览.html')
    with open(preview, 'w', encoding='utf-8') as f:
        f.write(html)

    print('\n  生成 10 个 PNG -> %s' % OUT_DIR)
    print('  预览页 -> %s' % preview)


if __name__ == '__main__':
    main()
