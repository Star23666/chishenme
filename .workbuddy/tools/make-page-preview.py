# -*- coding: utf-8 -*-
"""
今天吃啥 · 5 个页面的高保真预览
把 WXSS 的值按 750rpx = 375px 换算成 px，配上真实的菜品图和 tabBar 图标，
生成一张可以直接看的 HTML，用于在打开开发者工具之前先确认设计。
"""
import os
import base64

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))   # .workbuddy/tools -> 项目根
APP = os.path.join(ROOT, 'chishenme')


def img(rel):
    p = os.path.join(APP, rel)
    if not os.path.exists(p):
        return ''
    with open(p, 'rb') as f:
        mime = 'image/png' if p.endswith('.png') else 'image/jpeg'
        return 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode())


D = {i: img('images/dishes/%s.jpg' % i) for i in [
    'hongshaorou', 'tangcupaigu', 'gongbaojiding', 'kelejichi', 'fanqiechaodan',
    'yuxiangrousi', 'suanrongxilanhua', 'fanqiedantang', 'danchaofan']}

ICON_OFF = {n: img('images/tab-%s.png' % n) for n in ['library', 'order', 'menu', 'random', 'fav']}
ICON_ON = {n: img('images/tab-%s-on.png' % n) for n in ['library', 'order', 'menu', 'random', 'fav']}
TABS = [('library', '菜库'), ('order', '点菜'), ('menu', '菜单'), ('random', '摇一摇'), ('fav', '收藏')]


def tabbar(active):
    out = '<div class="tabbar">'
    for key, label in TABS:
        on = (key == active)
        out += ('<div class="tab"><img src="%s"><span style="color:%s">%s</span></div>'
                % (ICON_ON[key] if on else ICON_OFF[key],
                   '#FF7043' if on else '#8A8F99', label))
    return out + '</div>'


def nav(title):
    return '<div class="nav">%s</div>' % title


def phone(title, active, body, note, overlay='', with_tabs=True, nav_text=None):
    tabs = tabbar(active) if with_tabs else ''
    return ('<div class="col"><div class="caption">%s</div>'
            '<div class="phone">%s<div class="body">%s</div>%s%s</div>'
            '<div class="note">%s</div></div>'
            % (title, nav(nav_text or title), body, overlay, tabs, note))


# ---------------- 页面 1：菜库 ----------------
CATS = ['全部', '荤菜', '素菜', '汤羹', '主食', '凉菜']
catbar = '<div class="catbar">' + ''.join(
    '<span class="cat %s">%s</span>' % ('on' if i == 0 else '', c)
    for i, c in enumerate(CATS)) + '</div>'

cards = [('红烧肉', '五花肉', D['hongshaorou']), ('糖醋排骨', '猪肋排', D['tangcupaigu']),
         ('宫保鸡丁', '鸡腿肉、花生米', D['gongbaojiding']), ('可乐鸡翅', '鸡中翅', D['kelejichi']),
         ('番茄炒蛋', '番茄、鸡蛋', D['fanqiechaodan']), ('鱼香肉丝', '猪里脊、木耳、胡萝卜', D['yuxiangrousi'])]
grid = '<div class="dgrid">'
for i, (n, m, src) in enumerate(cards):
    star = '<div class="favdot">★</div>' if i in (0, 3) else ''
    grid += ('<div class="dcard"><div class="dimgwrap"><img src="%s">%s</div>'
             '<div class="dmeta"><div class="dname">%s</div><div class="dmain">%s</div></div></div>'
             % (src, star, n, m))
grid += '</div><div class="tip">长按菜品可收藏 / 取消收藏 · 本菜库共 35 道</div>'
page1 = catbar + grid

