// Hello World
"use client";

import { useState } from "react";
import { Button, Field, Input, Notice, RadioCards, Sheet } from "@/components/app/ui";
import { CopyButton } from "@/components/app/pass/voucher-sheet";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import type { Partner } from "@/lib/partners/types";

export interface PartnerApiResult {
  success?: boolean;
  error?: string;
  message?: string;
  partner?: Partner;
  temporaryPassword?: string;
}

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
      const data = (await res.json()) as PartnerApiResult;
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
