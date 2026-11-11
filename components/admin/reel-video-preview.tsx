"use client";

import { useRef, useState } from "react";
import { Button, Notice } from "@/components/app/ui";
import { videoPosterFile } from "@/lib/media/video-poster";

export function ReelVideoPreview({ url, poster, busy, onPoster, onDelete }: {
  url: string; poster: string; busy: boolean; onPoster: (file: File) => Promise<void>; onDelete?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = busy || capturing;
  async function capture() {
    if (!video.current || disabled) return;
    setError(null); setCapturing(true);
    video.current.pause();
    try { await onPoster(await videoPosterFile(video.current)); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível gerar a capa."); }
    finally { setCapturing(false); }
  }
  return (
    <div className="space-y-3 sm:col-span-2">
      <video ref={video} src={url} crossOrigin="anonymous" poster={poster || undefined} controls playsInline preload="metadata" aria-label="Vídeo enviado para o destaque" className="max-h-80 w-full rounded-xl bg-black"
        onLoadedMetadata={(event) => { const value = event.currentTarget.duration; setDuration(Number.isFinite(value) ? value : 0); }}
        onDurationChange={(event) => { const value = event.currentTarget.duration; if (Number.isFinite(value)) setDuration(value); }}
        onLoadedData={() => setLoaded(true)} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onSeeking={() => setSeeking(true)} onSeeked={() => setSeeking(false)}
        onError={() => { setLoaded(false); setError("Não foi possível reproduzir o vídeo. Confira o endereço ou envie o arquivo novamente."); }} />
      <label className="block space-y-2 text-sm">
        <span>Escolher momento da capa · {time.toFixed(1)} s{duration > 0 ? ` de ${duration.toFixed(1)} s` : ""}</span>
        <input aria-label="Momento do vídeo para a capa" type="range" min={0} max={duration || 0} step={0.1} value={Math.min(time, duration)} disabled={disabled || !duration}
          className="h-11 w-full accent-primary" onChange={(event) => { if (!video.current) return; video.current.pause(); const next = Math.min(Number(event.target.value), Math.max(0, duration - 0.05)); setTime(next); video.current.currentTime = next; }} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={disabled || !loaded || seeking} onClick={() => void capture()}>{capturing ? "Gerando capa…" : "Usar este momento como capa"}</Button>
        {onDelete && <Button variant="secondary" disabled={disabled} onClick={onDelete}>Excluir destaque e vídeo do Storage</Button>}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">Arraste o seletor ou pause o vídeo no momento desejado. A capa será enviada ao selecionar o botão; salve o destaque para publicar. Ao trocar e salvar o vídeo, o anterior é excluído do Storage se não estiver em outro destaque.</p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