# ---------------- 页面 2：点菜 ----------------
order_rows = [
    ('荤菜', [('红烧肉', D['hongshaorou'], '少放辣', 1), ('可乐鸡翅', D['kelejichi'], '', 0)]),
    ('素菜', [('蒜蓉西兰花', D['suanrongxilanhua'], '', 1)]),
    ('汤羹', [('番茄蛋汤', D['fanqiedantang'], '', 1)]),
    ('主食', [('蛋炒饭', D['danchaofan'], '多做一份', 2)]),
]
o = '<div class="ohead"><span class="onum">4</span><span class="otxt">道菜已选 · 共 5 份</span></div>'
for gname, rows in order_rows:
    o += '<div class="sectitle">%s</div><div class="rows">' % gname
    for n, src, note, qty in rows:
        stepper = ('<div class="stbtn">−</div><div class="stnum">%d</div>' % qty) if qty else ''
        o += ('<div class="orow"><img src="%s"><div class="omid"><div class="oname">%s</div>'
              '<div class="%s">%s</div></div><div class="stepper">%s<div class="stbtn plus">＋</div></div></div>'
              % (src, n, 'onote' if note else 'onoteempty', note or '加备注', stepper))
    o += '</div>'
o += '<div class="floatspace"></div>'
page2 = o
FLOATBAR = '<div class="floatbar"><span>已选 4 种 · 5 份</span><b>看菜单 →</b></div>'

# ---------------- 页面 3：今日菜单 ----------------
hero = ('<div class="hero"><div class="herodate">今天 · 周四</div>'
        '<div class="herotitle">今天吃这些</div><div class="herostats">'
        + ''.join('<div class="hs"><b>%s</b><i>%s</i></div>' % (v, k)
                  for v, k in [(5, '共几道'), (2, '荤菜'), (1, '素菜'), (1, '汤羹'), (1, '主食'), (0, '凉菜')])
        + '</div></div>')
mitems = [('红烧肉', '荤菜', '备注：少放辣', 1, D['hongshaorou'], '爸爸'),
          ('蒜蓉西兰花', '素菜', '', 1, D['suanrongxilanhua'], '妈妈'),
          ('番茄蛋汤', '汤羹', '', 1, D['fanqiedantang'], '爸爸、奶奶'),
          ('蛋炒饭', '主食', '', 2, D['danchaofan'], '小明')]
ml = '<div class="mlist">'
for n, c, note, q, src, by in mitems:
    qx = '<span class="mqty"> ×%d</span>' % q if q > 1 else ''
    nt = '<div class="mnote">%s</div>' % note if note else ''
    byt = '<div class="mby">%s 点的</div>' % by
    ops = ('<div class="mops"><div class="mobtn">减一份</div><div class="mobtn mdel">移除</div></div>'
           if q > 1 else '<div class="mops"><div class="mobtn mdel">移除</div></div>')
    ml += ('<div class="mitem"><img src="%s"><div class="mmid"><div class="mname">%s%s</div>'
           '<div class="mcat">%s</div>%s%s</div>%s</div>' % (src, n, qx, c, byt, nt, ops))
ml += '</div>'
ml += ('<div class="ops"><div class="opbtn">复制菜单文字</div>'
       '<div class="opbtn opshare">转发给家人</div>'
       '<div class="opbtn opdanger">清空菜单</div></div>')
# 家庭状态条：只在配了云开发时出现
FBAR = ('<div class="fbar"><div class="fbarl"><span class="fbardot"></span>'
        '<span>老王家 · 3 人共享</span></div><div class="fbarr">K7M2QP ›</div></div>')
page3 = hero + FBAR + ml

# ---------------- 页面 4：摇一摇 ----------------
r = ('<div class="modebar"><div class="modeitem on">随机一道</div>'
     '<div class="modeitem">三菜一汤</div></div>'
     + catbar.replace('class="cat ', 'class="cat ') +
     '<div class="stage"><div class="rcard"><img class="rcimg" src="%s">'
     '<div class="rcname">糖醋排骨</div><div class="rccat">荤菜 · 猪肋排</div>'
     '<div class="rctips">排骨先焯后炸，糖醋汁按 1:2:3 收浓</div></div></div>'
     '<div class="actions"><div class="bigbtn">再摇一次</div>'
     '<div class="subactions"><div class="subbtn">加入菜单</div>'
     '<div class="subbtn subdark">看菜单</div></div></div>') % D['tangcupaigu']
page4 = r

