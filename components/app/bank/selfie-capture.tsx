// Hello World
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * Foto do rosto só pela câmera frontal, ao vivo: não há campo de arquivo, então
 * a galeria nunca abre (o banco confere que é a própria pessoa, na hora). A
 * prévia aparece espelhada, como num espelho; a foto sai em JPEG sem espelhar.
 */

type CameraState = "closed" | "starting" | "live" | "saving";

const CAMERA_ERROR: Record<string, string> = {
  NotAllowedError: "Libere o acesso à câmera para o PRX nas configurações do navegador e tente de novo.",
  SecurityError: "Libere o acesso à câmera para o PRX nas configurações do navegador e tente de novo.",
  NotFoundError: "Não encontramos uma câmera neste aparelho. Abra o PRX no celular para tirar a selfie.",
  OverconstrainedError: "Não encontramos a câmera frontal. Abra o PRX no celular para tirar a selfie.",
  NotReadableError: "A câmera está em uso por outro app. Feche o outro app e tente de novo.",
};
const CAMERA_FALLBACK = "Não foi possível abrir a câmera. Tente de novo.";

/** Frase simples para cada recusa do navegador ao abrir a câmera. */
export function cameraErrorMessage(err: unknown): string {
  const name = typeof err === "object" && err !== null && "name" in err ? String((err as { name: unknown }).name) : "";
  return CAMERA_ERROR[name] ?? CAMERA_FALLBACK;
}

export function SelfieCapture({ taken, onCapture, label = "Foto do rosto (selfie)" }: { taken: boolean; onCapture: (photo: File) => Promise<void>; label?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("closed");
  const [error, setError] = useState<string | null>(null);

  const stop = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };

  // Câmera desligada ao sair da tela.
  useEffect(() => stop, []);

  useEffect(() => {
    if (state !== "live" || !video.current || !stream.current) return;
    video.current.srcObject = stream.current;
    void video.current.play().catch(() => undefined);
  }, [state]);

  async function open() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) return setError(CAMERA_ERROR.NotFoundError);
    setState("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      setState("live");
    } catch (err) {
      stop();
      setState("closed");
      setError(cameraErrorMessage(err));
    }
  }

  function close() {
    stop();
    setState("closed");
  }

  async function shoot() {
    const frame = video.current;
    if (!frame?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = frame.videoWidth;
    canvas.height = frame.videoHeight;
    canvas.getContext("2d")?.drawImage(frame, 0, 0);
    setState("saving");
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    stop();
    try {
      if (!blob) throw new Error(CAMERA_FALLBACK);
      await onCapture(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no envio. Tente de novo.");
    } finally {
      setState("closed");
    }
  }

  const cameraOn = state !== "closed";

  return (
    <div className={cn("rounded-2xl p-4 transition-colors", taken && !cameraOn ? "bg-success/[0.07]" : "bg-surface")}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink">{label}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{taken ? "Foto tirada" : "Só pela câmera frontal, na hora"}</p>
        </div>
        {!cameraOn && (
          <button
            type="button"
            onClick={() => void open()}
            className="glass-chip inline-flex min-h-12 shrink-0 cursor-pointer items-center rounded-full px-4 text-[14px] font-medium text-ink"
          >
            {taken ? "Tirar de novo" : "Tirar foto do rosto"}
          </button>
        )}
      </div>

      {cameraOn && (
        <div className="mt-3 space-y-3">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-ink">
            <video ref={video} playsInline muted autoPlay aria-label="Câmera frontal" className="h-full w-full -scale-x-100 object-cover" />
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">Rosto inteiro, de frente, com boa luz e sem óculos escuros ou boné.</p>
          <div className="flex gap-2">
            <Button className="min-h-12 flex-1" disabled={state !== "live"} onClick={() => void shoot()}>
              {state === "saving" ? "Enviando…" : state === "starting" ? "Abrindo a câmera…" : "Tirar foto"}
            </Button>
            <Button variant="ghost" className="min-h-12" disabled={state === "saving"} onClick={close}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
