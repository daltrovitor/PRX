// Hello World
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import type { User } from "@/hooks/use-auth";
import { DashboardBackdrop, DashboardHeader } from "@/components/app/dashboard-header";
import { PwaInstallPrompt } from "@/components/app/pwa-install-prompt";
import { PasswordChecklist } from "@/components/auth/password-checklist";
import { PASSWORD_HINT, PASSWORD_MISMATCH, passwordProblem } from "@/lib/password-policy";
import { CircleLoader } from "@/components/ui/circle-loader";
import { Avatar, BalanceFigure, Button, EmptyState, Field, IconButton, Input, Notice, Segmented, Select, Sheet, Tag, formatBRL } from "@/components/app/ui";
import { StatCell, TransactionRow } from "@/components/app/shared";
import { IconLogout } from "@/components/icons/prx-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { useThemeScope } from "@/components/theme-provider";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { SmoothScroll } from "@/components/app/smooth-scroll";
import { postJson } from "@/components/family/family-client";
import { maskCpfInput } from "@/lib/cpf-mask";
import { EMPTY_CONSENT, GuardianConsentFields, consentProblem, type GuardianConsentValue } from "@/components/family/guardian-consent";
import { FAMILY_STATUS_LABEL, FREQUENCY_LABEL, WEEKDAY_LABEL, type AllowanceFrequency } from "@/lib/family/types";
import type { ChildDetail, ChildSummary, FamilyOverview } from "@/lib/family/service";
import { cn } from "@/lib/utils";

const when = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long" });
const fmt = (iso: string | null) => (iso ? when.format(new Date(iso)).replace(".", "") : "—");

type ChildTab = "resumo" | "extrato" | "beneficios" | "eventos" | "projetos";
type SheetKind = "pix" | "mesada" | "limites" | "novo" | null;
type PendingLink = FamilyOverview["pendingLinks"][number];

/**
 * Conta Pai: controle, segurança e mesada. O responsável acompanha cada filho
 * (saldo, extrato, benefícios, nível, XP, PRX Coins, eventos, ingressos e
 * projetos), envia Pix, programa a mesada e define limites. A Conta Pai não
 * tem saldo próprio e não rende.
 */
