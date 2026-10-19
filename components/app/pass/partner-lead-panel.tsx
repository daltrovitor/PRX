// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Button, Checkbox, Field, Input, Notice, Select, Textarea } from "@/components/app/ui";
import { LEAD_CATEGORY_IDS, LEAD_RELATIONS, LEAD_RELATION_LABEL, leadCategoryName, type LeadRelation } from "@/lib/partner-leads/types";

const EMPTY = {
  businessName: "",
  document: "",
  categoryId: "gastronomia",
  city: "",
  contactName: "",
  relation: "dono" as LeadRelation,
  email: "",
  phone: "",
  link: "",
  offer: "",
  consent: false,
};

/**
 * "Seja um parceiro" no PRX PASS: a empresa (ou quem indica) conta quem é e o
 * que quer oferecer aos membros. Vira um pedido para a equipe comercial.
 */
export function PartnerLeadPanel({ defaultName, defaultEmail }: { defaultName: string; defaultEmail: string }) {
  const [form, setForm] = useState({ ...EMPTY, contactName: defaultName, email: defaultEmail });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.consent) {
      setError("Autorize o contato da equipe PRX para enviar.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/partner-leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error || "Não foi possível enviar o pedido.");
      setDone(json.message || "Pedido enviado.");
    } catch (err) {
      setError(err instanceof TypeError ? "Sem internet agora. Confira sua conexão e tente de novo." : err instanceof Error ? err.message : "Não foi possível enviar o pedido.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <section aria-labelledby="lead-title" className="space-y-4 rounded-3xl glass p-6">
        <h2 id="lead-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Pedido recebido
        </h2>
        <p className="text-sm text-muted-foreground">{done}</p>
        <Button variant="secondary" onClick={() => { setDone(null); setForm({ ...EMPTY, contactName: defaultName, email: defaultEmail }); }}>
          Indicar outra empresa
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="lead-title" className="space-y-6">
      <div className="max-w-xl">
        <h2 id="lead-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Seja um parceiro PRX
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sua marca no catálogo do PRX PASS, para uma geração que escolhe bem. Conte quem é a empresa e o que ela quer oferecer: a equipe de parcerias responde pelo contato informado.
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-4 rounded-3xl glass p-5 sm:grid-cols-2 sm:p-6">
        <Field label="Nome da empresa">
          {(id) => <Input id={id} required minLength={2} maxLength={120} value={form.businessName} onChange={(e) => set("businessName", e.target.value)} />}
        </Field>
        <Field label="CNPJ (opcional)" hint="Agiliza a análise.">
          {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={18} value={form.document} onChange={(e) => set("document", e.target.value)} />}
        </Field>
        <Field label="Categoria">
          {(id) => (
            <Select id={id} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              {LEAD_CATEGORY_IDS.map((c) => (
                <option key={c} value={c}>
                  {leadCategoryName(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Cidade">
          {(id) => <Input id={id} required minLength={2} maxLength={120} autoComplete="address-level2" value={form.city} onChange={(e) => set("city", e.target.value)} />}
        </Field>
        <Field label="Seu nome">
          {(id) => <Input id={id} required minLength={2} maxLength={120} autoComplete="name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />}
        </Field>
        <Field label="Sua relação com a empresa">
          {(id) => (
            <Select id={id} value={form.relation} onChange={(e) => set("relation", e.target.value as LeadRelation)}>
              {LEAD_RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {LEAD_RELATION_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="E-mail para contato">
          {(id) => <Input id={id} type="email" required maxLength={160} autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />}
        </Field>
        <Field label="WhatsApp ou telefone" hint="Com DDD.">
          {(id, d) => <Input id={id} aria-describedby={d} type="tel" required inputMode="tel" autoComplete="tel" maxLength={20} value={form.phone} onChange={(e) => set("phone", e.target.value)} />}
        </Field>
        <Field label="Instagram ou site (opcional)" className="sm:col-span-2">
          {(id) => <Input id={id} maxLength={200} value={form.link} onChange={(e) => set("link", e.target.value)} placeholder="@suamarca ou suamarca.com.br" />}
        </Field>
        <Field label="O que a empresa quer oferecer aos membros?" hint="Ex.: 15% em toda a loja, aula experimental grátis, drop exclusivo." className="sm:col-span-2">
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={4} required minLength={10} maxLength={1000} value={form.offer} onChange={(e) => set("offer", e.target.value)} />}
        </Field>
        <Checkbox
          className="sm:col-span-2"
          checked={form.consent}
          onChange={(checked) => set("consent", checked)}
          label="Autorizo a equipe PRX a entrar em contato pelo e-mail e telefone informados sobre esta parceria."
        />
        {error && (
          <Notice tone="error" className="sm:col-span-2">
            {error}
          </Notice>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={sending} className="w-full sm:w-auto">
            {sending ? "Enviando…" : "Enviar pedido de parceria"}
          </Button>
        </div>
      </form>
    </section>
  );
}
