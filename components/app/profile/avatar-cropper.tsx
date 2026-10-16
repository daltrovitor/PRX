// Hello World
"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/app/ui";
import { CROP_OUTPUT, MAX_ZOOM, MIN_ZOOM, clampOffset, clampZoom, cropRect, displaySize, imagePosition, type Offset, type Size } from "@/lib/profile/crop";

type Loaded = { image: HTMLImageElement; size: Size };

/**
 * Enquadramento da foto de perfil antes do envio: arrastar para posicionar,
 * zoom pelo controle, pela roda do mouse, pela pinça no celular ou pelas
 * teclas (+, − e setas). O círculo mostra como a foto aparece no app; o que
 * sai é um quadrado de 1024 px, que o servidor ainda reduz e limpa.
 */
export function AvatarCropper({ src, busy, onCancel, onConfirm }: { src: string; busy: boolean; onCancel: () => void; onConfirm: (photo: Blob) => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState(280);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });

  useEffect(() => {
    let alive = true;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => alive && setLoaded({ image, size: { w: image.naturalWidth, h: image.naturalHeight } });
    image.onerror = () => alive && setFailed(true);
    image.src = src;
    return () => {
      alive = false;
    };
  }, [src]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setView(entry.contentRect.width));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const shown = loaded ? displaySize(loaded.size, view, zoom) : { w: view, h: view };
  const safe = clampOffset(offset, shown, view);
  const position = imagePosition(shown, view, safe);

  function applyZoom(next: number) {
    const target = clampZoom(next);
    setOffset((current) => ({ x: (current.x * target) / zoom, y: (current.y * target) / zoom }));
    setZoom(target);
  }

  function move(dx: number, dy: number) {
    setOffset(clampOffset({ x: safe.x + dx, y: safe.y + dy }, shown, view));
  }

  // A roda do mouse precisa de um ouvinte não passivo para não rolar a página por trás.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const target = clampZoom(zoom * Math.exp(-event.deltaY * 0.0015));
      setOffset((current) => ({ x: (current.x * target) / zoom, y: (current.y * target) / zoom }));
      setZoom(target);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoom]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) return move(event.clientX - previous.x, event.clientY - previous.y);
    const [a, b] = [...pointers.current.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (!pinch.current) pinch.current = { distance, zoom };
    else applyZoom((pinch.current.zoom * distance) / pinch.current.distance);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 30 : 10;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(step, 0),
      ArrowRight: () => move(-step, 0),
      ArrowUp: () => move(0, step),
      ArrowDown: () => move(0, -step),
      "+": () => applyZoom(zoom + 0.1),
      "=": () => applyZoom(zoom + 0.1),
      "-": () => applyZoom(zoom - 0.1),
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  function confirm() {
    if (!loaded) return;
    const { sx, sy, size } = cropRect(loaded.size, view, zoom, safe);
    const side = Math.max(256, Math.min(CROP_OUTPUT, Math.round(size)));
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d");
    if (!context) return setFailed(true);
    context.imageSmoothingQuality = "high";
    context.drawImage(loaded.image, sx, sy, size, size, 0, 0, side, side);
    canvas.toBlob((blob) => (blob ? onConfirm(blob) : setFailed(true)), "image/jpeg", 0.9);
  }

  if (failed) {
    return (
      <div className="space-y-4">
        <p className="text-[15px] text-ink">Não conseguimos abrir esta foto aqui. Escolha uma foto JPG, PNG ou WebP.</p>
        <Button variant="secondary" onClick={onCancel}>
          Escolher outra
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div
        ref={frameRef}
        data-lenis-prevent
        role="group"
        tabIndex={0}
        aria-label="Enquadramento da foto. Arraste para posicionar; use as setas para mover e + ou − para o zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative mx-auto aspect-square w-full max-w-[320px] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        {loaded && (
          <div
            aria-hidden
            className="absolute left-0 top-0 bg-cover will-change-transform"
            style={{ width: shown.w, height: shown.h, backgroundImage: `url("${src}")`, transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
          />
        )}
        {/* Fora do círculo escurece: é assim que a foto aparece no app. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] ring-1 ring-white/70" />
        {!loaded && <p className="absolute inset-0 grid place-items-center text-[14px] text-white/80">Abrindo a foto…</p>}
      </div>

      <label className="mx-auto flex max-w-[320px] items-center gap-3 text-[13px] text-muted-foreground">
        <span>Zoom</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!loaded}
          onChange={(e) => applyZoom(Number(e.target.value))}
          className="h-12 flex-1 cursor-pointer accent-[#7c3aed]"
        />
      </label>

      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="ghost" size="sm" disabled={!loaded || busy} onClick={() => (setZoom(1), setOffset({ x: 0, y: 0 }))}>
          Centralizar
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" disabled={!loaded || busy} onClick={confirm}>
          {busy ? "Enviando…" : "Usar esta foto"}
        </Button>
      </div>
    </div>
  );
}
