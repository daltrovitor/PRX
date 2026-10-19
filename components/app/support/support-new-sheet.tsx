// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, Notice, Select, Sheet, Textarea } from "@/components/app/ui";
import { COMPANY } from "@/lib/company";
import { SUPPORT_TOPICS, SUPPORT_TOPIC_LABEL, type SupportTicket, type SupportTopic } from "@/lib/support/types";
import { sendSupport } from "@/components/app/support/support-api";

const FORM_ID = "support-new-form";

/** Nova solicitação ao SAC: assunto, resumo e a mensagem. O protocolo sai na hora. */
export function SupportNewSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (ticket: SupportTicket) => void }) {
  const [topic, setTopic] = useState<SupportTopic>("conta");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const ticket = await sendSupport({ action: "open", ticket: { topic, subject, message } });
      setSubject("");
      setMessage("");
      onCreated(ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nova solicitação"
      description="Conte o que aconteceu. Você recebe um número de protocolo na hora."
      footer={
        <Button block type="submit" form={FORM_ID} disabled={sending}>
          {sending ? "Enviando…" : "Enviar ao atendimento"}
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4">
        <Field label="Assunto">
          {(id) => (
            <Select id={id} value={topic} onChange={(e) => setTopic(e.target.value as SupportTopic)}>
              {SUPPORT_TOPICS.map((t) => (
                <option key={t} value={t}>
                  {SUPPORT_TOPIC_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {topic === "privacidade" && (
          <Notice tone="neutral">Pedidos sobre seus dados pessoais (LGPD) também podem ir direto ao Encarregado de Dados: {COMPANY.dpoEmail}.</Notice>
        )}
        <Field label="Resumo" hint="Ex.: voucher não abre no balcão.">
          {(id, d) => <Input id={id} aria-describedby={d} value={subject} maxLength={120} required minLength={3} onChange={(e) => setSubject(e.target.value)} />}
        </Field>
        <Field label="Mensagem" hint="Inclua o que for útil: data, valor, nome do parceiro ou do evento. Nunca envie senhas.">
          {(id, d) => (
            <Textarea id={id} aria-describedby={d} rows={5} value={message} maxLength={4000} required minLength={10} onChange={(e) => setMessage(e.target.value)} />
          )}
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Sheet>
  );
}
