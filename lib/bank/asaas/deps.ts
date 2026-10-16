// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError } from "@/lib/partners/errors";
import { asaasEnabled, getAsaasClient, type AsaasClient } from "@/lib/asaas/client";
import { usesSupabaseBank } from "@/lib/bank/repository";
import { getAsaasBankStore } from "@/lib/bank/asaas/store";
import { getBankMirror, type BankMirror } from "@/lib/bank/asaas/mirror";
import type { AsaasBankStore } from "@/lib/bank/asaas/types";
import { FAMILY_BUCKET, readMemoryDocument } from "@/lib/family/documents";
import { getKycRepository } from "@/lib/kyc/repository";
import type { BankKycApplication } from "@/lib/kyc/types";

/**
 * Dependências dos serviços do PRX BANK com o Asaas. Injetáveis para os
 * testes; em produção vêm do ambiente (cliente HTTP, Supabase e storage).
 */
export interface AsaasDeps {
  client: AsaasClient;
  store: AsaasBankStore;
  mirror: BankMirror;
  latestKyc(userId: string): Promise<BankKycApplication | null>;
  /** Arquivo de documento do KYC guardado pela PRX (bucket privado). */
  readDocument(path: string): Promise<{ blob: Blob; filename: string } | null>;
  now(): Date;
}

/** O Asaas atende este membro? Só contas reais (Supabase) com o provedor ligado. */
export function asaasActiveFor(userId: string): boolean {
  return asaasEnabled() && usesSupabaseBank(userId);
}

async function readDocument(path: string): Promise<{ blob: Blob; filename: string } | null> {
  const filename = path.split("/").pop() || "documento";
  if (!supabaseAdmin) {
    const found = readMemoryDocument(path);
    return found ? { blob: new Blob([new Uint8Array(found.data)], { type: found.type }), filename } : null;
  }
  const { data, error } = await supabaseAdmin.storage.from(FAMILY_BUCKET).download(path);
  if (error || !data) {
    console.warn("[bank] documento do KYC indisponível:", error?.message);
    return null;
  }
  return { blob: data, filename };
}

export function asaasDeps(): AsaasDeps {
  const client = getAsaasClient();
  if (!client) throw new PartnerError("A ativação de contas ainda não está disponível neste ambiente.", 503);
  return {
    client,
    store: getAsaasBankStore(),
    mirror: getBankMirror(),
    latestKyc: (userId) => getKycRepository().latestForUser(userId),
    readDocument,
    now: () => new Date(),
  };
}
