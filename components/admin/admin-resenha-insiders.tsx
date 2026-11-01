// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Avatar, Button, Field, Input, Notice, Segmented, Sheet, Tag } from "@/components/app/ui";
import { ImagePicker, useImageUpload } from "@/components/admin/image-picker";
import type { AdminOverview } from "@/lib/resenha/admin";

export type RegistryInsider = AdminOverview["insiders"][number];

export interface InsiderProfilePayload {
  mode: "create" | "link";
  name: string;
  handle: string;
  avatarUrl: string;
  email: string;
}

/** Cadastro de Insiders: foto, nome e @ que aparecem no catálogo do app, e a senha individual do portal. */
export function InsiderRegistry({
  insiders,
  busy,
  onNew,
  onEdit,
  onReset,
  onToggle,
  onDecide,
}: {
  insiders: RegistryInsider[];
  busy: boolean;
  onNew: () => void;
  onEdit: (insider: RegistryInsider) => void;
  onReset: (insider: RegistryInsider) => void;
  onToggle: (insider: RegistryInsider) => void;
  onDecide: (insider: RegistryInsider, decision: "approve" | "reject") => void;
}) {
  const pending = insiders.filter((i) => i.status === "pending");
  return (
    <section aria-labelledby="insiders-title" className="space-y-3 rounded-3xl border border-line p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="insiders-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
            Insiders
          </h3>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Foto, nome e @ aparecem para os membros no catálogo da Resenha, onde eles pedem para comprar o convite. Cada Insider tem a própria senha do portal. Depois de cadastrar, coloque o Insider em uma edição.
          </p>
        </div>
        <Button onClick={onNew}>Cadastrar Insider</Button>
      </div>
      {pending.length > 0 && (
        <div className="space-y-2" role="region" aria-label="Cadastros aguardando aprovação">
          <p className="text-[13px] font-medium text-ink">Aguardando aprovação ({pending.length})</p>
          <ul className="space-y-2">
            {pending.map((insider) => (
              <li key={insider.id} className="flex flex-col gap-3 rounded-2xl bg-surface p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={insider.name} src={insider.avatarUrl || null} size={48} />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-ink">{insider.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {insider.handle ? `@${insider.handle} · ` : ""}
                      {insider.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onDecide(insider, "approve")} disabled={busy}>
                    Aprovar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => onDecide(insider, "reject")} disabled={busy}>
                    Recusar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {insiders.length === pending.length ? (
        pending.length === 0 ? (
          <Notice>Nenhum Insider cadastrado ainda.</Notice>
        ) : null
      ) : (
        <ul className="space-y-2">
          {insiders.filter((i) => i.status !== "pending").map((insider) => (
            <li key={insider.id} className="flex flex-col gap-3 rounded-2xl bg-surface p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={insider.name} src={insider.avatarUrl || null} size={48} />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
                    <span className="truncate">{insider.name}</span>
                    {insider.status === "rejected" ? <Tag tone="warning">Recusado</Tag> : !insider.active && <Tag tone="warning">Desativado</Tag>}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {insider.handle ? `@${insider.handle} · ` : ""}
                    {insider.email}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => onEdit(insider)} disabled={busy}>
                  Editar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onReset(insider)} disabled={busy}>
                  Nova senha
                </Button>
                {insider.status === "rejected" ? (
                  <Button size="sm" variant="ghost" onClick={() => onDecide(insider, "approve")} disabled={busy}>
                    Aprovar
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => onToggle(insider)} disabled={busy}>
                    {insider.active ? "Desativar" : "Reativar"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Cadastrar (insider = null) ou editar um Insider: foto, nome, @ e, no cadastro, o e-mail do login. */
export function InsiderProfileSheet({
  insider,
  busy,
  error,
  onClose,
  onSave,
}: {
  insider: RegistryInsider | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: InsiderProfilePayload) => void;
}) {
  const [draft, setDraft] = useState<InsiderProfilePayload>({ mode: "create", name: insider?.name ?? "", handle: insider?.handle ?? "", avatarUrl: insider?.avatarUrl ?? "", email: insider?.email ?? "" });
  const [photoError, setPhotoError] = useState<string | null>(null);
  const set = <K extends keyof InsiderProfilePayload>(key: K, value: InsiderProfilePayload[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const upload = useImageUpload((url) => set("avatarUrl", url), setPhotoError);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={insider ? "Editar Insider" : "Cadastrar Insider"}
      description={insider ? "Foto, nome e @ aparecem para os membros no catálogo da Resenha." : "O sistema cria o login e uma senha individual, mostrada uma única vez."}
      footer={
        <Button block type="submit" form="resenha-insider-profile-form" disabled={busy || upload.busy}>
          {busy ? "Salvando…" : insider ? "Salvar" : "Cadastrar e gerar senha"}
        </Button>
      }
    >
      <form id="resenha-insider-profile-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ImagePicker
            label="Foto (aparece no catálogo da Resenha)"
            value={draft.avatarUrl}
            busy={upload.busy}
            square
            onChange={(e) => {
              setPhotoError(null);
              void upload.upload(e, "logo");
            }}
          />
          {photoError && <p className="mt-1.5 text-[13px] text-destructive">{photoError}</p>}
        </div>
        <Field label="Nome (aparece no catálogo)">{(id) => <Input id={id} value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={80} required />}</Field>
        <Field label="@ do Instagram (aparece no catálogo)" hint="Sem o @: ele aparece como @usuario.">
          {(id, describedBy) => (
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-ink">
                @
              </span>
              <Input id={id} aria-describedby={describedBy} autoCapitalize="none" autoCorrect="off" placeholder="usuario" value={draft.handle} onChange={(e) => set("handle", e.target.value.replace(/@/g, ""))} />
            </div>
          )}
        </Field>
        {!insider && (
          <>
            <div className="sm:col-span-2">
              <Segmented
                label="Acesso do Insider"
                value={draft.mode}
                onChange={(mode) => set("mode", mode)}
                options={[
                  { value: "create", label: "Criar acesso e senha" },
                  { value: "link", label: "Vincular conta existente" },
                ]}
              />
            </div>
            <Field label="E-mail do login" className="sm:col-span-2" hint={draft.mode === "link" ? "A conta PRX já existe: o Insider entra com a senha que já tem." : "Será o login do portal insider.prx.app.br."}>
              {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="email" inputMode="email" autoCapitalize="none" value={draft.email} onChange={(e) => set("email", e.target.value)} required />}
            </Field>
          </>
        )}
        {error && (
          <Notice tone="error" className="sm:col-span-2">
            {error}
          </Notice>
        )}
      </form>
    </Sheet>
  );
}
