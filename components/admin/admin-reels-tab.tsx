// Hello World
"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Button, EmptyState, Notice, Sheet, Tag } from "@/components/app/ui";
import { IconPlus } from "@/components/icons/prx-icons";
import { EMPTY_REEL_FORM, ReelFormFields, reelToForm, uploadReelMedia, type ReelForm } from "@/components/admin/admin-reel-form";
import type { PartnerOverview } from "@/lib/partners/service";
import type { Benefit } from "@/lib/pass-data";
import { compressImageFile } from "@/lib/media/compression";
import { PrxImage } from "@/components/ui/prx-image";
import { REEL_COLLECTION_LABEL, ctaLabelOf, type PartnerReel, type ReelPlacement } from "@/lib/reels/types";

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Destaques: vídeos verticais 9:16 com produtos e novidades dos parceiros no
 * feed da aba Destaques e banners de imagem na Home. O feed e a Home mostram a
 * marca e o botão de ação; métricas ficam só aqui. Parceiro cadastrado é
 * opcional (basta o nome da marca).
 */
export function AdminReelsTab({ partners, benefits }: { partners: PartnerOverview[]; benefits: Benefit[] }) {
  const { confirmDelete, showToast } = useConfirmToast();
  const [reels, setReels] = useState<PartnerReel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerReel | null>(null);
  const [form, setForm] = useState<ReelForm>(EMPTY_REEL_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"video" | "poster" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectable = partners.filter((p) => p.status !== "BLOQUEADO");
  const banner = form.placement === "home";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reels", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { reels?: PartnerReel[]; error?: string };
      if (!res.ok || !json.reels) throw new Error(json.error || "Não foi possível carregar os Destaques.");
      setReels(json.reels);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Sem conexão.");
      setReels((r) => r ?? []);
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

  function openCreate(placement: ReelPlacement = "feed") {
    const partner = selectable[0];
    setEditing(null);
    // Banner: já começa pelo primeiro parceiro, com a imagem de banner e o nome que ele tem cadastrados.
    setForm({
      ...EMPTY_REEL_FORM,
      placement,
      partnerId: partner?.id ?? "",
      ...(placement === "home" && partner ? { posterUrl: partner.bannerUrl, title: partner.tradeName } : {}),
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(reel: PartnerReel) {
    setEditing(reel);
    setForm(reelToForm(reel));
    setError(null);
    setOpen(true);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>, kind: "video" | "poster") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(kind);
    setError(null);
    try {
      const fileToUpload =
        kind === "poster" ? await compressImageFile(file, banner ? { maxWidth: 1600, maxHeight: 1600, quality: 0.85 } : { maxWidth: 1080, maxHeight: 1920, quality: 0.82 }) : file;
      const url = await uploadReelMedia(fileToUpload, kind);
      setForm((f) => (kind === "video" ? { ...f, videoUrl: url } : { ...f, posterUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no envio.");
    } finally {
      setUploading(null);
    }
  }

  async function save(body: Record<string, unknown>, method: "POST" | "PUT") {
    const res = await fetch("/api/admin/reels", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) throw new Error(json.error || "Não foi possível salvar o destaque.");
  }

  function payload(f: ReelForm) {
    return { ...f, sortOrder: Number(f.sortOrder) || 0, ctaTarget: f.ctaKind === "catalog" ? "" : f.ctaTarget };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save(editing ? { id: editing.id, ...payload(form) } : payload(form), editing ? "PUT" : "POST");
      showToast("success", editing ? "Destaque atualizado." : banner ? "Banner publicado na Home." : "Vídeo publicado nos Destaques.");
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem conexão com o servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(reel: PartnerReel) {
    try {
      await save({ id: reel.id, ...payload({ ...reelToForm(reel), active: !reel.active }) }, "PUT");
      await load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Não foi possível alterar.");
    }
  }

  async function remove(reel: PartnerReel) {
    const what = reel.placement === "home" ? "banner" : "vídeo";
    const ok = await confirmDelete({
      title: `Excluir ${what}`,
      message: `"${reel.title}" sai ${reel.placement === "home" ? "da Home" : "do feed"} e as métricas são apagadas.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/reels?id=${encodeURIComponent(reel.id)}`, { method: "DELETE" });
    if (res.ok) {
      showToast("success", reel.placement === "home" ? "Banner excluído." : "Vídeo excluído.");
      await load();
    } else showToast("error", "Não foi possível excluir.");
  }

  const totals = (reels ?? []).reduce((acc, r) => ({ views: acc.views + r.views, likes: acc.likes + r.likes, clicks: acc.clicks + r.ctaClicks }), { views: 0, likes: 0, clicks: 0 });

  return (
    <section aria-labelledby="reels-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="reels-title" className="text-2xl font-semibold tracking-[-0.03em] text-ink">
            Destaques
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Vídeos verticais 9:16 na aba Destaques e banners de imagem na Home, com produtos e novidades dos parceiros. Cada um leva a um benefício, ao catálogo ou à loja.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => openCreate("home")}>
            <IconPlus size={18} />
            Novo banner da Home
          </Button>
          <Button onClick={() => openCreate("feed")}>
            <IconPlus size={18} />
            Novo vídeo
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <Kpi label="Visualizações" value={compact.format(totals.views)} />
        <Kpi label="Curtidas" value={compact.format(totals.likes)} />
        <Kpi label="Cliques no botão" value={compact.format(totals.clicks)} />
      </dl>

      {loadError && <Notice tone="error">{loadError}</Notice>}

      {reels === null ? (
        <div role="status" aria-label="Carregando" className="h-32 rounded-2xl bg-surface" />
      ) : reels.length === 0 ? (
        <EmptyState
          title="Nenhum destaque publicado"
          body="Publique o primeiro banner na Home ou o primeiro vídeo vertical de um parceiro."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => openCreate("home")}>Publicar banner</Button>
              <Button variant="secondary" onClick={() => openCreate("feed")}>
                Publicar vídeo
              </Button>
            </div>
          }
        />
      ) : (
        <div className="glass overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Destaque</th>
                <th scope="col" className="px-4 py-3 font-medium">Parceiro</th>
                <th scope="col" className="px-4 py-3 font-medium">Ação</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Ordem</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Views</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Curtidas · salvos</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Cliques</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reels.map((reel) => {
                const isBanner = reel.placement === "home";
                return (
                  <tr key={reel.id} className="transition-colors hover:bg-surface/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`relative block shrink-0 overflow-hidden rounded-md bg-[#0b0b10] ${isBanner ? "h-12 w-16" : "h-14 w-8"}`}>
                          {reel.posterUrl && <PrxImage src={reel.posterUrl} alt="" fill sizes="64px" className="object-cover" />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{reel.title}</p>
                          <p className="text-[13px] text-muted-foreground">{isBanner ? "Banner da Home" : REEL_COLLECTION_LABEL[reel.collection]}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink">{reel.partnerName}</td>
                    <td className="px-4 py-3 text-[13px] text-ink">{ctaLabelOf(reel)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{reel.sortOrder}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{reel.views.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {reel.likes.toLocaleString("pt-BR")} · {reel.saves.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{reel.ctaClicks.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3">{reel.active ? <Tag tone="success">{isBanner ? "Na Home" : "No feed"}</Tag> : <Tag>Pausado</Tag>}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(reel)}>
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void toggle(reel)}>
                          {reel.active ? "Pausar" : "Ativar"}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void remove(reel)}>
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? "Editar destaque" : banner ? "Novo banner da Home" : "Novo vídeo nos Destaques"}
        description={
          banner
            ? "Imagem abaixo dos eventos na Home, com a marca como Parceiro PRX e o botão de ação."
            : "Formato vertical 9:16, até 60 segundos e 50 MB. O feed mostra a marca e o botão de ação."
        }
        footer={
          <Button block type="submit" form="reel-form" disabled={saving || uploading !== null}>
            {uploading ? "Enviando arquivo…" : saving ? "Salvando…" : editing ? "Salvar destaque" : banner ? "Publicar na Home" : "Publicar nos Destaques"}
          </Button>
        }
      >
        <ReelFormFields form={form} onChange={setForm} partners={selectable} benefits={benefits} uploading={uploading} onFile={(event, kind) => void onFile(event, kind)} error={error} onSubmit={submit} />
      </Sheet>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl glass p-4 sm:p-5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-[26px] font-light leading-none tracking-[-0.03em] text-ink tabular-nums">{value}</dd>
    </div>
  );
}
