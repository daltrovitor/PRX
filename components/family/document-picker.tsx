// Hello World
"use client";

import { useId, useRef, useState } from "react";
import { DOCUMENT_LABEL, type DocumentKind, type DocumentRef } from "@/lib/family/types";
import { uploadFamilyDocument } from "@/components/family/family-client";
import { compressImageFile } from "@/lib/media/compression";
import { cn } from "@/lib/utils";

/**
 * Envio de um documento (foto ou PDF, até 10 MB). No celular abre câmera ou
 * galeria. O arquivo vai para a pasta privada do usuário; a tela guarda só a referência.
 */
export function DocumentPicker({
  kind,
  value,
  onChange,
  optional = false,
  hint,
}: {
  kind: DocumentKind;
  value: DocumentRef | null;
  onChange: (ref: DocumentRef | null) => void;
  optional?: boolean;
  hint?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      // Foto (RG, CNH, certidão): compacta e redimensiona em JPEG, formato que o banco parceiro aceita (WebP não).
      const uploadFile = file.type.startsWith("image/")
        ? await compressImageFile(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.85, mimeType: "image/jpeg" })
        : file;
      onChange(await uploadFamilyDocument(kind, uploadFile));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no envio.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={cn("rounded-2xl p-4 transition-colors", value ? "bg-success/[0.07]" : "bg-surface")}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="block text-[15px] font-medium text-ink">
            {DOCUMENT_LABEL[kind]}
            {optional && <span className="font-normal text-muted-foreground"> · opcional</span>}
          </label>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{value ? `Enviado: ${value.name || "arquivo"}` : hint || "Foto nítida ou PDF, até 10 MB"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {value && !busy && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex min-h-12 cursor-pointer items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-ink"
            >
              Remover
            </button>
          )}
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="glass-chip inline-flex min-h-12 cursor-pointer items-center rounded-full px-4 text-[14px] font-medium text-ink disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Enviando…" : value ? "Trocar" : "Enviar"}
          </button>
        </div>
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        className="sr-only"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
