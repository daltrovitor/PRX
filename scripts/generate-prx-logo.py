import json, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = r"C:/Users/vitor_w39/OneDrive/Documents/prx"

# ---- Traced geometry (source image coordinates, 672x582 master) ----
SYMBOL_WHITE = "M214 119H312L340 147.8H282.2L333.7 199.7L261.2 272.7H221L293.5 199Z"
SYMBOL_COLOR = "M414 92H464.5L383.3 173L458.2 253.2H359.5L332 223.2H389.5L339.2 167.8Z"
P = ("M101 306.2H174A31.3 31.3 0 0 1 174 368.8H118.5V405.6H101Z"
     "M118.5 320.8H172A15.8 16.7 0 0 1 172 354.2H118.5Z")
R = ("M279.2 306.2H350.5A32.5 31.6 0 0 1 350.5 369.4H348L383.5 405.6H361.2L324.2 369.4H296.8V405.6H279.2Z"
     "M296.8 321H350.5A16 16.95 0 0 1 350.5 354.9H296.8Z")
X_MAIN = "M447.5 306.5H471.5L570.6 405.6H546.6L508.4 367.5L469.8 405.6H447L496 355.5Z"
X_ARM = "M548 306.5H571.5L527 351L515.5 339.5Z"

# ---- Tagline outlined from Barlow Regular (DIN-style grotesk) ----
# Each glyph is centred on the letter position measured in the master artwork.
TEXT = "EXPERIÊNCIAS QUE CONECTAM GERAÇÕES"
CENTERS = [(42.2, 49.8), (59.8, 67.8), (78.2, 86.2), (96.0, 103.8), (114.0, 122.2), (133.2, 135.0), (146.5, 154.0), (164.2, 173.0), (183.5, 191.2), (202.2, 204.0), (214.8, 224.0), (234.0, 242.0), (265.8, 274.0), (285.0, 293.0), (304.5, 312.0), (334.8, 342.8), (353.0, 361.8), (372.5, 381.2), (392.0, 399.5), (409.5, 417.2), (427.0, 435.2), (443.5, 452.8), (462.8, 473.0), (495.5, 504.0), (514.2, 522.0), (532.0, 540.0), (549.8, 559.0), (569.0, 577.0), (587.5, 595.8), (606.2, 614.0), (624.2, 632.2)]
font = TTFont("package/files/barlow-latin-400-normal.woff")
gs = font.getGlyphSet(); cmap = font.getBestCmap()
from fontTools.pens.boundsPen import BoundsPen
CAP = 700.0
target_cap = 11.6
scale = target_cap / CAP
fmt = lambda v: ("%.2f" % v).rstrip("0").rstrip(".")
pen = SVGPathPen(gs, ntos=fmt)
letters = [c for c in TEXT if c != " "]
ORIGIN_X = CENTERS[0][0]
for c, (a, b) in zip(letters, CENTERS):
    g = cmap[ord(c)]
    bp = BoundsPen(gs); gs[g].draw(bp)
    x0, _, x1, _ = bp.bounds
    cx = (x0 + x1) / 2 * scale
    target = (a + b) / 2 - ORIGIN_X
    gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, target - cx, 0)))
TAGLINE = pen.getCommands()
TAGLINE_WIDTH = CENTERS[-1][1] - ORIGIN_X
target_w = TAGLINE_WIDTH

# ---- Layout (horizontal lockup) ----
SYM_BOX = (214, 92, 464.5, 273)          # x0 y0 x1 y1
WORD_BOX = (101, 306.2, 571.5, 405.6)
sym_w = SYM_BOX[2] - SYM_BOX[0]; sym_h = SYM_BOX[3] - SYM_BOX[1]
word_w = WORD_BOX[2] - WORD_BOX[0]; word_h = WORD_BOX[3] - WORD_BOX[1]
GAP = 55.5
word_x = sym_w + GAP
tag_scale = word_w / TAGLINE_WIDTH
tag_cap = target_cap * tag_scale
bar_w = 103 * tag_scale * (TAGLINE_WIDTH / target_w)
BLOCK = word_h + 20 + tag_cap + 18 + 3.5
top_full = (sym_h - BLOCK) / 2
top_compact = (sym_h - word_h) / 2
VB_W = word_x + word_w

layout = {
    "viewBox": {"full": [0, 0, round(VB_W, 2), sym_h], "compact": [0, 0, round(VB_W, 2), sym_h], "symbol": [0, 0, sym_w, sym_h]},
    "symbol": f"translate({-SYM_BOX[0]} {-SYM_BOX[1]})",
    "wordFull": f"translate({round(word_x - WORD_BOX[0], 2)} {round(top_full - WORD_BOX[1], 2)})",
    "wordCompact": f"translate({round(word_x - WORD_BOX[0], 2)} {round(top_compact - WORD_BOX[1], 2)})",
    "tagline": f"translate({round(word_x, 2)} {round(top_full + word_h + 20 + tag_cap, 2)}) scale({round(tag_scale, 4)})",
    "bar": {"x": round(word_x + word_w / 2 - bar_w / 2, 2), "y": round(top_full + word_h + 20 + tag_cap + 18, 2), "w": round(bar_w, 2), "h": 3.5},
}

