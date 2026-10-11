// Hello World
import crypto from "crypto";
import { getSessionSecret } from "@/lib/server-secrets";

/**
 * QR Code dinâmico do PRX PASS (modelo TOTP). O app do membro pede ao servidor
 * um código novo a cada 60 s; o código é um HMAC do voucher + titular + janela
 * de tempo, com segredo que só existe no servidor. O balcão lê o QR (ou digita
 * o código do voucher + 6 dígitos do momento) e o servidor confere assinatura,
 * janela, titular e voucher. Print antigo expira em no máximo ~2 min, e o uso
 * único continua garantido pela baixa atômica no banco (um QR copiado dentro
 * da janela não passa duas vezes).
 */

export const PASS_QR_PERIOD_S = 60;
/** Tolerância de relógio: aceita a janela anterior e a seguinte. */
export const PASS_QR_SKEW_STEPS = 1;
export const PASS_QR_PREFIX = "PRX_PASS2";

/** Chave própria do QR, derivada do segredo do servidor (ou PRX_PASS_QR_SECRET). */
function qrKey(): Buffer {
  const base = process.env.PRX_PASS_QR_SECRET?.trim() || getSessionSecret();
  return crypto.createHmac("sha256", base).update("prx-pass-qr:v1").digest();
}

export function passQrStep(now = Date.now()): number {
  return Math.floor(now / 1000 / PASS_QR_PERIOD_S);
}

export interface VoucherBinding {
  id: string;
  code: string;
  userId: string;
}

function signature(v: VoucherBinding, step: number): string {
  return crypto.createHmac("sha256", qrKey()).update(`${v.id}|${v.userId}|${v.code}|${step}`).digest().subarray(0, 12).toString("base64url");
}

/** 6 dígitos do momento (truncamento dinâmico do HOTP, RFC 4226). */
function momentDigits(v: VoucherBinding, step: number): string {
  const mac = crypto.createHmac("sha256", qrKey()).update(`${v.id}|${v.userId}|${v.code}|${step}|otp`).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const value = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export interface PassQrToken {
  payload: string;
  /** Para digitar no balcão quando a câmera falha: código do voucher + estes 6 dígitos. */
  momentCode: string;
  step: number;
  validUntil: string;
  period: number;
}

export function issuePassQr(v: VoucherBinding, now = Date.now()): PassQrToken {
  const step = passQrStep(now);
  return {
    payload: `${PASS_QR_PREFIX}::${v.code}::${step}::${signature(v, step)}`,
    momentCode: momentDigits(v, step),
    step,
    validUntil: new Date((step + 1) * PASS_QR_PERIOD_S * 1000).toISOString(),
    period: PASS_QR_PERIOD_S,
  };
}

export type PassInput =
  | { kind: "dynamic"; code: string; step: number; sig: string }
  | { kind: "moment"; code: string; digits: string }
  | { kind: "static"; code: string };

/** Entende o QR novo, o código + 6 dígitos digitados, ou o código/QR antigo (sem prova de momento). */
export function parsePassInput(raw: string): PassInput {
  const trimmed = raw.trim();
  if (trimmed.startsWith(`${PASS_QR_PREFIX}::`)) {
    const [, code = "", step = "", sig = ""] = trimmed.split("::");
    if (/^\d{1,12}$/.test(step) && /^[A-Za-z0-9_-]{16}$/.test(sig)) return { kind: "dynamic", code: code.trim().toUpperCase(), step: Number(step), sig };
    return { kind: "dynamic", code: code.trim().toUpperCase(), step: -1, sig: "" };
  }
  const upper = trimmed.toUpperCase().replace(/\s+/g, " ");
  const moment = upper.match(/^(PRX-[A-Z0-9]{4}-[A-Z0-9]{4})[\s-]?(\d{6})$/);
  if (moment) return { kind: "moment", code: moment[1], digits: moment[2] };
  if (upper.startsWith("PRX_PASS::") || upper.startsWith("NXTGEN_PASS::")) return { kind: "static", code: (upper.split("::")[1] ?? "").trim() };
  return { kind: "static", code: upper };
}

export type PassQrVerdict = "ok" | "missing" | "expired" | "invalid";

/** Confere a prova de momento contra o voucher encontrado pelo código. */
export function verifyPassInput(input: PassInput, v: VoucherBinding, now = Date.now()): PassQrVerdict {
  if (input.kind === "static") return "missing";
  if (input.code !== v.code.toUpperCase()) return "invalid";
  const current = passQrStep(now);
  if (input.kind === "dynamic") {
    if (input.step < 0 || !same(input.sig, signature(v, input.step))) return "invalid";
    if (input.step < current - PASS_QR_SKEW_STEPS) return "expired";
    if (input.step > current + PASS_QR_SKEW_STEPS) return "invalid";
    return "ok";
  }
  for (let step = current - PASS_QR_SKEW_STEPS; step <= current + PASS_QR_SKEW_STEPS; step++) {
    if (same(input.digits, momentDigits(v, step))) return "ok";
  }
  // Dígitos de alguns minutos atrás: avisa que expirou em vez de "inválido".
  for (let step = current - 6; step < current - PASS_QR_SKEW_STEPS; step++) {
    if (same(input.digits, momentDigits(v, step))) return "expired";
  }
  return "invalid";
}

export const PASS_QR_MESSAGES: Record<Exclude<PassQrVerdict, "ok">, string> = {
  missing: "Este código não traz a prova do momento. Peça ao cliente para abrir o voucher no app: o QR muda a cada 60 segundos (ou digite o código com os 6 dígitos que aparecem embaixo do QR).",
  expired: "QR Code expirado. Peça ao cliente para atualizar o voucher no app e leia de novo.",
  invalid: "QR Code inválido para este voucher. Peça ao cliente para abrir o voucher no próprio app.",
};
