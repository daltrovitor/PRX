// Hello World
"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Field, Input, Notice } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import type { PhoneVerificationState } from "@/lib/phone/types";

/*
 * Confirmar o celular pelo WhatsApp: número → código de 6 dígitos → confirmado.
 * O servidor valida tudo (limites, validade, tentativas); a tela só guia o passo.
 */

type Step = "phone" | "code";

const maskPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};

interface ApiResult {
  phone?: PhoneVerificationState;
  state?: PhoneVerificationState;
  devCode?: string;
  error?: string;
}

async function call(url: string, init?: RequestInit): Promise<ApiResult> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const json = (await res.json().catch(() => ({}))) as ApiResult;
  if (!res.ok) throw new Error(json.error || "Sem internet agora. Confira sua conexão e tente de novo.");
  return json;
}

/** Segundos até poder pedir outro código (atualiza a cada segundo). */
function useCountdown(until: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  return until ? Math.min(60, Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000))) : 0;
}

export function PhoneVerifyCard() {
  const { showToast } = useConfirmToast();
  const [state, setState] = useState<PhoneVerificationState | null>(null);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const wait = useCountdown(state?.pending?.resendAvailableAt ?? null);

  const load = useCallback(async () => {
    try {
      const json = await call("/api/phone");
      if (json.phone) setState(json.phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (phone.replace(/\D/g, "").length !== 11) return setError("Informe o celular com DDD.");
    setBusy(true);
    try {
      const json = await call("/api/phone/code", { method: "POST", body: JSON.stringify({ phone }) });
      if (json.state) setState(json.state);
      setDevCode(json.devCode ?? null);
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o código.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError("Digite os 6 números do código.");
    setBusy(true);
    try {
      const json = await call("/api/phone/verify", { method: "POST", body: JSON.stringify({ phone, code }) });
      if (json.phone) setState(json.phone);
      setStep("phone");
      setEditing(false);
      setPhone("");
      setCode("");
      setDevCode(null);
      showToast("success", "WhatsApp confirmado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar o código.");
    } finally {
      setBusy(false);
    }
  }

  const verified = Boolean(state?.verified) && !editing;

  return (
    <section aria-labelledby="profile-whatsapp" className="space-y-4 rounded-3xl glass p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="profile-whatsapp" className="text-lg font-semibold tracking-[-0.02em] text-ink">
            WhatsApp
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {verified ? `${state?.phone} confirmado.` : "Confirme seu celular com um código enviado pelo WhatsApp. Ele protege sua conta e recebe os avisos da PRX."}
          </p>
        </div>
        {verified && (
          <Button size="sm" variant="secondary" className="min-h-12" onClick={() => setEditing(true)}>
            Trocar número
          </Button>
        )}
      </div>

      {!verified && step === "phone" && (
        <form onSubmit={(e) => void sendCode(e)} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
          <Field label="Celular com DDD" className="flex-1">
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(11) 98888-7777"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                required
              />
            )}
          </Field>
          <Button type="submit" className="min-h-12 sm:w-auto" disabled={busy}>
            {busy ? "Enviando…" : "Enviar código"}
          </Button>
        </form>
      )}

      {!verified && step === "code" && (
        <form onSubmit={(e) => void confirm(e)} className="space-y-3" noValidate>
          <Field label={`Código enviado para ${phone}`} hint="O código vale por 10 minutos.">
            {(id, describedBy) => (
              <Input
                ref={codeRef}
                id={id}
                aria-describedby={describedBy}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-xl tracking-[0.5em] tabular-nums"
                required
              />
            )}
          </Field>
          {devCode && (
            <Notice>
              Ambiente de desenvolvimento, sem WhatsApp configurado: o código é <strong className="tabular-nums">{devCode}</strong>.
            </Notice>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="min-h-12" disabled={busy}>
              {busy ? "Confirmando…" : "Confirmar"}
            </Button>
            <Button type="button" variant="secondary" className="min-h-12" disabled={busy || wait > 0} onClick={() => void sendCode()}>
              {wait > 0 ? `Reenviar em ${wait}s` : "Reenviar código"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-12"
              disabled={busy}
              onClick={() => {
                setStep("phone");
                setError(null);
                setDevCode(null);
              }}
            >
              Trocar número
            </Button>
          </div>
        </form>
      )}

      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
