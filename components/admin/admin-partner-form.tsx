// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Button, Checkbox, Field, Input, Notice, RadioCards, Select, Sheet, Textarea } from "@/components/app/ui";
import { ImagePicker, useImageUpload } from "@/components/admin/image-picker";
import { BadgePicker } from "@/components/admin/badge-picker";
import { useFormDraft } from "@/components/admin/use-form-draft";
import { TemporaryCredential, type PartnerApiResult as ApiResult } from "@/components/admin/admin-partner-access";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { PRX_CATEGORIES } from "@/lib/pass-data";
import { formatDocument, inferDocumentType, onlyDigits } from "@/lib/partners/documents";
import { PARTNER_STATUSES, PARTNER_STATUS_LABEL, type Partner, type PartnerStatus } from "@/lib/partners/types";

export { AdminPartnerAccessSheet, TemporaryCredential } from "@/components/admin/admin-partner-access";

type AccessMode = "none" | "link" | "create";

export function AdminPartnerSheet({
  open,
  onClose,
  partner,
  prefillEmail,
  onSaved,
  existing = [],
  onOpenExisting,
}: {
  open: boolean;
  onClose: () => void;
  partner: Partner | null;
  prefillEmail?: string;
  onSaved: (partner: Partner) => void;
  /** Parceiros já cadastrados: avisa quando o CNPJ/CPF digitado já existe. */
  existing?: ReadonlyArray<Partner>;
  onOpenExisting?: (id: string) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={partner ? `Editar ${partner.tradeName}` : "Novo parceiro"}
      description="Empresa, representante legal e contato operacional. Estes dados preenchem o contrato."
    >
      {open && (
        <PartnerForm
          key={partner?.id ?? `new-${prefillEmail ?? ""}`}
          partner={partner}
          prefillEmail={prefillEmail}
          onSaved={onSaved}
          onClose={onClose}
          existing={existing}
          onOpenExisting={onOpenExisting}
        />
      )}
    </Sheet>
  );
}

type Person = { name: string; phone: string; email: string };
const samePerson = (a: Person, b: Person) => a.name === b.name && a.phone === b.phone && a.email === b.email;