export function ParentShell({ user, onLogout }: { user: User; onLogout: () => void }) {
  useThemeScope("app");
  const { showToast } = useConfirmToast();
  const [overview, setOverview] = useState<FamilyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChildDetail | null>(null);
  const [tab, setTab] = useState<ChildTab>("resumo");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [approving, setApproving] = useState<PendingLink | null>(null);
  const first = (user.name || "").trim().split(/\s+/)[0] || "responsável";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/family", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { overview?: FamilyOverview; error?: string };
      if (!res.ok || !json.overview) throw new Error(json.error || "Não foi possível carregar a família.");
      setOverview(json.overview);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }, []);

  const loadChild = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/family/children/${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { child?: ChildDetail; error?: string };
      if (!res.ok || !json.child) throw new Error(json.error || "Não foi possível carregar os dados do filho.");
      setDetail(json.child);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }, [showToast]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const children = overview?.children ?? [];
  const current = selected ?? children[0]?.id ?? null;

  useEffect(() => {
    if (!current) return;
    let alive = true;
    void (async () => {
      if (alive) await loadChild(current);
    })();
    return () => {
      alive = false;
    };
  }, [current, loadChild]);

  const refresh = async () => {
    await load();
    if (current) await loadChild(current);
  };

  const status = overview?.identity.status;
  const approved = status === "active";
  const child = detail && detail.id === current ? detail : null;

  async function reject(linkId: string) {
    const result = await postJson(`/api/family/links/${encodeURIComponent(linkId)}`, { decision: "reject" });
    if (!result.ok) return showToast("error", result.error);
    showToast("success", "Pedido recusado.");
    await refresh();
  }

  return (
    <SmoothScroll>
      <div className="prx-app relative isolate min-h-dvh overflow-x-clip bg-background text-foreground">
        <div aria-hidden className="prx-ambient" />
        <DashboardBackdrop />
        <PwaInstallPrompt />
        <DashboardHeader
          name={user.name || "Responsável"}
          subtitle="Controle, segurança e mesada"
          area="Conta Pai"
          actions={
            <>
              <ThemeToggle variant="app" />
              <IconButton label="Sair da Conta Pai" onClick={onLogout}>
                <IconLogout size={18} />
              </IconButton>
            </>
          }
        />

        <main id="conteudo" className="relative z-10 mx-auto w-full max-w-[1096px] space-y-8 px-4 pb-16 pt-6 sm:px-6 lg:pt-10">
          <section className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex items-center gap-4">
              <Avatar name={user.name || "Responsável"} src={user.avatarUrl} size={56} className="hidden ring-1 ring-black/10 dark:ring-white/[0.18] sm:inline-flex" />
              <div>
                <p className="ob-label text-[12px] text-muted-foreground">Oi, {first}</p>
                <h1 className="ob-display mt-2.5 text-[28px] text-ink sm:text-[40px]">Conta Pai</h1>
                <p className="mt-2 text-[14px] text-muted-foreground">Controle, segurança e mesada dos seus filhos.</p>
              </div>
            </div>
            <Button onClick={() => setSheet("novo")} disabled={!approved}>
              Adicionar filho
            </Button>
          </section>

          {error && <Notice tone="error">{error}</Notice>}

          {overview && !approved && (
            <Notice tone={status === "rejected" ? "warning" : "neutral"}>
              {status === "rejected" ? (
                <>
                  Seu cadastro não foi aprovado{overview.application?.reviewNote ? `: ${overview.application.reviewNote}` : "."}{" "}
                  <a href="/sou-pai" className="font-semibold underline underline-offset-2">
                    Enviar de novo
                  </a>
                </>
              ) : overview.application ? (
                "Cadastro em análise. Liberamos Pix, mesada e limites assim que a equipe PRX conferir seus documentos (até 2 dias úteis)."
              ) : (
                <>
                  Falta concluir seu cadastro.{" "}
                  <a href="/sou-pai" className="font-semibold underline underline-offset-2">
                    Enviar documentos
                  </a>
                </>
              )}
            </Notice>
          )}

          {overview && overview.pendingLinks.length > 0 && (
            <section aria-labelledby="links-title" className="space-y-3">
              <h2 id="links-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
                Pedidos de vínculo
              </h2>
              <ul className="space-y-2">
                {overview.pendingLinks.map((link) => (
                  <li key={link.id} className="glass-soft flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[15px] text-ink">
                      <strong className="font-semibold">{link.childName || "Seu filho"}</strong> pediu para vincular a Conta Filho a você.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setApproving(link)} disabled={!approved}>
                        Aceitar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void reject(link.id)} disabled={!approved}>
                        Recusar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {overview === null ? (
            <div role="status" aria-label="Carregando" className="h-48 rounded-3xl bg-surface" />
          ) : children.length === 0 ? (
            <EmptyState
              title="Nenhum filho vinculado ainda"
              body={
                approved
                  ? "Crie o acesso do seu filho (obrigatório para menores de 16) ou aceite o pedido que ele enviar com o seu e-mail."
                  : "Assim que o cadastro for aprovado, você cria o acesso do seu filho por aqui."
              }
            />
          ) : (
            <>
              <section aria-label="Filhos" className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
                {children.map((c) => (
                  <ChildCard key={c.id} child={c} active={c.id === current} onSelect={() => setSelected(c.id)} />
                ))}
              </section>

              {child ? (
                <ChildPanel child={child} tab={tab} onTab={setTab} approved={approved} onAction={setSheet} />
              ) : (
                <div role="status" aria-label="Carregando" className="h-64 rounded-3xl bg-surface" />
              )}
            </>
          )}

          <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
            A Conta Pai não guarda dinheiro nem rende. O dinheiro sai do seu banco e vai direto para a conta do seu filho.
          </p>
        </main>

        {child && sheet === "pix" && <PixSheet child={child} onClose={() => setSheet(null)} onDone={refresh} />}
        {child && sheet === "mesada" && <AllowanceSheet child={child} onClose={() => setSheet(null)} onDone={refresh} />}
        {child && sheet === "limites" && <LimitsSheet child={child} onClose={() => setSheet(null)} onDone={refresh} />}
        {approving && (
          <ApproveLinkSheet
            link={approving}
            onClose={() => setApproving(null)}
            onDone={async () => {
              setSelected(approving.childUserId);
              await refresh();
            }}
          />
        )}
        {sheet === "novo" && (
          <NewChildSheet
            onClose={() => setSheet(null)}
            onDone={async (id) => {
              setSelected(id);
              await refresh();
            }}
          />
        )}
      </div>
    </SmoothScroll>
  );
}

function ChildCard({ child, active, onSelect }: { child: ChildSummary; active: boolean; onSelect: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      aria-pressed={active}
      className={cn(
        "flex w-[78%] shrink-0 snap-start cursor-pointer flex-col justify-between gap-6 rounded-[28px] p-5 text-left sm:w-auto",
        active ? "prx-holo" : "glass glass-lift"
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className={cn("block truncate text-[17px] font-semibold", active ? "text-white" : "text-ink")}>{child.name}</span>
          <span className={cn("block text-[13px]", active ? "text-white/80" : "text-muted-foreground")}>
            {child.age} anos · Nível {child.level.toLocaleString("pt-BR")}
          </span>
        </span>
        {child.status !== "active" && <Tag tone="warning">{FAMILY_STATUS_LABEL[child.status]}</Tag>}
      </span>
      <span>
        <span className={cn("block text-[12px] font-semibold uppercase tracking-[0.08em]", active ? "text-white/80" : "text-muted-foreground")}>Saldo</span>
        <span className={cn("mt-1 block text-[30px] font-normal leading-none tracking-[-0.035em] tabular-nums", active ? "text-white" : "text-ink")}>{formatBRL(child.balance)}</span>
        <span className={cn("mt-2 block text-[13px]", active ? "text-white/85" : "text-muted-foreground")}>
          {child.coins.toLocaleString("pt-BR")} PRX Coins · {child.xp.toLocaleString("pt-BR")} XP
        </span>
      </span>
    </motion.button>
  );
}

function ChildPanel({ child, tab, onTab, approved, onAction }: { child: ChildDetail; tab: ChildTab; onTab: (t: ChildTab) => void; approved: boolean; onAction: (s: SheetKind) => void }) {
  const [isTabChanging, setIsTabChanging] = useState(false);

  const handleTabChange = (t: ChildTab) => {
    if (t === tab) return;
    setIsTabChanging(true);
    onTab(t);
    setTimeout(() => setIsTabChanging(false), 200);
  };

  return (
    <section aria-labelledby="child-title" className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="child-title" className="ob-display text-[22px] text-ink sm:text-[26px]">
            {child.name}
          </h2>
          <p className="text-[14px] text-muted-foreground">{child.bankStatus === "blocked" ? "Conta PRX Bank bloqueada" : "Conta PRX Bank ativa"}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <Button onClick={() => onAction("pix")} disabled={!approved} className="px-4">
            Enviar Pix
          </Button>
          <Button variant="secondary" onClick={() => onAction("mesada")} disabled={!approved} className="px-4">
            Mesada
          </Button>
          <Button variant="secondary" onClick={() => onAction("limites")} disabled={!approved} className="px-4">
            Limites
          </Button>
        </div>
      </div>

      <Segmented
        label="Acompanhar"
        value={tab}
        onChange={handleTabChange}
        options={[
          { value: "resumo", label: "Resumo" },
          { value: "extrato", label: "Extrato", count: child.transactions.length },
          { value: "beneficios", label: "Benefícios", count: child.vouchers.length },
          { value: "eventos", label: "Eventos", count: child.tickets.length },
          { value: "projetos", label: "Projetos", count: child.projects.length },
        ]}
      />

      {isTabChanging ? (
        <CircleLoader minHeight={320} label="Carregando janela..." />
      ) : (
        <>
          {tab === "resumo" && (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="glass rounded-3xl p-5 sm:p-6 lg:col-span-7">
            <BalanceFigure label="Saldo do filho" value={child.balance} />
            <dl className="mt-6 grid grid-cols-3 gap-2">
              <Mini label="PRX Coins" value={child.coins.toLocaleString("pt-BR")} />
              <Mini label="Nível" value={child.level.toLocaleString("pt-BR")} />
              <Mini label="XP" value={child.xp.toLocaleString("pt-BR")} />
            </dl>
          </div>
          <div className="grid gap-4 lg:col-span-5">
            <StatCell label="Mesada" value={child.allowance?.active ? formatBRL(child.allowance.amount) : "Sem mesada"}>
              <p className="text-[13px] text-muted-foreground">
                {child.allowance?.active
                  ? `${FREQUENCY_LABEL[child.allowance.frequency]} · próxima ${day.format(new Date(child.allowance.nextRunAt))}`
                  : "Programe um valor semanal ou mensal."}
              </p>
            </StatCell>
            <StatCell label="Limites do cartão e Pix" value={formatBRL(child.limits.daily)}>
              <p className="text-[13px] text-muted-foreground">
                por dia · {formatBRL(child.limits.perTransaction)} por compra · {formatBRL(child.limits.monthly)} por mês
              </p>
            </StatCell>
          </div>
          <div className="lg:col-span-12">
            <h3 className="text-[15px] font-semibold text-ink">Últimas movimentações</h3>
            {child.transactions.length === 0 ? (
              <p className="mt-2 text-[14px] text-muted-foreground">Nenhuma movimentação ainda.</p>
            ) : (
              <ul className="mt-1">
                {child.transactions.slice(0, 5).map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "extrato" &&
        (child.transactions.length === 0 ? (
          <EmptyState title="Extrato vazio" body="Pix, compras, mesada e cashbacks do seu filho aparecem aqui." />
        ) : (
          <ul className="glass rounded-3xl px-4 sm:px-5">
            {child.transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </ul>
        ))}

      {tab === "beneficios" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ListCard title="Benefícios resgatados" empty="Nenhum benefício resgatado ainda.">
            {child.vouchers.map((v) => (
              <Row key={v.id} title={`${v.partnerName} · ${v.discountLabel}`} meta={v.benefitTitle} tag={v.status === "used" ? "Usado" : v.status === "valid" ? "Válido" : "Expirado"} />
            ))}
          </ListCard>
          <ListCard title="PRX Coins e XP" empty="Nada por aqui ainda.">
            {child.points.map((p) => (
              <Row
                key={p.id}
                title={p.description || "Movimentação de pontos"}
                meta={fmt(p.createdAt)}
                tag={`${p.coinsDelta >= 0 ? "+" : "−"}${Math.abs(p.coinsDelta).toLocaleString("pt-BR")} coins${p.xpDelta > 0 ? ` · +${p.xpDelta} XP` : ""}`}
              />
            ))}
          </ListCard>
        </div>
      )}

      {tab === "eventos" && (
        <ListCard title="Eventos e ingressos" empty="Nenhum ingresso ainda.">
          {child.tickets.map((t) => (
            <Row key={t.id} title={t.eventTitle} meta={fmt(t.startsAt)} tag={t.status === "valid" ? "Válido" : t.status === "used" ? "Usado" : t.status === "pending_payment" ? "Aguardando pagamento" : "Cancelado"} />
          ))}
        </ListCard>
      )}

      {tab === "projetos" && (
        <ListCard title="Projetos de startup (PRX Founders)" empty="Nenhum projeto enviado ainda.">
          {child.projects.map((p) => (
            <Row key={p.id} title={p.title} meta={fmt(p.createdAt)} tag={p.status} />
          ))}
        </ListCard>
      )}
        </>
      )}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface p-3">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-[20px] font-normal leading-none tracking-[-0.03em] text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function ListCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="glass rounded-3xl p-5">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children.length === 0 ? <p className="mt-2 text-[14px] text-muted-foreground">{empty}</p> : <ul className="mt-2 divide-y divide-line">{children}</ul>}
    </section>
  );
}

function Row({ title, meta, tag }: { title: string; meta: string; tag: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-ink">{title}</p>
        <p className="truncate text-[13px] text-muted-foreground">{meta}</p>
      </div>
      <Tag>{tag}</Tag>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Ações                                                                      */
/* -------------------------------------------------------------------------- */

function useSubmit(onDone: () => Promise<void> | void, onClose: () => void, success: string) {
  const { showToast } = useConfirmToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(url: string, payload: unknown, method = "POST") {
    setBusy(true);
    setError(null);
    const result = await postJson(url, payload, method);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    showToast("success", success);
    onClose();
    await onDone();
  }
  return { busy, error, run, setError };
}

function PixSheet({ child, onClose, onDone }: { child: ChildDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, run } = useSubmit(onDone, onClose, `Pix enviado para ${child.name.split(" ")[0]}.`);
  return (
    <Sheet open onClose={onClose} title={`Pix para ${child.name.split(" ")[0]}`} description="Sai do seu banco e cai na hora na conta do seu filho.">
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void run(`/api/family/children/${encodeURIComponent(child.id)}/pix`, { amount: Number(amount.replace(",", ".")), note });
        }}
      >
        <Field label="Valor (R$)">{(id) => <Input id={id} inputMode="decimal" placeholder="50,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />}</Field>
        <Field label="Mensagem (opcional)">{(id) => <Input id={id} maxLength={60} placeholder="Lanche da semana" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" block disabled={busy || !(Number(amount.replace(",", ".")) > 0)}>
          {busy ? "Enviando…" : "Enviar Pix"}
        </Button>
      </form>
    </Sheet>
  );
}

function AllowanceSheet({ child, onClose, onDone }: { child: ChildDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const a = child.allowance;
  const [amount, setAmount] = useState(a ? String(a.amount).replace(".", ",") : "");
  const [frequency, setFrequency] = useState<AllowanceFrequency>(a?.frequency ?? "weekly");
  const [weekday, setWeekday] = useState(String(a?.weekday ?? 5));
  const [monthDay, setMonthDay] = useState(String(a?.monthDay ?? 5));
  const { busy, error, run } = useSubmit(onDone, onClose, "Mesada programada.");
  const cancel = useSubmit(onDone, onClose, "Mesada cancelada.");
  const url = `/api/family/children/${encodeURIComponent(child.id)}/allowance`;
  return (
    <Sheet open onClose={onClose} title="Mesada automática" description="Cai às 9h (Brasília) no dia escolhido, direto na conta do seu filho.">
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void run(url, { amount: Number(amount.replace(",", ".")), frequency, weekday: Number(weekday), monthDay: Number(monthDay), active: true }, "PUT");
        }}
      >
        <Segmented
          equal
          label="Frequência"
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: "weekly", label: "Semanal" },
            { value: "monthly", label: "Mensal" },
          ]}
        />
        <Field label="Valor (R$)">{(id) => <Input id={id} inputMode="decimal" placeholder="50,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />}</Field>
        {frequency === "weekly" ? (
          <Field label="Dia da semana">
            {(id) => (
              <Select id={id} value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                {WEEKDAY_LABEL.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <Field label="Dia do mês" hint="Até o dia 28, para cair em todos os meses.">
            {(id, hint) => (
              <Select id={id} aria-describedby={hint} value={monthDay} onChange={(e) => setMonthDay(e.target.value)}>
                {Array.from({ length: 28 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Dia {i + 1}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {(error || cancel.error) && <Notice tone="error">{error || cancel.error}</Notice>}
        <Button type="submit" block disabled={busy || !(Number(amount.replace(",", ".")) > 0)}>
          {busy ? "Salvando…" : a ? "Atualizar mesada" : "Programar mesada"}
        </Button>
        {a && (
          <Button type="button" variant="danger" block disabled={cancel.busy} onClick={() => void cancel.run(url, undefined, "DELETE")}>
            {cancel.busy ? "Cancelando…" : "Cancelar mesada"}
          </Button>
        )}
      </form>
    </Sheet>
  );
}

function LimitsSheet({ child, onClose, onDone }: { child: ChildDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const [perTransaction, setPerTransaction] = useState(String(child.limits.perTransaction));
  const [daily, setDaily] = useState(String(child.limits.daily));
  const [monthly, setMonthly] = useState(String(child.limits.monthly));
  const { busy, error, run } = useSubmit(onDone, onClose, "Limites atualizados.");
  const n = (v: string) => Number(v.replace(",", ".")) || 0;
  return (
    <Sheet open onClose={onClose} title="Limites de gasto" description="Valem para o cartão e para o Pix do seu filho. Acima disso, a PRX bloqueia.">
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void run(`/api/family/children/${encodeURIComponent(child.id)}/limits`, { perTransaction: n(perTransaction), daily: n(daily), monthly: n(monthly) }, "PUT");
        }}
      >
        <Field label="Por compra (R$)">{(id) => <Input id={id} inputMode="decimal" value={perTransaction} onChange={(e) => setPerTransaction(e.target.value)} required />}</Field>
        <Field label="Por dia (R$)">{(id) => <Input id={id} inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} required />}</Field>
        <Field label="Por mês (R$)">{(id) => <Input id={id} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} required />}</Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" block disabled={busy}>
          {busy ? "Salvando…" : "Salvar limites"}
        </Button>
      </form>
    </Sheet>
  );
}

function NewChildSheet({ onClose, onDone }: { onClose: () => void; onDone: (childId: string) => Promise<void> }) {
  const { showToast } = useConfirmToast();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", cpf: "", birthDate: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consent, setConsent] = useState<GuardianConsentValue>(EMPTY_CONSENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const weak = passwordProblem(form.password);
    if (weak) return setError(weak);
    if (form.password !== confirmPassword) return setError(PASSWORD_MISMATCH);
    const problem = consentProblem(consent);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const result = await postJson<{ child?: { id: string } }>("/api/family/children", { ...form, ...consent });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    showToast("success", "Conta do seu filho criada. Ele já pode entrar com o e-mail e a senha.");
    onClose();
    if (result.data.child?.id) await onDone(result.data.child.id);
  }

  return (
    <Sheet open onClose={onClose} title="Adicionar filho" description="Crie o acesso dele à PRX. A conta já nasce vinculada a você, com limites iniciais." size="lg">
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Field label="Nome completo">{(id) => <Input id={id} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CPF do filho">{(id) => <Input id={id} inputMode="numeric" placeholder="000.000.000-00" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpfInput(e.target.value) })} required />}</Field>
          <Field label="Data de nascimento" hint="Contas PRX são para quem tem 12 anos ou mais.">
            {(id, hint) => <Input id={id} aria-describedby={hint} type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} required className="cursor-pointer" />}
          </Field>
        </div>
        <Field label="E-mail de acesso dele">{(id) => <Input id={id} type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />}</Field>
        <Field label="Senha inicial" hint={`${PASSWORD_HINT} Combine com seu filho.`}>
          {(id, hint) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={hint} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />}
        </Field>
        <Field label="Confirmar senha">
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />}
        </Field>
        <PasswordChecklist password={form.password} confirm={confirmPassword} className="text-muted-foreground" />
        <GuardianConsentFields
          value={consent}
          onChange={(next) => {
            setConsent(next);
            setError(null);
          }}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" block disabled={busy}>
          {busy ? "Criando…" : "Criar conta do filho"}
        </Button>
      </form>
    </Sheet>
  );
}

/** Aceitar o pedido de vínculo de um menor = parentesco + tutela declarada + consentimento parental (LGPD, Art. 14). */
function ApproveLinkSheet({ link, onClose, onDone }: { link: PendingLink; onClose: () => void; onDone: () => Promise<void> }) {
  const { showToast } = useConfirmToast();
  const [consent, setConsent] = useState<GuardianConsentValue>(EMPTY_CONSENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = consentProblem(consent);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const result = await postJson(`/api/family/links/${encodeURIComponent(link.id)}`, { decision: "approve", ...consent });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    showToast("success", "Conta vinculada. Agora você acompanha e define os limites.");
    onClose();
    await onDone();
  }

  return (
    <Sheet open onClose={onClose} title={`Vincular ${link.childName || "seu filho"}`} description="Confirme a responsabilidade legal para acompanhar a conta e liberar Pix e cartão." size="lg">
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <GuardianConsentFields
          value={consent}
          onChange={(next) => {
            setConsent(next);
            setError(null);
          }}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" block disabled={busy}>
          {busy ? "Vinculando…" : "Aceitar e vincular"}
        </Button>
      </form>
    </Sheet>
  );
}
