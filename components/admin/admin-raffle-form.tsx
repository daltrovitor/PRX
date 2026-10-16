// Hello World
"use client";

import { useState } from "react";
import { Button, Checkbox, Field, Input, Notice, Sheet, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { ImagePicker, useImageUpload } from "@/components/admin/image-picker";
import { adminPost, errorText } from "@/components/admin/admin-api";
import type { Raffle } from "@/lib/raffles/types";

const local = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");
const toIso = (v: string) => (v ? new Date(v).toISOString() : "");

type Form = Record<
  "title" | "description" | "imageUrl" | "prize" | "prizeValue" | "rules" | "startsAt" | "endsAt" | "drawAt" | "winnersCount" | "maxEntriesPerUser" | "minAge" | "authorizationNumber" | "authorizationIssuer" | "authorizationValidUntil" | "regulationUrl",
  string
> & { requiresActiveBank: boolean; foundersOnly: boolean; subscribersOnly: boolean };

const from = (r: Raffle | null): Form => ({
  title: r?.title ?? "",
  description: r?.description ?? "",
  imageUrl: r?.imageUrl ?? "",
  prize: r?.prize ?? "",
  prizeValue: r?.prizeValue?.toString() ?? "",
  rules: r?.rules ?? "",
  startsAt: local(r?.startsAt),
  endsAt: local(r?.endsAt),
  drawAt: local(r?.drawAt),
  winnersCount: String(r?.winnersCount ?? 1),
  maxEntriesPerUser: String(r?.maxEntriesPerUser ?? 1),
  minAge: r?.minAge?.toString() ?? "",
  authorizationNumber: r?.authorizationNumber ?? "",
  authorizationIssuer: r?.authorizationIssuer ?? "SPA/MF",
  authorizationValidUntil: r?.authorizationValidUntil ?? "",
  regulationUrl: r?.regulationUrl ?? "",
  requiresActiveBank: r?.requiresActiveBank ?? false,
  foundersOnly: r?.foundersOnly ?? false,
  subscribersOnly: r?.subscribersOnly ?? false,
});

/** Cadastro do sorteio. Depois de publicado, só título, descrição, imagem e texto das regras mudam. */
export function AdminRaffleForm({ raffle, onClose, onSaved }: { raffle: Raffle | null; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useConfirmToast();
  const [form, setForm] = useState<Form>(() => from(raffle));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const upload = useImageUpload(
    (url) => set("imageUrl", url),
    (msg) => showToast("error", msg)
  );
  const locked = Boolean(raffle && raffle.status !== "draft");

  async function save() {
    setSaving(true);
    try {
      await adminPost("/api/admin/raffles", {
        action: "save",
        id: raffle?.id,
        data: {
          ...form,
          imageUrl: form.imageUrl || null,
          prizeValue: form.prizeValue ? Number(form.prizeValue.replace(",", ".")) : null,
          startsAt: toIso(form.startsAt),
          endsAt: toIso(form.endsAt),
          drawAt: toIso(form.drawAt),
          winnersCount: Number(form.winnersCount),
          maxEntriesPerUser: Number(form.maxEntriesPerUser),
          minAge: form.minAge ? Number(form.minAge) : null,
          authorizationValidUntil: form.authorizationValidUntil || null,
        },
      });
      showToast("success", raffle ? "Sorteio atualizado." : "Rascunho criado. Publique quando a autorização estiver em mãos.");
      onSaved();
    } catch (err) {
      showToast("error", errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={raffle ? "Editar sorteio" : "Novo sorteio"}
      size="lg"
      footer={
        <Button block disabled={saving} onClick={() => void save()}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {locked && <Notice className="sm:col-span-2">Publicado: prêmio, datas, elegibilidade e autorização ficam travados para quem já participa.</Notice>}
        <Field label="Nome" className="sm:col-span-2">{(id) => <Input id={id} value={form.title} onChange={(e) => set("title", e.target.value)} />}</Field>
        <div className="sm:col-span-2">
          <ImagePicker label="Imagem (opcional)" value={form.imageUrl} busy={upload.busy} onChange={(e) => void upload.upload(e, "banner")} />
        </div>
        <Field label="Descrição" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />}</Field>
        <Field label="Prêmio">{(id) => <Input id={id} disabled={locked} value={form.prize} onChange={(e) => set("prize", e.target.value)} />}</Field>
        <Field label="Valor do prêmio (R$, opcional)">{(id) => <Input id={id} inputMode="decimal" value={form.prizeValue} onChange={(e) => set("prizeValue", e.target.value)} />}</Field>
        <Field label="Inscrições abrem">{(id) => <Input id={id} type="datetime-local" disabled={locked} value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />}</Field>
        <Field label="Inscrições fecham">{(id) => <Input id={id} type="datetime-local" disabled={locked} value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />}</Field>
        <Field label="Data do sorteio">{(id) => <Input id={id} type="datetime-local" disabled={locked} value={form.drawAt} onChange={(e) => set("drawAt", e.target.value)} />}</Field>
        <Field label="Número de ganhadores">{(id) => <Input id={id} type="number" min={1} max={100} disabled={locked} value={form.winnersCount} onChange={(e) => set("winnersCount", e.target.value)} />}</Field>
        <Field label="Participações por pessoa">{(id) => <Input id={id} type="number" min={1} max={10} disabled={locked} value={form.maxEntriesPerUser} onChange={(e) => set("maxEntriesPerUser", e.target.value)} />}</Field>
        <Field label="Idade mínima (opcional)">{(id) => <Input id={id} type="number" min={12} disabled={locked} value={form.minAge} onChange={(e) => set("minAge", e.target.value)} />}</Field>
        <Checkbox label="Só com a conta PRX BANK ativa" disabled={locked} checked={form.requiresActiveBank} onChange={(v) => set("requiresActiveBank", v)} />
        <Checkbox label="Só Founders" disabled={locked} checked={form.foundersOnly} onChange={(v) => set("foundersOnly", v)} />
        <Checkbox label="Só assinantes" disabled={locked} checked={form.subscribersOnly} onChange={(v) => set("subscribersOnly", v)} />
        <Field label="Regras (texto que o membro lê antes de participar)" className="sm:col-span-2">{(id) => <Textarea id={id} rows={5} value={form.rules} onChange={(e) => set("rules", e.target.value)} />}</Field>
        <div className="space-y-3 rounded-2xl border border-line p-4 sm:col-span-2">
          <p className="text-[13px] font-semibold text-ink">Base legal (obrigatória para publicar)</p>
          <p className="text-[12px] text-muted-foreground">
            Sorteio ligado a promoção comercial precisa de autorização prévia (Lei 5.768/1971; hoje pela Secretaria de Prêmios e Apostas do Ministério da Fazenda). Confirme com o jurídico.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nº do certificado de autorização">{(id) => <Input id={id} disabled={locked} value={form.authorizationNumber} onChange={(e) => set("authorizationNumber", e.target.value)} />}</Field>
            <Field label="Órgão">{(id) => <Input id={id} value={form.authorizationIssuer} onChange={(e) => set("authorizationIssuer", e.target.value)} />}</Field>
            <Field label="Válida até">{(id) => <Input id={id} type="date" value={form.authorizationValidUntil} onChange={(e) => set("authorizationValidUntil", e.target.value)} />}</Field>
            <Field label="Link do regulamento (https)">{(id) => <Input id={id} disabled={locked} value={form.regulationUrl} onChange={(e) => set("regulationUrl", e.target.value)} />}</Field>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