function PartnerForm({
  partner,
  prefillEmail,
  onSaved,
  onClose,
  existing,
  onOpenExisting,
}: {
  partner: Partner | null;
  prefillEmail?: string;
  onSaved: (partner: Partner) => void;
  onClose: () => void;
  existing: ReadonlyArray<Partner>;
  onOpenExisting?: (id: string) => void;
}) {
  const { showToast } = useConfirmToast();
  // Rascunho no navegador: fechar o painel ou um erro não apagam o que foi digitado.
  const draft = useFormDraft(`prx_admin_partner_draft:${partner?.id ?? "new"}`, partner?.updatedAt ?? "new", () => ({
    tradeName: partner?.tradeName ?? "",
    legalName: partner?.legalName ?? "",
    document: partner ? formatDocument(partner.documentType, partner.document) : "",
    categoryId: partner?.categoryId || "gastronomia",
    location: partner?.location ?? "Goiânia, GO",
    description: partner?.description ?? "",
    logoUrl: partner?.logoUrl ?? "",
    bannerUrl: partner?.bannerUrl ?? "",
    status: (partner?.status ?? "ATIVO") as PartnerStatus,
    representative: partner?.representative ?? { name: "", document: "", role: "", email: "", phone: "" },
    contact: partner?.contact ?? { name: "", phone: "", email: "" },
    badges: partner?.badges ?? [],
    // Contato operacional igual ao representante: os dados não são digitados duas vezes.
    sameContact: !partner || !partner.contact.name || samePerson(partner.contact, partner.representative),
  }));
  const form = draft.value;
  const setForm = draft.setValue;
  const [access, setAccess] = useState<{ mode: AccessMode; email: string; name: string }>({
    mode: prefillEmail ? "link" : "none",
    email: prefillEmail ?? "",
    name: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<{ email: string; password: string; partner: Partner } | null>(null);
  const logo = useImageUpload((url) => setForm((f) => ({ ...f, logoUrl: url })), setError);
  const banner = useImageUpload((url) => setForm((f) => ({ ...f, bannerUrl: url })), setError);

  const docType = inferDocumentType(form.document);
  const digits = onlyDigits(form.document);
  const twin = !partner && digits.length >= 11 ? existing.find((p) => p.document === digits) : undefined;
  const setRep = (key: keyof typeof form.representative, value: string) => setForm((f) => ({ ...f, representative: { ...f.representative, [key]: value } }));
  const setContact = (key: keyof typeof form.contact, value: string) => setForm((f) => ({ ...f, contact: { ...f.contact, [key]: value } }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const { sameContact, ...fields } = form;
    const rep = form.representative;
    const payload = {
      ...fields,
      document: onlyDigits(form.document),
      representative: { ...rep, document: onlyDigits(rep.document) },
      contact: sameContact ? { name: rep.name, phone: rep.phone, email: rep.email } : form.contact,
    };
    const loginEmail = access.email.trim() || rep.email;
    const body = partner
      ? { id: partner.id, partner: payload }
      : { partner: payload, access: access.mode === "none" ? { mode: "none" } : { mode: access.mode, email: loginEmail, name: access.name || rep.name || form.tradeName } };
    try {
      const res = await fetch("/api/admin/partners", {
        method: partner ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.success || !data.partner) {
        setError(data.error || "Não foi possível salvar o parceiro.");
        return;
      }
      draft.clear();
      showToast("success", data.message || "Parceiro salvo.");
      if (data.temporaryPassword) {
        setCredential({ email: loginEmail, password: data.temporaryPassword, partner: data.partner });
        return;
      }
      onSaved(data.partner);
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  if (credential) {
    return (
      <div className="space-y-5">
        <TemporaryCredential email={credential.email} password={credential.password} />
        <Button block onClick={() => onSaved(credential.partner)}>
          Concluir
        </Button>
      </div>
    );
  }

  const section = "col-span-full border-t border-line pt-5 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground first:border-t-0 first:pt-0";

  return (
    <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
      {draft.restored && (
        <Notice className="col-span-full">
          <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Recuperamos o que você já tinha digitado neste cadastro.</span>
            <Button variant="secondary" size="sm" onClick={draft.discard}>
              Descartar rascunho
            </Button>
          </span>
        </Notice>
      )}
      <h3 className={section}>Empresa</h3>
      <Field label="Nome fantasia" hint="Como aparece no app.">
        {(id, d) => <Input id={id} aria-describedby={d} required value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} />}
      </Field>
      <Field label="Razão social (ou nome completo, se CPF)">
        {(id) => <Input id={id} required value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />}
      </Field>
      <Field label="CNPJ ou CPF" hint={docType ? `${docType} detectado.` : "Só números ou com máscara."}>
        {(id, d) => (
          <Input
            id={id}
            aria-describedby={d}
            required
            inputMode="numeric"
            value={form.document}
            onChange={(e) => setForm({ ...form, document: e.target.value })}
            onBlur={() =>
              docType &&
              setForm((f) => ({
                ...f,
                document: formatDocument(docType, f.document),
                // Pessoa física: o titular é o representante, sem digitar nome e CPF de novo.
                representative:
                  docType === "CPF"
                    ? { ...f.representative, name: f.representative.name || f.legalName, document: f.representative.document || formatDocument("CPF", f.document) }
                    : f.representative,
              }))
            }
          />
        )}
      </Field>
      {twin && (
        <Notice tone="warning" className="col-span-full">
          <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Este {twin.documentType} já está cadastrado: <strong>{twin.tradeName}</strong>.
            </span>
            {onOpenExisting && (
              <Button variant="secondary" size="sm" onClick={() => onOpenExisting(twin.id)}>
                Abrir cadastro
              </Button>
            )}
          </span>
        </Notice>
      )}
      <Field label="Categoria">
        {(id) => (
          <Select id={id} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {PRX_CATEGORIES.filter((c) => c.id !== "all").map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Cidade ou alcance">
        {(id) => <Input id={id} required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />}
      </Field>
      <Field label="Status da parceria" hint="Suspenso ou bloqueado tira os benefícios do catálogo e trava o validador.">
        {(id, d) => (
          <Select id={id} aria-describedby={d} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PartnerStatus })}>
            {PARTNER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PARTNER_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Descrição (opcional)" className="sm:col-span-2">
        {(id) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
      </Field>
      <BadgePicker
        className="sm:col-span-2"
        value={form.badges ?? []}
        onChange={(badges) => setForm((f) => ({ ...f, badges }))}
        hint="Valem para todos os benefícios deste parceiro."
      />
      <ImagePicker label="Logo (quadrado)" value={form.logoUrl} busy={logo.busy} onChange={(e) => logo.upload(e, "logo")} square />
      <ImagePicker label="Capa (retangular)" value={form.bannerUrl} busy={banner.busy} onChange={(e) => banner.upload(e, "banner")} />

      <h3 className={section}>Representante legal</h3>
      <p className="col-span-full -mt-3 text-[13px] text-muted-foreground">Quem aceita o contrato. Pode ser completado pelo próprio parceiro no portal antes do aceite.</p>
      <Field label="Nome completo">
        {(id) => <Input id={id} value={form.representative.name} onChange={(e) => setRep("name", e.target.value)} />}
      </Field>
      <Field label="CPF">
        {(id) => <Input id={id} inputMode="numeric" value={form.representative.document} onChange={(e) => setRep("document", e.target.value)} />}
      </Field>
      <Field label="Cargo">
        {(id) => <Input id={id} value={form.representative.role} onChange={(e) => setRep("role", e.target.value)} placeholder="Sócio-administrador" />}
      </Field>
      <Field label="E-mail">
        {(id) => <Input id={id} type="email" value={form.representative.email} onChange={(e) => setRep("email", e.target.value)} />}
      </Field>
      <Field label="Telefone">
        {(id) => <Input id={id} type="tel" value={form.representative.phone} onChange={(e) => setRep("phone", e.target.value)} />}
      </Field>

      <h3 className={section}>Contato operacional</h3>
      <div className="col-span-full">
        <Checkbox checked={form.sameContact} onChange={(checked) => setForm((f) => ({ ...f, sameContact: checked }))} label="O contato do dia a dia é o próprio representante legal" />
      </div>
      {!form.sameContact && (
        <>
          <Field label="Nome ou setor">
            {(id) => <Input id={id} value={form.contact.name} onChange={(e) => setContact("name", e.target.value)} />}
          </Field>
          <Field label="Telefone">
            {(id) => <Input id={id} type="tel" value={form.contact.phone} onChange={(e) => setContact("phone", e.target.value)} />}
          </Field>
          <Field label="E-mail">
            {(id) => <Input id={id} type="email" value={form.contact.email} onChange={(e) => setContact("email", e.target.value)} />}
          </Field>
        </>
      )}

      {!partner && (
        <>
          <h3 className={section}>Login no Portal do Parceiro</h3>
          <RadioCards
            label="Acesso"
            value={access.mode}
            onChange={(mode) => setAccess((a) => ({ ...a, mode, email: a.email || form.representative.email }))}
            className="sm:col-span-2"
            options={[
              { value: "none", title: "Configurar depois", body: "Sem login, o parceiro não valida QR Codes nem aceita contratos." },
              { value: "link", title: "Vincular conta existente", body: "Uma conta PRX já cadastrada vira o login do parceiro." },
              { value: "create", title: "Criar acesso", body: "Gera um login com senha temporária, exibida uma única vez." },
            ]}
          />
          {access.mode !== "none" && (
            <Field label="E-mail de login" hint={form.representative.email ? "Em branco, usa o e-mail do representante." : undefined}>
              {(id, d) => (
                <Input
                  id={id}
                  aria-describedby={d}
                  type="email"
                  required={!form.representative.email}
                  placeholder={form.representative.email || undefined}
                  value={access.email}
                  onChange={(e) => setAccess({ ...access, email: e.target.value })}
                />
              )}
            </Field>
          )}
        </>
      )}

      {error && (
        <Notice tone="error" className="col-span-full">
          {error}
        </Notice>
      )}

      <div className="col-span-full flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || logo.busy || banner.busy}>
          {saving ? "Salvando…" : partner ? "Salvar alterações" : "Cadastrar parceiro"}
        </Button>
      </div>
    </form>
  );
}
