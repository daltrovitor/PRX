// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Input, Notice, Tag } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Pager, formatDateTimeBr, useDebounced } from "@/components/admin/pager";
import type { AccessCandidate, BankAccessGrant } from "@/lib/bank/access";

type GrantRow = BankAccessGrant & { name: string; email: string };

/**
 * Liberação do PRX BANK para maiores de 29 anos. O PRX é para jovens até 29;
 * aqui a equipe libera a abertura para pessoas específicas acima disso. A
 * idade vem da data de nascimento validada da conta e é conferida no servidor.
 * Liberar não aprova nada: a pessoa ainda passa pela identidade e pelo banco.
 */
export function AdminBankAccessTab() {
  const { confirmDelete, showToast } = useConfirmToast();
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [found, setFound] = useState<AccessCandidate[] | null>(null);
  const [grants, setGrants] = useState<{ items: GrantRow[]; total: number } | null>(null);
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadGrants = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/bank/access?page=${page}&pageSize=20`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { grants?: GrantRow[]; total?: number; error?: string };
      if (!res.ok || !json.grants) throw new Error(json.error || "Não foi possível carregar as liberações.");
      setGrants({ items: json.grants, total: json.total ?? 0 });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }, [page]);

  const search = useCallback(async (term: string) => {
    if (term.trim().length < 2) return setFound(null);
    try {
      const res = await fetch(`/api/admin/bank/access?q=${encodeURIComponent(term)}&pageSize=10`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { members?: AccessCandidate[]; error?: string };
      if (!res.ok || !json.members) throw new Error(json.error || "Não foi possível buscar.");
      setFound(json.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await loadGrants();
    })();
    return () => {
      alive = false;
    };
  }, [loadGrants]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await search(q);
    })();
    return () => {
      alive = false;
    };
  }, [q, search]);

  async function change(action: "grant" | "revoke", userId: string, name: string) {
    const ok = await confirmDelete({
      title: action === "grant" ? "Liberar PRX BANK" : "Revogar liberação",
      message:
        action === "grant"
          ? `Liberar a abertura do PRX BANK para ${name}? A pessoa ainda passa pela análise de identidade e pelo banco parceiro.`
          : `Revogar a liberação de ${name}? Aberturas em andamento deixam de seguir. Uma conta já aberta no banco parceiro não é encerrada por aqui.`,
      confirmText: action === "grant" ? "Liberar" : "Revogar",
      type: action === "grant" ? "warning" : "danger",
    });
    if (!ok) return;
    setBusy(userId);
    try {
      const res = await fetch("/api/admin/bank/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId, note: notes[userId] ?? "" }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Não foi possível salvar.");
      showToast("success", action === "grant" ? "Abertura do PRX BANK liberada." : "Liberação revogada.");
      await Promise.all([loadGrants(), search(q)]);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="access-title" className="space-y-6">
      <div>
        <h2 id="access-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
          Liberação do PRX BANK acima de 29 anos
        </h2>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
          Busque a pessoa, confira a idade (da data de nascimento validada na conta) e libere. A regra vale no servidor: sem a liberação, a abertura é recusada mesmo
          chamando a API direto.
        </p>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar membro para liberar o PRX BANK" className="max-w-md" />

      {found !== null &&
        (found.length === 0 ? (
          <EmptyState title="Ninguém encontrado" body="Confira o nome ou o e-mail." />
        ) : (
          <ul className="space-y-3">
            {found.map((m) => (
              <li key={m.userId} className="glass-soft flex flex-col gap-3 rounded-3xl p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-ink">{m.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {m.email} · {m.age === null ? "sem data de nascimento validada" : `${m.age} anos (${m.birthSource === "identity" ? "identidade da conta" : "cadastro"})`}
                  </p>
                  {m.grant && <p className="text-[13px] text-muted-foreground">Liberado por {m.grant.grantedBy} em {formatDateTimeBr(m.grant.grantedAt)}</p>}
                </div>
                {m.grant ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Tag tone="success">Liberado</Tag>
                    <Button variant="danger" size="sm" disabled={busy !== null} onClick={() => void change("revoke", m.userId, m.name)}>
                      Revogar
                    </Button>
                  </div>
                ) : m.eligible ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input value={notes[m.userId] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [m.userId]: e.target.value }))} placeholder="Motivo (opcional)" aria-label={`Motivo da liberação de ${m.name}`} maxLength={500} />
                    <Button size="sm" disabled={busy !== null} onClick={() => void change("grant", m.userId, m.name)}>
                      Liberar PRX BANK
                    </Button>
                  </div>
                ) : (
                  <Tag>{m.age === null ? "Sem idade validada" : "Até 29 anos: não precisa"}</Tag>
                )}
              </li>
            ))}
          </ul>
        ))}

      <div className="space-y-3">
        <h3 className="text-[15px] font-semibold text-ink">Liberações vigentes</h3>
        {grants === null ? (
          <div role="status" aria-label="Carregando" className="h-24 rounded-3xl bg-surface" />
        ) : grants.items.length === 0 ? (
          <EmptyState title="Nenhuma liberação vigente" body="Quem você liberar aparece aqui, com quem liberou e quando." />
        ) : (
          <ul className="space-y-2">
            {grants.items.map((g) => (
              <li key={g.id} className="flex flex-col gap-2 rounded-2xl bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 text-[14px] text-ink">
                  <span className="font-medium">{g.name}</span> · {g.ageAtGrant} anos na liberação · {g.grantedBy}, {formatDateTimeBr(g.grantedAt)}
                  {g.note ? ` · ${g.note}` : ""}
                </span>
                <Button variant="danger" size="sm" disabled={busy !== null} onClick={() => void change("revoke", g.userId, g.name)}>
                  Revogar
                </Button>
              </li>
            ))}
          </ul>
        )}
        {grants && grants.total > 20 && <Pager page={page} pageSize={20} total={grants.total} onPage={setPage} />}
      </div>
    </section>
  );
}
