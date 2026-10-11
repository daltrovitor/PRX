// Hello World
"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import confetti from "canvas-confetti";
import { QrScanner } from "@/components/app/qr-scanner";
import { Button, EmptyState, Field, Input, Notice, Segmented, Sheet, Tag } from "@/components/app/ui";
import { IconCheck, IconClose, IconRefresh } from "@/components/icons/prx-icons";
import type { HistoryEntry } from "@/lib/validation";
import type { DoorTicket } from "@/lib/validation/tickets";
import type { CounterVoucher } from "@/lib/validation/vouchers";
import { setSoundEnabled, signal, soundEnabled } from "@/components/validation/feedback";

const noopSubscribe = () => () => undefined;

/**
 * Validador universal da portaria e do balcão (parceiro e Equipe PRX).
 * O servidor decide pelo formato se é ingresso (check-in) ou voucher (baixa)
 * e se quem está logado pode validá-lo.
 */

type Result = (
  | { kind: "ticket"; ticket: DoorTicket; canConfirm: boolean; warning: string | null }
  | { kind: "voucher"; voucher: CounterVoucher; canConfirm: boolean; warning: string | null }
) & { message?: string | null };

interface ValidateResponse {
  success?: boolean;
  kind?: "ticket" | "voucher";
  canCheckin?: boolean;
  canRedeem?: boolean;
  warning?: string | null;
  error?: string;
  message?: string;
  ticket?: DoorTicket;
  voucher?: CounterVoucher;
}

function toResult(data: ValidateResponse): Result | null {
  if (data.kind === "ticket" && data.ticket) return { kind: "ticket", ticket: data.ticket, canConfirm: Boolean(data.canCheckin), warning: data.warning ?? null };
  if (data.kind === "voucher" && data.voucher) return { kind: "voucher", voucher: data.voucher, canConfirm: Boolean(data.canRedeem), warning: data.warning ?? null };
  return null;
}

async function post(code: string, action: "lookup" | "confirm", eventId: string | null): Promise<{ ok: boolean; data: ValidateResponse }> {
  try {
    const res = await fetch("/api/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, action, eventId: eventId || undefined }) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as ValidateResponse };
  } catch {
    return { ok: false, data: { error: "Sem conexão com o servidor." } };
  }
}

/** eventId: evento escolhido na portaria (ingresso de outro evento é recusado no servidor). */
export function useValidation(eventId: string | null = null) {
  const [result, setResult] = useState<Result | null>(null);
  // O QR dinâmico do PASS precisa ir inteiro na confirmação (a prova do momento está nele).
  const [scanned, setScanned] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [version, setVersion] = useState(0);
  const [scanKey, setScanKey] = useState(0);

  const lookup = useCallback(async (raw: string) => {
    if (!raw.trim()) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await post(raw, "lookup", eventId);
    setBusy(false);
    const next = toResult(data);
    if (!ok || !next) {
      signal("refused");
      setError(data.error || "Código não encontrado. Confira e tente de novo.");
      setScanKey((k) => k + 1);
      return;
    }
    if (!next.canConfirm) signal("refused");
    setScanned(raw);
    setConfirmed(false);
    setResult(next);
  }, [eventId]);

  const confirm = useCallback(async () => {
    if (!result) return;
    const code = result.kind === "ticket" ? result.ticket.code : scanned || result.voucher.code;
    setBusy(true);
    const { ok, data } = await post(code, "confirm", eventId);
    setBusy(false);
    const next = toResult(data);
    if (!ok || !data.success) {
      signal("refused");
      setResult((current) => (next ? { ...next, canConfirm: false, warning: data.error || "Não foi possível confirmar." } : current && { ...current, canConfirm: false, warning: data.error || "Não foi possível confirmar." }));
      return;
    }
    signal("ok");
    if (typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 }, colors: ["#6c0cf0", "#0b0b10", "#0f7b4f"] });
    }
    if (next) setResult({ ...next, canConfirm: false, warning: null, message: data.message ?? null });
    setConfirmed(true);
    setVersion((v) => v + 1);
  }, [result, scanned, eventId]);

  const close = useCallback(() => {
    setResult(null);
    setConfirmed(false);
    setScanKey((k) => k + 1);
  }, []);

  return { result, busy, error, setError, confirmed, version, scanKey, lookup, confirm, close };
}

export type Validation = ReturnType<typeof useValidation>;

/* -------------------------------------------------------------------------- */

type Mode = "scanner" | "manual";

async function fetchHistory(): Promise<HistoryEntry[] | null> {
  try {
    const res = await fetch("/api/validate", { cache: "no-store" });
    const data = (await res.json()) as { history?: HistoryEntry[] };
    return res.ok && Array.isArray(data.history) ? data.history : null;
  } catch {
    return null;
  }
}

