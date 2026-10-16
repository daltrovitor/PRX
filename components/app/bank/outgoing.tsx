// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { QrScanner } from "@/components/app/qr-scanner";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Button, Field, Input, Notice, Segmented, Sheet, Textarea, formatBRL } from "@/components/app/ui";
import { PIX_KEY_LABEL, detectPixKeyType } from "@/lib/prx/pix";
import { NIGHT_LIMIT_HINT, ProviderDisclosure } from "@/components/app/bank/provider-disclosure";

/**
 * Saídas pelo banco parceiro: Pix (chave, Copia e Cola, QR Code) e pagamento
 * de contas. O servidor revisa (recebedor, valor, limites, saldo) e só executa
 * depois da biometria do aparelho ou da senha da conta.
 */

export interface Prepared {
  requestId: string;
  kind: "pix_key" | "pix_qr" | "bill";
  amount: number;
  recipient: string;
  institution: string | null;
  document: string | null;
  dueDate: string | null;
  fee: number | null;
  expiresAt: string;
}

type Confirmation = { method: "passkey"; options: PublicKeyCredentialRequestOptionsJSON; sealed: string; passwordFallback: true } | { method: "password" };

export interface Review {
  prepared: Prepared;
  confirmation: Confirmation;
}

async function post(body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const res = await fetch("/api/bank/outgoing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, json: { error: "Sem internet agora. Confira sua conexão e tente de novo." } };
  }
}

const errorOf = (json: Record<string, unknown>, fallback: string) => (typeof json.error === "string" ? json.error : fallback);

/** Converte "1.234,56" ou "1234.56" em número. */
function parseMoney(text: string): number {
  const cleaned = text.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

/** Revisão e confirmação (biometria ou senha) de uma saída preparada no servidor. Também usada no checkout de ingressos. */
export function ReviewSheet({ review, onClose, onDone }: { review: Review | null; onClose: () => void; onDone: (prepared: Prepared) => void }) {
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askPassword = review?.confirmation.method === "password" || usePassword;

  function close() {
    if (review) void post({ action: "cancel", requestId: review.prepared.requestId });
    setPassword("");
    setUsePassword(false);
    setError(null);
    onClose();
  }

  async function confirm(event?: FormEvent) {
    event?.preventDefault();
    if (!review) return;
    setBusy(true);
    setError(null);
    let proof: unknown;
    if (askPassword) {
      if (!password) {
        setBusy(false);
        return setError("Digite sua senha.");
      }
      proof = { type: "password", password };
    } else if (review.confirmation.method === "passkey") {
      try {
        const response = await startAuthentication({ optionsJSON: review.confirmation.options });
        proof = { type: "passkey", sealed: review.confirmation.sealed, response };
      } catch {
        setBusy(false);
        setUsePassword(true);
        return setError("Biometria cancelada ou indisponível neste aparelho. Confirme com a sua senha.");
      }
    }
    const { ok, json } = await post({ action: "confirm", requestId: review.prepared.requestId, proof });
    setBusy(false);
    if (!ok) return setError(errorOf(json, "Não foi possível concluir a operação."));
    setPassword("");
    setUsePassword(false);
    onDone(review.prepared);
  }

  const p = review?.prepared;
  const rows: Array<[string, string]> = p
    ? ([
        ["Para", p.recipient],
        p.institution ? ["Instituição", p.institution] : null,
        p.document ? ["CPF/CNPJ", p.document] : null,
        p.dueDate ? ["Vencimento", new Date(`${p.dueDate}T12:00:00`).toLocaleDateString("pt-BR")] : null,
        p.fee ? ["Tarifa", formatBRL(p.fee)] : null,
      ].filter(Boolean) as Array<[string, string]>)
    : [];

  return (
    <Sheet
      open={Boolean(review)}
      onClose={close}
      title={p?.kind === "bill" ? "Confirmar pagamento" : "Confirmar Pix"}
      footer={
        <Button block onClick={() => void confirm()} disabled={busy || !review}>
          {busy ? "Confirmando…" : askPassword ? `Confirmar ${p ? formatBRL(p.amount) : ""}` : `Confirmar com biometria · ${p ? formatBRL(p.amount) : ""}`}
        </Button>
      }
    >
      {p && (
        <div className="space-y-5">
          <dl className="divide-y divide-line rounded-3xl bg-surface px-4 text-[15px]">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-3.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-all text-right font-medium text-ink">{value}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 py-3.5">
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="text-2xl font-semibold tracking-[-0.02em] text-ink">{formatBRL(p.amount)}</dd>
            </div>
          </dl>
          {askPassword && (
            <form onSubmit={(e) => void confirm(e)}>
              <Field label="Senha da sua conta PRX">
                {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
              </Field>
            </form>
          )}
          {review?.confirmation.method === "passkey" && !usePassword && (
            <button type="button" className="min-h-12 cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setUsePassword(true)}>
              Confirmar com senha
            </button>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <ProviderDisclosure />
        </div>
      )}
    </Sheet>
  );
}

type PixMethod = "chave" | "copia" | "qr";

/** Pix pela conta no banco parceiro. */
export function ProviderPixPanel({ balance, initialMethod = "chave", onSent }: { balance: number; initialMethod?: PixMethod; onSent: () => void }) {
  const [method, setMethod] = useState<PixMethod>(initialMethod);
  const [key, setKey] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [pasted, setPasted] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useConfirmToast();
  const keyType = detectPixKeyType(key);

  async function prepare(body: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    const { ok, json } = await post({ action: "prepare_pix", ...body });
    setBusy(false);
    if (!ok) return setError(errorOf(json, "Não foi possível revisar o Pix."));
    setReview({ prepared: json.prepared as Prepared, confirmation: json.confirmation as Confirmation });
  }

  function fromKey(event: FormEvent) {
    event.preventDefault();
    if (!keyType) return setError("Chave inválida. Use CPF, CNPJ, e-mail, celular com DDD ou chave aleatória.");
    const amount = parseMoney(amountText);
    if (!(amount > 0)) return setError("Informe o valor do Pix.");
    void prepare({ method: "key", key: key.trim(), amount, description });
  }

  function fromPayload(payload: string) {
    const amount = parseMoney(amountText);
    void prepare({ method: "qr", payload: payload.trim(), amount: amount > 0 ? amount : undefined, description });
  }

  function done(prepared: Prepared) {
    setReview(null);
    setKey("");
    setAmountText("");
    setDescription("");
    setPasted("");
    showToast("success", `Pix de ${formatBRL(prepared.amount)} enviado para ${prepared.recipient}. Você recebe o aviso quando ele for liquidado.`);
    onSent();
  }

  return (
    <section aria-label="Enviar Pix" className="space-y-6 lg:max-w-2xl pb-48 sm:pb-36 lg:pb-8">
      <Segmented
        label="Forma de pagamento Pix"
        value={method}
        onChange={(value) => {
          setMethod(value);
          setError(null);
        }}
        options={[
          { value: "chave", label: "Chave" },
          { value: "copia", label: "Copia e cola" },
          { value: "qr", label: "Ler QR Code" },
        ]}
      />

      {method === "chave" && (
        <form onSubmit={fromKey} className="space-y-5">
          <Field label="Chave Pix" hint={keyType ? `Tipo identificado: ${PIX_KEY_LABEL[keyType]}` : "CPF, CNPJ, e-mail, celular ou chave aleatória."}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />}
          </Field>
          <Field label="Valor" hint={`Disponível: ${formatBRL(balance)}`}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} inputMode="decimal" placeholder="0,00" value={amountText} onChange={(e) => setAmountText(e.target.value)} className="font-mono text-lg" />}
          </Field>
          <Field label="Mensagem (opcional)">{(id) => <Input id={id} value={description} maxLength={60} onChange={(e) => setDescription(e.target.value)} />}</Field>
          <div className="pt-2 pb-4">
            <Button type="submit" block disabled={busy}>
              {busy ? "Revisando…" : "Revisar Pix"}
            </Button>
          </div>
        </form>
      )}

      {method !== "chave" && (
        <Field label="Valor (só se o código não trouxer)" hint={`Disponível: ${formatBRL(balance)}`}>
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} inputMode="decimal" placeholder="0,00" value={amountText} onChange={(e) => setAmountText(e.target.value)} className="font-mono" />}
        </Field>
      )}

      {method === "copia" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            fromPayload(pasted);
          }}
          className="space-y-5"
        >
          <Field label="Código Pix Copia e Cola">
            {(id) => <Textarea id={id} value={pasted} onChange={(e) => setPasted(e.target.value)} className="font-mono text-sm" spellCheck={false} placeholder="00020126…" />}
          </Field>
          <Button type="submit" block disabled={busy || !pasted.trim()}>
            {busy ? "Lendo…" : "Ler código"}
          </Button>
        </form>
      )}

      {method === "qr" && <QrScanner onScan={fromPayload} active={!review && !busy} />}

      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-[13px] text-muted-foreground">{NIGHT_LIMIT_HINT}</p>
      <ReviewSheet review={review} onClose={() => setReview(null)} onDone={done} />
    </section>
  );
}

