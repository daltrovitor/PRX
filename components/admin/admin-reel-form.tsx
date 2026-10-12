// Hello World
"use client";

import { useMemo, type ChangeEvent, type FormEvent } from "react";
import { Checkbox, Field, Input, Notice, Select, Textarea } from "@/components/app/ui";
import { IconUpload } from "@/components/icons/prx-icons";
import type { PartnerOverview } from "@/lib/partners/service";
import type { Benefit } from "@/lib/pass-data";
import {
  REEL_COLLECTIONS,
  REEL_COLLECTION_LABEL,
  REEL_CTA_KINDS,
  REEL_CTA_LABEL,
  REEL_PLACEMENTS,
  REEL_PLACEMENT_LABEL,
  type PartnerReel,
  type ReelCollection,
  type ReelCtaKind,
  type ReelPlacement,
} from "@/lib/reels/types";

/** Formulário de um Destaque: vídeo do feed ou banner de imagem da Home (mesmo cadastro, mesmas métricas). */

export interface ReelForm {
  partnerId: string;
  brandName: string;
  placement: ReelPlacement;
  collection: ReelCollection;
  title: string;
  caption: string;
  videoUrl: string;
  posterUrl: string;
  ctaKind: ReelCtaKind;
  ctaLabel: string;
  ctaTarget: string;
  sortOrder: string;
  active: boolean;
}

export const EMPTY_REEL_FORM: ReelForm = {
  partnerId: "",
  brandName: "",
  placement: "feed",
  collection: "descubra",
  title: "",
  caption: "",
  videoUrl: "",
  posterUrl: "",
  ctaKind: "catalog",
  ctaLabel: "",
  ctaTarget: "",
  sortOrder: "0",
  active: true,
};

export function reelToForm(reel: PartnerReel): ReelForm {
  return {
    partnerId: reel.partnerId,
    brandName: reel.partnerId ? "" : reel.partnerName,
    placement: reel.placement,
    collection: reel.collection,
    title: reel.title,
    caption: reel.caption,
    videoUrl: reel.videoUrl,
    posterUrl: reel.posterUrl,
    ctaKind: reel.ctaKind,
    ctaLabel: reel.ctaLabel,
    ctaTarget: reel.ctaTarget,
    sortOrder: String(reel.sortOrder),
    active: reel.active,
  };
}

/**
 * Envio em duas etapas: o servidor valida e devolve uma URL assinada do
 * Supabase Storage, e o navegador manda o arquivo direto para lá (sem o limite
 * de corpo da hospedagem). Sem Supabase, o arquivo vai para a própria API.
 */
export async function uploadReelMedia(file: File, kind: "video" | "poster"): Promise<string> {
  const res = await fetch("/api/admin/reels/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
  });
  const json = (await res.json().catch(() => ({}))) as { mode?: "signed" | "direct"; signedUrl?: string; publicUrl?: string; error?: string };
  if (!res.ok) throw new Error(json.error || "Falha no envio.");

  if (json.mode === "signed" && json.signedUrl && json.publicUrl) {
    const body = new FormData();
    body.append("cacheControl", "31536000");
    body.append("", file);
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const put = await fetch(json.signedUrl, { method: "PUT", headers: { "x-upsert": "false", ...(anon ? { apikey: anon } : {}) }, body });
    if (!put.ok) throw new Error(`O Storage recusou o arquivo (${put.status}). Tente de novo.`);
    return json.publicUrl;
  }

  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  const direct = await fetch("/api/admin/reels/upload", { method: "POST", body: form });
  const data = (await direct.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!direct.ok || !data.url) throw new Error(data.error || "Falha no envio.");
  return data.url;
}

function MediaField({
  label,
  hint,
  value,
  busy,
  accept,
  onUrl,
  onFile,
}: {
  label: string;
  hint?: string;
  value: string;
  busy: boolean;
  accept: string;
  onUrl: (url: string) => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Field label={label} hint={hint ?? "Envie o arquivo ou cole uma URL https."}>
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={value} onChange={(e) => onUrl(e.target.value)} placeholder="https://" />}
      </Field>
      <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-line has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
        <IconUpload size={16} />
        {busy ? "Enviando…" : "Enviar arquivo"}
        <input type="file" accept={accept} className="sr-only" onChange={onFile} disabled={busy} />
      </label>
    </div>
  );
}

