// Hello World
"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/app/ui";
import { PRX_CATEGORIES } from "@/lib/pass-data";
import { MAX_LABEL, type BenefitDraft, type ImportDraft } from "@/lib/partners/import-parse";
import type { Partner } from "@/lib/partners/types";

const section = "col-span-full border-t border-line pt-5 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground first:border-t-0 first:pt-0";

/** Prévia editável do que foi lido: nada é gravado até o admin confirmar. */
export function ImportReview({
  draft,
  setDraft,
  twin,
  issues,
}: {
  draft: ImportDraft;
  setDraft: Dispatch<SetStateAction<ImportDraft | null>>;
  twin: Partner | undefined;
  issues: string[];
}) {
  const set = (patch: Partial<ImportDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setRep = (key: keyof ImportDraft["representative"], value: string) => setDraft((d) => (d ? { ...d, representative: { ...d.representative, [key]: value } } : d));
  const setBenefit = (key: string, patch: Partial<BenefitDraft>) => setDraft((d) => (d ? { ...d, benefits: d.benefits.map((b) => (b.key === key ? { ...b, ...patch } : b)) } : d));
  const removeBenefit = (key: string) => setDraft((d) => (d ? { ...d, benefits: d.benefits.filter((b) => b.key !== key) } : d));

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {twin ? (
        <Notice tone="warning" className="col-span-full">
          Este CNPJ já está cadastrado como <strong>{twin.tradeName}</strong>. Os benefícios abaixo serão adicionados a esse parceiro; os dados da empresa e o login não mudam.
        </Notice>
      ) : (
        <Notice className="col-span-full">Confira o que foi lido. Corrija o que precisar: só depois de confirmar é que o parceiro e os benefícios são criados.</Notice>
      )}

      <h3 className={section}>Empresa</h3>
      <Field label="Nome fantasia">{(id) => <Input id={id} value={draft.tradeName} onChange={(e) => set({ tradeName: e.target.value })} />}</Field>
      <Field label="Razão social">{(id) => <Input id={id} value={draft.legalName} onChange={(e) => set({ legalName: e.target.value })} />}</Field>
      <Field label="CNPJ ou CPF">{(id) => <Input id={id} inputMode="numeric" value={draft.document} onChange={(e) => set({ document: e.target.value })} />}</Field>
      <Field label="Categoria" hint={draft.categoryId ? undefined : "Não deu para deduzir: escolha."}>
        {(id, d) => (
          <Select id={id} aria-describedby={d} value={draft.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            <option value="" disabled>
              Escolha a categoria
            </option>
            {PRX_CATEGORIES.filter((c) => c.id !== "all").map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Cidade ou alcance" className="sm:col-span-2">
        {(id) => <Input id={id} value={draft.location} onChange={(e) => set({ location: e.target.value })} />}
      </Field>

      <h3 className={section}>Quem assina o contrato</h3>
      <Field label="Nome completo">{(id) => <Input id={id} value={draft.representative.name} onChange={(e) => setRep("name", e.target.value)} />}</Field>
      <Field label="CPF">{(id) => <Input id={id} inputMode="numeric" value={draft.representative.document} onChange={(e) => setRep("document", e.target.value)} />}</Field>
      <Field label="Cargo">{(id) => <Input id={id} value={draft.representative.role} onChange={(e) => setRep("role", e.target.value)} />}</Field>
      <Field label="Telefone">{(id) => <Input id={id} type="tel" value={draft.representative.phone} onChange={(e) => setRep("phone", e.target.value)} />}</Field>
      <Field label="E-mail">{(id) => <Input id={id} type="email" value={draft.representative.email} onChange={(e) => setRep("email", e.target.value)} />}</Field>
      <Field label="E-mail de login no portal" hint={twin ? "Parceiro existente: o login não é alterado." : "Cria o acesso com senha temporária. Em branco, usa o e-mail de quem assina."}>
        {(id, d) => <Input id={id} aria-describedby={d} type="email" value={draft.loginEmail} onChange={(e) => set({ loginEmail: e.target.value })} />}
      </Field>

      <h3 className={section}>Benefícios ({draft.benefits.length})</h3>
      {draft.benefits.length === 0 && <Notice tone="warning" className="col-span-full">Nenhum benefício lido. O parceiro será criado sem benefícios.</Notice>}
      {draft.benefits.map((b, i) => (
        <fieldset key={b.key} className="col-span-full grid gap-3 rounded-2xl bg-surface p-4 sm:grid-cols-[1fr_10rem]">
          <legend className="sr-only">Benefício {i + 1}</legend>
          <Field label={`Título ${i + 1}`}>{(id) => <Input id={id} value={b.title} maxLength={80} onChange={(e) => setBenefit(b.key, { title: e.target.value })} />}</Field>
          <Field label="Rótulo da oferta">
            {(id) => <Input id={id} value={b.discountLabel} maxLength={MAX_LABEL} onChange={(e) => setBenefit(b.key, { discountLabel: e.target.value })} />}
          </Field>
          <Field label="Descrição" className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={2} value={b.description} onChange={(e) => setBenefit(b.key, { description: e.target.value })} />}
          </Field>
          <div className="sm:col-span-2">
            <Button variant="ghost" size="sm" onClick={() => removeBenefit(b.key)}>
              Remover este benefício
            </Button>
          </div>
        </fieldset>
      ))}
      <p className="col-span-full -mt-2 text-[13px] text-muted-foreground">Os benefícios entram com nível 1, regra padrão (QR Code no balcão) e preço 0 em PRX Coins. Ajuste o preço depois, na aba Benefícios.</p>

      {issues.length > 0 && (
        <Notice tone="error" className="col-span-full">
          <ul className="list-disc space-y-0.5 pl-5">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