/** Pagamento de contas (boletos de concessionárias, tributos e bancários) pela linha digitável. */
export function BillPanel({ onPaid }: { onPaid: () => void }) {
  const [line, setLine] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useConfirmToast();

  async function prepare(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const digits = line.replace(/\D/g, "");
    if (digits.length !== 47 && digits.length !== 48) return setError("A linha digitável tem 47 (boletos) ou 48 números (contas de consumo e tributos).");
    setBusy(true);
    const { ok, json } = await post({ action: "prepare_bill", identificationField: digits });
    setBusy(false);
    if (!ok) return setError(errorOf(json, "Não foi possível ler esta conta."));
    setReview({ prepared: json.prepared as Prepared, confirmation: json.confirmation as Confirmation });
  }

  return (
    <section aria-label="Pagar contas" className="space-y-6 lg:max-w-2xl pb-36 lg:pb-8">
      <form onSubmit={(e) => void prepare(e)} className="space-y-5">
        <Field label="Linha digitável" hint="Copie do boleto ou da conta. Pontos e espaços são ignorados.">
          {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={line} inputMode="numeric" onChange={(e) => setLine(e.target.value)} className="font-mono text-sm" spellCheck={false} />}
        </Field>
        <Button type="submit" block disabled={busy || !line.trim()}>
          {busy ? "Consultando…" : "Revisar pagamento"}
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      <ReviewSheet
        review={review}
        onClose={() => setReview(null)}
        onDone={(prepared) => {
          setReview(null);
          setLine("");
          showToast("success", `Pagamento de ${formatBRL(prepared.amount)} enviado. Você recebe o aviso quando for compensado.`);
          onPaid();
        }}
      />
    </section>
  );
}
