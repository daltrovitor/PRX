// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Field, Input, Notice, Tag } from "@/components/app/ui";
import { useDebounced } from "@/components/admin/pager";
import type { InsiderInviteView, InviteCandidate, InviteTicketState } from "@/lib/resenha/invites";

const TICKET_LABEL: Record<InviteTicketState, { label: string; tone: "neutral" | "success" | "warning" | "accent" }> = {
  none: { label: "Convidado", tone: "neutral" },
  pending_payment: { label: "Pagando", tone: "warning" },
  valid: { label: "Ingresso garantido", tone: "success" },
  used: { label: "Entrou", tone: "accent" },
  cancelled: { label: "Convidado", tone: "neutral" },
};

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
 * Convite pelo app: o Insider busca o membro por nome ou ID PRX e convida.
 * A Resenha passa a aparecer no app da pessoa, que recebe uma notificação no
 * celular e compra o ingresso no PRX LIVE. Cada convite ocupa um PASS.
 */
export function InviteMembers({ link, passesLeft, open, onChanged }: { link: string; passesLeft: number; open: boolean; onChanged: () => Promise<void> | void }) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 350);
  const [results, setResults] = useState<InviteCandidate[] | null>(null);
  const [invites, setInvites] = useState<InsiderInviteView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      setInvites((await call<{ invites: InsiderInviteView[] }>(`/api/insider/invites?link=${encodeURIComponent(link)}`)).invites);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os convites.");
    }
  }, [link]);

  useEffect(() => {
    void (async () => {
      await loadInvites();
    })();
  }, [loadInvites]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (debounced.replace(/\s/g, "").length < 3) {
        if (alive) setResults(null);
        return;
      }
      try {
        const json = await call<{ members: InviteCandidate[] }>(`/api/insider/members?link=${encodeURIComponent(link)}&q=${encodeURIComponent(debounced)}`);
        if (alive) setResults(json.members);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Não foi possível buscar.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [debounced, link]);

  async function invite(candidate: InviteCandidate) {
    setBusy(candidate.memberCode);
    setError(null);
    setNotice(null);
    try {
      const json = await call<{ message: string }>("/api/insider/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link, memberCode: candidate.memberCode }) });
      setNotice(json.message);
      setResults((list) => list?.map((c) => (c.memberCode === candidate.memberCode ? { ...c, status: "invited" } : c)) ?? null);
      await Promise.all([loadInvites(), onChanged()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível convidar.");
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await call(`/api/insider/invites?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await Promise.all([loadInvites(), onChanged()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível cancelar.");
    } finally {
      setBusy(null);
    }
  }

  const active = (invites ?? []).filter((i) => i.status === "invited");

  return (
    <section className="glass space-y-5 rounded-3xl p-5 sm:p-6" aria-labelledby="invite-title">
      <div className="space-y-1">
        <h2 id="invite-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Convidar pelo app
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Busque pelo nome ou pelo ID PRX (fica no Perfil do app). A Resenha aparece só no app de quem você convidar, com um aviso no celular, e a pessoa garante o ingresso no PRX LIVE. Cada convite usa um PASS.
        </p>
      </div>

      {open ? (
        <Field label="Nome ou ID PRX" hint={passesLeft > 0 ? `${passesLeft} ${passesLeft === 1 ? "PASS disponível" : "PASSes disponíveis"}.` : "Seus PASSes acabaram."}>
          {(id, d) => <Input id={id} aria-describedby={d} value={query} maxLength={80} autoComplete="off" placeholder="Ex.: Bia Souza ou PRX-7K3M9Q" onChange={(e) => setQuery(e.target.value)} />}
        </Field>
      ) : (
        <Notice tone="neutral">Convites só com a lista aberta.</Notice>
      )}

      {results !== null && (
        <ul className="space-y-2" aria-label="Resultado da busca">
          {results.length === 0 && <li className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">Ninguém com esse nome ou ID. Peça para a pessoa conferir o ID PRX no Perfil do app.</li>}
          {results.map((c) => (
            <li key={c.memberCode} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
              <Avatar name={c.name} src={c.avatarUrl || null} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-ink">{c.name}</p>
                <p className="font-mono text-[12px] text-muted-foreground">{c.memberCode}</p>
              </div>
              {c.status === "available" ? (
                <Button size="sm" onClick={() => void invite(c)} disabled={busy !== null || passesLeft <= 0}>
                  {busy === c.memberCode ? "Convidando…" : "Convidar"}
                </Button>
              ) : (
                <Tag tone={c.status === "invited" ? "success" : "neutral"}>{c.status === "invited" ? "Convidado" : "Você"}</Tag>
              )}
            </li>
          ))}
        </ul>
      )}

      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="space-y-2">
        <h3 className="text-[15px] font-semibold text-ink">Seus convites ({active.length})</h3>
        {invites === null ? (
          <div role="status" aria-label="Carregando convites" className="h-16 rounded-2xl bg-surface" />
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém convidado pelo app ainda.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((i) => {
              const tag = TICKET_LABEL[i.ticket];
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">{i.memberName}</p>
                    <p className="font-mono text-[12px] text-muted-foreground">{i.memberCode}</p>
                  </div>
                  <Tag tone={tag.tone}>{tag.label}</Tag>
                  {(i.ticket === "none" || i.ticket === "cancelled") && (
                    <Button size="sm" variant="ghost" onClick={() => void cancel(i.id)} disabled={busy !== null}>
                      {busy === i.id ? "Cancelando…" : "Cancelar"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
