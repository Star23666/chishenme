# -*- coding: utf-8 -*-
"""
今天吃啥 · 图片与包体积核对

检查三件事：
  1. 35 张菜品图：数量、命名、格式、尺寸、单张体积、总体积
  2. 10 个 tabBar 图标：数量、PNG 规格、主色是否与 app.json 完全一致、有无抗锯齿
  3. 小程序主包总体积是否安全低于 2MB 上限（微信硬限制，超了传不上去）

运行： python .workbuddy/verify/chishenme/check-images.py
"""

import os
import sys
import json
from collections import Counter

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
APP_DIR = os.path.join(ROOT, 'chishenme')

DISH_DIR = os.path.join(APP_DIR, 'images', 'dishes')
ICON_DIR = os.path.join(APP_DIR, 'images')

DISH_SIZE = 320
DISH_MIN_KB, DISH_MAX_KB = 8, 60
DISH_TOTAL_MB_MAX = 1.5
PACKAGE_MB_MAX = 2.0

MAIN_PACKAGE_EXT = {'.js', '.json', '.wxml', '.wxss', '.wxs', '.jpg', '.jpeg',
                    '.png', '.gif', '.webp', '.svg', '.ttf', '.woff'}

pass_cnt = 0
fail_cnt = 0
failures = []


def ok(name, cond, extra=''):
    global pass_cnt, fail_cnt
    if cond:
        pass_cnt += 1
        print('  \u2713 ' + name)
    else:
        fail_cnt += 1
        failures.append(name + ('  [' + extra + ']' if extra else ''))
        print('  \u2717 ' + name + ('  [' + extra + ']' if extra else ''))


def S(t):
    print('\n' + t)


def rgb_hex(t):
    return '#%02X%02X%02X' % t[:3]


# ==================== 读出菜品清单 ====================

dishes_js = open(os.path.join(APP_DIR, 'data', 'dishes.js'), encoding='utf-8').read()
import re
ids = re.findall(r"id:\s*'([a-z0-9_]+)'", dishes_js)
ids = sorted(set(ids))

# ==================== A. 菜品图 ====================

S('A. 菜品图片')

ok('从 dishes.js 解析出 35 道菜', len(ids) == 35, 'actual=%d' % len(ids))

files = sorted(f for f in os.listdir(DISH_DIR)) if os.path.isdir(DISH_DIR) else []
jpgs = [f for f in files if f.lower().endswith('.jpg')]
ok('dishes 目录下正好 35 个 jpg', len(jpgs) == 35, 'actual=%d' % len(jpgs))

expected = set(i + '.jpg' for i in ids)
actual = set(jpgs)
ok('没有缺失的图片', len(expected - actual) == 0, ', '.join(sorted(expected - actual)))
ok('没有多余的图片', len(actual - expected) == 0, ', '.join(sorted(actual - expected)))

bad_fmt, bad_size, bad_kb = [], [], []
total_bytes = 0
details = []
for i in ids:
    p = os.path.join(DISH_DIR, i + '.jpg')
    if not os.path.exists(p):
        continue
    kb = os.path.getsize(p) / 1024.0
    total_bytes += os.path.getsize(p)
    with Image.open(p) as im:
        if im.format != 'JPEG':
            bad_fmt.append('%s=%s' % (i, im.format))
        if im.size != (DISH_SIZE, DISH_SIZE):
            bad_size.append('%s=%dx%d' % (i, im.size[0], im.size[1]))
    if kb < DISH_MIN_KB or kb > DISH_MAX_KB:
        bad_kb.append('%s=%.1fKB' % (i, kb))
    details.append((i, kb))

ok('全部是 JPEG 格式', len(bad_fmt) == 0, ', '.join(bad_fmt))
ok('全部是 %dx%d' % (DISH_SIZE, DISH_SIZE), len(bad_size) == 0, ', '.join(bad_size))
ok('单张体积都在 %d~%d KB 内' % (DISH_MIN_KB, DISH_MAX_KB), len(bad_kb) == 0, ', '.join(bad_kb))

