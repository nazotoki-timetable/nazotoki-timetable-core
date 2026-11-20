#!/usr/bin/env python3
"""サンプル会場2（ビルの 3〜5 階の屋内図と、駅前の広場までの広めの周辺地図）と venue_map.json を生成する。

部屋の並びと通路を簡略化したサンプルの図。画面にもファイルにも、実在の施設名・通りの名前は出さない（部屋は一般名）。

  - 入れない非公開区画は灰色で描き（名前非表示）、通路網に入れない
  - 5F の会議室1・控室はラウンジを通ってだけ入れる（通路網の線でつなぐ所だけを通るので、見えない壁を置く必要はない）。
    和室へは、右下のエレベーター横の隙間から細い通路を通って入る
  - 両端の階段（非常口の表示）は非常階段として描くが、経路には使わない。階の移動はエレベーター（右上の 3 基）
  - 1 階の図は無い。エレベーターで 1 階へ降り、1 階の出入口（大通り側＝西）から外へ出る、として 3 階のエレベーターと屋外の出入口をつなぐ
  - 建物の外は OpenStreetMap のデータから作る（tools/outdoor-map/osm_outdoor.py）。名前（name）は保存しない。地下街・地下道は使わない

  python3 tools/sample-venue/build_sample_hall2.py
出力: public/venues/sample-hall2/{3f,4f,5f,outdoor}.svg, public/venues/sample-hall2/venue_map.json
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'venues' / 'sample-hall2'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / 'tools' / 'outdoor-map'))
from osm_outdoor import OutdoorMap  # noqa: E402

W, H = 1760, 1010
OY = 44  # 上下の余白（下の座標はすべて余白を足す前の値）
FONT = "'Hiragino Sans','Noto Sans JP','Noto Sans CJK JP','IPAGothic',sans-serif"
INK = '#2b2e3a'
WALL = 7
FILL = {'room': '#ffffff', 'service': '#f1f1ee', 'emergency': '#f1f1ee', 'ev': '#eef0f5', 'closed': '#cfd2dc'}

# 建物の外形（八角形に近い形）
OUTLINE = [(130, 66), (640, 2), (1050, 2), (1635, 66), (1678, 448), (1640, 840), (1140, 922), (700, 922), (122, 840), (82, 448)]


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


# 3 フロア共通の骨格：エレベーター・トイレ・非常階段
def core():
    return [
        ('EV', rect(110, 255, 195, 365), 'ev', 24),
        ('トイレ', rect(200, 255, 298, 395), 'service', 24),
        ('EV', rect(1255, 315, 1495, 420), 'ev', 30),
        ('非常階段', rect(1560, 315, 1660, 400), 'emergency', 18),
        ('EV', rect(1265, 548, 1460, 665), 'ev', 28),
        ('', rect(1460, 548, 1560, 665), 'closed', 0),
        ('トイレ', rect(1560, 548, 1660, 670), 'service', 22),
        ('非常階段', rect(100, 548, 200, 652), 'emergency', 18),
    ]


def core5():
    """5F：右下のエレベーター・設備区画・トイレを少し小さくし、エレベーター横に隙間（和室へ行く通路）を空ける"""
    base = [c for c in core() if c[1][0] != (1265, 548) and c[1][0] != (1460, 548) and c[1][0] != (1560, 548)]
    return base + [
        ('', rect(1130, 548, 1265, 645), 'closed', 0),  # 壁・設備（通れない）
        ('EV', rect(1265, 548, 1415, 645), 'ev', 28),
        ('', rect(1460, 548, 1555, 645), 'closed', 0),
        ('トイレ', rect(1555, 548, 1660, 645), 'service', 22),
    ]


# 部屋：(表示名, 多角形, 種類, 文字の大きさ)。外形からはみ出す所は切り取って描く
#   種類 closed …… 入れない非公開区画（灰色で塗り、名前は表示しない。通路網に点を置かない）
FLOORS = {
    '3F': {
        'label': '3階',
        'rooms': [
            ('研修室2', [(105, 268), (390, 268), (390, 35), (130, 66)], 'room', 40),
            ('研修室1', [(1237, 295), (1680, 295), (1680, 0), (1237, 0)], 'room', 44),
            ('', [(390, 0), (1237, 0), (1237, 410), (390, 410)], 'closed', 0),
            ('', rect(80, 660, 395, 960), 'closed', 0),
            ('', [(395, 553), (1265, 553), (1265, 670), (1680, 670), (1680, 960), (395, 960)], 'closed', 0),
        ] + core(),
        'areas': [],
    },
    '4F': {
        'label': '4階',
        'rooms': [
            ('研修室3', [(105, 248), (420, 248), (420, 28), (130, 66)], 'room', 40),
            ('', [(420, 0), (1680, 0), (1680, 315), (1255, 315), (1255, 395), (420, 395)], 'closed', 0),
            ('展示室3', [(200, 548), (557, 548), (557, 960), (80, 960), (80, 652), (200, 652)], 'room', 40),
            ('展示室2', rect(557, 548, 1127, 960), 'room', 44),
            ('展示室1', [(1127, 548), (1265, 548), (1265, 670), (1680, 670), (1680, 960), (1127, 960)], 'room', 40),
        ] + core(),
        'areas': [],
    },
    # 5F：上に小さな会議室が並び、下にラウンジを挟んで会議室1・控室・和室
    '5F': {
        'label': '5階',
        'rooms': [
            ('', rect(100, 0, 230, 235), 'closed', 0),
            ('会議室6', rect(230, 0, 470, 235), 'room', 34),
            ('会議室5', rect(470, 0, 690, 235), 'room', 34),
            ('会議室4', rect(690, 0, 910, 235), 'room', 34),
            ('会議室3', rect(910, 0, 1130, 235), 'room', 34),
            ('会議室2', rect(1130, 0, 1420, 235), 'room', 34),
            ('', rect(1420, 0, 1680, 235), 'closed', 0),
            ('会議室1', rect(200, 548, 640, 960), 'room', 44),
            ('', rect(80, 652, 200, 960), 'closed', 0),
            ('ラウンジ', rect(640, 548, 1130, 960), 'room', 40),
            # 控室と和室は同じ高さ。その上（エレベーター・設備区画・トイレとの間）に細い通路
            ('控室', rect(1130, 700, 1265, 960), 'room', 28),
            ('和室', rect(1265, 700, 1680, 960), 'room', 40),
        ] + core5(),
        'areas': [],
    },
}

# 通路網：(点, x, y)・部屋 (点, x, y, 部屋名)・線。部屋の点は入口のすぐ内側
CORRIDOR = [('cw', 150, 480), ('c1', 340, 480), ('c2', 595, 480), ('c3', 835, 480), ('c4', 1075, 480),
            ('c5', 1215, 480), ('c6', 1375, 480), ('ce', 1610, 480)]
CORRIDOR_EDGES = [('cw', 'c1'), ('c1', 'c2'), ('c2', 'c3'), ('c3', 'c4'), ('c4', 'c5'), ('c5', 'c6'), ('c6', 'ce'), ('c6', 'ev')]
GRAPH = {
    # 3F：非公開区画は通らない。研修室2 はトイレの脇から、研修室1 はエレベーターと非常階段の間から入る
    '3F': {
        'nodes': [('s2', 345, 340), ('s1', 1528, 450)],
        'rooms': [('r-2', 345, 240, '研修室2'), ('r-1', 1528, 265, '研修室1')],
        'edges': [('c1', 's2'), ('s2', 'r-2'), ('c6', 's1'), ('ce', 's1'), ('s1', 'r-1')],
    },
    # 4F：非公開区画は通らない
    '4F': {
        'nodes': [('p3', 360, 330)],
        'rooms': [('r-3', 360, 225, '研修室3'), ('r-x3', 338, 590, '展示室3'), ('r-x2', 835, 590, '展示室2'), ('r-x1', 1205, 590, '展示室1')],
        'edges': [('c1', 'p3'), ('p3', 'r-3'), ('c1', 'r-x3'), ('c3', 'r-x2'), ('c5', 'r-x1')],
    },
    # 5F：会議室1 はラウンジを通ってだけ入れる（廊下から会議室1 へ直接の線を引かない）
    '5F': {
        'nodes': [('u6', 350, 280), ('u5', 580, 280), ('u4', 800, 280), ('u3', 1020, 280), ('u2', 1275, 280), ('uk', 1550, 280),
                  ('ld', 735, 520), ('lg', 885, 700), ('g1', 1437, 500), ('g2', 1437, 672)],
        'rooms': [('r-m6', 350, 210, '会議室6'), ('r-m5', 580, 210, '会議室5'), ('r-m4', 800, 210, '会議室4'),
                  ('r-m3', 1020, 210, '会議室3'), ('r-m2', 1275, 210, '会議室2'),
                  ('r-lounge', 885, 760, 'ラウンジ'), ('r-m1', 610, 720, '会議室1'), ('r-w', 1437, 728, '和室'),
                  ('r-k', 1160, 830, '控室')],
        'edges': [('u6', 'u5'), ('u5', 'u4'), ('u4', 'u3'), ('u3', 'u2'), ('u2', 'uk'),
                  ('u6', 'c1'), ('u4', 'c3'), ('u3', 'c4'),
                  ('u6', 'r-m6'), ('u5', 'r-m5'), ('u4', 'r-m4'), ('u3', 'r-m3'), ('u2', 'r-m2'),
                  ('c2', 'ld'), ('c3', 'ld'), ('ld', 'lg'), ('lg', 'r-lounge'), ('lg', 'r-m1'),
                  ('c6', 'g1'), ('g1', 'g2'), ('g2', 'r-w'), ('lg', 'r-k')],
    },
}
EV = (1375, 430)  # 右上の 3 基（各階で同じ位置）


# ─────────── 描く ───────────
def clip(poly, box):
    """多角形 poly を凸多角形 box で切り取る（Sutherland–Hodgman）"""
    def inside(p, a, b):
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0

    def cross(p, q, a, b):
        x1, y1, x2, y2, x3, y3, x4, y4 = *p, *q, *a, *b
        d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    out = poly
    for i in range(len(box)):
        a, b = box[i], box[(i + 1) % len(box)]
        src, out = out, []
        for j in range(len(src)):
            p, q = src[j], src[(j + 1) % len(src)]
            if inside(q, a, b):
                if not inside(p, a, b):
                    out.append(cross(p, q, a, b))
                out.append(q)
            elif inside(p, a, b):
                out.append(cross(p, q, a, b))
        if not out:
            break
    return out


def text(x, y, s, size, color=INK, weight=700, anchor='middle', extra=''):
    return f'<text x="{x:.0f}" y="{y:.0f}" text-anchor="{anchor}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{color}" {extra}>{s}</text>'


def pts(poly):
    return ' '.join(f'{x:.1f},{y + OY:.1f}' for x, y in poly)


def svg_floor(spec):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
           f'<rect width="{W}" height="{H}" fill="#e7e9f0"/>',
           f'<polygon points="{pts(OUTLINE)}" fill="#dfe2ea"/>']
    # 外形は時計回りに並べ直して切り取りに使う
    box = OUTLINE[::-1] if sum((b[0] - a[0]) * (b[1] + a[1]) for a, b in zip(OUTLINE, OUTLINE[1:] + OUTLINE[:1])) > 0 else OUTLINE
    for name, poly, kind, size in spec['rooms']:
        cp = clip(poly, box)
        if len(cp) < 3:
            continue
        stroke = '#9a9db0' if kind == 'closed' else INK
        out.append(f'<polygon points="{pts(cp)}" fill="{FILL[kind]}" stroke="{stroke}" stroke-width="{WALL if kind == "room" else 4}" stroke-linejoin="round"/>')
        if kind == 'closed' or not name or not size:
            continue
        xs = [p[0] for p in cp]
        ys = [p[1] for p in cp]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2 + OY
        color = INK if kind == 'room' else '#7d8091'
        if kind == 'emergency':
            for i in range(1, 5):
                yy = min(ys) + OY + 30 + i * 12
                out.append(f'<line x1="{min(xs) + 12:.0f}" y1="{yy:.0f}" x2="{max(xs) - 12:.0f}" y2="{yy:.0f}" stroke="{INK}" stroke-width="3" opacity=".45"/>')
            out.append(text(cx, min(ys) + OY + 26, name, size, color))
        else:
            out.append(text(cx, cy + size * 0.36, name, size, color, 800 if kind == 'room' else 700))
    for name, x, y, size in spec['areas']:
        out.append(text(x, y + OY, name, size, '#9a9db0', 800))
    out.append(f'<polygon points="{pts(OUTLINE)}" fill="none" stroke="{INK}" stroke-width="{WALL}" stroke-linejoin="round"/>')
    out.append(text(48, H - 26, spec['label'], 56, INK, 900, 'start', 'opacity=".22"'))
    out.append(text(W - 36, H - 24, 'この地図はサンプルです', 26, '#9a9db0', 700, 'end'))
    out.append('</svg>\n')
    return '\n'.join(out)


def build_graph():
    nodes, edges = [], []
    for fid, g in GRAPH.items():
        p = fid.lower()
        for nid, x, y in CORRIDOR + g['nodes']:
            nodes.append({'id': f'{p}-{nid}', 'floor': fid, 'x': x, 'y': y + OY})
        for nid, x, y, room in g['rooms']:
            nodes.append({'id': f'{p}-{nid}', 'floor': fid, 'x': x, 'y': y + OY, 'room': room})
        nodes.append({'id': f'{p}-ev', 'floor': fid, 'x': EV[0], 'y': EV[1] + OY, 'kind': 'elevator', 'name': 'エレベーター'})
        edges += [[f'{p}-{a}', f'{p}-{b}'] for a, b in CORRIDOR_EDGES + g['edges']]
    # エレベーター：階どうしは 1 階分 10m に数える
    edges += [{'a': '5f-ev', 'b': '4f-ev', 'weight': 10}, {'a': '4f-ev', 'b': '3f-ev', 'weight': 10}]
    return nodes, edges


# ─────────── 建物の外 ───────────
OSM_CACHE = ROOT / 'tools' / 'sample-venue' / 'osm_cache2.json'
BUILDING_WAYS = [50365485]   # OSM：会場のビル
PLAZA_WAYS = [680256831]     # OSM：駅の出口の前の広場（歩行者用の広場）
FOOT = (min(p[0] for p in OUTLINE), min(p[1] for p in OUTLINE) + OY, max(p[0] for p in OUTLINE), max(p[1] for p in OUTLINE) + OY)


def footprint_of(m):
    """屋内図の外形の四角を、OSM のビルの最小外接長方形に重ねる。屋内図の下（+y）を西向き（出入口の側）に合わせる"""
    c, (long_px, short_px), _u, v = m.footprint_box(BUILDING_WAYS)
    if v[0] > 0:  # 短辺の向きを西向き（-x）に
        v = (-v[0], -v[1])
    theta = math.degrees(math.atan2(-v[0], v[1]))
    return {'floor': 'OUT', 'outline': list(FOOT), 'center': [round(c[0], 1), round(c[1], 1)],
            'size': [round(long_px, 1), round(short_px, 1)], 'rotation': round(theta, 2)}


def west_door(m):
    """ビルの外壁のうち、いちばん西の辺のまん中（1 階の出入口の目安）"""
    ring = m.way_px(BUILDING_WAYS[0])
    edges = list(zip(ring, ring[1:]))
    a, b = min(edges, key=lambda e: (e[0][0] + e[1][0]) / 2)
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def build_outdoor():
    m = OutdoorMap.load(OSM_CACHE, center=(35.17210, 136.88700), radius_m=560, keep_names=False)
    m.set_view(BUILDING_WAYS + PLAZA_WAYS, margin_m=70)
    fp = footprint_of(m)
    door = west_door(m)
    plaza = m.way_px(PLAZA_WAYS[0])[:-1]
    pc = (sum(p[0] for p in plaza) / len(plaza), sum(p[1] for p in plaza) / len(plaza))
    m.add_point('out-door', door, kind='entrance', name='1階 出入口')
    m.add_point('out-plaza', pc, room='駅前広場（受付）', aliases=['駅前広場'], note='駅の出口の前の広場')
    m.set_focus(BUILDING_WAYS + PLAZA_WAYS, margin_m=60)
    svg = m.svg([
        {'ways': BUILDING_WAYS, 'label': '会場', 'door': door, 'size': 40},
        {'ways': PLAZA_WAYS, 'label': '駅前広場', 'size': 34, 'style': 'area'},
    ], badge='この地図はサンプルです', street_labels=False)
    (OUT / 'outdoor.svg').write_text(svg, encoding='utf-8')
    floor, nodes, edges = m.venue_floor('OUT', '屋外', './outdoor.svg')
    mpp_in = m.view['mpp'] * (fp['size'][0] / (FOOT[2] - FOOT[0]) + fp['size'][1] / (FOOT[3] - FOOT[1])) / 2
    return fp, round(mpp_in, 5), floor, nodes, edges


for fid, spec in FLOORS.items():
    (OUT / f'{fid.lower()}.svg').write_text(svg_floor(spec), encoding='utf-8')
nodes, edges = build_graph()
fp, mpp_in, out_floor, out_nodes, out_edges = build_outdoor()
# エレベーターで 1 階へ降り、出入口まで：40m に数える（1 階の図は無い）
edges.append({'a': '3f-ev', 'b': 'out-door', 'weight': 40})
venue = {
    'name': 'サンプル会場2（簡略図）',
    'attribution': '屋外の地図データ © OpenStreetMap contributors（ODbL 1.0。LICENSE-OSM.md）',
    'floors': [{'id': fid, 'label': spec['label'], 'level': int(fid[0]), 'image': f'./{fid.lower()}.svg', 'width': W, 'height': H,
                'metersPerPx': mpp_in, 'footprint': fp}
               for fid, spec in FLOORS.items()] + [out_floor],
    'nodes': nodes + out_nodes,
    'edges': edges + out_edges,
}
(OUT / 'venue_map.json').write_text(json.dumps(venue, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f"floors {len(venue['floors'])}, nodes {len(venue['nodes'])}, edges {len(venue['edges'])}")