# ---------------- 页面 5：收藏 ----------------
favs = [('红烧肉', '荤菜 · 五花肉', D['hongshaorou']), ('可乐鸡翅', '荤菜 · 鸡中翅', D['kelejichi']),
        ('番茄炒蛋', '荤菜 · 番茄、鸡蛋', D['fanqiechaodan']), ('宫保鸡丁', '荤菜 · 鸡腿肉、花生米', D['gongbaojiding'])]
fg = '<div class="sectitle">已收藏 4 道 · 全库共 35 道</div><div class="dgrid">'
for n, sub, src in favs:
    fg += ('<div class="fcard"><img src="%s"><div class="fname">%s</div><div class="fsub">%s</div>'
           '<div class="fops"><div class="fbtn">取消收藏</div>'
           '<div class="fbtn fadd">加入菜单</div></div></div>' % (src, n, sub))
fg += '</div>'
page5 = fg

# ---------------- 页面 6：一起点菜（未进房间） ----------------
p6a = ('<div class="tabs2"><div class="tab2 on">建一个家</div>'
       '<div class="tab2">加入家人的房间</div></div>'
       '<div class="p6card">'
       '<div class="lbl2">我家叫什么</div>'
       '<div class="inp2">老王家</div>'
       '<div class="lbl2">我在家里的称呼</div>'
       '<div class="inp2">爸爸</div>'
       '<div class="btnp">创建房间</div>'
       '<div class="hint2">创建后会生成一个 6 位房间码，把它告诉家人，'
       '他们就能进来一起点菜。</div></div>')

# ---------------- 页面 7：一起点菜（已在房间里） ----------------
p6b = ('<div class="roomcard"><div class="roomname">老王家</div>'
       '<div class="roomsub">把它告诉家人，他们输一次就进来了</div>'
       '<div class="codebadge">K7M2QP</div>'
       '<div class="roomops"><div class="op2">复制房间码</div>'
       '<div class="op2 op2share">转发邀请</div></div></div>'
       '<div class="p6card mecard"><div class="meleft"><div class="melbl">我在家里的称呼</div>'
       '<div class="mename">爸爸</div></div><div class="meop">修改</div></div>'
       '<div class="sectitle">家里人（3/15）</div>'
       '<div class="mems2">'
       '<div class="mem2"><div class="mavatar">爸</div><div class="mname2">爸爸</div>'
       '<div class="mtag mtagme">我</div><div class="mtag">房主</div></div>'
       '<div class="mem2"><div class="mavatar">妈</div><div class="mname2">妈妈</div></div>'
       '<div class="mem2"><div class="mavatar">明</div><div class="mname2">小明</div></div>'
       '</div>'
       '<div class="p6card"><div class="btnp">去看今天的菜单</div>'
       '<div class="btng">退出这个房间</div></div>')