total_mb = total_bytes / 1024.0 / 1024.0
ok('菜品图总体积 < %.1f MB' % DISH_TOTAL_MB_MAX, total_mb < DISH_TOTAL_MB_MAX,
   '实际 %.2f MB' % total_mb)

avg_kb = total_bytes / 1024.0 / max(len(ids), 1)
print('      菜品图合计 %.1f KB（约 %.2f MB），平均每张 %.1f KB' % (total_bytes / 1024.0, total_mb, avg_kb))

# 极端值的图片单独点出来，方便手工复核
details.sort(key=lambda x: x[1])
print('      最小：%s %.1fKB    最大：%s %.1fKB' % (details[0][0], details[0][1], details[-1][0], details[-1][1]))

# ==================== B. tabBar 图标 ====================

S('B. tabBar 图标')

app_json = json.load(open(os.path.join(APP_DIR, 'app.json'), encoding='utf-8'))
tb = app_json['tabBar']
NORMAL_EXPECT = tb['color'].upper()
ACTIVE_EXPECT = tb['selectedColor'].upper()

ok('app.json 声明了 5 个 tab', len(tb['list']) == 5, 'actual=%d' % len(tb['list']))

icon_paths = []
for it in tb['list']:
    icon_paths.append((it['text'], it['iconPath'], False))
    icon_paths.append((it['text'], it['selectedIconPath'], True))

ok('共 10 个图标文件', len(icon_paths) == 10)


def local(p):
    """把 app.json 里的资源路径（/images/xxx.png，以项目根为根）转成磁盘路径。

    ★ 这个 lstrip('/') 不能省：Windows 上 os.path.join('D:\\proj', '/images/a.png')
      会直接返回 '/images/a.png'（以斜杠开头的段会顶掉前面的目录），
      于是「文件是否存在」会全部误报为不存在。"""
    return os.path.join(APP_DIR, p.lstrip('/').replace('/', os.sep))


# ★ 这些路径必须以 / 开头。不带斜杠时模拟器按「相对当前页面」解析，
#   5 个图标会整排变成「图片加载失败」的碎图，页面文字却完全正常。
no_slash = [p for _, p, _ in icon_paths if not p.startswith('/')]
ok('10 个图标路径都以 / 开头（不带斜杠会渲染成碎图）', len(no_slash) == 0, ', '.join(no_slash))

missing = [p for _, p, _ in icon_paths if not os.path.exists(local(p))]
ok('10 个图标文件都存在', len(missing) == 0, ', '.join(missing))

bad_dim, bad_mode, bad_color, no_aa = [], [], [], []
for label, rel, is_active in icon_paths:
    p = local(rel)
    if not os.path.exists(p):
        continue
    with Image.open(p) as im:
        if im.size != (81, 81):
            bad_dim.append('%s=%dx%d' % (rel, im.size[0], im.size[1]))
        if im.mode != 'RGBA':
            bad_mode.append('%s=%s' % (rel, im.mode))
            continue
        px = list(im.getdata())

    # 不透明像素的主色，必须与 app.json 里的颜色完全一致
    solid = [q[:3] for q in px if q[3] > 200]
    if solid:
        main = Counter(solid).most_common(1)[0][0]
        want = ACTIVE_EXPECT if is_active else NORMAL_EXPECT
        if rgb_hex(main) != want:
            bad_color.append('%s 实际%s 期望%s' % (rel, rgb_hex(main), want))
    else:
        bad_color.append('%s 没有不透明像素' % rel)

    # 抗锯齿：必须存在半透明边缘像素
    semi = sum(1 for q in px if 30 < q[3] < 225)
    if semi < 10:
        no_aa.append('%s 仅%d个' % (rel, semi))

ok('全部是 81x81', len(bad_dim) == 0, ', '.join(bad_dim))
ok('全部是 RGBA', len(bad_mode) == 0, ', '.join(bad_mode))
ok('主色与 app.json 完全一致（未选中 %s / 选中 %s）' % (NORMAL_EXPECT, ACTIVE_EXPECT),
   len(bad_color) == 0, ', '.join(bad_color))
