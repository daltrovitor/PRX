// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, Notice, RadioCards, Select, Sheet, Textarea } from "@/components/app/ui";
import { CopyButton } from "@/components/app/pass/voucher-sheet";
import { ImagePicker, useImageUpload } from "@/components/admin/image-picker";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { PRX_CATEGORIES } from "@/lib/pass-data";
import { formatDocument, inferDocumentType, onlyDigits } from "@/lib/partners/documents";
import { PARTNER_STATUSES, PARTNER_STATUS_LABEL, type Partner, type PartnerStatus } from "@/lib/partners/types";

interface ApiResult {
  success?: boolean;
  error?: string;
  message?: string;
  partner?: Partner;
  temporaryPassword?: string;
}

type AccessMode = "none" | "link" | "create";

/** Credencial gerada: aparece uma única vez, para o admin repassar ao parceiro. */
export function TemporaryCredential({
  email,
  password,
  note = "Esta senha não será mostrada de novo. Envie ao parceiro por um canal seguro; ela é pedida outra vez na hora de aceitar o contrato.",
}: {
  email: string;
  password: string;
  note?: string;
}) {
  return (
    <div className="space-y-3 rounded-3xl bg-surface p-4">
      <p className="text-[15px] font-semibold text-ink">Login criado para {email}</p>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-card px-3.5 py-2.5">
        <code className="font-mono text-base tracking-[0.06em] text-ink">{password}</code>
        <CopyButton value={password} label="Copiar senha" />
      </div>
      <Notice tone="warning">{note}</Notice>
    </div>
  );
}

export function AdminPartnerSheet({
  open,
  onClose,
  partner,
  prefillEmail,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  partner: Partner | null;
  prefillEmail?: string;
  onSaved: (partner: Partner) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={partner ? `Editar ${partner.tradeName}` : "Novo parceiro"}
      description="Empresa, representante legal e contato operacional. Estes dados preenchem o contrato."
    >
      {open && <PartnerForm key={partner?.id ?? `new-${prefillEmail ?? ""}`} partner={partner} prefillEmail={prefillEmail} onSaved={onSaved} onClose={onClose} />}
    </Sheet>
  );
}

function PartnerForm({
  partner,
  prefillEmail,
  onSaved,
  onClose,
}: {
  partner: Partner | null;
  prefillEmail?: string;
  onSaved: (partner: Partner) => void;
  onClose: () => void;
}) {
  const { showToast } = useConfirmToast();
  const [form, setForm] = useState({
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
  });
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
  const setRep = (key: keyof typeof form.representative, value: string) => setForm((f) => ({ ...f, representative: { ...f.representative, [key]: value } }));
  const setContact = (key: keyof typeof form.contact, value: string) => setForm((f) => ({ ...f, contact: { ...f.contact, [key]: value } }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = { ...form, document: onlyDigits(form.document), representative: { ...form.representative, document: onlyDigits(form.representative.document) } };
    const body = partner
      ? { id: partner.id, partner: payload }
      : { partner: payload, access: access.mode === "none" ? { mode: "none" } : { mode: access.mode, email: access.email, name: access.name || form.representative.name || form.tradeName } };
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
      showToast("success", data.message || "Parceiro salvo.");
      if (data.temporaryPassword) {
        setCredential({ email: access.email, password: data.temporaryPassword, partner: data.partner });
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
            onBlur={() => docType && setForm((f) => ({ ...f, document: formatDocument(docType, f.document) }))}
          />
        )}
      </Field>
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
      <Field label="Nome ou setor">
        {(id) => <Input id={id} value={form.contact.name} onChange={(e) => setContact("name", e.target.value)} />}
      </Field>
      <Field label="Telefone">
        {(id) => <Input id={id} type="tel" value={form.contact.phone} onChange={(e) => setContact("phone", e.target.value)} />}
      </Field>
      <Field label="E-mail">
        {(id) => <Input id={id} type="email" value={form.contact.email} onChange={(e) => setContact("email", e.target.value)} />}
      </Field>

      {!partner && (
        <>
          <h3 className={section}>Login no Portal do Parceiro</h3>
          <RadioCards
            label="Acesso"
            value={access.mode}
            onChange={(mode) => setAccess({ ...access, mode })}
            className="sm:col-span-2"
            options={[
              { value: "none", title: "Configurar depois", body: "Sem login, o parceiro não valida QR Codes nem aceita contratos." },
              { value: "link", title: "Vincular conta existente", body: "Uma conta PRX já cadastrada vira o login do parceiro." },
              { value: "create", title: "Criar acesso", body: "Gera um login com senha temporária, exibida uma única vez." },
            ]}
          />
          {access.mode !== "none" && (
            <Field label="E-mail de login">
              {(id) => <Input id={id} type="email" required value={access.email} onChange={(e) => setAccess({ ...access, email: e.target.value })} />}
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

/** Vincular, criar ou remover o login de um parceiro já cadastrado. */
export function AdminPartnerAccessSheet({ open, onClose, partner, onSaved }: { open: boolean; onClose: () => void; partner: Partner; onSaved: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Login do parceiro" description={`${partner.tradeName} · só este login valida os QR Codes dos benefícios dele.`}>
      {open && <AccessForm partner={partner} onSaved={onSaved} />}
    </Sheet>
  );
}

function AccessForm({ partner, onSaved }: { partner: Partner; onSaved: () => void }) {
  const { showToast, confirmDelete } = useConfirmToast();
  const [mode, setMode] = useState<"link" | "create">("create");
  const [email, setEmail] = useState(partner.representative.email || partner.contact.email || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/partners/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: partner.id, ...body }),
      });
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.success) {
        setError(data.error || "Não foi possível configurar o acesso.");
        return;
      }
      showToast("success", data.message || "Acesso atualizado.");
      if (data.temporaryPassword) setCredential({ email, password: data.temporaryPassword });
      else onSaved();
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    const ok = await confirmDelete({
      title: "Remover login",
      message: `${partner.ownerEmail} perde o acesso ao portal e volta a ser uma conta de membro. Contratos aceitos continuam válidos.`,
      confirmText: "Remover",
      cancelText: "Cancelar",
    });
    if (ok) await send({ mode: "revoke" });
  }

  if (credential) {
    return (
      <div className="space-y-5">
        <TemporaryCredential email={credential.email} password={credential.password} />
        <Button block onClick={onSaved}>
          Concluir
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void send({ mode, email, name: partner.representative.name || partner.tradeName });
      }}
    >
      {partner.ownerEmail && (
        <div className="flex items-center justify-between gap-3 rounded-3xl bg-surface p-4">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Login atual</p>
            <p className="truncate text-[15px] text-ink">{partner.ownerEmail}</p>
          </div>
          <Button variant="danger" size="sm" onClick={revoke} disabled={busy}>
            Remover
          </Button>
        </div>
      )}
      <RadioCards
        label={partner.ownerEmail ? "Trocar por" : "Acesso"}
        value={mode}
        onChange={setMode}
        options={[
          { value: "create", title: "Criar acesso", body: "Novo login com senha temporária." },
          { value: "link", title: "Vincular conta existente", body: "Conta PRX já cadastrada." },
        ]}
      />
      <Field label="E-mail de login">
        {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" block disabled={busy || !email.trim()}>
        {busy ? "Salvando…" : mode === "create" ? "Criar login" : "Vincular conta"}
      </Button>
    </form>
  );
}
