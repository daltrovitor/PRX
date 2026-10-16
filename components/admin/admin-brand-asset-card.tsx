// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, Field, Input, Notice, Tag } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { useImageUpload, ImagePicker } from "@/components/admin/image-picker";
import { adminGet, adminPost, errorText } from "@/components/admin/admin-api";
import { formatDateTimeBr } from "@/components/admin/pager";
import { PLACEMENTS, PLACEMENT_LABEL, type BrandAsset, type Placement } from "@/lib/brand/asset-types";

/**
 * Imagem oficial do PRX Founders. Os lugares já existem no app e nos
 * e-mails; nada aparece enquanto a imagem não for enviada e ativada aqui.
 * Para trocar depois, basta enviar outra.
 */
export function AdminBrandAssetCard() {
  const { showToast } = useConfirmToast();
  const [asset, setAsset] = useState<BrandAsset | null>(null);
  const [draft, setDraft] = useState<{ url: string | null; alt: string; enabled: boolean; placements: Placement[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const upload = useImageUpload(
    (url) => setDraft((d) => (d ? { ...d, url } : d)),
    (msg) => showToast("error", msg)
  );

  const load = useCallback(async () => {
    try {
      const res = await adminGet<{ assets: BrandAsset[] }>("/api/admin/brand-assets");
      const found = res.assets.find((a) => a.key === "founders_official_image") ?? null;
      setAsset(found);
      if (found) setDraft({ url: found.url, alt: found.alt, enabled: found.enabled, placements: found.placements.length ? found.placements : [...PLACEMENTS] });
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await adminPost("/api/admin/brand-assets", { key: "founders_official_image", data: draft });
      showToast("success", draft.enabled ? "Imagem oficial publicada nos lugares marcados." : "Imagem salva (desligada).");
      await load();
    } catch (err) {
      showToast("error", errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="brand-founders" className="glass-soft space-y-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="brand-founders" className="text-[15px] font-semibold text-ink">
          Imagem oficial do PRX Founders
        </h3>
        <Tag tone={asset?.enabled ? "success" : "warning"}>{asset?.enabled ? "Publicada" : asset?.url ? "Enviada, desligada" : "Material pendente"}</Tag>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!asset?.url && <Notice tone="warning">Aguardando a imagem oficial. Enquanto ela não for enviada e ativada, nenhum lugar do app ou dos e-mails mostra o PRX Founders com imagem.</Notice>}
      {draft && (
        <div className="grid gap-4 sm:grid-cols-2">
          <ImagePicker label="Arquivo da imagem" value={draft.url ?? ""} busy={upload.busy} onChange={(e) => void upload.upload(e, "brand")} />
          <Field label="Texto alternativo (acessibilidade)">{(id) => <Input id={id} value={draft.alt} onChange={(e) => setDraft({ ...draft, alt: e.target.value })} placeholder="Ex.: Arte oficial do PRX Founders" />}</Field>
          <fieldset className="sm:col-span-2">
            <legend className="text-[13px] font-medium text-ink">Onde mostrar</legend>
            {PLACEMENTS.map((p) => (
              <Checkbox key={p} label={PLACEMENT_LABEL[p]} checked={draft.placements.includes(p)} onChange={(on) => setDraft({ ...draft, placements: on ? [...draft.placements, p] : draft.placements.filter((x) => x !== p) })} />
            ))}
          </fieldset>
          <Checkbox label="Ativar a exibição" hint="Só liga com a imagem enviada e o texto alternativo preenchido." checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} className="sm:col-span-2" />
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            {asset?.updatedAt && (
              <p className="text-[12px] text-muted-foreground">
                Alterada por {asset.updatedBy} em {formatDateTimeBr(asset.updatedAt)}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
