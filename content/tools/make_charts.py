#!/usr/bin/env python3
"""Generate courses/microeconomics/src/charts.json — the textbook graphs used by quiz questions.

Charts are plain data so the app can draw them in its hand-drawn style (rough.js):
  x / y       axis label and max (min is always 0)
  curves      polylines: label, points [[x, y], ...], labelAt, style solid|dashed|bold
  guides      thin dashed helper lines (from an axis to a point), no label
  ticks       labelled positions on the axes: {"x": [{at, label}], "y": [...]}
  markers     dots with a label: {at, label}
  areas       shaded polygons with a letter in the middle: {label, polygon, labelAt}
  texts       free text: {at, text}
  notes       one-line captions under the chart
Letters on areas follow Pindyck & Rubinfeld's figures, so they match the textbook.
Run:  python3 content/tools/make_charts.py   (then build_bank.py)
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "courses" / "microeconomics" / "src" / "charts.json"


def sample(f, x0, x1, n=40, ymax=None):
    pts = []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        y = f(x)
        if ymax is None or y <= ymax:
            pts.append([round(x, 3), round(y, 3)])
    return pts


def hguide(y, x):
    return {"points": [[0, y], [x, y]]}


def vguide(x, y):
    return {"points": [[x, 0], [x, y]]}


charts = []

charts.append({
    "id": "ceiling",
    "title": "Price ceiling in a competitive market",
    "x": {"label": "Quantity", "max": 10}, "y": {"label": "Price", "max": 10},
    "curves": [
        {"label": "D", "points": [[0, 10], [10, 0]], "labelAt": [9.5, 1.2]},
        {"label": "S", "points": [[0, 0], [10, 10]], "labelAt": [9.6, 8.7]},
    ],
    "guides": [hguide(5, 5), vguide(5, 5), hguide(3, 7), vguide(3, 7), vguide(7, 3), hguide(7, 3)],
    "ticks": {"x": [{"at": 3, "label": "Q₁"}, {"at": 5, "label": "Q₀"}, {"at": 7, "label": "Q₂"}],
              "y": [{"at": 3, "label": "Pmax"}, {"at": 5, "label": "P₀"}]},
    "markers": [{"at": [5, 5], "label": "E"}],
    "areas": [
        {"label": "A", "polygon": [[0, 3], [3, 3], [3, 5], [0, 5]], "labelAt": [1.5, 4]},
        {"label": "B", "polygon": [[3, 5], [3, 7], [5, 5]], "labelAt": [3.6, 5.7]},
        {"label": "C", "polygon": [[3, 3], [3, 5], [5, 5]], "labelAt": [3.6, 4.3]},
    ],
    "texts": [{"at": [5, 2.4], "text": "shortage"}],
    "notes": ["Ceiling Pmax below P₀: firms supply Q₁, buyers want Q₂ — shortage Q₂ − Q₁."],
})

charts.append({
    "id": "tax",
    "title": "A specific (per-unit) tax",
    "x": {"label": "Quantity", "max": 8}, "y": {"label": "Price", "max": 12},
    "curves": [
        {"label": "D", "points": [[0, 12], [6, 0]], "labelAt": [5.7, 1.4]},
        {"label": "S", "points": [[0, 0], [8, 8]], "labelAt": [7.6, 8.4]},
    ],
    "guides": [hguide(6, 3), hguide(4, 4), hguide(3, 3), vguide(3, 6), vguide(4, 4)],
    "ticks": {"x": [{"at": 3, "label": "Q₁"}, {"at": 4, "label": "Q₀"}],
              "y": [{"at": 3, "label": "Ps"}, {"at": 4, "label": "P₀"}, {"at": 6, "label": "Pb"}]},
    "markers": [],
    "areas": [
        {"label": "A", "polygon": [[0, 4], [3, 4], [3, 6], [0, 6]], "labelAt": [1.5, 5]},
        {"label": "D", "polygon": [[0, 3], [3, 3], [3, 4], [0, 4]], "labelAt": [1.5, 3.5]},
        {"label": "B", "polygon": [[3, 6], [3, 4], [4, 4]], "labelAt": [3.3, 4.6]},
        {"label": "C", "polygon": [[3, 4], [4, 4], [3, 3]], "labelAt": [3.3, 3.6]},
    ],
    "texts": [],
    "notes": ["Tax t = Pb − Ps. Buyers pay Pb, sellers keep Ps, quantity falls from Q₀ to Q₁."],
})

charts.append({
    "id": "tariff",
    "title": "Import tariff in a small importing country",
    "x": {"label": "Quantity", "max": 10}, "y": {"label": "Price", "max": 10},
    "curves": [
        {"label": "D", "points": [[0, 10], [10, 0]], "labelAt": [9.5, 1.2]},
        {"label": "S (domestic)", "points": [[0, 0], [10, 10]], "labelAt": [8.4, 9.4]},
        {"label": "Pw", "points": [[0, 2], [10, 2]], "labelAt": [9.6, 2.35]},
        {"label": "Pw + t", "points": [[0, 4], [10, 4]], "labelAt": [9.3, 4.35]},
    ],
    "guides": [vguide(2, 2), vguide(4, 4), vguide(6, 4), vguide(8, 2)],
    "ticks": {"x": [{"at": 2, "label": "Qs"}, {"at": 4, "label": "Q′s"}, {"at": 6, "label": "Q′d"}, {"at": 8, "label": "Qd"}],
              "y": [{"at": 2, "label": "Pw"}, {"at": 4, "label": "P*"}]},
    "markers": [],
    "areas": [
        {"label": "A", "polygon": [[0, 2], [2, 2], [4, 4], [0, 4]], "labelAt": [1.5, 3]},
        {"label": "B", "polygon": [[2, 2], [4, 2], [4, 4]], "labelAt": [3.4, 2.6]},
        {"label": "D", "polygon": [[4, 2], [6, 2], [6, 4], [4, 4]], "labelAt": [5, 3]},
        {"label": "C", "polygon": [[6, 2], [8, 2], [6, 4]], "labelAt": [6.6, 2.6]},
    ],
    "texts": [],
    "notes": ["Free trade at Pw: imports Qd − Qs. Tariff t raises the domestic price to P*: imports shrink to Q′d − Q′s."],
})


def mc(q): return 3 * q * q - 12 * q + 15
def avc(q): return q * q - 6 * q + 15
def atc(q): return avc(q) + 32 / q


charts.append({
    "id": "firmCosts",
    "title": "Short-run costs of a competitive firm",
    "x": {"label": "Output q", "max": 6}, "y": {"label": "$ per unit", "max": 36},
    "curves": [
        {"label": "MC", "points": sample(mc, 0.6, 5.3, ymax=36), "labelAt": [5.45, 34]},
        {"label": "ATC", "points": sample(atc, 1.2, 6, ymax=36), "labelAt": [5.9, 21.6]},
        {"label": "AVC", "points": sample(avc, 0.3, 6, ymax=36), "labelAt": [5.9, 16.2]},
        {"label": "firm supply", "points": sample(mc, 3, 5.3, n=20, ymax=36), "labelAt": [3.7, 27], "style": "bold"},
    ],
    "guides": [hguide(6, 3), hguide(15, 4), vguide(3, 6), vguide(4, 15)],
    "ticks": {"x": [{"at": 3, "label": "q₁"}, {"at": 4, "label": "q₂"}],
              "y": [{"at": 6, "label": "AVCmin"}, {"at": 15, "label": "ATCmin"}]},
    "markers": [{"at": [3, 6], "label": "shutdown point"}, {"at": [4, 15], "label": "break-even point"}],
    "areas": [],
    "texts": [],
    "notes": ["MC cuts AVC and ATC at their minimum points."],
})

charts.append({
    "id": "monopoly",
    "title": "Monopoly vs perfect competition",
    "x": {"label": "Quantity", "max": 12}, "y": {"label": "Price", "max": 12},
    "curves": [
        {"label": "D = AR", "points": [[0, 12], [12, 0]], "labelAt": [10.6, 2.2]},
        {"label": "MR", "points": [[0, 12], [6, 0]], "labelAt": [5.9, 0.9]},
        {"label": "MC", "points": [[0, 0], [11, 11]], "labelAt": [10.4, 11.3]},
    ],
    "guides": [hguide(8, 4), hguide(6, 6), vguide(4, 8), vguide(6, 6)],
    "ticks": {"x": [{"at": 4, "label": "Qm"}, {"at": 6, "label": "Qc"}],
              "y": [{"at": 6, "label": "Pc"}, {"at": 8, "label": "Pm"}]},
    "markers": [{"at": [4, 4], "label": "MR = MC"}],
    "areas": [
        {"label": "A", "polygon": [[0, 6], [4, 6], [4, 8], [0, 8]], "labelAt": [2, 7]},
        {"label": "B", "polygon": [[4, 8], [6, 6], [4, 6]], "labelAt": [4.6, 6.6]},
        {"label": "C", "polygon": [[4, 6], [6, 6], [4, 4]], "labelAt": [4.6, 5.4]},
    ],
    "texts": [],
    "notes": ["The monopolist picks Qm where MR = MC and charges Pm read off the demand curve."],
})

charts.append({
    "id": "monopsony",
    "title": "Monopsony (a single buyer of an input)",
    "x": {"label": "Labour L", "max": 12}, "y": {"label": "Wage w", "max": 16},
    "curves": [
        {"label": "S = AE", "points": [[0, 2], [12, 14]], "labelAt": [11.2, 14.4]},
        {"label": "ME", "points": [[0, 2], [6.5, 15]], "labelAt": [6.6, 15.4]},
        {"label": "MV (demand)", "points": [[0, 14], [12, 2]], "labelAt": [10.6, 2.6]},
    ],
    "guides": [hguide(10, 4), hguide(8, 6), hguide(6, 4), vguide(4, 10), vguide(6, 8)],
    "ticks": {"x": [{"at": 4, "label": "Lm"}, {"at": 6, "label": "Lc"}],
              "y": [{"at": 6, "label": "wm"}, {"at": 8, "label": "wc"}]},
    "markers": [{"at": [4, 10], "label": "ME = MV"}],
    "areas": [
        {"label": "A", "polygon": [[0, 6], [4, 6], [4, 8], [0, 8]], "labelAt": [2, 7]},
        {"label": "B", "polygon": [[4, 8], [4, 10], [6, 8]], "labelAt": [4.6, 8.7]},
        {"label": "C", "polygon": [[4, 6], [4, 8], [6, 8]], "labelAt": [4.6, 7.3]},
    ],
    "texts": [],
    "notes": ["The monopsonist hires Lm where ME = MV and pays the wage wm read off the supply (AE) curve."],
})

charts.append({
    "id": "kinked",
    "title": "Sweezy kinked demand curve",
    "x": {"label": "Quantity", "max": 10}, "y": {"label": "Price", "max": 9},
    "curves": [
        {"label": "D", "points": [[0, 8], [4, 6], [9.5, 0.5]], "labelAt": [9.2, 1.3]},
        {"label": "MR", "points": [[0, 8], [4, 4]], "labelAt": [1.2, 6.4]},
        {"label": "MR", "points": [[4, 2], [5, 0]], "labelAt": [5.3, 0.5]},
        {"label": "MC", "points": [[0, 1], [10, 6]], "labelAt": [9.6, 5.4]},
        {"label": "MC′", "points": [[0, 1.8], [10, 6.8]], "labelAt": [9.6, 7.2]},
        {"label": "", "points": [[4, 4], [4, 2]], "style": "dashed"},
    ],
    "guides": [hguide(6, 4), vguide(4, 6)],
    "ticks": {"x": [{"at": 4, "label": "Q*"}], "y": [{"at": 6, "label": "P*"}]},
    "markers": [{"at": [4, 6], "label": "kink"}],
    "areas": [],
    "texts": [{"at": [4.9, 3.1], "text": "gap in MR"}],
    "notes": ["Rivals match price cuts but not price rises, so demand is flatter above P* than below it."],
})

charts.append({
    "id": "cournot",
    "title": "Cournot duopoly: reaction curves",
    "x": {"label": "Q₁ (firm 1)", "max": 30}, "y": {"label": "Q₂ (firm 2)", "max": 30},
    "curves": [
        {"label": "Firm 1 reaction curve", "points": [[15, 0], [0, 30]], "labelAt": [3.2, 27]},
        {"label": "Firm 2 reaction curve", "points": [[0, 15], [30, 0]], "labelAt": [24, 4.2]},
        {"label": "collusion curve", "points": [[15, 0], [0, 15]], "labelAt": [2.2, 12.2], "style": "dashed"},
        {"label": "competitive outcomes", "points": [[30, 0], [0, 30]], "labelAt": [20, 11.4], "style": "dashed"},
    ],
    "guides": [],
    "ticks": {"x": [], "y": []},
    "markers": [{"at": [10, 10], "label": "Cournot"}, {"at": [7.5, 7.5], "label": "collusion"},
                {"at": [15, 7.5], "label": "Stackelberg"}, {"at": [15, 15], "label": "competition"}],
    "areas": [],
    "texts": [],
    "notes": ["Market demand P = 30 − Q, both firms have MC = 0 (Pindyck's example)."],
})

charts.append({
    "id": "externality",
    "title": "Negative production externality",
    "x": {"label": "Quantity", "max": 10}, "y": {"label": "Price", "max": 12},
    "curves": [
        {"label": "D", "points": [[0, 10], [10, 0]], "labelAt": [9.5, 1.2]},
        {"label": "MC (private supply)", "points": [[0, 0], [10, 10]], "labelAt": [8.2, 9.6]},
        {"label": "MSC = MC + MEC", "points": [[0, 0], [8, 12]], "labelAt": [5.2, 11.5]},
        {"label": "MEC", "points": [[0, 0], [10, 5]], "labelAt": [9.5, 4.3], "style": "dashed"},
    ],
    "guides": [hguide(6, 4), hguide(5, 5), vguide(4, 6), vguide(5, 7.5)],
    "ticks": {"x": [{"at": 4, "label": "Q*"}, {"at": 5, "label": "Q₁"}],
              "y": [{"at": 5, "label": "P₁"}, {"at": 6, "label": "P*"}]},
    "markers": [],
    "areas": [{"label": "DWL", "polygon": [[4, 6], [5, 7.5], [5, 5]], "labelAt": [4.6, 6.1]}],
    "texts": [],
    "notes": ["The market produces Q₁ where D = MC; the efficient output Q* is where D = MSC."],
})


def ic(u):
    return lambda x: u / x


charts.append({
    "id": "consumerChoice",
    "title": "Consumer optimum: budget line and indifference curves",
    "x": {"label": "Good X", "max": 12}, "y": {"label": "Good Y", "max": 22},
    "curves": [
        {"label": "budget line", "points": [[0, 20], [10, 0]], "labelAt": [8.7, 4.6]},
        {"label": "U₁", "points": sample(ic(32), 1.5, 12, ymax=22), "labelAt": [11.7, 3.4]},
        {"label": "U₂", "points": sample(ic(50), 2.3, 12, ymax=22), "labelAt": [11.7, 4.9]},
        {"label": "U₃", "points": sample(ic(72), 3.3, 12, ymax=22), "labelAt": [11.7, 6.7]},
    ],
    "guides": [],
    "ticks": {"x": [], "y": []},
    "markers": [{"at": [5, 10], "label": "A"}, {"at": [2, 16], "label": "B"}, {"at": [8, 4], "label": "C"}],
    "areas": [],
    "texts": [],
    "notes": ["Px = 2, Py = 1, income 20, so the budget line has slope −Px/Py = −2. Utility U = X·Y, so MRS = Y/X."],
})

if __name__ == "__main__":
    OUT.write_text(json.dumps(charts, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
    print(f"wrote {len(charts)} charts to {OUT}")
