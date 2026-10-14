// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, Notice } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { formatDocument, onlyDigits } from "@/lib/partners/documents";
import type { PartnerContact, PartnerRepresentative } from "@/lib/partners/types";

export interface PartnerProfile {
  id: string;
  tradeName: string;
  legalName: string;
  documentType: "CNPJ" | "CPF";
  document: string;
  location: string;
  status: string;
  representative: PartnerRepresentative;
  contact: PartnerContact;
}

interface ProfileResponse {
  success?: boolean;
  error?: string;
  partner?: PartnerProfile;
  missing?: string[];
}

/** Empresa e representante. Razão social e CNPJ só a PRX altera; o resto o parceiro mantém. */
export function PartnerCompany({ profile, missing, onSaved }: { profile: PartnerProfile; missing: string[]; onSaved: (data: { partner: PartnerProfile; missing: string[] }) => void }) {
  const { showToast } = useConfirmToast();
  const [rep, setRep] = useState({ ...profile.representative, document: profile.representative.document ? formatDocument("CPF", profile.representative.document) : "" });
  const [contact, setContact] = useState(profile.contact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ representative: { ...rep, document: onlyDigits(rep.document) }, contact }),
      });
      const data = (await res.json()) as ProfileResponse;
      if (!res.ok || !data.success || !data.partner) {
        setError(data.error || "Não foi possível salvar.");
        return;
      }
      showToast("success", "Cadastro atualizado.");
      onSaved({ partner: data.partner, missing: data.missing ?? [] });
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="company-title" className="grid gap-10 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-5">
        <h2 id="company-title" className="ob-display text-[28px] text-ink sm:text-[40px]">
          Empresa
        </h2>
        <dl className="divide-y divide-line rounded-3xl glass px-5 text-[15px]">
          <div className="py-3">
            <dt className="text-[13px] text-muted-foreground">Nome fantasia</dt>
            <dd className="text-ink">{profile.tradeName}</dd>
          </div>
          <div className="py-3">
            <dt className="text-[13px] text-muted-foreground">Razão social</dt>
            <dd className="text-ink">{profile.legalName}</dd>
          </div>
          <div className="py-3">
            <dt className="text-[13px] text-muted-foreground">{profile.documentType}</dt>
            <dd className="font-mono text-ink">{formatDocument(profile.documentType, profile.document)}</dd>
          </div>
          <div className="py-3">
            <dt className="text-[13px] text-muted-foreground">Local</dt>
            <dd className="text-ink">{profile.location}</dd>
          </div>
        </dl>
        <p className="text-[13px] text-muted-foreground">Para alterar razão social ou documento, fale com a equipe PRX: esses dados identificam a parte no contrato.</p>
      </div>

      <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
        <h3 className="col-span-full text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Representante legal</h3>
        {missing.length > 0 && (
          <Notice tone="warning" className="col-span-full">
            Para aceitar contratos, complete: {missing.join(", ")}.
          </Notice>
        )}
        <Field label="Nome completo">
          {(id) => <Input id={id} value={rep.name} onChange={(e) => setRep({ ...rep, name: e.target.value })} autoComplete="name" />}
        </Field>
        <Field label="CPF">
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              value={rep.document}
              onChange={(e) => setRep({ ...rep, document: e.target.value })}
              onBlur={() => onlyDigits(rep.document).length === 11 && setRep((r) => ({ ...r, document: formatDocument("CPF", r.document) }))}
            />
          )}
        </Field>
        <Field label="Cargo">
          {(id) => <Input id={id} value={rep.role} onChange={(e) => setRep({ ...rep, role: e.target.value })} placeholder="Sócio-administrador" />}
        </Field>
        <Field label="E-mail">
          {(id) => <Input id={id} type="email" value={rep.email} onChange={(e) => setRep({ ...rep, email: e.target.value })} autoComplete="email" />}
        </Field>
        <Field label="Telefone">
          {(id) => <Input id={id} type="tel" value={rep.phone} onChange={(e) => setRep({ ...rep, phone: e.target.value })} autoComplete="tel" />}
        </Field>

        <h3 className="col-span-full border-t border-line pt-5 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Contato operacional</h3>
        <Field label="Nome ou setor">
          {(id) => <Input id={id} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />}
        </Field>
        <Field label="Telefone">
          {(id) => <Input id={id} type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />}
        </Field>
        <Field label="E-mail">
          {(id) => <Input id={id} type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />}
        </Field>

        {error && (
          <Notice tone="error" className="col-span-full">
            {error}
          </Notice>
        )}
        <div className="col-span-full">
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar cadastro"}
          </Button>
        </div>
      </form>
    </section>
  );
}
