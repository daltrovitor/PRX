// Hello World
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Input, Notice } from "@/components/app/ui";
import { formatPartyDate } from "@/lib/resenha/format";
import type { PublicEditionView } from "@/lib/resenha/service";

interface RequestResponse {
  success?: boolean;
  token?: string;
  error?: string;
}

const EMPTY = { name: "", email: "", whatsapp: "", instagram: "", birthDate: "", consent: false };

/** Página do link do Insider: "A resenha é da Bia." e o pedido de acesso à lista. */
export function RequestForm({ view, code }: { view: PublicEditionView; code: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { edition, insider } = view;
  const host = edition.title.replace(/^Resenha /, "");
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.consent) return setError("Confirme que você tem 18 anos ou mais e aceite o uso dos seus dados.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/resenha/${edition.slug}/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, code }) });
      const data = (await res.json().catch(() => ({}))) as RequestResponse;
      if (!res.ok || !data.token) return setError(data.error || "Não foi possível enviar o pedido agora.");
      try {
        localStorage.setItem(`resenha:${edition.slug}`, data.token);
      } catch {
        // sem armazenamento local: o link da página do pedido continua valendo
      }
      router.push(`/resenha/lista/${data.token}`);
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="ob-display text-[40px] leading-[1.02] text-ink sm:text-5xl">A resenha é {host}.</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Resenha {edition.slug} · {formatPartyDate(edition.startsAt)} · {edition.city}
        </p>
      </header>

      {!view.canRequest ? (
        <section className="glass space-y-2 rounded-3xl p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">{view.reason}</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">Quem entra é quem recebe o link de um Insider. O endereço aparece só para quem está na lista.</p>
        </section>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="glass space-y-5 rounded-3xl p-5 sm:p-6" noValidate>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Peça seu acesso à lista</h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Quem libera é {insider?.name}
              {insider?.handle ? ` (@${insider.handle})` : ""}. O endereço aparece só para quem entra na lista.
            </p>
          </div>
          <Field label="Nome completo">
            {(id) => <Input id={id} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} required />}
          </Field>
          <Field label="E-mail" hint="O aviso de que você entrou na lista chega aqui.">
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="WhatsApp (opcional)">
              {(id) => <Input id={id} type="tel" autoComplete="tel" inputMode="tel" placeholder="(11) 98888-7777" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />}
            </Field>
            <Field label="Instagram (opcional)">
              {(id) => <Input id={id} autoCapitalize="none" placeholder="@seuusuario" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} />}
            </Field>
          </div>
          <Field label="Data de nascimento" hint="A Resenha é 18+. A idade é conferida no dia da festa.">
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="date" autoComplete="bday" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} required />}
          </Field>
          <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-muted-foreground">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-primary" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} />
            <span>
              Tenho 18 anos ou mais e aceito que a PRX e o Insider vejam estes dados para decidir meu acesso e controlar a entrada. Detalhes na{" "}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="cursor-pointer text-ink underline">
                Política de Privacidade
              </a>
              .
            </span>
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" block disabled={busy}>
            {busy ? "Enviando…" : "Pedir acesso"}
          </Button>
        </form>
      )}
    </div>
  );
}
