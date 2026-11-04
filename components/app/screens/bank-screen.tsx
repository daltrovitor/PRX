// Hello World
"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import type { User } from "@/hooks/use-auth";
import { useAppNav } from "@/components/app/app-nav";
import { useBankAccount, useHiddenBalance, usePointsWallet, type ActionResult, type PartnerReward } from "@/components/app/use-prx-stores";
import { PrxMap } from "@/components/app/bank/prx-map";
import { BankKycPanel } from "@/components/app/bank/bank-kyc";
import { ActivationPanel } from "@/components/app/bank/activation-panel";
import { BillPanel, ProviderPixPanel } from "@/components/app/bank/outgoing";
import { ProviderStatement } from "@/components/app/bank/provider-statement";
import { NIGHT_LIMIT_HINT } from "@/components/app/bank/provider-disclosure";
import { WalletTriad } from "@/components/app/points/wallet-triad";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { TransactionRow } from "@/components/app/shared";
import { CardVisual } from "@/components/app/bank/card-visual";
import { QrScanner } from "@/components/app/qr-scanner";
import { CopyButton, useQrDataUrl } from "@/components/app/pass/voucher-sheet";
import { BalanceFigure, Button, EmptyState, Field, IconButton, Input, Notice, Segmented, Select, Sheet, Tag, Textarea, formatBRL } from "@/components/app/ui";
import { IconEye, IconEyeOff, IconTrash } from "@/components/icons/prx-icons";
import {
  ACCOUNT_STATUS_LABEL,
  MAX_PIX_KEYS,
  PIX_KEY_STATUS_LABEL,
  filterTransactions,
  summarize,
  type BankAccountView,
  type StatementFilter,
  type StatementPeriod,
} from "@/lib/prx/bank";
import { PIX_KEY_LABEL, detectPixKeyType, parsePixPayload, type PixKeyType } from "@/lib/prx/pix";
import { cn } from "@/lib/utils";

type BankSection = "extrato" | "pix" | "cobrar" | "contas" | "mapa" | "cartoes" | "chaves";
/** PRX Map fica entre Cobrar e Cartões. */
const SECTIONS: ReadonlyArray<BankSection> = ["extrato", "pix", "cobrar", "contas", "mapa", "cartoes", "chaves"];

type Run = (body: { action: string } & Record<string, unknown>) => Promise<ActionResult & { reward?: PartnerReward | null }>;

interface PartnerPreview {
  partnerName: string;
  categoryName: string;
  verticalCode: string;
  coins: number;
  xp: number;
}

/** Pergunta ao servidor se a chave é de um parceiro PRX (e quanto o Pix rende em coins e XP). */
async function lookupPartner(key: string, recipientName: string | null, amount: number): Promise<PartnerPreview | null> {
  try {
    const res = await fetch("/api/bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "lookup_partner", key, recipientName, amount }),
    });
    const json = (await res.json().catch(() => ({}))) as { partner?: PartnerPreview | null };
    return res.ok ? json.partner ?? null : null;
  } catch {
    return null;
  }
}