ok('都有抗锯齿半透明边缘', len(no_aa) == 0, ', '.join(no_aa))

# ==================== C. 主包体积 ====================

S('C. 小程序主包体积')

# cloudfunctions 是云函数目录，不是小程序包的一部分（而且 project.config.json 里
# 已经把它加进 packOptions.ignore 了）。如果把它算进主包体积，检查结果会虚高，
# 以后真的逼近 2MB 时就分不清是页面代码的问题还是云函数的。
#
# project.config.json / project.private.config.json 同理，不参与上传。
SKIP_DIRS = {'cloudfunctions'}
SKIP_FILES = {'project.config.json', 'project.private.config.json'}

pkg_bytes = 0
by_ext = {}
skipped_bytes = 0
for dirpath, dirs, fs in os.walk(APP_DIR):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for f in fs:
        ext = os.path.splitext(f)[1].lower()
        if f in SKIP_FILES or ext not in MAIN_PACKAGE_EXT:
            continue
        sz = os.path.getsize(os.path.join(dirpath, f))
        pkg_bytes += sz
        by_ext[ext] = by_ext.get(ext, 0) + sz

for dirpath, _dirs, fs in os.walk(os.path.join(APP_DIR, 'cloudfunctions')):
    for f in fs:
        skipped_bytes += os.path.getsize(os.path.join(dirpath, f))

pkg_mb = pkg_bytes / 1024.0 / 1024.0
ok('主包体积 < %.1f MB' % PACKAGE_MB_MAX, pkg_mb < PACKAGE_MB_MAX,
   '实际 %.2f MB' % pkg_mb)

print('      主包合计 %.1f KB (%.2f MB)，占用上限的 %.0f%%'
      % (pkg_bytes / 1024.0, pkg_mb, pkg_mb / PACKAGE_MB_MAX * 100))
for ext in sorted(by_ext, key=lambda e: -by_ext[e]):
    print('        %-7s %8.1f KB' % (ext, by_ext[ext] / 1024.0))
print('      （另有 %.1f KB 云函数代码，单独部署，不计入主包）' % (skipped_bytes / 1024.0))

# 光靠约定不行，得让它可验证：项目里必须声明云函数目录
proj = json.load(open(os.path.join(APP_DIR, 'project.config.json'), encoding='utf-8'))
ok('project.config.json 声明了 cloudfunctionRoot',
   proj.get('cloudfunctionRoot') == 'cloudfunctions/', str(proj.get('cloudfunctionRoot')))

# ★ 这里有一条踩过的坑，反过来断言：
#   cloudfunctionRoot 本身就已经把云函数目录排除出小程序包了。
#   如果再往 packOptions.ignore 里塞一个 "cloudfunctions"，
#   开发者工具会把整个云函数目录当成「被忽略的资源」，
#   控制台打印 “Ignored by project.config.json packOptions.ignore setting: cloudfunctions/...”，
#   后果是云函数文件在工具里失去正常处理（右键「上传并部署」会出问题）。
#   所以这条检查要求它**不在** ignore 里。
ignored = [i.get('value') for i in proj.get('packOptions', {}).get('ignore', [])]
ok('cloudfunctions 没有被写进 packOptions.ignore（写了反而会让工具忽略云函数文件）',
   'cloudfunctions' not in ignored, ', '.join(str(x) for x in ignored) or '（空）')
ok('云函数入口文件真的存在',
   os.path.exists(os.path.join(APP_DIR, 'cloudfunctions', 'csmMenu', 'index.js')))

# ==================== 汇总 ====================

print('\n' + '=' * 56)
print('  通过 %d 项，失败 %d 项' % (pass_cnt, fail_cnt))
if failures:
    print('\n  失败清单：')
    for f in failures:
        print('    - ' + f)
print('=' * 56)
sys.exit(1 if fail_cnt else 0)
