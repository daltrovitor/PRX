// Hello World
"use client";

import { useState, type ChangeEvent } from "react";
import { Avatar, Button, Notice, Sheet } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { useAuth } from "@/hooks/use-auth";
import { AvatarCropper } from "@/components/app/profile/avatar-cropper";

/** Foto original aceita para enquadrar (o que sobe ao servidor é o recorte de até 1024 px). */
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

/**
 * Foto de perfil: escolher, enquadrar (arrastar e zoom) e enviar; trocar ou
 * remover. O servidor ainda regrava a foto sem os metadados da câmera. Não
 * substitui a selfie da abertura do PRX BANK.
 */
export function AvatarEditor({ name, src }: { name: string; src: string | null | undefined }) {
  const { refreshUser } = useAuth();
  const { confirmDelete, showToast } = useConfirmToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null | undefined>(undefined);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const current = preview === undefined ? src : preview;
  const hasPhoto = Boolean(current && !current.includes("unsplash.com"));

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.files?.[0];
    event.target.value = "";
    if (!raw) return;
    if (!raw.type.startsWith("image/")) return setError("Escolha uma foto.");
    if (raw.size > MAX_SOURCE_BYTES) return setError("Foto acima de 30 MB. Escolha outra.");
    setError(null);
    setCropSrc(URL.createObjectURL(raw));
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function upload(photo: Blob) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", new File([photo], "avatar.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/profile/avatar", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { avatarUrl?: string; error?: string };
      if (!res.ok || !json.avatarUrl) throw new Error(json.error || "Não foi possível trocar a foto.");
      setPreview(json.avatarUrl);
      closeCrop();
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
    <div className="profile-avatar-editor flex flex-col items-center gap-3">
      <div className="profile-avatar-ring"><Avatar name={name} src={current} size={96} className="profile-avatar-face" /></div>
      <div className="flex flex-wrap justify-center gap-2">
        <label className="profile-photo-button glass-chip inline-flex min-h-12 cursor-pointer items-center rounded-full px-5 text-sm font-medium text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
          {busy && !cropSrc ? "Enviando…" : hasPhoto ? "Trocar foto" : "Adicionar foto"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" aria-label="Escolher foto de perfil" disabled={busy} onChange={pick} />
        </label>
        {hasPhoto && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
            Remover
          </Button>
        )}
      </div>
      {error && !cropSrc && <Notice tone="error">{error}</Notice>}

      <Sheet open={cropSrc !== null} onClose={() => !busy && closeCrop()} title="Ajustar foto" description="Arraste para posicionar e use o zoom. O círculo mostra como ela aparece no app.">
        {cropSrc && (
          <div className="space-y-4">
            <AvatarCropper src={cropSrc} busy={busy} onCancel={closeCrop} onConfirm={(photo) => void upload(photo)} />
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
