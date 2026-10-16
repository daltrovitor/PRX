// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, EmptyState, Input, Notice, Sheet, Tag, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Pager, formatDateTimeBr } from "@/components/admin/pager";
import { AdminRaffleForm } from "@/components/admin/admin-raffle-form";
import { adminGet, adminPost, errorText } from "@/components/admin/admin-api";
import { RAFFLE_STATUS_LABEL, type Raffle, type RaffleEntry, type RaffleEvent } from "@/lib/raffles/types";

type Row = Raffle & { entries: number };
type Detail = { raffle: Raffle; entries: Array<RaffleEntry & { name: string; email: string }>; entriesTotal: number; events: RaffleEvent[] };

/**
 * Sorteios: rascunho → publicado (com a autorização legal e o aceite de quem
 * publica) → encerrado (lista congelada) → sorteado (semente revelada). Tudo
 * fica no histórico do sorteio e na auditoria do admin.
 */
export function AdminRafflesTab() {
  const { confirmDelete, showToast } = useConfirmToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Raffle | null | "new">(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [ack, setAck] = useState(false);
  const [entropy, setEntropy] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await adminGet(`/api/admin/raffles?page=${page}&pageSize=20`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [page]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  async function open(id: string) {
    try {
      setAck(false);
      setEntropy("");
      setReason("");
      setDetail(await adminGet(`/api/admin/raffles?id=${encodeURIComponent(id)}`));
    } catch (err) {
      showToast("error", errorText(err));
    }
  }

  async function act(body: Record<string, unknown>, ok: string, confirm?: { title: string; message: string; danger?: boolean }) {
    if (confirm && !(await confirmDelete({ title: confirm.title, message: confirm.message, confirmText: confirm.title, type: confirm.danger ? "danger" : "warning" }))) return;
    try {
      await adminPost("/api/admin/raffles", body);
      showToast("success", ok);
      await load();
      if (body.action === "delete") setDetail(null);
      else if (typeof body.id === "string") await open(body.id);
    } catch (err) {
      showToast("error", errorText(err));
    }
  }

  const r = detail?.raffle;
  return (
    <section aria-labelledby="raffles-title" className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="raffles-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
            Sorteios
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">Participação gratuita. Só publica com a autorização e o regulamento informados; a apuração pode ser conferida por qualquer pessoa.</p>
        </div>
        <Button onClick={() => setEditing("new")}>Novo sorteio</Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {data === null ? (
        <div role="status" aria-label="Carregando" className="h-32 rounded-3xl bg-surface" />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nenhum sorteio" body="Crie um rascunho; publique quando a autorização estiver em mãos." />
      ) : (
        <ul className="space-y-2">
          {data.items.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => void open(x.id)} className="glass-soft flex w-full cursor-pointer flex-col gap-1 rounded-2xl px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-ink">{x.title}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {x.prize} · até {formatDateTimeBr(x.endsAt)} · {x.entries} participação(ões)
                  </span>
                </span>
                <Tag tone={x.status === "published" ? "accent" : x.status === "drawn" ? "success" : "neutral"}>{RAFFLE_STATUS_LABEL[x.status]}</Tag>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > 20 && <Pager page={page} pageSize={20} total={data.total} onPage={setPage} />}

      {editing && (
        <AdminRaffleForm
          raffle={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
            if (r) void open(r.id);
          }}
        />
      )}

      {detail && r && (
        <Sheet open onClose={() => setDetail(null)} title={r.title} description={`${RAFFLE_STATUS_LABEL[r.status]} · ${detail.entriesTotal} participação(ões)`} size="lg">
          <div className="space-y-5 text-[14px]">
            <p className="text-ink">
              {r.prize} · inscrições {formatDateTimeBr(r.startsAt)} a {formatDateTimeBr(r.endsAt)} · sorteio {formatDateTimeBr(r.drawAt)} · {r.winnersCount} ganhador(es)
            </p>
            <p className="text-[13px] text-muted-foreground">
              Autorização: {r.authorizationIssuer || "—"} nº {r.authorizationNumber || "—"}
              {r.legalAckBy ? ` · aceite de ${r.legalAckBy} em ${formatDateTimeBr(r.legalAckAt)}` : ""}
            </p>
            {r.commitHash && <p className="break-all text-[12px] text-muted-foreground">Hash de compromisso: {r.commitHash}</p>}
            {r.entriesHash && <p className="break-all text-[12px] text-muted-foreground">Hash da lista: {r.entriesHash}</p>}
            {r.status === "drawn" && (
              <div className="rounded-2xl bg-surface p-4">
                <p className="font-semibold text-ink">Ganhadores</p>
                <ol className="mt-1 space-y-1">
                  {r.winners.map((w) => {
                    const entry = detail.entries.find((e) => e.id === w.entryId);
                    return (
                      <li key={w.position}>
                        {w.position}º · {entry ? `${entry.name} · ${entry.email}` : w.displayName} · participação nº {w.entryNumber}
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-2 break-all text-[12px] text-muted-foreground">
                  Semente revelada: {r.seed}
                  {r.publicEntropy ? ` · número público: ${r.publicEntropy}` : ""}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {r.status !== "drawn" && r.status !== "cancelled" && r.status !== "closed" && (
                <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                  Editar
                </Button>
              )}
              {r.status === "published" && (
                <Button size="sm" variant="secondary" onClick={() => void act({ action: "pause", id: r.id }, "Inscrições pausadas.")}>
                  Pausar
                </Button>
              )}
              {r.status === "paused" && (
                <Button size="sm" variant="secondary" onClick={() => void act({ action: "resume", id: r.id }, "Inscrições retomadas.")}>
                  Retomar
                </Button>
              )}
              {(r.status === "published" || r.status === "paused") && (
                <Button size="sm" variant="secondary" onClick={() => void act({ action: "close", id: r.id }, "Inscrições encerradas e lista congelada.", { title: "Encerrar inscrições", message: "A lista de participações fica congelada (hash registrado)." })}>
                  Encerrar inscrições
                </Button>
              )}
              {r.status === "draft" && (
                <Button size="sm" variant="danger" onClick={() => void act({ action: "delete", id: r.id }, "Rascunho excluído.", { title: "Excluir rascunho", message: "Excluir este rascunho?", danger: true })}>
                  Excluir rascunho
                </Button>
              )}
            </div>

            {r.status === "draft" && (
              <div className="space-y-3 rounded-2xl border border-line p-4">
                <Checkbox label="Confirmo que a autorização e o regulamento informados são válidos para este sorteio (conferido com o jurídico)." checked={ack} onChange={setAck} />
                <Button disabled={!ack} onClick={() => void act({ action: "publish", id: r.id, acknowledged: ack }, "Sorteio publicado.", { title: "Publicar sorteio", message: "Os membros elegíveis passam a ver e participar." })}>
                  Publicar
                </Button>
              </div>
            )}
            {r.status === "closed" && (
              <div className="space-y-3 rounded-2xl border border-line p-4">
                <Input value={entropy} onChange={(e) => setEntropy(e.target.value)} placeholder="Número público (opcional), ex.: Loteria Federal concurso 5990: 54321" aria-label="Número público da apuração" />
                <Button onClick={() => void act({ action: "draw", id: r.id, publicEntropy: entropy }, "Sorteio apurado e resultado publicado.", { title: "Sortear agora", message: "A semente é revelada e os ganhadores aparecem para os membros." })}>
                  Sortear
                </Button>
              </div>
            )}
            {r.status !== "drawn" && r.status !== "cancelled" && r.status !== "draft" && (
              <div className="space-y-2">
                <Textarea rows={1} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo do cancelamento (os participantes veem)" aria-label="Motivo do cancelamento" />
                <Button size="sm" variant="danger" onClick={() => void act({ action: "cancel", id: r.id, reason }, "Sorteio cancelado.", { title: "Cancelar sorteio", message: "Cancelar este sorteio?", danger: true })}>
                  Cancelar sorteio
                </Button>
              </div>
            )}

            <details>
              <summary className="cursor-pointer font-semibold text-ink">Participações ({detail.entriesTotal})</summary>
              <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-[13px]">
                {detail.entries.map((e) => (
                  <li key={e.id} className="rounded-xl bg-surface px-3 py-2">
                    {e.entryNumber ? `nº ${e.entryNumber} · ` : ""}
                    {e.name} · {e.email} · {formatDateTimeBr(e.createdAt)}
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <summary className="cursor-pointer font-semibold text-ink">Histórico</summary>
              <ul className="mt-2 space-y-1 text-[13px]">
                {detail.events.map((e) => (
                  <li key={e.id} className="break-all rounded-xl bg-surface px-3 py-2">
                    {formatDateTimeBr(e.createdAt)} · {e.actor} · {e.action}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </Sheet>
      )}
    </section>
  );
}
