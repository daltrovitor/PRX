// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Notice, Tag } from "@/components/app/ui";
import type { InsiderInviteRequestView } from "@/lib/resenha/invite-requests";

const REFRESH_MS = 20_000;
const STATUS = { approved: { label: "Aprovado", tone: "success" as const }, rejected: { label: "Recusado", tone: "neutral" as const } };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new Error("Sem internet agora. Confira sua conexão e tente de novo.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || "Não foi possível falar com a PRX agora.");
  return json;
}

/**
 * Pedidos pelo app: membros que escolheram este Insider no catálogo da Resenha e
 * pedem para comprar o convite. Aprovar vira convite (usa um PASS e avisa a
 * pessoa no celular); recusar encerra o pedido dela nesta edição.
 */
export function InviteRequests({ link, passesLeft, onChanged }: { link: string; passesLeft: number; onChanged: () => Promise<void> | void }) {
  const [requests, setRequests] = useState<InsiderInviteRequestView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests((await call<{ requests: InsiderInviteRequestView[] }>(`/api/insider/invite-requests?link=${encodeURIComponent(link)}`)).requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os pedidos.");
    }
  }, [link]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // Pedidos novos chegam pelo app a qualquer momento: a lista se atualiza sozinha.
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const json = await call<{ message: string }>("/api/insider/invite-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      setNotice(json.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar a decisão.");
    } finally {
      setBusy(null);
      await Promise.all([load(), onChanged()]);
    }
  }

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const decided = (requests ?? []).filter((r) => r.status !== "pending").slice(0, 10);

  return (
    <section className="glass space-y-5 rounded-3xl p-5 sm:p-6" aria-labelledby="app-requests-title">
      <div className="space-y-1">
        <h2 id="app-requests-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Pedidos pelo app {pending.length > 0 && `(${pending.length})`}
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Membros que escolheram você no app e pedem para comprar o convite da Resenha. Aprovar libera a compra e usa um PASS. Quem você recusar não pode pedir a outro Insider nesta edição.
        </p>
      </div>

      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {requests === null ? (
        <div role="status" aria-label="Carregando pedidos" className="h-16 rounded-2xl bg-surface" />
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pedido esperando você.</p>
      ) : (
        <ul className="space-y-2" aria-label="Pedidos aguardando">
          {pending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3">
              <Avatar name={r.memberName} src={r.avatarUrl || null} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-ink">{r.memberName}</p>
                <p className="font-mono text-[12px] text-muted-foreground">{r.memberCode}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => void decide(r.id, "reject")} disabled={busy !== null}>
                  Recusar
                </Button>
                <Button size="sm" onClick={() => void decide(r.id, "approve")} disabled={busy !== null || passesLeft <= 0}>
                  {busy === r.id ? "Salvando…" : "Aprovar"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && passesLeft <= 0 && <Notice tone="warning">Seus PASSes acabaram: só dá para recusar. Peça mais PASSes à equipe PRX.</Notice>}

      {decided.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[15px] font-semibold text-ink">Decididos</h3>
          <ul className="space-y-2">
            {decided.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{r.memberName}</p>
                  <p className="font-mono text-[12px] text-muted-foreground">{r.memberCode}</p>
                </div>
                <Tag tone={STATUS[r.status === "approved" ? "approved" : "rejected"].tone}>{STATUS[r.status === "approved" ? "approved" : "rejected"].label}</Tag>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
