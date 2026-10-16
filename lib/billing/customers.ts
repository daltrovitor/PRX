// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError, isMissingTable } from "@/lib/partners/errors";
import { createBillingCustomer, findCustomerByReference } from "@/lib/asaas/billing";
import type { AsaasClient } from "@/lib/asaas/client";
import { isValidCpf } from "@/lib/prx/pix";

/**
 * Cliente do membro na conta principal do Asaas (cobranças da PRX). Um por
 * pessoa e ambiente: antes de criar, procura pela referência externa
 * "prx:<id>" (uma tentativa anterior pode ter criado sem o PRX saber). Nunca
 * cria cliente a cada visita.
 */

export interface Payer {
  id: string;
  fullName: string;
  email: string;
  cpf?: string | null;
  phone?: string | null;
}

export const CPF_REQUIRED_FOR_BILLING = "Para pagar, complete o seu CPF no Perfil.";

const memory = () => ((globalThis as unknown as { __prxBillingCustomers?: Map<string, string> }).__prxBillingCustomers ??= new Map());

async function saved(userId: string, environment: string): Promise<string | null> {
  if (!supabaseAdmin) return memory().get(`${userId}:${environment}`) ?? null;
  const { data, error } = await supabaseAdmin.from("billing_customers").select("asaas_customer_id").eq("user_id", userId).eq("environment", environment).maybeSingle();
  if (isMissingTable(error)) throw new PartnerError("Falta aplicar a migração supabase/migrations/20261016_prx_subscriptions.sql no Supabase.", 503);
  if (error) throw dbError(error, "Não foi possível ler o cliente de cobrança");
  return (data as { asaas_customer_id?: string } | null)?.asaas_customer_id ?? null;
}

async function remember(userId: string, environment: string, customerId: string): Promise<void> {
  if (!supabaseAdmin) {
    memory().set(`${userId}:${environment}`, customerId);
    return;
  }
  const { error } = await supabaseAdmin.from("billing_customers").upsert({ user_id: userId, environment, asaas_customer_id: customerId }, { onConflict: "user_id,environment" });
  if (error) throw dbError(error, "Não foi possível salvar o cliente de cobrança");
}

export async function ensureBillingCustomer(payer: Payer, client: AsaasClient): Promise<string> {
  const env = client.environment;
  const known = await saved(payer.id, env);
  if (known) return known;
  const cpf = (payer.cpf ?? "").replace(/\D/g, "");
  if (!isValidCpf(cpf)) throw new PartnerError(CPF_REQUIRED_FOR_BILLING, 409);
  const reference = `prx:${payer.id}`;
  const existing = await findCustomerByReference(client, reference);
  const id =
    existing ??
    (
      await createBillingCustomer(client, {
        name: payer.fullName || payer.email,
        cpfCnpj: cpf,
        email: payer.email,
        mobilePhone: (payer.phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "") || null,
        externalReference: reference,
      })
    ).id;
  await remember(payer.id, env, id);
  return id;
}