export function ValidatorPanel({ validation, hint, header }: { validation: Validation; hint: string; header?: ReactNode }) {
  const [mode, setMode] = useState<Mode>("scanner");
  const [code, setCode] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const storedSound = useSyncExternalStore(noopSubscribe, soundEnabled, () => true);
  const [soundOverride, setSound] = useState<boolean | null>(null);
  const sound = soundOverride ?? storedSound;
  const { lookup, busy, error, setError, result, scanKey, version } = validation;

  const loadHistory = useCallback(async () => {
    const list = await fetchHistory();
    if (list) setHistory(list);
  }, []);

  useEffect(() => {
    let active = true;
    fetchHistory().then((list) => {
      if (active && list) setHistory(list);
    });
    return () => {
      active = false;
    };
  }, [version]);

  function submitManual(event: FormEvent) {
    event.preventDefault();
    void lookup(code);
  }

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <section aria-labelledby="validate-title" className="space-y-6 lg:col-span-7">
        <div>
          <h2 id="validate-title" className="ob-display text-[28px] text-ink sm:text-[40px]">
            Validar
          </h2>
          <p className="mt-3 text-[15px] text-muted-foreground">{hint}</p>
        </div>

        {header}

        <Segmented
          label="Forma de validação"
          value={mode}
          onChange={(value) => {
            setMode(value);
            setError(null);
          }}
          options={[
            { value: "scanner", label: "Câmera" },
            { value: "manual", label: "Código" },
          ]}
        />

        {mode === "scanner" ? (
          <QrScanner key={scanKey} onScan={(text) => void lookup(text)} active={!result && !busy} />
        ) : (
          <form onSubmit={submitManual} className="space-y-4">
            <Field label="Código" hint="Ingresso: UP-0000-0000 ou RUN-0000-0000 · Voucher: PRX-0000-0000 e os 6 dígitos do momento (ex.: PRX-0000-0000 123456).">
              {(id, describedBy) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-lg tracking-[0.12em]"
                />
              )}
            </Field>
            <Button type="submit" block disabled={busy || !code.trim()}>
              {busy ? "Consultando…" : "Consultar"}
            </Button>
          </form>
        )}

        {error && <Notice tone="error">{error}</Notice>}

        <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[14px] text-muted-foreground">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              setSound(e.target.checked);
              setSoundEnabled(e.target.checked);
            }}
            className="h-5 w-5 cursor-pointer accent-[#6c0cf0]"
          />
          Som ao liberar e ao recusar (vibra quando o aparelho permite)
        </label>
      </section>

      <section aria-labelledby="history-title" className="space-y-4 lg:col-span-5">
        <div className="flex items-end justify-between gap-4">
          <h2 id="history-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Últimas validações
          </h2>
          <Button variant="ghost" size="sm" onClick={() => void loadHistory()} aria-label="Atualizar histórico">
            <IconRefresh size={16} />
          </Button>
        </div>
        {history.length === 0 ? (
          <EmptyState title="Nada validado ainda" body="Entradas e baixas registradas por você aparecem aqui." />
        ) : (
          <ul className="space-y-2">
            {history.map((entry) =>
              entry.kind === "ticket" ? (
                <li key={entry.key} className="flex items-center justify-between gap-4 rounded-3xl glass-soft px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-ink">{entry.ticket.code}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {entry.ticket.eventTitle} · {entry.ticket.holderName}
                    </p>
                  </div>
                  <Tag tone={entry.ticket.isTest ? "warning" : "accent"}>{entry.ticket.isTest ? "Teste" : "Entrada"}</Tag>
                </li>
              ) : (
                <li key={entry.key} className="flex items-center justify-between gap-4 rounded-3xl glass-soft px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-ink">{entry.voucher.code}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {entry.voucher.benefitTitle || entry.voucher.discountLabel} · {entry.voucher.userName}
                    </p>
                  </div>
                  <Tag tone={entry.voucher.status === "used" ? "neutral" : "accent"}>{entry.voucher.status === "used" ? "Baixado" : "Pendente"}</Tag>
                </li>
              )
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

export function ValidationSheet({ validation }: { validation: Validation }) {
  const { result, confirmed, busy, confirm, close } = validation;
  const failed = !confirmed && Boolean(result) && !result?.canConfirm;

  let title = "Consulta";
  if (result?.kind === "ticket") {
    const test = result.ticket.isTest;
    title = confirmed
      ? test
        ? "Teste registrado"
        : "Entrada liberada"
      : result.ticket.status === "used"
        ? "Ingresso já utilizado"
        : result.canConfirm
          ? test
            ? "Ingresso de teste"
            : "Ingresso válido"
          : "Entrada não liberada";
  } else if (result?.kind === "voucher") {
    title = confirmed ? "Baixa registrada" : result.voucher.status === "used" ? "Voucher já utilizado" : result.voucher.expired ? "Voucher expirado" : result.canConfirm ? "Voucher válido" : "Voucher não aceito";
  }

  return (
    <Sheet
      open={Boolean(result)}
      onClose={close}
      title={title}
      description={result?.kind === "ticket" ? result.ticket.eventTitle : result?.voucher.benefitTitle}
      footer={
        result?.canConfirm && !confirmed ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={() => void confirm()} disabled={busy}>
              {busy ? "Registrando…" : result.kind === "ticket" ? "Liberar entrada" : "Confirmar uso e dar baixa"}
            </Button>
          </div>
        ) : (
          <Button block variant="ink" onClick={close}>
            Validar outro
          </Button>
        )
      }
    >
      {result && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white ${failed ? "bg-destructive" : "bg-success"}`}>
              {failed ? <IconClose size={22} /> : <IconCheck size={24} />}
            </span>
            <p className="min-w-0 break-words text-3xl font-semibold tracking-[-0.035em] text-ink">
              {result.kind === "ticket" ? result.ticket.holderName : result.voucher.discountLabel}
            </p>
          </div>

          {result.kind === "ticket" && result.ticket.isTest && (
            <p role="note" className="rounded-2xl bg-destructive px-4 py-3 text-center text-[14px] font-semibold uppercase tracking-[0.06em] text-white">
              Ingresso de teste · não libera entrada real
            </p>
          )}
          {result.kind === "ticket" && (result.ticket.idCheckRequired || (result.ticket.minAge ?? 0) > 0) && (
            <Notice tone="warning">
              {(result.ticket.minAge ?? 0) > 0 ? `Evento ${result.ticket.ageRating}: ` : ""}
              {result.ticket.idCheckRequired ? "confira documento oficial com foto e o nome antes de liberar." : "confira a idade antes de liberar."}
              {result.ticket.entryRequirements ? ` ${result.ticket.entryRequirements}` : ""}
            </Notice>
          )}
          {confirmed && result.message && <Notice tone="success">{result.message}</Notice>}

          {result.kind === "ticket" ? (
            <dl className="divide-y divide-line rounded-3xl bg-surface px-4 text-[15px]">
              <Row label="Código">
                <span className="font-mono">{result.ticket.code}</span>
              </Row>
              <Row label="Evento">{result.ticket.eventTitle}</Row>
              {result.ticket.eventStartsAt && <Row label="Início">{result.ticket.eventStartsAt}</Row>}
              <Row label="Lote">
                {result.ticket.batchName}
                {result.ticket.source === "invite" ? " · convite" : ""}
              </Row>
              {result.ticket.run && (
                <Row label="Inscrição">
                  {result.ticket.run.modality.toUpperCase()} · {result.ticket.run.category} · camiseta {result.ticket.run.shirtSize}
                </Row>
              )}
              <Row label="Situação">{result.ticket.statusLabel}</Row>
              <Row label="Pedido">
                <span className="font-mono">{result.ticket.purchaseCode}</span>
              </Row>
              {result.ticket.checkedInAt && (
                <Row label="Entrada">
                  {result.ticket.checkedInAt}
                  {result.ticket.checkedInBy ? ` · ${result.ticket.checkedInBy}` : ""}
                </Row>
              )}
            </dl>
          ) : (
            <>
              <dl className="divide-y divide-line rounded-3xl bg-surface px-4 text-[15px]">
                <Row label="Código">
                  <span className="font-mono">{result.voucher.code}</span>
                </Row>
                {result.voucher.partnerName && <Row label="Parceiro">{result.voucher.partnerName}</Row>}
                <Row label="Cliente">{result.voucher.userName || "Membro PRX"}</Row>
                <Row label="Resgatado">{result.voucher.redeemedAt}</Row>
                {result.voucher.expiresAt && <Row label="Usar até">{result.voucher.expiresAt}</Row>}
                {result.voucher.validatedAt && <Row label="Baixa">{result.voucher.validatedAt}</Row>}
              </dl>
              {result.voucher.terms && <p className="text-sm text-muted-foreground">Regra: {result.voucher.terms}</p>}
            </>
          )}

          {result.warning && <Notice tone="warning">{result.warning}</Notice>}
        </div>
      )}
    </Sheet>
  );
}
