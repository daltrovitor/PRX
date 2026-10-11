// Hello World
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError } from "@/lib/partners/errors";
import { ageOn } from "@/lib/family/age";
import { queryCpf, readSerproConfig, type SerproConfig, type SerproResult } from "@/lib/cpf/serpro";

/**
 * Confere CPF + data de nascimento na Receita (Serpro) antes de a conta existir.
 * Quem se cadastra só vê mensagens genéricas; o motivo exato fica em
 * cpf_verification_log (Supabase) e na linha "[prx:cpf]" dos logs da Vercel.
 */

export const CPF_MISMATCH_MESSAGE = "Não conseguimos confirmar este CPF com a data de nascimento informada. Confira os dados e tente de novo.";
export const CPF_UNAVAILABLE_MESSAGE = "Não foi possível conferir seu CPF agora. Tente de novo em alguns minutos.";

/** Situações cadastrais aceitas: 0 Regular e 4 Pendente de regularização. Falecido, nula, cancelada e suspensa não entram. */
const ACCEPTED_SITUATIONS = new Set(["0", "4"]);

export type CpfOutcome = "verified" | "mismatch" | "irregular" | "unavailable" | "skipped";

export interface CpfDecision {
  outcome: CpfOutcome;
  detail: string;
  httpStatus: number | null;
  situationCode: string | null;
}

/** Decide o que fazer com a resposta do Serpro (função pura, testável). */
export function decide(result: SerproResult, isoBirthDate: string, now = new Date()): CpfDecision {
  switch (result.kind) {
    case "match":
      if (!ACCEPTED_SITUATIONS.has(result.situationCode)) {
        return { outcome: "irregular", detail: `Situação cadastral ${result.situationCode}${result.situation ? ` (${result.situation})` : ""}`, httpStatus: 200, situationCode: result.situationCode };
      }
      return { outcome: "verified", detail: result.partial ? "Conferido (resposta parcial)" : "Conferido", httpStatus: result.partial ? 206 : 200, situationCode: result.situationCode };
    case "mismatch":
      return { outcome: "mismatch", detail: result.reason, httpStatus: 404, situationCode: null };
    case "minor_withheld":
      // A v3 não devolve dados de menor: só aceita quando o cadastro também declara menor de idade.
      return ageOn(isoBirthDate, now) < 18
        ? { outcome: "verified", detail: `Menor de idade: Receita não devolve os dados (${result.status}); consistente com a idade declarada`, httpStatus: result.status, situationCode: null }
        : { outcome: "mismatch", detail: `Receita indica menor de idade (${result.status}), mas o cadastro declara maior`, httpStatus: result.status, situationCode: null };
    case "unavailable":
      return { outcome: "unavailable", detail: result.detail, httpStatus: result.status, situationCode: null };
  }
}

const maskCpf = (cpf: string) => `***.***.${cpf.slice(6, 9)}-**`;
const fingerprint = (cpf: string, birth: string) => createHash("sha256").update(`${cpf}:${birth}`).digest("hex");

/** CPFs já conferidos nesta instância (evita pagar de novo se a pessoa corrige o e-mail e reenvia). */
const recentlyVerified = new Map<string, number>();
const CACHE_MS = 10 * 60_000;

async function record(cpf: string, decision: CpfDecision, source: string): Promise<void> {
  console[decision.outcome === "verified" ? "info" : "warn"](`[prx:cpf] ${decision.outcome} ${maskCpf(cpf)} via=${source}${decision.httpStatus ? ` http=${decision.httpStatus}` : ""} · ${decision.detail}`);
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from("cpf_verification_log").insert({
    cpf_masked: maskCpf(cpf),
    source,
    outcome: decision.outcome,
    http_status: decision.httpStatus,
    situation_code: decision.situationCode,
    detail: decision.detail.slice(0, 500),
  });
  // Tabela ainda não criada (migração 20261009): fica só a linha da Vercel.
  if (error) console.warn("[prx:cpf] registro não gravado no Supabase:", error.message);
}

export interface VerifyDeps {
  config?: SerproConfig | null;
  fetcher?: typeof fetch;
  now?: Date;
}

/**
 * Lança PartnerError quando o CPF não confere com a data de nascimento (422),
 * está irregular (422) ou a Receita está fora do ar (503). Sem credenciais do
 * Serpro não consulta nada e só registra "skipped".
 */
export async function assertCpfMatchesBirth(cpf: string, isoBirthDate: string, source: string, deps: VerifyDeps = {}): Promise<"verified" | "skipped"> {
  const config = deps.config === undefined ? readSerproConfig() : deps.config;
  if (!config) {
    await record(cpf, { outcome: "skipped", detail: "Serpro não configurado (SERPRO_CPF_CONSUMER_KEY/SECRET); cadastro autodeclarado", httpStatus: null, situationCode: null }, source);
    return "skipped";
  }
  const key = fingerprint(cpf, isoBirthDate);
  const cachedAt = recentlyVerified.get(key);
  if (cachedAt && Date.now() - cachedAt < CACHE_MS) return "verified";

  const decision = decide(await queryCpf(cpf, isoBirthDate, config, deps.fetcher), isoBirthDate, deps.now);
  await record(cpf, decision, source);
  if (decision.outcome === "verified") {
    recentlyVerified.set(key, Date.now());
    return "verified";
  }
  if (decision.outcome === "unavailable") throw new PartnerError(CPF_UNAVAILABLE_MESSAGE, 503);
  throw new PartnerError(CPF_MISMATCH_MESSAGE, 422);
}

/** Só para testes. */
export function resetCpfCache(): void {
  recentlyVerified.clear();
}
