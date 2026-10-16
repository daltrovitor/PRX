// Hello World
/**
 * Gera as imagens do e-mail de boas-vindas em public/email/ a partir dos assets
 * da marca (public/brand). E-mail não aceita SVG (Gmail/Outlook), então logo,
 * ícones e a moeda PRX COINS viram PNG em 2x; as fotos viram JPG leves com o
 * degradê para o fundo obsidiana já aplicado (texto legível em qualquer cliente).
 *
 *   node scripts/build-email-assets.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = (file) => path.join(root, "public", "brand", file);
const showcase = (file) => path.join(root, "public", "brand", "showcase", file);
const out = path.join(root, "public", "email");

/** Mesmas cores do template (lib/notifications/templates/welcome-email.ts). */
const OBSIDIAN = "#050508";
const CARD = "#0b0b14";

const jpg = (img) => img.jpeg({ quality: 76, mozjpeg: true, chromaSubsampling: "4:2:0" });

async function svgBuffer(file) {
  // Os SVGs da marca começam com o comentário "Hello World" antes do <svg>: o librsvg aceita.
  return Buffer.from(await readFile(file, "utf8"));
}

async function logos() {
  const compact = await sharp(await svgBuffer(brand("prx-compact-on-dark.svg")), { density: 300 }).resize({ width: 240 }).png().toBuffer();
  await writeFile(path.join(out, "prx-logo.png"), compact);
  const symbol = await sharp(await svgBuffer(brand("prx-symbol-on-dark.svg")), { density: 300 }).resize({ width: 120 }).png().toBuffer();
  await writeFile(path.join(out, "prx-symbol.png"), symbol);
}

/** Degradê horizontal/vertical em SVG para escurecer a foto onde o texto entra. */
function fade({ width, height, stops, vertical = false }) {
  const coords = vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"';
  const stopTags = stops.map(([offset, opacity, color = OBSIDIAN]) => `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`).join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" ${coords}>${stopTags}</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
}

/** Névoa violeta/cobalto da identidade Obsidian. */
function haze({ width, height, cx, cy, r, color = "#7c3aed", opacity = 0.35 }) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><radialGradient id="h" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#h)"/></svg>`,
  );
}

/** Hero: o cristal PRX à direita, o breu à esquerda para o "VOCÊ ENTROU." (desktop) e embaixo (celular). */
async function hero() {
  const W = 1200;
  const H = 760;
  // O cristal passa da altura do hero: recorta a faixa central (o composite exige caber no quadro).
  const crystal = await sharp(showcase("prx-3d-crystal.png")).resize({ height: 980 }).extract({ left: 0, top: 150, width: 551, height: H }).toBuffer();
  const desktop = sharp({ create: { width: W, height: H, channels: 3, background: OBSIDIAN } }).composite([
    { input: haze({ width: W, height: H, cx: "0.78", cy: "0.45", r: "0.55", opacity: 0.32 }) },
    { input: crystal, left: W - 551, top: 0, blend: "screen" },
    { input: fade({ width: W, height: H, stops: [["0", 1], ["0.44", 0.96], ["0.68", 0.25], ["1", 0]] }) },
    { input: fade({ width: W, height: H, vertical: true, stops: [["0", 0], ["0.78", 0], ["1", 0.9]] }) },
  ]);
  await writeFile(path.join(out, "hero.jpg"), await jpg(desktop).toBuffer());

  // Celular: texto no topo, cristal na metade de baixo.
  const MW = 750;
  const MH = 1180;
  const crystalMobile = await sharp(showcase("prx-3d-crystal.png")).resize({ width: 640 }).extract({ left: 0, top: 0, width: 640, height: MH - 470 }).toBuffer();
  const mobile = sharp({ create: { width: MW, height: MH, channels: 3, background: OBSIDIAN } }).composite([
    { input: haze({ width: MW, height: MH, cx: "0.62", cy: "0.8", r: "0.5", opacity: 0.3 }) },
    { input: crystalMobile, left: 150, top: 470, blend: "screen" },
    { input: fade({ width: MW, height: MH, vertical: true, stops: [["0", 1], ["0.5", 1], ["0.7", 0.2], ["0.92", 0.2], ["1", 0.85]] }) },
  ]);
  await writeFile(path.join(out, "hero-mobile.jpg"), await jpg(mobile).toBuffer());
}

