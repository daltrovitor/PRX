// Hello World
"use client";

import { useState, type ChangeEvent } from "react";
import { IconImage, IconUpload } from "@/components/icons/prx-icons";
import { compressImageFile } from "@/lib/media/compression";
import { PrxImage } from "@/components/ui/prx-image";

/** Envia a imagem para o bucket do Supabase Storage ou gera fallback compactado com gzip. */
export function useImageUpload(onUploaded: (url: string) => void, onError: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  /** "brand": material oficial (ex.: imagem do PRX Founders), em resolução maior e sem perder qualidade. */
  async function upload(event: ChangeEvent<HTMLInputElement>, type: "logo" | "banner" | "brand") {
    const rawFile = event.target.files?.[0];
    event.target.value = "";
    if (!rawFile) return;
    setBusy(true);
    try {
      // Compacta e redimensiona antes de enviar para poupar banda e espaço no banco
      const file = await compressImageFile(rawFile, {
        maxWidth: type === "logo" ? 800 : type === "brand" ? 2400 : 1600,
        maxHeight: type === "logo" ? 800 : type === "brand" ? 2400 : 1200,
        quality: type === "brand" ? 0.92 : 0.82,
      });
      const body = new FormData();
      body.append("file", file);
      body.append("type", type);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) onError(data.error || "Falha no envio da imagem.");
      else onUploaded(data.url);
    } catch {
      onError("Falha no envio da imagem.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, upload };
}

export function ImagePicker({
  label,
  value,
  busy,
  onChange,
  square = false,
}: {
  label: string;
  value: string;
  busy: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  square?: boolean;
}) {
  return (
    <div>
      <p className="text-[13px] font-medium text-ink">{label}</p>
      <label className="mt-1.5 flex min-h-20 cursor-pointer items-center gap-4 rounded-2xl bg-surface p-3 transition-colors hover:bg-line has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
        <span className={`relative shrink-0 overflow-hidden rounded-xl bg-card ${square ? "h-14 w-14" : "h-14 w-24"}`}>
          {value ? (
            <PrxImage src={value} alt="" fill sizes="96px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
              <IconImage size={18} />
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 text-sm text-ink">
          <IconUpload size={16} />
          {busy ? "Enviando…" : value ? "Trocar imagem" : "Enviar imagem"}
        </span>
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={onChange} />
      </label>
    </div>
  );
}