GRAD = {
    "symbol": {"cx": 330, "cy": 172, "r": 140, "stops": [[0, "#7607FD"], [0.42, "#6430FA"], [0.7, "#3C9CFD"], [1, "#0BD9FD"]]},
    "x": {"x1": 450, "y1": 310, "x2": 570, "y2": 405, "stops": [[0, "#7C04F0"], [0.4, "#6420F9"], [0.55, "#4F80FE"], [1, "#06E4F9"]]},
    "bar": {"stops": [[0, "#7607FD"], [1, "#0BD9FD"]]},
}

paths = {"symbolWhite": SYMBOL_WHITE, "symbolColor": SYMBOL_COLOR, "p": P, "r": R, "xMain": X_MAIN, "xArm": X_ARM, "tagline": TAGLINE}

# ---- TS module ----
ts = ["// Hello World",
      "// Geometria vetorial da marca PRX, traÃ§ada a partir do arquivo mestre (672x582).",
      "// Gerado por script â€” nÃ£o editar Ã  mÃ£o. Coordenadas no espaÃ§o do arquivo mestre.",
      "",
      f"export const PRX_PATHS = {json.dumps(paths, indent=2)} as const;",
      "",
      f"export const PRX_LAYOUT = {json.dumps(layout, indent=2)} as const;",
      "",
      f"export const PRX_GRADIENTS = {json.dumps(GRAD, indent=2)} as const;",
      ""]
os.makedirs(ROOT + "/lib/brand", exist_ok=True)
open(ROOT + "/lib/brand/prx-logo-data.ts", "w", encoding="utf-8").write("\n".join(ts))

# ---- Static SVG files ----
def defs(prefix):
    s = GRAD["symbol"]; x = GRAD["x"]; b = GRAD["bar"]
    st = lambda arr: "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in arr)
    bar = layout["bar"]
    return (f'<defs><radialGradient id="{prefix}s" gradientUnits="userSpaceOnUse" cx="{s["cx"]}" cy="{s["cy"]}" r="{s["r"]}">{st(s["stops"])}</radialGradient>'
            f'<linearGradient id="{prefix}x" gradientUnits="userSpaceOnUse" x1="{x["x1"]}" y1="{x["y1"]}" x2="{x["x2"]}" y2="{x["y2"]}">{st(x["stops"])}</linearGradient>'
            f'<linearGradient id="{prefix}b" gradientUnits="userSpaceOnUse" x1="{bar["x"]}" y1="0" x2="{bar["x"] + bar["w"]}" y2="0">{st(b["stops"])}</linearGradient></defs>')

SIGNATURE_STYLE = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:21px;font-weight:500;letter-spacing:0.28em"

def svg(kind, ink):
    vb = layout["viewBox"][kind]
    out = [f'<!-- Hello World -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="{" ".join(str(v) for v in vb)}" role="img" aria-label="PRX">', defs("prx")]
    out.append(f'<g transform="{layout["symbol"]}"><path fill="{ink}" d="{SYMBOL_WHITE}"/><path fill="url(#prxs)" d="{SYMBOL_COLOR}"/></g>')
    if kind != "symbol":
        wt = layout["wordFull"] if kind == "full" else layout["wordCompact"]
        # gradient for X lives in master coords, so place it inside the translated group
        out.append(f'<g transform="{wt}"><path fill="{ink}" fill-rule="evenodd" d="{P}{R}"/><path fill="url(#prxx)" d="{X_MAIN}{X_ARM}"/></g>')
    if kind == "full":
        # Assinatura atual: "the next pays" em texto, centrada sob o wordmark e sem a barra (mesmo desenho de
        # components/brand/prx-logo.tsx). A assinatura antiga em contorno segue em lib/brand/prx-logo-data.ts
        # só por compatibilidade: nenhum componente a usa mais.
        out.append(f'<text x="541" y="153" text-anchor="middle" fill="{ink}" style="{SIGNATURE_STYLE}">the next pays</text>')
    out.append("</svg>\n")
    return "".join(out)

os.makedirs(ROOT + "/public/brand", exist_ok=True)
for kind in ("full", "compact", "symbol"):
    open(f"{ROOT}/public/brand/prx-{kind}-on-dark.svg", "w").write(svg(kind, "#FFFFFF"))
    open(f"{ROOT}/public/brand/prx-{kind}-on-light.svg", "w").write(svg(kind, "#0B0B10"))

# favicon: symbol on graphite tile
pad = 34
tile = max(sym_w, sym_h) + pad * 2
ox = (tile - sym_w) / 2; oy = (tile - sym_h) / 2
fav = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {tile} {tile}">{defs("f")}'
       f'<rect width="{tile}" height="{tile}" rx="{tile*0.18:.1f}" fill="#0B0B10"/>'
       f'<g transform="translate({ox - SYM_BOX[0]} {oy - SYM_BOX[1]})"><path fill="#FFFFFF" d="{SYMBOL_WHITE}"/><path fill="url(#fs)" d="{SYMBOL_COLOR}"/></g></svg>\n')
open(ROOT + "/app/icon.svg", "w").write(fav)
open(ROOT + "/public/brand/prx-app-icon.svg", "w").write(fav)
print("ok", layout, round(TAGLINE_WIDTH, 1))
