// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Notice, Select, Sheet, Tag, Textarea } from "@/components/app/ui";
import { SUPPORT_STATUSES, SUPPORT_STATUS_LABEL, SUPPORT_TOPIC_LABEL, type SupportStatus, type SupportTicket } from "@/lib/support/types";
import { cn } from "@/lib/utils";

const FORM_ID = "admin-support-reply";
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Conversa no admin: a equipe responde (o membro recebe e-mail) e/ou muda o status. */
export function AdminSupportThread({ ticket, onClose, onSaved }: { ticket: SupportTicket | null; onClose: () => void; onSaved: (ticket: SupportTicket) => void }) {
  const [reply, setReply] = useState("");
  // Vazio = automático: respondeu → "Respondido"; sem resposta, nada muda.
  const [status, setStatus] = useState<SupportStatus | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(body: { reply?: string; status?: SupportStatus }) {
    if (!ticket) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/support", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ticket.id, ...body }) });
      const json = (await res.json().catch(() => ({}))) as { ticket?: SupportTicket; error?: string };
      if (!res.ok || !json.ticket) throw new Error(json.error || "Não foi possível salvar.");
      setReply("");
      setStatus("");
      onSaved(json.ticket);
    } catch (err) {
      setError(err instanceof TypeError ? "Sem internet agora." : err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save({ reply: reply.trim() || undefined, status: status || undefined });
  }

  return (
    <Sheet
      open={Boolean(ticket)}
      onClose={onClose}
      size="lg"
      title={ticket ? `${ticket.protocol} · ${ticket.subject}` : "Solicitação"}
      description={ticket ? `${ticket.userName} · ${ticket.userEmail} · ${SUPPORT_TOPIC_LABEL[ticket.topic]}` : undefined}
      footer={
        ticket && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button block type="submit" form={FORM_ID} disabled={saving || (!reply.trim() && !status)}>
              {saving ? "Salvando…" : reply.trim() ? "Enviar resposta" : "Salvar status"}
            </Button>
            {ticket.status !== "resolved" && (
              <Button block variant="secondary" disabled={saving} onClick={() => void save({ status: "resolved" })}>
                Marcar como resolvido
              </Button>
            )}
          </div>
        )
      }
    >
      {ticket && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={ticket.status === "open" ? "warning" : ticket.status === "resolved" ? "success" : "neutral"}>{SUPPORT_STATUS_LABEL[ticket.status]}</Tag>
            <span className="text-[13px] text-muted-foreground">Aberta em {when(ticket.createdAt)}</span>
          </div>
          <ol className="space-y-3" aria-label="Mensagens">
            {ticket.messages.map((m) => (
              <li key={m.id} className={cn("max-w-[88%] rounded-2xl p-3.5", m.author === "team" ? "ml-auto bg-primary/10" : "bg-surface")}>
                <p className="text-[12px] font-medium text-muted-foreground">
                  {m.author === "team" ? `Equipe · ${m.authorName}` : m.authorName} · {when(m.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink">{m.body}</p>
              </li>
            ))}
          </ol>
          <form id={FORM_ID} onSubmit={submit} className="space-y-4">
            <Field label="Resposta ao membro" hint="O membro vê assinado como “Equipe PRX” e recebe um aviso por e-mail.">
              {(id, d) => <Textarea id={id} aria-describedby={d} rows={4} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} />}
            </Field>
            <Field label="Status" hint="Automático: com resposta vira “Respondido”.">
              {(id, d) => (
                <Select id={id} aria-describedby={d} value={status} onChange={(e) => setStatus(e.target.value as SupportStatus | "")}>
                  <option value="">Automático</option>
                  {SUPPORT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {SUPPORT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </form>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </Sheet>
  );
}
