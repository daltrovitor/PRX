// Hello World
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { asaasChecklist, readAsaasConfig, webhookUrls, type AsaasCheck } from "@/lib/asaas/config";
import { asaasRuntime, probeWebhookUrl, type AsaasRuntime } from "@/lib/asaas/runtime";
import { getAsaasClient } from "@/lib/asaas/client";
import { isMissingTable } from "@/lib/partners/errors";
import { supabaseAdmin } from "@/lib/supabase/client";

/**
 * Situação do PRX BANK para o painel admin: variáveis, migração e conexão com
 * o Asaas. Responde por que o banco está ou não ligado, sem mostrar segredos.
 */
export interface BankStatus {
  /** true quando o app fala com o Asaas (Pix, saldo e extrato reais). */
  live: boolean;
  environment: "sandbox" | "production" | null;
  checks: AsaasCheck[];
  /** Contas abertas no banco parceiro (null = não deu para consultar). */
  accounts: { production: number; sandbox: number; events: number } | null;
  /** Versão publicada (commit da Vercel), para saber se o deploy novo já entrou. */
  version: string | null;
  /** O que este deploy lê de fato (tipo da chave, endpoint, URLs dos webhooks), sem segredos. */
  runtime: AsaasRuntime;
}

function supabaseCheck(): AsaasCheck {
  const label = "Acesso do servidor ao Supabase (SUPABASE_SERVICE_ROLE_KEY)";
  if (supabaseAdmin) return { label, ok: true, hint: null };
  const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || "").trim();
  const problem = raw ? "O valor não é uma chave de servidor do Supabase (ela começa com sb_secret_ ou eyJ)." : "A variável está vazia.";
  return {
    label,
    ok: false,
    hint: `${problem} Use a secret key (sb_secret_...) ou a service_role do Supabase. Sem ela, contas, PRX Coins e o banco caem numa memória temporária e o Asaas não liga.`,
  };
}

async function migrationCheck(): Promise<AsaasCheck> {
  const label = "Migração do PRX BANK no Supabase";
  if (!supabaseAdmin) return { label, ok: false, hint: "Depende do acesso ao Supabase (item acima)." };
  const { error } = await supabaseAdmin.from("bank_subaccounts").select("id").limit(1);
  if (!error) return { label, ok: true, hint: null };
  return { label, ok: false, hint: isMissingTable(error) ? "Aplique supabase/migrations/20261001_prx_asaas_baas.sql." : `Supabase respondeu: ${error.message}` };
}

async function connectionCheck(): Promise<AsaasCheck> {
  const label = "Conexão com o Asaas (chave da conta mãe)";
  const client = getAsaasClient();
  if (!client) return { label, ok: false, hint: "Corrija os itens acima: enquanto houver erro, o app não liga o Asaas." };
  try {
    await client.get("/finance/balance", {}, z.object({ balance: z.number() }).loose());
    return { label, ok: true, hint: null };
  } catch (err) {
    return { label, ok: false, hint: `O Asaas recusou a chave: ${errorMessage(err, "sem resposta").slice(0, 200)}` };
  }
}

async function accountCounts(): Promise<BankStatus["accounts"]> {
  if (!supabaseAdmin) return null;
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    return error ? null : (n ?? 0);
  };
  const created = () => supabaseAdmin!.from("bank_subaccounts").select("id", { count: "exact", head: true }).not("asaas_account_id", "is", null);
  const [production, sandbox, events] = await Promise.all([
    count(created().eq("environment", "production")),
    count(created().eq("environment", "sandbox")),
    count(supabaseAdmin.from("bank_webhooks_log").select("id", { count: "exact", head: true })),
  ]);
  return production === null || sandbox === null || events === null ? null : { production, sandbox, events };
}

/** As URLs dos webhooks chamadas de verdade: precisam chegar à PRX sem redirecionamento. */
function webhookChecks(): Promise<AsaasCheck[]> {
  const urls = webhookUrls();
  if (!urls) return Promise.resolve([]);
  return Promise.all([
    probeWebhookUrl("Webhook de eventos responde direto (sem redirecionamento)", urls.events),
    probeWebhookUrl("Webhook de validação de saque responde direto", urls.validateWithdraw),
  ]);
}

export async function bankStatus(): Promise<BankStatus> {
  const config = readAsaasConfig();
  const [migration, connection, webhooks, accounts] = await Promise.all([migrationCheck(), connectionCheck(), webhookChecks(), accountCounts()]);
  const checks = [supabaseCheck(), ...asaasChecklist(), migration, connection, ...webhooks];
  const runtime = asaasRuntime();
  return { live: config !== null && checks.every((c) => c.ok), environment: config?.environment ?? null, checks, accounts, version: runtime.commit, runtime };
}
