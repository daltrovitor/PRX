// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Field, Notice, Segmented, Select, Tag, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { formatDocument, inferDocumentType } from "@/lib/partners/documents";
import { formatPhone } from "@/lib/notifications/format";
import { LEAD_RELATION_LABEL, LEAD_STATUSES, LEAD_STATUS_LABEL, leadCategoryName, type LeadStatus, type PartnerLead } from "@/lib/partner-leads/types";

type Filter = LeadStatus | "all";
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Pedidos "Seja um parceiro" vindos do PRX PASS. A equipe comercial anota o
 * andamento; o cadastro do parceiro e do contrato continua na aba Parceiros.
 */
export function AdminPartnerLeadsTab({ onGoToPartners }: { onGoToPartners: () => void }) {
  const [filter, setFilter] = useState<Filter>("new");
  const [data, setData] = useState<{ available: boolean; migration?: string; leads: PartnerLead[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/partner-leads${filter === "all" ? "" : `?status=${filter}`}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { available?: boolean; migration?: string; leads?: PartnerLead[]; error?: string };
      if (!res.ok || !json.leads) throw new Error(json.error || "Não foi possível carregar os pedidos.");
      setData({ available: json.available !== false, migration: json.migration, leads: json.leads });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora.");
    }
  }, [filter]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <section aria-labelledby="leads-title" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-1.5">
          <h2 id="leads-title" className="text-xl font-semibold tracking-[-0.02em] text-ink">
            Seja parceiro
          </h2>
          <p className="text-sm text-muted-foreground">Empresas que pediram para entrar no PRX PASS. Quando fechar, cadastre o parceiro e marque o pedido como “Virou parceiro”.</p>
        </div>
        <Button variant="secondary" onClick={onGoToPartners}>
          Abrir Parceiros
        </Button>
      </header>

      <Segmented
        label="Filtrar pedidos"
        value={filter}
        onChange={setFilter}
        options={[{ value: "all" as Filter, label: "Todos" }, ...LEAD_STATUSES.map((s) => ({ value: s as Filter, label: LEAD_STATUS_LABEL[s] }))]}
      />

      {error && <Notice tone="error">{error}</Notice>}
      {data && !data.available && <Notice tone="warning">Falta aplicar a migração supabase/migrations/{data.migration} no Supabase para receber pedidos.</Notice>}
      {!data && !error && <div role="status" aria-label="Carregando pedidos" className="h-40 rounded-3xl bg-surface" />}
      {data?.available && data.leads.length === 0 && <EmptyState title="Nenhum pedido" body="Nenhum pedido de parceria com este status." />}
      {data?.available && data.leads.length > 0 && (
        <ul className="grid gap-4 lg:grid-cols-2">
          {data.leads.map((lead) => (
            <LeadCard key={`${lead.id}:${lead.updatedAt}`} lead={lead} onSaved={() => void load()} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LeadCard({ lead, onSaved }: { lead: PartnerLead; onSaved: () => void }) {
  const { showToast } = useConfirmToast();
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [note, setNote] = useState(lead.note);
  const [saving, setSaving] = useState(false);
  const docType = lead.document ? inferDocumentType(lead.document) : null;
  const dirty = status !== lead.status || note !== lead.note;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/partner-leads", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: lead.id, status, note }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Não foi possível salvar.");
      showToast("success", "Pedido atualizado.");
      onSaved();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="space-y-4 rounded-3xl glass p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">{lead.businessName}</h3>
          <p className="text-[13px] text-muted-foreground">
            {leadCategoryName(lead.categoryId)} · {lead.city} · {when(lead.createdAt)}
          </p>
        </div>
        <Tag tone={lead.status === "new" ? "warning" : lead.status === "converted" ? "success" : "neutral"}>{LEAD_STATUS_LABEL[lead.status]}</Tag>
      </div>
      <dl className="grid gap-x-4 gap-y-1.5 text-[14px] sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Contato</dt>
        <dd className="text-ink">
          {lead.contactName} ({LEAD_RELATION_LABEL[lead.relation]})
        </dd>
        <dt className="text-muted-foreground">E-mail</dt>
        <dd className="break-all text-ink">{lead.email}</dd>
        <dt className="text-muted-foreground">Telefone</dt>
        <dd className="text-ink">{formatPhone(lead.phone)}</dd>
        {docType && (
          <>
            <dt className="text-muted-foreground">{docType}</dt>
            <dd className="text-ink">{formatDocument(docType, lead.document)}</dd>
          </>
        )}
        {lead.link && (
          <>
            <dt className="text-muted-foreground">Instagram/site</dt>
            <dd className="break-all text-ink">{lead.link}</dd>
          </>
        )}
      </dl>
      <p className="whitespace-pre-line rounded-2xl bg-surface p-3.5 text-[14px] leading-relaxed text-ink">{lead.offer}</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
        <Field label="Andamento">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Anotação da equipe">
          {(id) => <Textarea id={id} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
      {dirty && (
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Salvando…" : "Salvar andamento"}
        </Button>
      )}
    </li>
  );
}