/** Converte "1.234,56" ou "1234.56" em número. */
function parseMoney(text: string): number {
  const cleaned = text.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function BankScreen({ member }: { member: User }) {
  const { sub, go } = useAppNav();
  // #bank/pagar (atalho "Pagar" da Início) abre o Pix já no Copia e Cola.
  const paying = sub === "pagar";
  const section: BankSection = paying ? "pix" : SECTIONS.includes(sub as BankSection) ? (sub as BankSection) : "extrato";
  const { account, loading, error, reload, run } = useBankAccount(member.id);
  const { wallet } = usePointsWallet(member.id);
  const [hidden, toggleHidden] = useHiddenBalance();

  if (!account) {
    return (
      <div className="space-y-8">
        <h1 className="ob-display text-[28px] text-ink sm:text-[40px]">PRX BANK</h1>
        {loading ? (
          <div role="status" aria-label="Carregando conta" className="h-40 rounded-3xl bg-surface" />
        ) : (
          <EmptyState title="Não foi possível abrir sua conta" body={error ?? undefined} action={<Button onClick={() => void reload()}>Tentar de novo</Button>} />
        )}
      </div>
    );
  }

  // Primeira visita ao PRX BANK: abertura de conta (KYC), ou a abertura salva aguardando. O resto da PRX nunca pede documentos.
  if (account.activation === "form" || account.activation === "waiting") return <BankKycPanel member={member} kyc={account.kyc} onDone={reload} />;

  const active = account.status === "active";
  // Conta aprovada no banco parceiro: Pix e contas saem pelo banco parceiro, com confirmação.
  const viaProvider = account.provider?.state === "active";

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="ob-display text-[28px] text-ink sm:text-[40px]">PRX BANK</h1>
          <Tag tone={active ? "success" : account.status === "blocked" ? "warning" : "neutral"}>Conta {ACCOUNT_STATUS_LABEL[account.status].toLowerCase()}</Tag>
          {account.sandbox && <Tag tone="neutral">Modo Sandbox · Testes</Tag>}
        </div>
        {account.status === "blocked" && <Notice tone="warning">Conta bloqueada. Fale com o suporte PRX para entender o motivo.</Notice>}
      </header>

      {account.status === "pending_activation" && <ActivationPanel account={account} member={member} onChanged={reload} />}

      <section aria-label="Carteira Central" className="grid gap-6 md:grid-cols-12 md:items-end">
        <BalanceFigure
          className="md:col-span-7"
          label="Saldo disponível"
          value={account.balance}
          hidden={hidden}
          action={
            <IconButton tone="plain" label={hidden ? "Mostrar saldo" : "Ocultar saldo"} aria-pressed={hidden} onClick={toggleHidden} className="-mr-2 h-12 w-12">
              {hidden ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </IconButton>
          }
        />
        <WalletTriad
          compact
          className="md:col-span-5"
          balance={account.balance}
          balanceLabel="Saldo disponível"
          coins={wallet?.coins ?? null}
          xp={wallet?.xp ?? member.prxScore ?? 0}
          hidden={hidden}
          onToggleHidden={toggleHidden}
          onOpenPoints={() => go("home", "pontos")}
          onOpenLevel={() => go("pass", "missions")}
        />
      </section>

      <Segmented
        label="Seções do PRX BANK"
        value={section}
        onChange={(value) => go("bank", value === "extrato" ? null : value)}
        options={[
          { value: "extrato", label: "Extrato" },
          { value: "pix", label: "Pix" },
          { value: "cobrar", label: "Cobrar" },
          ...(viaProvider ? [{ value: "contas" as const, label: "Pagar contas" }] : []),
          { value: "mapa", label: "PRX Map" },
          { value: "cartoes", label: "Cartões" },
          { value: "chaves", label: "Chaves Pix", count: account.pixKeys.length },
        ]}
      />

      {section === "extrato" && <StatementPanel account={account} hidden={hidden} />}
      {section === "extrato" && viaProvider && <ProviderStatement hidden={hidden} />}
      {section === "pix" &&
        (viaProvider ? (
          <ProviderPixPanel key={paying ? "pagar" : "pix"} balance={account.balance} initialMethod={paying ? "copia" : "chave"} onSent={() => void reload()} />
        ) : (
          <PixPanel key={paying ? "pagar" : "pix"} account={account} run={run} initialMethod={paying ? "copia" : "chave"} />
        ))}
      {section === "contas" && <BillPanel onPaid={() => void reload()} />}
      {section === "cobrar" && <ChargePanel account={account} run={run} />}
      {section === "mapa" && <PrxMap transactions={account.transactions} hidden={hidden} />}
      {section === "cartoes" && <CardsPanel holder={member.name || "Membro PRX"} />}
      {section === "chaves" && <KeysPanel account={account} run={run} />}
    </div>
  );
}

function StatementPanel({ account, hidden }: { account: BankAccountView; hidden: boolean }) {
  const [period, setPeriod] = useState<StatementPeriod>(30);
  const [filter, setFilter] = useState<StatementFilter>("all");
  const list = useMemo(() => filterTransactions(account.transactions, period, filter), [account.transactions, period, filter]);
  const totals = summarize(list);

  return (
    <section aria-label="Extrato" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Período" className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none touch-pan-x sm:mx-0 sm:px-0">
          {([7, 30, 90] as const).map((p) => (
            <FilterChip key={p} active={period === p} onClick={() => setPeriod(p)}>
              {p} dias
            </FilterChip>
          ))}
        </div>
        <div role="group" aria-label="Tipo de movimentação" className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none touch-pan-x sm:mx-0 sm:px-0">
          {(
            [
              ["all", "Tudo"],
              ["in", "Entradas"],
              ["out", "Saídas"],
            ] as const
          ).map(([value, label]) => (
            <FilterChip key={value} active={filter === value} onClick={() => setFilter(value)}>
              {label}
            </FilterChip>
          ))}
        </div>
      </div>

      <p className="text-[13px] text-muted-foreground">
        {list.length} {list.length === 1 ? "movimentação" : "movimentações"} · <span className="text-success">+{hidden ? "••••" : formatBRL(totals.income)}</span> ·{" "}
        <span className="text-ink">−{hidden ? "••••" : formatBRL(totals.outcome)}</span>
      </p>

      {list.length === 0 ? (
        <EmptyState
          title={account.transactions.length === 0 ? "Nenhuma movimentação ainda" : "Sem movimentações no período"}
          body={account.transactions.length === 0 ? "O extrato começa quando a conta for ativada e o primeiro Pix entrar." : "Mude o período ou o tipo para ver mais."}
        />
      ) : (
        <ul>
          {list.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} hidden={hidden} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-12 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
        active ? "bg-ink text-background" : "bg-surface text-muted-foreground hover:bg-line hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------------ */

type PixMethod = "chave" | "copia" | "qr";

interface PixDraft {
  key: string;
  recipient: string;
  /** Nome do recebedor vindo do QR/Copia e Cola, usado para reconhecer o parceiro. */
  recipientName: string | null;
  amount: number;
  description: string;
  fixedAmount: boolean;
}

/** Envio de Pix (conta ativa). A operação é sempre decidida no servidor, junto ao banco parceiro. */
function PixPanel({ account, run, initialMethod = "chave" }: { account: BankAccountView; run: Run; initialMethod?: PixMethod }) {
  const [method, setMethod] = useState<PixMethod>(initialMethod);
  const [key, setKey] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [pasted, setPasted] = useState("");
  const [draft, setDraft] = useState<PixDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [partner, setPartner] = useState<PartnerPreview | null>(null);
  const { showToast } = useConfirmToast();

  const keyType = detectPixKeyType(key);

  function review(next: PixDraft) {
    setDraft(next);
    setPartner(null);
    void lookupPartner(next.key, next.recipientName, next.amount).then(setPartner);
  }

  function reviewFromKey(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!keyType) return setError("Chave inválida. Use CPF, CNPJ, e-mail, celular com DDD ou chave aleatória.");
    const amount = parseMoney(amountText);
    if (!(amount > 0)) return setError("Informe o valor do Pix.");
    if (amount > account.balance) return setError("Saldo insuficiente para esta transferência.");
    review({ key: key.trim(), recipient: `${PIX_KEY_LABEL[keyType]} ${key.trim()}`, recipientName: null, amount, description, fixedAmount: false });
  }

  function reviewFromPayload(raw: string) {
    setError(null);
    const parsed = parsePixPayload(raw);
    if (!parsed) return setError("Esse código não é um Pix Copia e Cola válido.");
    if (!parsed.valid) return setError("O código Pix está incompleto ou foi alterado (falha na verificação). Peça um novo código.");
    review({ key: parsed.key, recipient: parsed.merchantName || parsed.key, recipientName: parsed.merchantName || null, amount: parsed.amount ?? 0, description: "", fixedAmount: Boolean(parsed.amount) });
  }

  async function confirm() {
    if (!draft) return;
    setBusy(true);
    const result = await run({ action: "send_pix", key: draft.key, amount: draft.amount, description: draft.description, recipientName: draft.recipientName });
    setBusy(false);
    setDraft(null);
    setPartner(null);
    if (!result.ok) return setError(result.error);
    if (result.reward) {
      showToast("success", `Você comprou em ${result.reward.partnerName} e ganhou +${result.reward.coins.toLocaleString("pt-BR")} PRX Coins e +${result.reward.xp.toLocaleString("pt-BR")} XP!`);
    } else {
      showToast("success", "Pix enviado.");
    }
    setKey("");
    setAmountText("");
    setDescription("");
    setPasted("");
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
        <form onSubmit={reviewFromKey} className="space-y-5">
          <Field label="Chave Pix" hint={keyType ? `Tipo identificado: ${PIX_KEY_LABEL[keyType]}` : "CPF, CNPJ, e-mail, celular ou chave aleatória."}>
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />}
          </Field>
          <Field label="Valor" hint={`Disponível: ${formatBRL(account.balance)}`}>
            {(id, describedBy) => (
              <Input id={id} aria-describedby={describedBy} inputMode="decimal" placeholder="0,00" value={amountText} onChange={(e) => setAmountText(e.target.value)} className="font-mono text-lg" />
            )}
          </Field>
          <Field label="Mensagem (opcional)">{(id) => <Input id={id} value={description} maxLength={60} onChange={(e) => setDescription(e.target.value)} />}</Field>
          <div className="pt-2 pb-4">
            <Button type="submit" block>
              Revisar Pix
            </Button>
          </div>
        </form>
      )}

      {method === "copia" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            reviewFromPayload(pasted);
          }}
          className="space-y-5"
        >
          <Field label="Código Pix Copia e Cola">
            {(id) => <Textarea id={id} value={pasted} onChange={(e) => setPasted(e.target.value)} className="font-mono text-sm" spellCheck={false} placeholder="00020126…" />}
          </Field>
          <div className="pt-2 pb-4">
            <Button type="submit" block disabled={!pasted.trim()}>
              Ler código
            </Button>
          </div>
        </form>
      )}

      {method === "qr" && <QrScanner onScan={reviewFromPayload} active={!draft} />}

      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-[13px] text-muted-foreground">{NIGHT_LIMIT_HINT}</p>

      <Sheet
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title="Confirmar Pix"
        footer={
          <Button block onClick={() => void confirm()} disabled={busy || !draft || !(draft.amount > 0)}>
            {busy ? "Enviando…" : `Enviar ${draft ? formatBRL(draft.amount) : ""}`}
          </Button>
        }
      >
        {draft && (
          <dl className="divide-y divide-line rounded-3xl bg-surface px-4 text-[15px]">
            <div className="flex justify-between gap-4 py-3.5">
              <dt className="text-muted-foreground">Para</dt>
              <dd className="text-right font-medium text-ink">{draft.recipient}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3.5">
              <dt className="text-muted-foreground">Chave</dt>
              <dd className="break-all text-right font-mono text-sm text-ink">{draft.key}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3.5">
              <dt className="text-muted-foreground">Valor</dt>
              <dd>
                {draft.fixedAmount || draft.amount > 0 ? (
                  <span className="text-2xl font-semibold tracking-[-0.02em] text-ink">{formatBRL(draft.amount)}</span>
                ) : (
                  <Input aria-label="Valor do Pix" inputMode="decimal" placeholder="0,00" className="w-36 text-right font-mono" onChange={(e) => setDraft({ ...draft, amount: parseMoney(e.target.value) })} />
                )}
              </dd>
            </div>
            {partner && (
              <div className="flex items-start justify-between gap-4 py-3.5">
                <dt className="text-muted-foreground">Parceiro PRX</dt>
                <dd className="text-right">
                  <span className="block font-medium text-ink">
                    {partner.partnerName} · {partner.categoryName}
                  </span>
                  {(partner.coins > 0 || partner.xp > 0) && (
                    <span className="mt-0.5 block text-[13px] font-medium text-primary">
                      +{partner.coins.toLocaleString("pt-BR")} PRX Coins · +{partner.xp.toLocaleString("pt-BR")} XP
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}
      </Sheet>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

/** Cobrança com QR Code (conta ativa): o código é gerado pelo banco parceiro. */
function ChargePanel({ account, run }: { account: BankAccountView; run: Run }) {
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = account.charges[0];
  // Banco parceiro gera QR Code dinâmico com valor definido.
  const valueRequired = Boolean(account.provider);
  const qr = useQrDataUrl(current && !current.paid ? current.payload : null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const amount = parseMoney(amountText);
    if (valueRequired && !(amount > 0)) return setError("Informe o valor da cobrança.");
    setBusy(true);
    const result = await run({ action: "create_charge", amount: amount > 0 ? amount : null, description });
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <section aria-label="Cobrar com Pix" className="grid gap-10 lg:grid-cols-12 pb-36 lg:pb-8">
      <form onSubmit={(e) => void create(e)} className="space-y-5 lg:col-span-5">
        <Field label={valueRequired ? "Valor" : "Valor (opcional)"} hint={valueRequired ? "Quanto você quer receber." : "Sem valor, quem paga escolhe quanto enviar."}>
          {(id, describedBy) => (
            <Input id={id} aria-describedby={describedBy} inputMode="decimal" placeholder="0,00" value={amountText} onChange={(e) => setAmountText(e.target.value)} className="font-mono text-lg" />
          )}
        </Field>
        <Field label="Descrição (opcional)">{(id) => <Input id={id} value={description} maxLength={40} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Button type="submit" block disabled={busy}>
          {busy ? "Gerando…" : "Gerar QR Code"}
        </Button>
        {error && <Notice tone="error">{error}</Notice>}
      </form>
      <div className="lg:col-span-7">
        {current ? (
          <div className="space-y-4 rounded-3xl glass p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <p className="text-3xl font-light tracking-[-0.03em] text-ink">{current.amount ? formatBRL(current.amount) : "Valor livre"}</p>
              {current.paid ? <Tag tone="success">Recebido</Tag> : <Tag>Aguardando</Tag>}
            </div>
            {qr && (
              <div className="w-full max-w-[240px] rounded-3xl bg-white p-4 ring-1 ring-line">
                <Image src={qr} alt="QR Code da cobrança Pix" width={240} height={240} unoptimized className="h-auto w-full" />
              </div>
            )}
            <p className="break-all font-mono text-[12px] leading-relaxed text-muted-foreground">{current.payload}</p>
            <CopyButton value={current.payload} label="Copiar código" />
          </div>
        ) : (
          <EmptyState title="Nenhuma cobrança criada" body="Preencha ao lado para gerar um QR Code de cobrança." />
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

/** Cartões PRX ainda não emitidos: a aba deixa claro que chegam em breve. */
function CardsPanel({ holder }: { holder: string }) {
  return (
    <section aria-label="Cartões" className="grid gap-12 lg:grid-cols-12 pb-36 lg:pb-8">
      <div className="space-y-6 lg:col-span-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Cartão virtual</h2>
          <Tag tone="accent">Em breve</Tag>
        </div>
        <CardVisual holder={holder} label="Virtual" />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          O cartão virtual PRX ainda não está funcionando. Ele chega em breve, sem anuidade, e avisamos aqui no app quando liberar. Enquanto isso, pague com Pix.
        </p>
      </div>

      <div className="space-y-6 lg:col-span-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Cartão físico</h2>
          <Tag tone="accent">Em breve</Tag>
        </div>
        <div className="space-y-2 rounded-3xl glass p-5 sm:p-6">
          <p className="text-[15px] text-ink">O cartão físico PRX ainda não está funcionando.</p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Ele chega em breve, sem anuidade. Quando liberar, você pede por aqui e recebe no seu endereço.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function KeysPanel({ account, run }: { account: BankAccountView; run: Run }) {
  const [type, setType] = useState<Exclude<PixKeyType, "cnpj">>("random");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = account.pixKeys.length >= MAX_PIX_KEYS;
  // Banco parceiro: pelo app, só a chave aleatória é registrada no Pix, e só com a conta aprovada.
  const viaProvider = account.provider !== null;
  const onlyRandom = viaProvider;
  const waitingApproval = viaProvider && account.provider?.state !== "active";

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const keyType = onlyRandom ? "random" : type;
    const result = await run({ action: "add_pix_key", key: { type: keyType, value: keyType === "random" ? "" : value } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setValue("");
  }

  async function remove(id: string, value: string) {
    if (viaProvider && !window.confirm(`Excluir a chave ${value}? Ela deixa de receber Pix.`)) return;
    setError(null);
    const result = await run({ action: "remove_pix_key", id });
    if (!result.ok) setError(result.error);
  }

  return (
    <section aria-label="Chaves Pix" className="grid gap-10 lg:grid-cols-12 pb-36 lg:pb-8">
      <form onSubmit={(e) => void add(e)} className="space-y-5 lg:col-span-5">
        {viaProvider && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            As chaves são registradas no Pix pelo PRX BANK, que pelo app só cria chave aleatória: até 5 por conta, com 1 minuto entre uma e outra.
            Chave de CPF, e-mail ou celular não pode ser criada pela integração.
          </p>
        )}
        {waitingApproval ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Sua primeira chave é criada assim que o PRX BANK aprovar sua conta. Avisamos aqui no app.
          </p>
        ) : (
          account.status === "pending_activation" && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Pré-cadastro: a chave fica reservada na sua conta e é registrada no Pix (DICT) quando o PRX BANK ativar a conta. Até lá ela ainda não recebe
              pagamentos.
            </p>
          )
        )}
        <Field label="Tipo de chave">
          {(id) => (
            <Select id={id} value={type} onChange={(e) => setType(e.target.value as Exclude<PixKeyType, "cnpj">)}>
              <option value="random">Chave aleatória</option>
              {!onlyRandom && (
                <>
                  <option value="cpf">CPF</option>
                  <option value="email">E-mail</option>
                  <option value="phone">Celular</option>
                </>
              )}
            </Select>
          )}
        </Field>
        {type !== "random" && !onlyRandom && (
          <Field label={PIX_KEY_LABEL[type]}>
            {(id) => (
              <Input
                id={id}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode={type === "email" ? "email" : "numeric"}
                autoComplete={type === "email" ? "email" : type === "phone" ? "tel" : "off"}
              />
            )}
          </Field>
        )}
        <Button type="submit" block disabled={busy || full || waitingApproval}>
          {full ? `Limite de ${MAX_PIX_KEYS} chaves` : busy ? "Cadastrando…" : "Cadastrar chave"}
        </Button>
        {error && <Notice tone="error">{error}</Notice>}
      </form>

      <div className="lg:col-span-7">
        {account.pixKeys.length === 0 ? (
          <EmptyState title="Nenhuma chave cadastrada" body="Com uma chave você recebe Pix e gera cobranças com QR Code." />
        ) : (
          <ul className="space-y-2">
            {account.pixKeys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 rounded-3xl glass-soft px-4 py-3 sm:gap-4">
                <div className="min-w-0 pr-2">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-[13px]">
                    {PIX_KEY_LABEL[k.type]} <Tag tone={k.status === "active" ? "success" : "neutral"}>{PIX_KEY_STATUS_LABEL[k.status]}</Tag>
                  </p>
                  <p className="mt-1 break-all font-mono text-sm text-ink sm:text-[15px]">{k.value}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <CopyButton value={k.value} />
                  {(viaProvider || k.status === "pending_activation") && (
                    <Button variant="ghost" size="sm" aria-label={`Excluir chave ${k.value}`} onClick={() => void remove(k.id, k.value)}>
                      <IconTrash size={16} />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
