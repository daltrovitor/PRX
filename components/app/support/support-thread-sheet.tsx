// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Notice, Sheet, Tag, Textarea } from "@/components/app/ui";
import { SUPPORT_STATUS_LABEL, SUPPORT_TOPIC_LABEL, type SupportTicket } from "@/lib/support/types";
import { sendSupport, supportWhen } from "@/components/app/support/support-api";
import { cn } from "@/lib/utils";

const FORM_ID = "support-reply-form";

/** Conversa de uma solicitação: mensagens, resposta do membro e encerramento. */
export function SupportThreadSheet({ ticket, onClose, onChanged }: { ticket: SupportTicket | null; onClose: () => void; onChanged: (ticket: SupportTicket) => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"reply" | "resolve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "reply" | "resolve") {
    if (!ticket) return;
    setBusy(kind);
    setError(null);
    try {
      const updated = await sendSupport(kind === "reply" ? { action: "reply", id: ticket.id, message } : { action: "resolve", id: ticket.id });
      if (kind === "reply") setMessage("");
      onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setBusy(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run("reply");
  }

  const resolved = ticket?.status === "resolved";

  return (
    <Sheet
      open={Boolean(ticket)}
      onClose={onClose}
      title={ticket?.subject ?? "Solicitação"}
      description={ticket ? `Protocolo ${ticket.protocol} · ${SUPPORT_TOPIC_LABEL[ticket.topic]}` : undefined}
      footer={
        ticket && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button block type="submit" form={FORM_ID} disabled={busy !== null || message.trim().length < 10}>
              {busy === "reply" ? "Enviando…" : resolved ? "Reabrir com esta mensagem" : "Enviar mensagem"}
            </Button>
            {!resolved && (
              <Button block variant="secondary" onClick={() => void run("resolve")} disabled={busy !== null}>
                {busy === "resolve" ? "Encerrando…" : "Já resolveu, encerrar"}
              </Button>
            )}
          </div>
        )
      }
    >
      {ticket && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={ticket.status === "answered" ? "accent" : ticket.status === "resolved" ? "success" : "neutral"}>{SUPPORT_STATUS_LABEL[ticket.status]}</Tag>
            <span className="text-[13px] text-muted-foreground">Aberta em {supportWhen(ticket.createdAt)}</span>
          </div>
          <ol className="space-y-3" aria-label="Mensagens">
            {ticket.messages.map((m) => (
              <li key={m.id} className={cn("max-w-[88%] rounded-2xl p-3.5", m.author === "member" ? "ml-auto bg-primary/10" : "bg-surface")}>
                <p className="text-[12px] font-medium text-muted-foreground">
                  {m.author === "member" ? "Você" : m.authorName} · {supportWhen(m.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink">{m.body}</p>
              </li>
            ))}
          </ol>
          <form id={FORM_ID} onSubmit={submit}>
            <Field label={resolved ? "Ainda precisa de ajuda?" : "Responder"} hint="Mínimo de 10 caracteres. Nunca envie senhas.">
              {(id, d) => <Textarea id={id} aria-describedby={d} rows={3} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />}
            </Field>
          </form>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </Sheet>
  );
}
