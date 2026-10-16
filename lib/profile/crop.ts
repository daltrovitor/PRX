// Hello World
/*
 * Matemática do enquadramento da foto de perfil (sem DOM, roda no navegador e
 * nos testes). O quadro é quadrado (lado `view`, em px de tela); a foto entra
 * no modo "cover" (zoom 1 preenche o quadro sem sobra) e o deslocamento é
 * medido a partir do centro. A foto nunca deixa canto vazio no quadro.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** Lado da imagem enviada ao servidor (ele reduz para 512 e regrava sem metadados). */
export const CROP_OUTPUT = 1024;

export interface Size {
  w: number;
  h: number;
}

export interface Offset {
  x: number;
  y: number;
}

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(zoom) ? zoom : MIN_ZOOM));

/** Escala que faz a foto cobrir o quadro inteiro (zoom 1). */
export function coverScale(image: Size, view: number): number {
  return Math.max(view / image.w, view / image.h);
}

/** Tamanho da foto na tela com o zoom aplicado. */
export function displaySize(image: Size, view: number, zoom: number): Size {
  const scale = coverScale(image, view) * clampZoom(zoom);
  return { w: image.w * scale, h: image.h * scale };
}

/** Prende o deslocamento para a foto continuar cobrindo o quadro. */
export function clampOffset(offset: Offset, shown: Size, view: number): Offset {
  const maxX = Math.max(0, (shown.w - view) / 2);
  const maxY = Math.max(0, (shown.h - view) / 2);
  const clamp = (value: number, max: number) => Math.min(max, Math.max(-max, value)) || 0; // "|| 0" tira o -0
  return { x: clamp(offset.x, maxX), y: clamp(offset.y, maxY) };
}

/** Posição do canto superior esquerdo da foto dentro do quadro. */
export function imagePosition(shown: Size, view: number, offset: Offset): Offset {
  return { x: view / 2 - shown.w / 2 + offset.x, y: view / 2 - shown.h / 2 + offset.y };
}

/** Recorte na foto original (px da imagem) que corresponde ao quadro visível. */
export function cropRect(image: Size, view: number, zoom: number, offset: Offset): { sx: number; sy: number; size: number } {
  const shown = displaySize(image, view, zoom);
  const scale = shown.w / image.w;
  const safe = clampOffset(offset, shown, view);
  const pos = imagePosition(shown, view, safe);
  const size = view / scale;
  const sx = Math.min(Math.max(0, -pos.x / scale), image.w - size);
  const sy = Math.min(Math.max(0, -pos.y / scale), image.h - size);
  return { sx, sy, size };
}
