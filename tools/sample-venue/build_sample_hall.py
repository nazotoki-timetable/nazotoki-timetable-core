#!/usr/bin/env python3
"""サンプル会場（3 フロアの屋内図と、建物の外の周辺地図）と venue_map.json を生成する。

部屋の並びと通路を簡略化したサンプルの図。画面にもファイルにも、実在の施設名・通りの名前は出さない。
西側の階段は非常階段のため、地図には描くが経路には使わない（階の移動は南階段だけ）。
交流スペース・フリースペースは壁のない広場で、通路と続いている。

建物の外（周辺地図・別館A/B）は OpenStreetMap のデータから作る（tools/outdoor-map/osm_outdoor.py、docs/OUTDOOR_ROUTE.md）。
  - 取得したデータは tools/sample-venue/osm_cache.json に保存（ODbL）。あれば通信しない。名前（name）は保存しない
  - 屋内図は、OSM の本館の形の最小外接長方形に重ねる。正面入口（屋内図の下側）は東向き
  - 本館・別館A・別館B は一般名。周辺地図に通りの名前も描かない
  - 別館の入口は「外壁のうち、いちばん道に近い点」の推定。直すときは tools/sample-venue/doors.json に
    緯度経度を書く（会場マップ編集ツールで点を動かすと、その点の緯度経度が出る）。作り直しても残る

  python3 tools/sample-venue/build_sample_hall.py
出力: public/venues/sample-hall/{1f,2f,3f,outdoor}.svg, public/venues/sample-hall/venue_map.json
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'venues' / 'sample-hall'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / 'tools' / 'outdoor-map'))
from osm_outdoor import OutdoorMap  # noqa: E402

W, H = 1720, 1130
FONT = "'Hiragino Sans','Noto Sans JP','Noto Sans CJK JP','IPAGothic',sans-serif"
INK = '#2b2e3a'
WALL = 7
FILL = {'room': '#ffffff', 'stairs': '#eef0f5', 'emergency': '#f1f1ee', 'service': '#f1f1ee', 'void': '#e2e4ec', 'closed': '#cfd2dc'}

# 部屋：(表示名, x0, y0, x1, y1, 種類, 文字の大きさ)
# 通路：(x0, y0, x1, y1)
FLOORS = {
    '1F': {
        'label': '1階',
        'rooms': [
            ('非常階段', 35, 160, 125, 320, 'emergency', 20),
            ('第3会議室', 205, 110, 350, 322, 'room', 40),
            ('第2会議室', 352, 110, 533, 322, 'room', 44),
            ('第1会議室', 536, 110, 717, 322, 'room', 44),
            ('トイレ', 717, 110, 835, 322, 'service', 30),
            ('トイレ', 885, 110, 1085, 255, 'service', 30),
            ('', 705, 367, 835, 518, 'closed', 0),
            ('', 885, 367, 1085, 560, 'closed', 0),
            ('', 1085, 110, 1645, 345, 'closed', 0),
            ('ホール', 1085, 345, 1645, 980, 'room', 72),
            ('EV', 575, 688, 665, 775, 'service', 30),
            ('南階段', 705, 825, 820, 960, 'stairs', 30),
        ],
        'halls': [(125, 322, 835, 367), (125, 110, 205, 322), (835, 255, 885, 520), (705, 518, 1085, 900), (665, 700, 705, 775)],
        'labels': [('ロビー', 930, 760, 40)],
        'entrance': (990, 900),
    },
    '2F': {
        'label': '2階',
        'rooms': [
            ('非常階段', 35, 160, 125, 320, 'emergency', 20),
            ('第5会議室', 125, 107, 369, 314, 'room', 44),
            ('和室2', 369, 107, 512, 314, 'room', 44),
            ('和室1', 512, 107, 717, 314, 'room', 44),
            ('トイレ', 717, 107, 888, 314, 'service', 30),
            ('交流スペース', 888, 107, 1086, 318, 'area', 34),
            ('第4会議室', 706, 364, 888, 618, 'room', 40),
            ('フリースペース', 888, 318, 1086, 515, 'area', 30),
            ('', 961, 515, 1086, 897, 'void', 0),
            ('', 1089, 107, 1647, 1060, 'void', 0),
            ('EV', 573, 686, 661, 773, 'service', 30),
            ('南階段', 703, 810, 821, 957, 'stairs', 30),
        ],
        'halls': [(125, 314, 888, 364), (888, 318, 961, 897), (661, 686, 888, 773), (703, 773, 821, 810)],
        'labels': [],
        'entrance': None,
    },
    '3F': {
        'label': '3階',
        'rooms': [
            ('非常階段', 38, 160, 128, 320, 'emergency', 20),
            ('第9会議室', 205, 110, 350, 320, 'room', 40),
            ('第8会議室', 350, 110, 515, 320, 'room', 40),
            ('第7会議室', 515, 110, 720, 320, 'room', 44),
            ('トイレ', 720, 110, 885, 320, 'service', 30),
            ('', 885, 110, 1085, 365, 'closed', 0),
            ('第6会議室', 790, 575, 885, 775, 'room', 30),
            ('', 885, 367, 1085, 905, 'closed', 0),
            ('', 1088, 107, 1648, 1083, 'void', 0),
            ('EV', 577, 688, 665, 775, 'service', 30),
            ('南階段', 705, 838, 822, 962, 'stairs', 30),
        ],
        'halls': [(128, 320, 885, 367), (128, 110, 205, 320), (705, 367, 790, 838), (665, 700, 705, 775)],
        'labels': [],
        'entrance': None,
    },
}

# 通路網：階ごとの点と線（部屋の点は「入口のすぐ内側」。room は公演の「会場(部屋)」と結び付ける名前）
GRAPH = {
    '1F': {
        'nodes': [
            ('c-w', 165, 345), ('c-3', 278, 345), ('c-2', 442, 345), ('c-1', 626, 345), ('c-e', 860, 345),
            ('l-n', 860, 600), ('l-c', 860, 720), ('l-s', 860, 800), ('h-d', 1060, 720), ('s-in', 762, 800),
        ],
        'rooms': [('r-3', 278, 270, '第3会議室'), ('r-2', 442, 270, '第2会議室'), ('r-1', 626, 270, '第1会議室'), ('r-h', 1150, 720, 'ホール', ['館内全域(受付:ホール)'])],
        'stairs': [('st-s', 762, 890, '南階段')],
        # 建物の出入口（周辺地図の同じ link の点とつながる）
        'entrances': [('ent', 990, 896, '正面入口', 'main-entrance')],
        'edges': [('c-w', 'c-3'), ('c-3', 'c-2'), ('c-2', 'c-1'), ('c-1', 'c-e'), ('c-e', 'l-n'), ('l-n', 'l-c'), ('l-c', 'l-s'),
                  ('l-c', 'h-d'), ('h-d', 'r-h'), ('l-s', 's-in'), ('s-in', 'st-s'),
                  ('c-3', 'r-3'), ('c-2', 'r-2'), ('c-1', 'r-1'), ('ent', 'l-s'), ('ent', 'h-d')],
    },
    '2F': {
        'nodes': [
            ('c-w', 165, 340), ('c-5', 247, 340), ('c-w2', 440, 340), ('c-w1', 615, 340), ('c-e', 925, 340),
            ('p-4', 925, 470), ('p-s', 925, 730), ('ev', 762, 730),
        ],
        'rooms': [('r-5', 247, 262, '第5会議室'), ('r-w2', 440, 262, '和室2'), ('r-w1', 615, 262, '和室1'),
                  ('r-k', 987, 250, '交流スペース'), ('r-f', 1000, 440, 'フリースペース'), ('r-4', 830, 470, '第4会議室')],
        'stairs': [('st-s', 762, 880, '南階段')],
        'edges': [('c-w', 'c-5'), ('c-5', 'c-w2'), ('c-w2', 'c-w1'), ('c-w1', 'c-e'), ('c-e', 'r-k'), ('c-e', 'p-4'), ('p-4', 'r-f'),
                  ('p-4', 'r-4'), ('p-4', 'p-s'), ('p-s', 'ev'), ('ev', 'st-s'),
                  ('c-5', 'r-5'), ('c-w2', 'r-w2'), ('c-w1', 'r-w1')],
    },
    '3F': {
        'nodes': [
            ('c-w', 168, 343), ('c-9', 278, 343), ('c-8', 432, 343), ('c-7', 617, 343), ('c-j', 748, 343),
            ('v-6', 748, 640), ('v-s', 748, 800),
        ],
        'rooms': [('r-9', 278, 268, '第9会議室'), ('r-8', 432, 268, '第8会議室'), ('r-7', 617, 268, '第7会議室'), ('r-6', 836, 640, '第6会議室')],
        'stairs': [('st-s', 763, 890, '南階段')],
        'edges': [('c-w', 'c-9'), ('c-9', 'c-8'), ('c-8', 'c-7'), ('c-7', 'c-j'), ('c-j', 'v-6'), ('v-6', 'r-6'), ('v-6', 'v-s'),
                  ('v-s', 'st-s'), ('c-9', 'r-9'), ('c-8', 'r-8'), ('c-7', 'r-7')],
    },
}


def text(x, y, s, size, color=INK, weight=700, anchor='middle', extra=''):
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{color}" {extra}>{s}</text>'


def svg_floor(spec):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
           f'<rect width="{W}" height="{H}" fill="#e7e9f0"/>',
           '<defs><pattern id="hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
           '<line x1="0" y1="0" x2="0" y2="18" stroke="#c9ccd8" stroke-width="6"/></pattern></defs>']
    for x0, y0, x1, y1 in spec['halls']:
        out.append(f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" fill="#dfe2ea"/>')
    for name, x0, y0, x1, y1, kind, size in spec['rooms']:
        w, h = x1 - x0, y1 - y0
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if kind == 'area':
            # 交流スペース・フリースペース：壁のない、通路と続いた広場
            out.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="#dfe2ea"/>')
            if w < size * len(name) * 1.02 and name.endswith('スペース'):
                out.append(text(cx, cy - size * 0.2, name[:-4], size))
                out.append(text(cx, cy + size * 0.95, 'スペース', size))
            else:
                out.append(text(cx, cy + size * 0.36, name, size))
            continue
        fill = 'url(#hatch)' if kind == 'void' else FILL[kind]
        stroke = '#9a9db0' if kind in ('closed', 'void') else INK
        sw = WALL if kind in ('room', 'stairs') else 4
        out.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
        if not name or not size:
            continue
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        color = INK if kind in ('room', 'stairs') else '#7d8091'
        if kind in ('stairs', 'emergency'):
            for i in range(1, 7):
                yy = y0 + 50 + i * 12
                out.append(f'<line x1="{x0 + 14}" y1="{yy}" x2="{x1 - 14}" y2="{yy}" stroke="{INK}" stroke-width="3" opacity=".5"/>')
            out.append(text(cx, y0 + 38, name, min(size, int(w / len(name) * 0.92)), color))
        elif size and w < size * len(name) * 1.02:
            # 細い部屋は 2 行（例：第3 / 会議室）
            if name.startswith('第'):
                head, tail = name[:2], name[2:]
            elif name.endswith('スペース'):
                head, tail = name[:-4], 'スペース'
            else:
                head, tail = name[: len(name) // 2], name[len(name) // 2:]
            out.append(text(cx, cy - size * 0.2, head, size, color))
            out.append(text(cx, cy + size * 0.95, tail, size, color))
        else:
            out.append(text(cx, cy + size * 0.36, name, size, color))
    for s, x, y, size in spec['labels']:
        out.append(text(x, y, s, size, '#9a9db0'))
    if spec['entrance']:
        ex, ey = spec['entrance']
        out.append(f'<rect x="{ex - 70}" y="{ey - 6}" width="140" height="20" fill="#dfe2ea"/>')
        out.append(f'<path d="M {ex} {ey + 22} l -26 40 h 52 z" fill="{INK}" opacity=".75"/>')
        out.append(text(ex, ey + 98, '正面入口', 32))
    # 階の名前・サンプルの表示（はっきり・常に読める位置に）
    out.append(text(48, 1100, spec['label'], 56, INK, 900, 'start', 'opacity=".22"'))
    # サンプルであることは、右下に灰色の小さな文字で添えるだけ（枠で目立たせない。施設名は出さない）
    out.append(text(W - 36, H - 30, 'この地図はサンプルです', 26, '#9a9db0', 700, 'end'))
    out.append('</svg>\n')
    return '\n'.join(out)


# ─────────── 屋内図と周辺地図の重ね方 ───────────
# 屋内図で建物の外形にあたる四角（3 フロア共通の座標）
OUTLINE = (35, 107, 1647, 980)
OSM_CACHE = ROOT / 'tools' / 'sample-venue' / 'osm_cache.json'
MAIN_WAYS = [254426947]                 # OSM：本館（屋内図の建物）
ANNEX_A_WAYS = [254426981, 254426956]   # OSM：同じ街区の西側の建物（サンプルでは「別館A」）
ANNEX_B_WAYS = [254427011]              # OSM：同じ街区の北西の建物（サンプルでは「別館B」）
DOORS_FILE = ROOT / 'tools' / 'sample-venue' / 'doors.json'


def door_override(m, room):
    """doors.json に緯度経度があれば、その位置（px）。無ければ None（推定を使う）"""
    if not DOORS_FILE.exists():
        return None
    v = json.loads(DOORS_FILE.read_text(encoding='utf-8')).get(room)
    if isinstance(v, dict) and 'lat' in v and 'lon' in v:
        return m.latlon_px(float(v['lat']), float(v['lon']))
    return None


def footprint_of(m):
    """屋内図の OUTLINE を、OSM の本館の最小外接長方形に重ねる。屋内図の下（+y）を東向きの短辺の向きに合わせる"""
    c, (long_px, short_px), _u, v = m.footprint_box(MAIN_WAYS)
    if v[0] < 0:  # 短辺の向きを東向き（+x）に
        v = (-v[0], -v[1])
    theta = math.degrees(math.atan2(-v[0], v[1]))
    return {'floor': 'OUT', 'outline': list(OUTLINE), 'center': [round(c[0], 1), round(c[1], 1)],
            'size': [round(long_px, 1), round(short_px, 1)], 'rotation': round(theta, 2)}


def plan_to_out(fp, x, y):
    """屋内図の座標 → 周辺地図の座標（RouteView のズームと同じ式）"""
    x0, y0, x1, y1 = fp['outline']
    sx, sy = fp['size'][0] / (x1 - x0), fp['size'][1] / (y1 - y0)
    dx, dy = (x - (x0 + x1) / 2) * sx, (y - (y0 + y1) / 2) * sy
    t = math.radians(fp['rotation'])
    return (fp['center'][0] + dx * math.cos(t) - dy * math.sin(t), fp['center'][1] + dx * math.sin(t) + dy * math.cos(t))


def build_outdoor():
    m = OutdoorMap.load(OSM_CACHE, center=(34.6649, 135.4902), radius_m=190, keep_names=False)
    m.set_view(MAIN_WAYS + ANNEX_A_WAYS + ANNEX_B_WAYS, margin_m=42)
    fp = footprint_of(m)
    ex, ey = GRAPH['1F']['entrances'][0][1:3]
    door_main = plan_to_out(fp, ex, ey + 6)
    door_a = door_override(m, '別館A') or m.door_of(ANNEX_A_WAYS)
    door_b = door_override(m, '別館B') or m.door_of(ANNEX_B_WAYS)
    m.add_point('out-ent-main', door_main, kind='entrance', name='本館 正面入口', link='main-entrance')
    m.add_point('out-r-a', door_a, room='別館A', note='本館の裏手・西側の通り沿い')
    m.add_point('out-r-b', door_b, room='別館B', note='西側の通り沿い・北の角の近く')
    m.set_focus(MAIN_WAYS + ANNEX_A_WAYS + ANNEX_B_WAYS, margin_m=12)
    svg = m.svg([
        {'ways': MAIN_WAYS, 'label': '本館', 'door': door_main, 'size': 44},
        {'ways': ANNEX_A_WAYS, 'label': '別館A', 'door': door_a, 'size': 30},
        {'ways': ANNEX_B_WAYS, 'label': '別館B', 'door': door_b, 'size': 30},
    ], badge='この地図はサンプルです', street_labels=False)
    (OUT / 'outdoor.svg').write_text(svg, encoding='utf-8')
    floor, nodes, edges = m.venue_floor('OUT', '屋外', './outdoor.svg')
    # 屋内の縮尺：外接長方形の長辺・短辺の m/px の平均
    mpp_in = m.view['mpp'] * (fp['size'][0] / (OUTLINE[2] - OUTLINE[0]) + fp['size'][1] / (OUTLINE[3] - OUTLINE[1])) / 2
    return fp, round(mpp_in, 5), floor, nodes, edges


def build_graph():
    nodes, edges = [], []
    stairs = {}
    for fid, g in GRAPH.items():
        p = fid.lower()
        for nid, x, y in g['nodes']:
            nodes.append({'id': f'{p}-{nid}', 'floor': fid, 'x': x, 'y': y})
        for r in g['rooms']:
            nid, x, y, room = r[:4]
            node = {'id': f'{p}-{nid}', 'floor': fid, 'x': x, 'y': y, 'room': room}
            if len(r) > 4:
                node['aliases'] = r[4]
            nodes.append(node)
        for nid, x, y, name in g['stairs']:
            # 同じ名前の階段は link でつなぐ（隣り合う階どうし。重みは VenueRouter の既定）
            nodes.append({'id': f'{p}-{nid}', 'floor': fid, 'x': x, 'y': y, 'kind': 'stairs', 'name': name, 'link': f'stairs-{name}'})
        for nid, x, y, name, link in g.get('entrances', []):
            nodes.append({'id': f'{p}-{nid}', 'floor': fid, 'x': x, 'y': y, 'kind': 'entrance', 'name': name, 'link': link})
        edges += [[f'{p}-{a}', f'{p}-{b}'] for a, b in g['edges']]
    return nodes, edges


for fid, spec in FLOORS.items():
    (OUT / f'{fid.lower()}.svg').write_text(svg_floor(spec), encoding='utf-8')
nodes, edges = build_graph()
fp, mpp_in, out_floor, out_nodes, out_edges = build_outdoor()
venue = {
    'name': 'サンプル会場（簡略図）',
    'attribution': '屋外の地図データ © OpenStreetMap contributors（ODbL 1.0。LICENSE-OSM.md）',
    'floors': [{'id': fid, 'label': spec['label'], 'level': i + 1, 'image': f'./{fid.lower()}.svg', 'width': W, 'height': H,
                'metersPerPx': mpp_in, 'footprint': fp}
               for i, (fid, spec) in enumerate(FLOORS.items())] + [out_floor],
    'nodes': nodes + out_nodes,
    'edges': edges + out_edges,
}
(OUT / 'venue_map.json').write_text(json.dumps(venue, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f"floors {len(venue['floors'])}, nodes {len(venue['nodes'])}, edges {len(venue['edges'])}")
