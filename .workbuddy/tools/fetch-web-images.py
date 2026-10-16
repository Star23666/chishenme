# -*- coding: utf-8 -*-
"""
从维基共享资源 / 中文维基百科收集菜图候选。

为什么用这两个源：
  1) 授权干净 —— CC 或公有领域，不是从菜谱网站扒的带版权图；
  2) 天然无水印 —— 维基不接受水印图；
  3) 能拿到原始大图（我们自己裁方、压缩）。

★ 两条踩过的坑：
  1) 不加限流会被 429 打回来，而且 429 长得像「这道菜没有图」，极易误判。
     → 每次请求之间 sleep，429 退避重试。
  2) 用英文词搜共享资源，对「高峰柠檬鸭」这类地方菜基本无效，
     返回 6 张毫不相干的图，比返回 0 张更危险（会当成有效候选）。
     → 优先用**中文词**搜；英文词只作补充。

用法：
  python fetch-web-images.py probe          只看覆盖率，不下载
  python fetch-web-images.py fetch          下载候选（每道最多 5 张）
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

PROXY = "http://127.0.0.1:7890"
UA = "chishenme-dish-fetcher/1.0 (personal family mini-program)"

OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
)

ROOT = r"D:/新建文件夹/小程序"
CAND_DIR = os.path.join(ROOT, ".workbuddy/tmp/dish-candidates")

# 全局请求节流：维基对匿名调用不友好，宁可慢也别被限流
_LAST = [0.0]
MIN_GAP = 0.75


def api(base, params, tries=4):
    """带节流 + 429 退避的 GET JSON"""
    url = base + "?" + urllib.parse.urlencode(params)
    for attempt in range(tries):
        gap = time.time() - _LAST[0]
        if gap < MIN_GAP:
            time.sleep(MIN_GAP - gap)
        _LAST[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with OPENER.open(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8")), ""
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2.5 * (attempt + 1))
                continue
            return None, "HTTP %s" % e.code
        except Exception as e:
            if attempt == tries - 1:
                return None, str(e)[:60]
            time.sleep(1.5)
    return None, "429 限流重试仍失败"


def wiki_images(title):
    """中文维基：先按标题取，取不到就搜条目再取。返回 url 列表"""
    urls = []
    for t in (title, None):
        params = {
            "action": "query", "format": "json", "redirects": "1",
            "prop": "pageimages", "piprop": "original|thumbnail",
            "pithumbsize": "1600",
        }
        if t:
            params["titles"] = t
        else:
            # 搜条目（用菜名），拿第一个结果
            s, e = api("https://zh.wikipedia.org/w/api.php", {
                "action": "query", "format": "json", "list": "search",
                "srsearch": title, "srlimit": "3", "srnamespace": "0",
            })
            if not s or not (s.get("query") or {}).get("search"):
                break
            hit = s["query"]["search"][0]["title"]
            params["titles"] = hit
        d, err = api("https://zh.wikipedia.org/w/api.php", params)
        if not d:
            break
        for _, pg in ((d.get("query") or {}).get("pages") or {}).items():
            if "missing" in pg:
                continue
            u = (pg.get("original") or {}).get("source") or \
                (pg.get("thumbnail") or {}).get("source")
            if u and u not in urls:
                urls.append(u)
        if urls:
            break
    return urls


def commons_images(term, limit=8):
    """共享资源文件搜索。term 用中文效果远好于英文。"""
    d, err = api("https://commons.wikimedia.org/w/api.php", {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": 'filetype:bitmap %s' % term,
        "gsrnamespace": "6", "gsrlimit": str(limit),
        "prop": "imageinfo", "iiprop": "url|size|mime", "iiurlwidth": "1600",
    })
    if not d:
        return []
    out = []
    for _, pg in ((d.get("query") or {}).get("pages") or {}).items():
        ii = (pg.get("imageinfo") or [{}])[0]
        if not ii.get("url"):
            continue
        if "jpeg" not in (ii.get("mime") or "") and "png" not in (ii.get("mime") or ""):
            continue
        out.append({
            "title": pg.get("title", ""),
            "url": ii.get("thumburl") or ii.get("url"),
            "w": ii.get("width", 0), "h": ii.get("height", 0),
        })
    return out


# (id, 中文名, 共享资源补充检索词)
DISHES = [
    ("gaofengningmengya", "柠檬鸭", "Lemon duck"),
    ("yangshuopijiuyu", "啤酒鱼", "Beer fish"),
    ("lipuyukourou", "芋头扣肉", "Taro pork belly"),
    ("quanzhoucuxueya", "醋血鸭", "Blood duck"),
    ("wuzhouzhibaoji", "纸包鸡", "Paper wrapped chicken"),
    ("suansunchaoniurou", "酸笋炒牛肉", "Sour bamboo shoots beef"),
    ("liuzhouluosifen", "螺蛳粉", "Luosifen"),
    ("guilinmifen", "桂林米粉", "Guilin rice noodles"),
    ("nanninglaoyoufen", "老友粉", "Laoyou fen"),
    ("luosiyajiaobao", "螺蛳鸭脚煲", "Duck feet pot"),
    ("gongchengyoucha", "油茶", "Oil tea"),
    ("shaxiezhidoujiao", "炒豆角", "Fried long beans"),
    ("guangxisuanye", "酸嘢", "Pickled fruit"),
    ("wusenuomifan", "五色糯米饭", "Five color sticky rice"),
    ("wuzhouguilinggao", "龟苓膏", "Guilinggao"),
    ("baiqieji", "白切鸡", "White cut chicken"),
    ("mizhichashao", "叉烧", "Char siu"),
    ("chizhizhengpaigu", "豉汁蒸排骨", "Steamed pork ribs"),
    ("boluogulaorou", "咕噜肉", "Sweet and sour pork"),
    ("baizhuoxia", "白灼虾", "Boiled shrimp"),
    ("luoboniunanbao", "萝卜牛腩", "Beef brisket"),
    ("haoyoushengcai", "蚝油生菜", "Oyster sauce lettuce"),
    ("shangtangwawacai", "娃娃菜", "Baby bok choy"),
    ("suanrongchaoxin", "菜心", "Choy sum"),
    ("ganchaoniuhe", "干炒牛河", "Beef chow fun"),
    ("laweibaozifan", "煲仔饭", "Claypot rice"),
    ("yuntunmian", "云吞面", "Wonton noodles"),
    ("bawanghuapaigutang", "猪骨汤", "Pork bone soup"),
    ("kejianiandoufu", "酿豆腐", "Stuffed tofu"),
    ("yanjuji", "盐焗鸡", "Salt baked chicken"),
    ("meicaikourou", "梅菜扣肉", "Mei cai kou rou"),
    ("chaoshanhaolao", "蚝烙", "Oyster omelette"),
    ("chaoshanlue", "卤鹅", "Braised goose"),
    ("shaguohaixianzhou", "海鲜粥", "Seafood congee"),
    ("shuijingxiajiao", "虾饺", "Har gow"),
    ("mapodoufu", "麻婆豆腐", "Mapo tofu"),
    ("tangculiji", "糖醋里脊", "Sweet sour pork"),
    ("qingjiaorousi", "青椒肉丝", "Shredded pork pepper"),
    ("youmendaxia", "油焖大虾", "Braised prawns"),
    ("hongshaoqiezi", "红烧茄子", "Braised eggplant"),
    ("suanrongkongxincai", "空心菜", "Water spinach"),
    ("muerchaoshanyao", "山药", "Chinese yam"),
    ("xihongshigedatang", "疙瘩汤", "Dough drop soup"),
    ("pidanshourouzhou", "皮蛋瘦肉粥", "Century egg congee"),
    ("liangbanhaidaisi", "海带丝", "Seaweed salad"),
]


def collect(did, cn, en):
    got = []
    for u in wiki_images(cn)[:2]:
        got.append({"url": u, "src": "wiki"})
    for c in commons_images(cn)[:5]:
        got.append({"url": c["url"], "src": "commons", "title": c["title"], "w": c["w"]})
    if len(got) < 3:
        for c in commons_images(en)[:4]:
            got.append({"url": c["url"], "src": "commons-en", "title": c["title"], "w": c["w"]})
    return got


def intitle_images(term, limit=8):
    """★ 高精度检索：只认「文件名里含这个词」的图。

    普通全文搜索会把「阳朔啤酒鱼」匹配到啤酒罐、「恭城油茶」匹配到油茶树 ——
    因为搜索引擎在正文/描述里找词，中餐菜名的歧义又特别大。
    intitle: 把范围压到文件名，凡命中基本都是真人特意命名的这张菜的图，
    精度高一个量级（代价是召回少）。
    """
    d, err = api("https://commons.wikimedia.org/w/api.php", {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": 'filetype:bitmap intitle:"%s"' % term,
        "gsrnamespace": "6", "gsrlimit": str(limit),
        "prop": "imageinfo", "iiprop": "url|size|mime", "iiurlwidth": "1600",
    })
    if not d:
        return []
    out = []
    for _, pg in ((d.get("query") or {}).get("pages") or {}).items():
        ii = (pg.get("imageinfo") or [{}])[0]
        if not ii.get("url"):
            continue
        if "jpeg" not in (ii.get("mime") or "") and "png" not in (ii.get("mime") or ""):
            continue
        out.append({
            "title": pg.get("title", ""),
            "url": ii.get("thumburl") or ii.get("url"),
            "w": ii.get("width", 0), "h": ii.get("height", 0),
        })
    return out


def precise():
    """高精度补一轮：只收文件名里带菜名的图，存成 wNN.jpg"""
    os.makedirs(CAND_DIR, exist_ok=True)
    total_new = 0
    for did, cn, en in DISHES:
        d = os.path.join(CAND_DIR, did)
        os.makedirs(d, exist_ok=True)
        hits, seen = [], set()
        for term in (cn, en):
            for c in intitle_images(term, 8):
                if c["url"] not in seen:
                    seen.add(c["url"])
                    hits.append(c)
        saved = 0
        for i, g in enumerate(hits[:8]):
            ext = ".png" if g["url"].lower().split("?")[0].endswith(".png") else ".jpg"
            path = os.path.join(d, "w%02d%s" % (i + 1, ext))
            try:
                req = urllib.request.Request(g["url"], headers={"User-Agent": UA})
                with OPENER.open(req, timeout=60) as r:
                    data = r.read()
                if len(data) < 4000:
                    continue
                with open(path, "wb") as f:
                    f.write(data)
                saved += 1
            except Exception as e:
                print("    ! %s %s" % (g["url"][:50], str(e)[:40]))
        total_new += saved
        print("  %-22s %-12s 名字命中 %d 张" % (did, cn, saved))
    print("-" * 58)
    print("高精度补入 %d 张" % total_new)


def probe():
    ok, none = [], []
    for did, cn, en in DISHES:
        got = collect(did, cn, en)
        good = [g for g in got if g.get("w", 1600) >= 600]
        if good:
            ok.append((did, cn, len(good)))
            print("  %-22s %-12s 候选 %d" % (did, cn, len(good)))
        else:
            none.append((did, cn))
            print("  %-22s %-12s ★ 无" % (did, cn))
    print("-" * 58)
    print("有候选 %d 道 / 无候选 %d 道（共 %d）" % (len(ok), len(none), len(DISHES)))
    print("无候选：" + "、".join(n[1] for n in none))


def fetch():
    os.makedirs(CAND_DIR, exist_ok=True)
    manifest = {}
    for did, cn, en in DISHES:
        got = collect(did, cn, en)[:5]
        d = os.path.join(CAND_DIR, did)
        os.makedirs(d, exist_ok=True)
        saved = []
        for i, g in enumerate(got):
            ext = ".png" if g["url"].lower().split("?")[0].endswith(".png") else ".jpg"
            path = os.path.join(d, "%02d%s" % (i + 1, ext))
            try:
                req = urllib.request.Request(g["url"], headers={"User-Agent": UA})
                with OPENER.open(req, timeout=60) as r:
                    data = r.read()
                if len(data) < 4000:
                    continue
                with open(path, "wb") as f:
                    f.write(data)
                saved.append({"file": os.path.basename(path), "src": g.get("src"),
                              "title": g.get("title", ""), "bytes": len(data)})
            except Exception as e:
                print("    ! 下载失败 %s %s" % (g["url"][:60], str(e)[:40]))
        manifest[did] = {"cn": cn, "files": saved}
        print("  %-22s %-12s 存下 %d 张" % (did, cn, len(saved)))
    mf = os.path.join(CAND_DIR, "manifest.json")
    with open(mf, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("-" * 58)
    print("候选存到：" + CAND_DIR)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "probe"
    {"probe": probe, "fetch": fetch, "precise": precise}.get(cmd, probe)()