# ---------------- 组装 ----------------
CSS = '''
*{box-sizing:border-box;margin:0;padding:0}
body{background:#EDEFF3;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
 color:#1F2329;padding:36px 24px 60px}
h1{font-size:22px;font-weight:700;text-align:center;margin-bottom:6px}
.sub{text-align:center;color:#8A8F99;font-size:13px;margin-bottom:30px;line-height:1.7}
.row{display:flex;gap:26px;justify-content:center;flex-wrap:wrap;align-items:flex-start}
.col{width:320px}
.caption{font-size:14px;font-weight:700;margin-bottom:10px;color:#FF7043;text-align:center}
.note{font-size:11.5px;color:#8A8F99;text-align:center;margin-top:10px;line-height:1.6}
.phone{width:320px;height:640px;background:#F5F6F8;border-radius:26px;overflow:hidden;
 box-shadow:0 6px 26px rgba(0,0,0,.13);display:flex;flex-direction:column;position:relative}
.nav{background:#FF7043;color:#fff;font-size:15px;font-weight:600;text-align:center;
 padding:12px 0;flex-shrink:0}
.body{flex:1;overflow-y:auto}
.body::-webkit-scrollbar{display:none}
.body{scrollbar-width:none}

/* 通用 */
.sectitle{padding:14px 15px 7px;font-size:13px;color:#8A8F99}
.catbar{background:#fff;padding:8px 0;border-bottom:1px solid #EEF0F4;white-space:nowrap;
 overflow-x:auto;flex-shrink:0}
.cat{display:inline-block;padding:6px 15px;margin-left:10px;font-size:13.5px;color:#5A6070;
 background:#F2F3F6;border-radius:999px}
.cat.on{background:#FF7043;color:#fff;font-weight:600}

/* tabbar */
.tabbar{height:52px;background:#fff;border-top:1px solid #E9EBEF;display:flex;flex-shrink:0}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.tab img{width:22px;height:22px;display:block}
.tab span{font-size:10px}

/* 菜库 */
.dgrid{display:flex;flex-wrap:wrap;padding:7px 5px 0}
.dcard{width:calc(50% - 10px);margin:5px;background:#fff;border-radius:10px;overflow:hidden}
.dimgwrap{position:relative}
.dcard img{width:100%;height:158px;object-fit:cover;display:block;background:#F0F1F4}
.favdot{position:absolute;top:7px;right:7px;width:23px;height:23px;line-height:23px;
 text-align:center;border-radius:50%;background:rgba(255,112,67,.92);color:#fff;font-size:12px}
.dmeta{padding:8px 10px 11px}
.dname{font-size:15px;font-weight:600}
.dmain{font-size:11.5px;color:#9AA0AB;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tip{text-align:center;color:#A6ABB5;font-size:12px;padding:15px 0 8px}

/* 点菜 */
.ohead{background:#FF7043;padding:13px 15px 15px;display:flex;align-items:baseline}
.onum{font-size:28px;font-weight:700;color:#fff}
.otxt{font-size:13px;color:rgba(255,255,255,.9);margin-left:7px}
.rows{background:#fff;margin:0 10px;border-radius:10px;overflow:hidden}
.orow{display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #F2F3F6}
.orow:last-child{border-bottom:none}
.orow img{width:55px;height:55px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#F0F1F4}
.omid{flex:1;min-width:0;padding:0 10px}
.oname{font-size:15px;font-weight:600}
.onote{font-size:11.5px;color:#FF7043;margin-top:4px}
.onoteempty{font-size:11.5px;color:#BFC4CD;margin-top:4px}
.stepper{display:flex;align-items:center;flex-shrink:0}
.stbtn{width:28px;height:28px;line-height:26px;text-align:center;border-radius:50%;
 border:1px solid #FF7043;color:#FF7043;font-size:17px}
.stbtn.plus{background:#FF7043;color:#fff}
.stnum{min-width:28px;text-align:center;font-size:15px;font-weight:600}
.floatspace{height:75px}
.floatbar{position:absolute;left:15px;right:15px;bottom:67px;height:48px;background:#1F2329;
 border-radius:999px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;
 box-shadow:0 4px 14px rgba(0,0,0,.18)}
.floatbar span{color:#fff;font-size:13.5px}
.floatbar b{color:#FFA98A;font-size:14px}

/* 菜单 */
.hero{background:#FF7043;padding:15px 15px 20px}
.herodate{font-size:12px;color:rgba(255,255,255,.85)}
.herotitle{font-size:22px;font-weight:700;color:#fff;margin:5px 0 13px}
.herostats{display:flex;background:rgba(255,255,255,.16);border-radius:9px;padding:10px 0}
.hs{flex:1;text-align:center}
.hs b{display:block;font-size:17px;color:#fff}
.hs i{display:block;font-size:10.5px;color:rgba(255,255,255,.85);font-style:normal;margin-top:2px}
.mlist{background:#fff;margin:10px;border-radius:10px;overflow:hidden}
.mitem{display:flex;align-items:center;padding:11px 12px;border-bottom:1px solid #F2F3F6}
.mitem:last-child{border-bottom:none}
.mitem img{width:60px;height:60px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#F0F1F4}
.mmid{flex:1;min-width:0;padding:0 10px}
.mname{font-size:15.5px;font-weight:600}
.mqty{font-size:12.5px;color:#FF7043;font-weight:600}
.mcat{font-size:11px;color:#9AA0AB;margin-top:4px}
.mnote{font-size:11.5px;color:#FF7043;margin-top:4px}
.mops{flex-shrink:0;text-align:right}
.mobtn{font-size:12px;color:#5A6070;background:#F2F3F6;border-radius:999px;padding:5px 12px;margin-bottom:6px}
.mobtn:last-child{margin-bottom:0}
.mdel{color:#E0483A;background:#FDECEA}
.ops{padding:5px 10px 0}
.opbtn{background:#fff;border-radius:999px;padding:12px 0;text-align:center;font-size:14.5px;
 color:#3A3F4A;margin-bottom:10px}
.opshare{background:#FF7043;color:#fff;font-weight:600}
.opdanger{color:#E0483A}

/* 摇一摇 */
.modebar{display:flex;background:#fff;padding:8px 10px 0;flex-shrink:0}
.modeitem{flex:1;text-align:center;padding:10px 0;font-size:14.5px;color:#8A8F99;
 border-bottom:2px solid transparent}
.modeitem.on{color:#FF7043;font-weight:700;border-bottom-color:#FF7043}
.stage{min-height:320px;display:flex;align-items:center;justify-content:center;padding:20px 15px}
.rcard{width:100%;background:#fff;border-radius:12px;overflow:hidden;padding-bottom:17px}
.rcimg{width:100%;height:260px;object-fit:cover;display:block;background:#F0F1F4}
.rcname{font-size:23px;font-weight:700;text-align:center;margin-top:14px}
.rccat{font-size:12.5px;color:#9AA0AB;text-align:center;margin-top:5px}
.rctips{font-size:13px;color:#5A6070;line-height:1.7;text-align:center;margin:11px 20px 0;
 padding-top:11px;border-top:1px solid #F2F3F6}
.actions{padding:0 20px}
.bigbtn{background:#FF7043;color:#fff;font-size:17px;font-weight:700;text-align:center;
 padding:15px 0;border-radius:999px;letter-spacing:3px}
.subactions{display:flex;margin-top:10px}
.subbtn{flex:1;text-align:center;padding:11px 0;border-radius:999px;background:#fff;
 color:#3A3F4A;font-size:14px;margin-right:10px}
.subbtn:last-child{margin-right:0}
.subdark{background:#1F2329;color:#fff}

/* 收藏 */
.fcard{width:calc(50% - 10px);margin:0 5px 10px;background:#fff;border-radius:10px;overflow:hidden}
.fcard img{width:100%;height:145px;object-fit:cover;display:block;background:#F0F1F4}
.fname{font-size:15px;font-weight:600;padding:8px 10px 0}
.fsub{font-size:11px;color:#9AA0AB;padding:3px 10px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fops{display:flex;padding:9px 10px 11px}
.fbtn{flex:1;text-align:center;font-size:12px;color:#5A6070;background:#F2F3F6;
 border-radius:999px;padding:7px 0;margin-right:6px}
.fbtn:last-child{margin-right:0}
.fadd{background:#FF7043;color:#fff}
/* 家庭状态条 */
.fbar{display:flex;align-items:center;margin:10px 10px 0;padding:11px 14px;background:#FFF8F0;border-radius:8px}
.fbarl{flex:1;display:flex;align-items:center;font-size:13px;color:#5A6070;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fbardot{width:7px;height:7px;border-radius:50%;background:#34C759;margin-right:7px;flex-shrink:0}
.fbarr{flex-shrink:0;font-size:12.5px;color:#FF7043;font-weight:600;margin-left:8px}
.mby{font-size:11.5px;color:#34A853;margin-top:4px}

/* 一起点菜（房间页） */
.tabs2{display:flex;margin:10px 10px 0;background:#EDEFF3;border-radius:999px;padding:3px}
.tab2{flex:1;text-align:center;font-size:13.5px;color:#5A6070;padding:9px 0;border-radius:999px}
.tab2.on{background:#fff;color:#FF7043;font-weight:600}
.p6card{background:#fff;border-radius:10px;margin:10px;padding:17px 15px}
.lbl2{font-size:12.5px;color:#8A8F99;margin:14px 0 7px}
.lbl2:first-child{margin-top:0}
.inp2{background:#F5F6F8;border-radius:8px;padding:12px 13px;font-size:15px;color:#1F2329}
.btnp{background:#FF7043;color:#fff;border-radius:999px;font-size:15px;font-weight:600;
 text-align:center;padding:11px 0;margin-top:20px}
.hint2{font-size:11.5px;color:#A6ABB5;line-height:1.7;margin-top:11px}
.roomcard{margin:10px;padding:22px 15px 15px;text-align:center;border-radius:10px;
 background:linear-gradient(160deg,#FF8A5C 0%,#FF7043 100%)}
.roomname{font-size:20px;font-weight:700;color:#fff}
.roomsub{font-size:12px;color:rgba(255,255,255,.88);margin-top:6px}
.codebadge{display:inline-block;margin:15px 0 5px;padding:10px 23px;background:rgba(255,255,255,.22);
 border-radius:9px;font-family:Menlo,Consolas,monospace;font-size:28px;font-weight:700;
 letter-spacing:5px;color:#fff}
.roomops{display:flex;margin-top:13px}
.op2{flex:1;margin:0 5px;padding:11px 0;border-radius:999px;background:rgba(255,255,255,.24);
 color:#fff;font-size:13.5px;font-weight:600}
.op2share{background:#fff;color:#FF7043}
.mecard{display:flex;align-items:center;padding:14px 15px}
.meleft{flex:1}
.melbl{font-size:11.5px;color:#9AA0AB}
.mename{font-size:16px;font-weight:600;margin-top:4px}
.meop{flex-shrink:0;font-size:13px;color:#FF7043;background:#FFF1EC;border-radius:999px;padding:6px 15px}
.mems2{background:#fff;margin:0 10px;border-radius:10px;overflow:hidden}
.mem2{display:flex;align-items:center;padding:12px 15px;border-bottom:1px solid #F2F3F6}
.mem2:last-child{border-bottom:none}
.mavatar{width:33px;height:33px;line-height:33px;text-align:center;border-radius:50%;
 background:#FFF1EC;color:#FF7043;font-size:14px;font-weight:700;flex-shrink:0}
.mname2{flex:1;padding:0 10px;font-size:15px}
.mtag{flex-shrink:0;font-size:10.5px;color:#8A8F99;background:#F2F3F6;border-radius:999px;padding:3px 9px;
 margin-left:5px}
.mtagme{background:#FF7043;color:#fff}
.btng{margin-top:11px;text-align:center;font-size:13.5px;color:#E0483A;padding:10px 0}
.fcard ~ * {}
'''

