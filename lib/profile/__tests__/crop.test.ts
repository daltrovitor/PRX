// Hello World
import { describe, expect, it } from "vitest";
import { MAX_ZOOM, clampOffset, clampZoom, coverScale, cropRect, displaySize } from "@/lib/profile/crop";

describe("enquadramento da foto de perfil", () => {
  const portrait = { w: 1000, h: 2000 };
  const view = 300;

  it("zoom 1 cobre o quadro sem sobra no lado menor", () => {
    expect(coverScale(portrait, view)).toBeCloseTo(0.3);
    expect(displaySize(portrait, view, 1)).toEqual({ w: 300, h: 600 });
  });

  it("o zoom fica entre 1 e o máximo", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it("não deixa a foto sair do quadro", () => {
    const shown = displaySize(portrait, view, 1);
    expect(clampOffset({ x: 50, y: 500 }, shown, view)).toEqual({ x: 0, y: 150 });
    expect(clampOffset({ x: -50, y: -500 }, shown, view)).toEqual({ x: 0, y: -150 });
  });

  it("centralizado, recorta o meio da foto", () => {
    expect(cropRect(portrait, view, 1, { x: 0, y: 0 })).toEqual({ sx: 0, sy: 500, size: 1000 });
  });

  it("arrastar para baixo mostra o topo; o zoom estreita o recorte", () => {
    expect(cropRect(portrait, view, 1, { x: 0, y: 150 })).toEqual({ sx: 0, sy: 0, size: 1000 });
    const zoomed = cropRect(portrait, view, 2, { x: 0, y: 0 });
    expect(zoomed.size).toBeCloseTo(500);
    expect(zoomed.sx).toBeCloseTo(250);
    expect(zoomed.sy).toBeCloseTo(750);
  });

  it("o recorte nunca passa da borda da imagem", () => {
    const r = cropRect(portrait, view, 4, { x: 9999, y: -9999 });
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy + r.size).toBeLessThanOrEqual(portrait.h + 1e-6);
    expect(r.sx + r.size).toBeLessThanOrEqual(portrait.w + 1e-6);
  });
});
