// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Avatar, Button, Field, Input, Notice, Sheet } from "@/components/app/ui";
import { PhotoPicker } from "@/components/insider/photo-picker";
import { PASSWORD_HINT } from "@/lib/password-policy";

export interface OwnInsider {
  name: string;
  email: string;
  handle: string;
  avatarUrl: string;
}

/** Cartão "Seus dados" no topo do portal: foto, nome e @ como os membros veem, com edição. */
export function InsiderProfileCard({ insider, onSaved }: { insider: OwnInsider; onSaved: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="glass flex items-center gap-4 rounded-3xl p-4 sm:p-5" aria-label="Seus dados">
      <Avatar name={insider.name} src={insider.avatarUrl} size={56} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-ink">{insider.name}</p>
        <p className="truncate text-[13px] text-muted-foreground">{insider.handle ? `@${insider.handle}` : "Sem @ cadastrado"}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Editar meus dados
      </Button>
      {open && (
        <ProfileSheet
          insider={insider}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            await onSaved();
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}

function ProfileSheet({ insider, onClose, onSaved }: { insider: OwnInsider; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState({ name: insider.name, handle: insider.handle, currentPassword: "", newPassword: "" });
  const [photo, setPhoto] = useState("");
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const shown = removePhoto ? null : photo || insider.avatarUrl || null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/insider/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, photo, removePhoto }) });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) setError(data.error || "Não foi possível salvar seus dados.");
      else await onSaved();
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Editar meus dados"
      description="Foto, nome e @ aparecem para os membros no catálogo da Resenha. A foto também vale no seu perfil do app."
      footer={
        <Button block type="submit" form="insider-profile-form" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </Button>
      }
    >
      <form id="insider-profile-form" onSubmit={submit} className="space-y-5">
        <PhotoPicker
          name={draft.name}
          src={shown}
          onPick={(url) => {
            setError(null);
            setRemovePhoto(false);
            setPhoto(url);
          }}
          onError={setError}
        />
        {shown && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setPhoto("");
              setRemovePhoto(true);
            }}
          >
            Remover foto
          </Button>
        )}
        <Field label="Nome">{(id) => <Input id={id} autoComplete="name" required maxLength={80} value={draft.name} onChange={(e) => set("name", e.target.value)} />}</Field>
        <Field label="Seu @ do Instagram" hint="Sem o @: ele aparece como @usuario.">
          {(id, describedBy) => (
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-ink">
                @
              </span>
              <Input id={id} aria-describedby={describedBy} autoCapitalize="none" autoCorrect="off" placeholder="usuario" value={draft.handle} onChange={(e) => set("handle", e.target.value.replace(/@/g, ""))} />
            </div>
          )}
        </Field>
        <p className="text-[13px] text-muted-foreground">E-mail de login: {insider.email}</p>
        <fieldset className="space-y-4 rounded-2xl bg-surface p-4">
          <legend className="px-1 text-[13px] font-medium text-ink">Trocar a senha (opcional)</legend>
          <Field label="Senha atual">{(id) => <Input id={id} type="password" autoComplete="current-password" value={draft.currentPassword} onChange={(e) => set("currentPassword", e.target.value)} />}</Field>
          <Field label="Senha nova" hint={PASSWORD_HINT}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="password" autoComplete="new-password" value={draft.newPassword} onChange={(e) => set("newPassword", e.target.value)} />}
          </Field>
        </fieldset>
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Sheet>
  );
}
