// Hello World

/**
 * Grava a importação reaproveitando as rotas do admin (as mesmas do cadastro manual):
 * 1) parceiro + login em /api/admin/partners, 2) um benefício por vez em /api/admin/benefits.
 * O login é validado antes do parceiro ser inserido, então uma falha ali não deixa cadastro pela metade.
 */
import { onlyDigits } from "@/lib/partners/documents";
import type { BenefitDraft, ImportDraft } from "@/lib/partners/import-parse";
import type { Partner } from "@/lib/partners/types";

interface ApiBody {
  success?: boolean;
  error?: string;
  partner?: Partner;
  temporaryPassword?: string;
}

const OFFLINE = "Sem internet agora. Confira sua conexão e tente de novo.";

async function send(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: ApiBody }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as ApiBody;
    return { ok: res.ok && data.success !== false, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: OFFLINE } };
  }
}

export interface PartnerStepResult {
  partner: Partner;
  credential: { email: string; password: string } | null;
  /** Conta que já existia e foi vinculada em vez de criada. */
  linked: boolean;
}

export async function createPartnerStep(draft: ImportDraft, images: { logoUrl: string; bannerUrl: string }): Promise<PartnerStepResult> {
  const rep = draft.representative;
  const partner = {
    tradeName: draft.tradeName.trim(),
    legalName: draft.legalName.trim(),
    document: onlyDigits(draft.document),
    categoryId: draft.categoryId,
    location: draft.location.trim(),
    description: "",
    logoUrl: images.logoUrl,
    bannerUrl: images.bannerUrl,
    status: "ATIVO",
    representative: { ...rep, document: onlyDigits(rep.document) },
    contact: { name: rep.name, phone: rep.phone, email: rep.email },
    badges: [],
  };
  const email = (draft.loginEmail || rep.email).trim();
  const name = rep.name || draft.tradeName;

  if (!email) {
    const none = await send("/api/admin/partners", { partner, access: { mode: "none" } });
    if (!none.ok || !none.data.partner) throw new Error(none.data.error || "Não foi possível cadastrar o parceiro.");
    return { partner: none.data.partner, credential: null, linked: false };
  }

  let linked = false;
  let result = await send("/api/admin/partners", { partner, access: { mode: "create", email, name } });
  if (result.status === 409) {
    // Já existe conta com este e-mail: vira o login do parceiro.
    linked = true;
    result = await send("/api/admin/partners", { partner, access: { mode: "link", email } });
  }
  if (!result.ok || !result.data.partner) throw new Error(result.data.error || "Não foi possível cadastrar o parceiro.");
  const password = result.data.temporaryPassword;
  return { partner: result.data.partner, credential: password ? { email, password } : null, linked };
}

export interface BenefitFailure {
  key: string;
  title: string;
  message: string;
}

/** Cria em sequência; devolve quantos entraram e quais falharam (para tentar de novo só esses). */
export async function createBenefitsStep(
  partnerId: string,
  categoryId: string,
  benefits: ReadonlyArray<BenefitDraft>
): Promise<{ created: number; failed: BenefitFailure[] }> {
  let created = 0;
  const failed: BenefitFailure[] = [];
  for (const b of benefits) {
    const res = await send("/api/admin/benefits", {
      partnerId,
      categoryId,
      title: b.title.trim(),
      description: b.description.trim(),
      discountLabel: b.discountLabel.trim(),
      minPrxLevel: 1,
      terms: [],
    });
    if (res.ok) created += 1;
    else failed.push({ key: b.key, title: b.title, message: res.data.error || "Não foi possível criar o benefício." });
  }
  return { created, failed };
}