export function ReelFormFields({
  form,
  onChange,
  partners,
  benefits,
  uploading,
  onFile,
  error,
  onSubmit,
}: {
  form: ReelForm;
  onChange: (next: ReelForm) => void;
  /** Parceiros que podem receber destaque (os bloqueados ficam de fora). */
  partners: PartnerOverview[];
  benefits: Benefit[];
  uploading: "video" | "poster" | null;
  onFile: (event: ChangeEvent<HTMLInputElement>, kind: "video" | "poster") => void;
  error: string | null;
  onSubmit: (event: FormEvent) => void;
}) {
  const banner = form.placement === "home";
  const partnerBenefits = useMemo(() => benefits.filter((b) => b.partnerId === form.partnerId), [benefits, form.partnerId]);

  /** Banner: a arte e o título começam pelo que o parceiro já tem cadastrado (dá para trocar). */
  function withBannerDefaults(next: ReelForm): ReelForm {
    const partner = partners.find((p) => p.id === next.partnerId);
    if (next.placement !== "home" || !partner) return next;
    return { ...next, posterUrl: next.posterUrl || partner.bannerUrl, title: next.title || partner.tradeName };
  }

  return (
    <form id="reel-form" onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
      <Field label="Onde aparece" className="sm:col-span-2" hint={banner ? "Imagem logo abaixo dos eventos na Home." : "Vídeo vertical no feed da aba Destaques."}>
        {(id, describedBy) => (
          <Select id={id} aria-describedby={describedBy} value={form.placement} onChange={(e) => onChange(withBannerDefaults({ ...form, placement: e.target.value as ReelPlacement }))}>
            {REEL_PLACEMENTS.map((p) => (
              <option key={p} value={p}>
                {REEL_PLACEMENT_LABEL[p]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Parceiro" hint={partners.length === 0 ? "Nenhum parceiro cadastrado: informe só a marca ao lado." : undefined}>
        {(id, describedBy) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={form.partnerId}
            onChange={(e) =>
              onChange(
                withBannerDefaults({
                  ...form,
                  partnerId: e.target.value,
                  ctaKind: !e.target.value && form.ctaKind === "benefit" ? "catalog" : form.ctaKind,
                  ctaTarget: form.ctaKind === "benefit" ? "" : form.ctaTarget,
                })
              )
            }
          >
            <option value="">Sem cadastro (só a marca)</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.tradeName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {!form.partnerId && (
        <Field label="Nome da marca" hint={banner ? "Aparece no cartão do banner." : "Aparece no cartão do vídeo."}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} required minLength={2} maxLength={80} value={form.brandName} onChange={(e) => onChange({ ...form, brandName: e.target.value })} />}
        </Field>
      )}
      {!banner && (
        <Field label="Coleção">
          {(id) => (
            <Select id={id} value={form.collection} onChange={(e) => onChange({ ...form, collection: e.target.value as ReelCollection })}>
              {REEL_COLLECTIONS.map((c) => (
                <option key={c} value={c}>
                  {REEL_COLLECTION_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label="Título" className="sm:col-span-2">
        {(id) => <Input id={id} required minLength={2} maxLength={80} value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} />}
      </Field>
      <Field label="Legenda (opcional)" className="sm:col-span-2">
        {(id) => <Textarea id={id} rows={2} maxLength={220} value={form.caption} onChange={(e) => onChange({ ...form, caption: e.target.value })} />}
      </Field>

      {banner ? (
        <MediaField
          label="Imagem do banner (JPG, PNG ou WEBP, até 8 MB)"
          hint="Formato quase quadrado funciona melhor no celular (ex.: 1200×960); no computador a imagem é recortada na horizontal. Envie o arquivo ou cole uma URL https."
          value={form.posterUrl}
          busy={uploading === "poster"}
          accept="image/jpeg,image/png,image/webp"
          onUrl={(posterUrl) => onChange({ ...form, posterUrl })}
          onFile={(e) => onFile(e, "poster")}
        />
      ) : (
        <>
          <MediaField label="Vídeo vertical (MP4, WEBM ou MOV, até 50 MB)" value={form.videoUrl} busy={uploading === "video"} accept="video/mp4,video/webm,video/quicktime" onUrl={(videoUrl) => onChange({ ...form, videoUrl })} onFile={(e) => onFile(e, "video")} />
          <MediaField label="Capa (JPG, PNG ou WEBP)" value={form.posterUrl} busy={uploading === "poster"} accept="image/jpeg,image/png,image/webp" onUrl={(posterUrl) => onChange({ ...form, posterUrl })} onFile={(e) => onFile(e, "poster")} />
        </>
      )}

      <Field label="Ação do botão">
        {(id) => (
          <Select id={id} value={form.ctaKind} onChange={(e) => onChange({ ...form, ctaKind: e.target.value as ReelCtaKind, ctaTarget: "" })}>
            {REEL_CTA_KINDS.filter((k) => k !== "benefit" || form.partnerId).map((k) => (
              <option key={k} value={k}>
                {REEL_CTA_LABEL[k]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Texto do botão (opcional)" hint={`Vazio usa "${REEL_CTA_LABEL[form.ctaKind]}".`}>
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} maxLength={28} value={form.ctaLabel} onChange={(e) => onChange({ ...form, ctaLabel: e.target.value })} />}
      </Field>
      {form.ctaKind === "benefit" && (
        <Field label="Benefício do parceiro" className="sm:col-span-2" hint={partnerBenefits.length === 0 ? "Este parceiro ainda não tem benefícios no catálogo." : undefined}>
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} required value={form.ctaTarget} onChange={(e) => onChange({ ...form, ctaTarget: e.target.value })}>
              <option value="" disabled>
                Escolha o benefício
              </option>
              {partnerBenefits.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} · {b.discountLabel}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {form.ctaKind === "external" && (
        <Field label="Link da loja (https://)" className="sm:col-span-2">
          {(id) => <Input id={id} type="url" required pattern="https://.*" value={form.ctaTarget} onChange={(e) => onChange({ ...form, ctaTarget: e.target.value })} placeholder="https://" />}
        </Field>
      )}
      <Field label={banner ? "Ordem na Home" : "Ordem no feed"} hint="Menor aparece primeiro.">
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="number" min={0} max={9999} value={form.sortOrder} onChange={(e) => onChange({ ...form, sortOrder: e.target.value })} />}
      </Field>
      <Checkbox className="self-end" label={banner ? "Ativo na Home" : "Ativo no feed"} checked={form.active} onChange={(active) => onChange({ ...form, active })} />

      {error && (
        <Notice tone="error" className="sm:col-span-2">
          {error}
        </Notice>
      )}
    </form>
  );
}