/** Fotos dos seis cards de "O que tem aqui?": recorte 520×300 com a base dissolvida na cor do card. */
const PILLAR_CROPS = [
  { name: "pass", file: "prx-card-metal.png", top: 240 },
  { name: "bank", file: "prx-bank-card.jpg", top: 300 },
  { name: "live", file: "prx-live-concert.png", top: 380 },
  { name: "invest", file: "prx-invest-copper.jpg", top: 250 },
  { name: "level", file: "prx-3d-crystal.png", top: 230 },
  { name: "me", file: "prx-me-horizon.jpg", top: 330 },
];

async function pillars() {
  const W = 520;
  const H = 300;
  for (const crop of PILLAR_CROPS) {
    const source = sharp(showcase(crop.file));
    const { width = 576 } = await source.metadata();
    const scale = W / width;
    const photo = await sharp(showcase(crop.file))
      .resize({ width: W })
      .extract({ left: 0, top: Math.round(crop.top * scale), width: W, height: H })
      .toBuffer();
    const img = sharp(photo).composite([{ input: fade({ width: W, height: H, vertical: true, stops: [["0", 0.1, CARD], ["0.55", 0, CARD], ["1", 0.92, CARD]] }) }]);
    await writeFile(path.join(out, `pillar-${crop.name}.jpg`), await jpg(img).toBuffer());
  }
}

/** Moeda PRX COINS: disco de metal escuro, aro violeta→cobalto e o símbolo PRX em relevo. */
async function coin() {
  const S = 240;
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 240 240">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0.62" stop-color="#7c3aed" stop-opacity="0.55"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
    <radialGradient id="face" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stop-color="#34304a"/><stop offset="0.55" stop-color="#15131f"/><stop offset="1" stop-color="#08070d"/></radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="0.45" stop-color="#7c3aed"/><stop offset="1" stop-color="#2563eb"/></linearGradient>
  </defs>
  <circle cx="120" cy="120" r="118" fill="url(#glow)"/>
  <circle cx="120" cy="120" r="92" fill="url(#face)" stroke="url(#rim)" stroke-width="7"/>
  <circle cx="120" cy="120" r="80" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.5"/>
  <path d="M62 78 A70 70 0 0 1 150 56" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/>
</svg>`);
  const symbol = await sharp(await svgBuffer(brand("prx-symbol-on-dark.svg")), { density: 300 }).resize({ width: 104 }).png().toBuffer();
  const symbolMeta = await sharp(symbol).metadata();
  const img = await sharp(base)
    .composite([{ input: symbol, left: Math.round((S - 104) / 2), top: Math.round((S - (symbolMeta.height ?? 75)) / 2) }])
    .png()
    .toBuffer();
  await writeFile(path.join(out, "prx-coin.png"), img);
}

/** Ícones de traço fino (Lucide, ISC) em branco, 48px para exibir em 24px. */
const ICONS = {
  pass: "star",
  bank: "landmark",
  live: "calendar-days",
  invest: "chart-column",
  level: "lightbulb",
  me: "heart",
  trophy: "trophy",
  gift: "gift",
  users: "users",
  arrow: "arrow-right",
};

function toSvg(node, color) {
  const attrs = (obj) =>
    Object.entries(obj)
      .filter(([k]) => k !== "key")
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
  const children = node.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`,
  );
}

async function icons() {
  for (const [name, lucide] of Object.entries(ICONS)) {
    const mod = await import(pathToFileURL(path.join(root, "node_modules", "lucide-react", "dist", "esm", "icons", `${lucide}.mjs`)).href);
    const node = mod.__iconData.node;
    await writeFile(path.join(out, `icon-${name}.png`), await sharp(toSvg(node, "#ffffff"), { density: 144 }).resize(48, 48).png().toBuffer());
  }
}

await mkdir(out, { recursive: true });
await Promise.all([logos(), hero(), pillars(), coin(), icons()]);
console.log("E-mail: assets gerados em public/email/");
