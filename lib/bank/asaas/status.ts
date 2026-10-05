// Hello World
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { asaasChecklist, readAsaasConfig, type AsaasCheck } from "@/lib/asaas/config";
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
  /** Versão publicada (commit da Vercel), para saber se o deploy novo já entrou. */
  version: string | null;
}

async function migrationCheck(): Promise<AsaasCheck> {
  const label = "Migração do PRX BANK no Supabase";
  if (!supabaseAdmin) return { label, ok: false, hint: "Defina SUPABASE_SERVICE_ROLE_KEY." };
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

export async function bankStatus(): Promise<BankStatus> {
  const config = readAsaasConfig();
  const checks = [...asaasChecklist(), await migrationCheck(), await connectionCheck()];
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim();
  return { live: config !== null && checks.every((c) => c.ok), environment: config?.environment ?? null, checks, version: sha ? sha.slice(0, 7) : null };
}
