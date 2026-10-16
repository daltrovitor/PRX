// Hello World
"use client";

import { useState, type ChangeEvent } from "react";
import { Avatar, Button, Notice } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { useAuth } from "@/hooks/use-auth";
import { compressImageFile } from "@/lib/media/compression";

/**
 * Foto de perfil: enviar, trocar ou remover. A foto é reduzida aqui e
 * reprocessada no servidor (sem metadados da câmera). Não substitui a selfie
 * da abertura do PRX BANK.
 */
export function AvatarEditor({ name, src }: { name: string; src: string | null | undefined }) {
  const { refreshUser } = useAuth();
  const { confirmDelete, showToast } = useConfirmToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null | undefined>(undefined);
  const current = preview === undefined ? src : preview;
  const hasPhoto = Boolean(current && !current.includes("unsplash.com"));

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.files?.[0];
    event.target.value = "";
    if (!raw) return;
    if (!raw.type.startsWith("image/")) return setError("Escolha uma foto.");
    setBusy(true);
    setError(null);
    try {
      const file = await compressImageFile(raw, { maxWidth: 1024, maxHeight: 1024, quality: 0.9, mimeType: "image/jpeg" });
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { avatarUrl?: string; error?: string };
      if (!res.ok || !json.avatarUrl) throw new Error(json.error || "Não foi possível trocar a foto.");
      setPreview(json.avatarUrl);
      showToast("success", "Foto atualizada.");
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível trocar a foto.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirmDelete({ title: "Remover foto", message: "Remover a sua foto de perfil? Voltam as iniciais do seu nome.", confirmText: "Remover", type: "danger" }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Não foi possível remover a foto.");
      setPreview(null);
      showToast("success", "Foto removida.");
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover a foto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Avatar name={name} src={current} size={96} />
      <div className="flex flex-wrap justify-center gap-2">
        <label className="glass-chip inline-flex min-h-12 cursor-pointer items-center rounded-full px-5 text-sm font-medium text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
          {busy ? "Enviando…" : hasPhoto ? "Trocar foto" : "Adicionar foto"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" aria-label="Escolher foto de perfil" disabled={busy} onChange={(e) => void upload(e)} />
        </label>
        {hasPhoto && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
            Remover
          </Button>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
