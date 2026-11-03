// Hello World
"use client";

import type { ChangeEvent } from "react";
import { Avatar } from "@/components/app/ui";
import { IconUpload } from "@/components/icons/prx-icons";
import { compressImageFile } from "@/lib/media/compression";

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/** Foto do Insider: escolhe, reduz no aparelho e devolve como data URL (o servidor refaz e valida a imagem). */
export function PhotoPicker({ name, src, onPick, onError }: { name: string; src: string | null; onPick: (dataUrl: string) => void; onError: (message: string) => void }) {
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      onPick(await readAsDataUrl(await compressImageFile(file, { maxWidth: 800, maxHeight: 800, quality: 0.82, minBytesToCompress: 0 })));
    } catch {
      onError("Não conseguimos ler esta imagem. Escolha outra foto.");
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || "Insider"} src={src} size={64} />
      <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-surface px-4 text-sm text-ink transition-colors hover:bg-line has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
        <IconUpload size={16} />
        {src ? "Trocar foto" : "Enviar foto"}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e)} />
      </label>
    </div>
  );
}