html = '''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>今天吃啥 · 页面预览</title>
<style>%s</style></head><body>
<h1>今天吃啥 · 6 个页面高保真预览</h1>
<div class="sub">下面是用<strong>真实菜品图、真实配色、真实尺寸</strong>渲染的静态预览（750rpx 按 375px 换算）。<br>
真机上的字体渲染、点击反馈、滚动会比这个更细腻。这只是给你先看设计。</div>
<div class="row">
%s
</div>
<div class="sub" style="margin-top:26px">
「一起点菜」是从<strong>菜单页顶部那条橙色边状态条</strong>点进去的，不在底部标签里 ——<br>
微信规定 tabBar 最多 5 个标签，所以第 6 个功能只能挂在页面里。
</div>
</body></html>''' % (
    CSS,
    phone('菜库', 'library', page1, '分类筛选 · 卡片网格 · 长按收藏')
    + phone('点菜', 'order', page2, '分组列表 · 加减份数 · 备注', FLOATBAR)
    + phone('菜单', 'menu', page3, '今日清单 · 分类统计 · 「谁点的」· 家庭状态条')
    + phone('摇一摇', 'random', page4, '随机一道 / 三菜一汤')
    + phone('收藏', 'fav', page5, '长按收藏的菜都在这里')
    + phone('一起点菜', None, p6a, '还没进房间：建一个家 / 加入家人的房间',
            with_tabs=False, nav_text='一起点菜')
    + phone('一起点菜', None, p6b, '已在房间里：房间码 · 成员 · 改称呼 · 退出',
            with_tabs=False, nav_text='一起点菜')
)

out = os.path.join(ROOT, '今天吃啥-页面预览.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print('写出', out, '%.0f KB' % (os.path.getsize(out) / 1024.0))
