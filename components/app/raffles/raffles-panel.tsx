// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Notice, Tag } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { PrxImage } from "@/components/ui/prx-image";
import { RAFFLE_STATUS_LABEL } from "@/lib/raffles/types";
import type { PublicRaffle } from "@/lib/raffles/service";

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Sorteios da PRX no app: regras, quem pode participar, período, prêmio,
 * autorização e regulamento antes de participar; depois, o resultado (só
 * primeiro nome e inicial) e os dados para conferir a apuração.
 */
export function RafflesPanel() {
  const { showToast } = useConfirmToast();
  const [raffles, setRaffles] = useState<PublicRaffle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/raffles", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { raffles?: PublicRaffle[]; error?: string };
      if (!res.ok || !json.raffles) throw new Error(json.error || "Não foi possível carregar os sorteios.");
      setRaffles(json.raffles);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora.");
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

  async function enter(r: PublicRaffle) {
    setBusy(r.id);
    try {
      const res = await fetch("/api/raffles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enter", id: r.id }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Não foi possível participar.");
      showToast("success", "Participação registrada. Boa sorte!");
      await load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Não foi possível participar.");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!raffles) return <div role="status" aria-label="Carregando sorteios" className="h-40 rounded-3xl bg-surface" />;
  if (raffles.length === 0) return <EmptyState title="Nenhum sorteio agora" body="Quando a PRX abrir um sorteio, ele aparece aqui com as regras e o regulamento." />;

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {raffles.map((r) => (
        <li key={r.id} className="glass flex flex-col overflow-hidden rounded-3xl">
          {r.imageUrl && (
            <div className="relative aspect-[16/9] w-full bg-surface">
              <PrxImage src={r.imageUrl} alt={`Imagem do sorteio ${r.title}`} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            </div>
          )}
          <div className="flex flex-1 flex-col gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{r.title}</h3>
              <Tag tone={r.status === "published" ? "accent" : r.status === "drawn" ? "success" : "neutral"}>{RAFFLE_STATUS_LABEL[r.status]}</Tag>
            </div>
            <p className="text-[15px] font-medium text-ink">Prêmio: {r.prize}</p>
            {r.description && <p className="text-[14px] leading-relaxed text-muted-foreground">{r.description}</p>}
            <dl className="grid gap-1 text-[13px] text-muted-foreground">
              <div>
                <dt className="inline">Inscrições: </dt>
                <dd className="inline">
                  {when(r.startsAt)} a {when(r.endsAt)}
                </dd>
              </div>
              <div>
                <dt className="inline">Sorteio: </dt>
                <dd className="inline">
                  {when(r.drawAt)} · {r.winnersCount} ganhador(es)
                </dd>
              </div>
              <div>
                <dt className="inline">Participação: </dt>
                <dd className="inline">gratuita, até {r.maxEntriesPerUser} por pessoa</dd>
              </div>
              {(r.minAge || r.requiresActiveBank || r.foundersOnly || r.subscribersOnly) && (
                <div>
                  <dt className="inline">Quem pode: </dt>
                  <dd className="inline">
                    {[r.minAge ? `${r.minAge}+ anos` : null, r.requiresActiveBank ? "conta PRX BANK ativa" : null, r.foundersOnly ? "Founders" : null, r.subscribersOnly ? "assinantes" : null].filter(Boolean).join(" · ")}
                  </dd>
                </div>
              )}
              <div>
                <dt className="inline">Autorização: </dt>
                <dd className="inline">
                  {r.authorizationIssuer} nº {r.authorizationNumber}
                </dd>
              </div>
            </dl>
            {r.rules && (
              <details>
                <summary className="cursor-pointer text-[13px] font-medium text-primary">Regras</summary>
                <p className="mt-1 whitespace-pre-line text-[13px] text-muted-foreground">{r.rules}</p>
              </details>
            )}
            <a href={r.regulationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center text-[13px] font-medium text-primary underline-offset-2 hover:underline">
              Ler o regulamento completo
            </a>

            {r.status === "drawn" && (
              <div className="space-y-2 rounded-2xl bg-surface p-4">
                <p className="text-[14px] font-semibold text-ink">Resultado</p>
                <ol className="space-y-1 text-[14px] text-ink">
                  {r.winners.map((w) => (
                    <li key={w.position}>
                      {w.position}º · {w.displayName} (participação nº {w.entryNumber}){w.isMe ? " · é você!" : ""}
                    </li>
                  ))}
                </ol>
                <details>
                  <summary className="cursor-pointer text-[12px] text-primary">Conferir a apuração</summary>
                  <p className="mt-1 break-all text-[11px] leading-relaxed text-muted-foreground">
                    Hash publicado antes: {r.commitHash} · Semente revelada: {r.seed} · Hash da lista ({r.entriesCount} participações): {r.entriesHash}
                    {r.publicEntropy ? ` · Número público: ${r.publicEntropy}` : ""}
                  </p>
                </details>
              </div>
            )}

            {r.status === "published" && (
              <div className="mt-auto space-y-2">
                {r.myEntries > 0 && <Notice tone="success">Você está participando ({r.myEntries} de {r.maxEntriesPerUser}).</Notice>}
                {!r.eligibility.eligible && r.eligibility.reason && <Notice>{r.eligibility.reason}</Notice>}
                <Button block disabled={busy !== null || !r.eligibility.eligible || r.myEntries >= r.maxEntriesPerUser} onClick={() => void enter(r)}>
                  {busy === r.id ? "Registrando…" : r.myEntries >= r.maxEntriesPerUser ? "Participação registrada" : r.myEntries > 0 ? "Participar de novo" : "Participar"}
                </Button>
                <p className="text-[11px] text-muted-foreground">Hash de compromisso da apuração: {r.commitHash}</p>
              </div>
            )}
            {r.status !== "published" && r.myEntries > 0 && r.status !== "drawn" && <Notice>Sua participação está registrada ({r.myEntries}).</Notice>}
          </div>
        </li>
      ))}
    </ul>
  );
}
