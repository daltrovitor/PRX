// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { passStore, type SystemVoucher } from "@/lib/pass-store";
import type { Benefit } from "@/lib/pass-data";
import type { BenefitRow, ProfileRow, VoucherRow } from "@/lib/db-rows";
import { campaignWindow, formatDateBR } from "@/lib/partners/contract";
import { PartnerError, dbError, isMissingColumn } from "@/lib/partners/errors";
import { getPartnerRepository } from "@/lib/partners/repository";
import { REDEMPTION_MODES, VISIBILITY_PLAN_IDS, deriveOfferLabel, isPaidPlan, type VisibilityPlan } from "@/lib/partners/plans";
import type { Campaign, CommercialSummary, Partner } from "@/lib/partners/types";
import { DEFAULT_PARTNER_FEE_PCT } from "@/lib/points/economics";
import { normalizeBadges, type BadgeCode } from "@/lib/badges/catalog";
import { columnReady } from "@/lib/db-features";

/**
 * Acesso a benefícios e vouchers usado pelo programa de parceiros, nos dois
 * modos (Supabase e memória). As tabelas benefits/vouchers são as mesmas do
 * PRX PASS; a migração 20260925 só acrescenta colunas.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value?: string | null): value is string => Boolean(value && UUID.test(value));

function asPlan(value: unknown): VisibilityPlan {
  return VISIBILITY_PLAN_IDS.includes(value as VisibilityPlan) ? (value as VisibilityPlan) : "basico";
}

/** Linha de benefits → Benefit. Único ponto de mapeamento para as rotas. */
export function mapBenefitRow(row: BenefitRow): Benefit {
  const plan = asPlan(row.visibility_plan);
  return {
    id: row.id,
    partnerId: row.partner_id || "",
    partnerName: row.partner_name,
    partnerLogo: row.partner_logo ?? "",
    partnerBanner: row.partner_banner ?? "",
    partnerLocation: row.partner_location || "",
    categoryId: row.category_id,
    title: row.title,
    description: row.description || "",
    discountLabel: row.discount_label,
    minPrxLevel: row.min_nxt_level || 1,
    terms: Array.isArray(row.terms) ? row.terms : [row.terms || "Apresente o QR Code no balcão."],
    campaignId: row.campaign_id ?? null,
    visibilityPlan: plan,
    sponsored: isPaidPlan(plan),
    startsAt: row.campaign_starts_at ?? null,
    endsAt: row.campaign_ends_at ?? null,
    quantity: row.campaign_quantity ?? null,
    perUserLimit: row.campaign_per_user_limit ?? null,
    usageDays: row.campaign_usage_days ?? null,
    pointsCost: Math.max(0, Math.trunc(Number(row.points_cost ?? 0)) || 0),
    costPrice: moneyOrZero(row.cost_price),
    prxRevenuePerRedemption: moneyOrZero(row.prx_revenue_per_redemption),
    partnerFeePct: row.partner_fee_pct === null || row.partner_fee_pct === undefined ? DEFAULT_PARTNER_FEE_PCT : moneyOrZero(row.partner_fee_pct),
    badges: normalizeBadges(row.badges),
  };
}

function moneyOrZero(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** Motivo pelo qual o benefício não pode ser resgatado agora, ou null. */
export function availabilityIssue(benefit: Benefit, now = new Date()): string | null {
  if (!benefit.partnerId) return "Este benefício ainda não está vinculado a um parceiro.";
  if (benefit.startsAt && now < new Date(benefit.startsAt)) {
    return `A campanha começa em ${new Date(benefit.startsAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`;
  }
  if (benefit.endsAt && now > new Date(benefit.endsAt)) return "Esta campanha já foi encerrada.";
  return null;
}

/** Regras exibidas ao membro, derivadas do Resumo Comercial aceito. */
export function campaignBenefitTerms(summary: CommercialSummary): string[] {
  const terms = [
    `Válido de ${formatDateBR(summary.startDate)} a ${formatDateBR(summary.endDate)}.`,
    `Use em até ${summary.usageDeadlineDays} ${summary.usageDeadlineDays === 1 ? "dia" : "dias"} depois de gerar o voucher.`,
    `Limite de ${summary.perUserLimit} por membro.`,
    `Onde usar: ${summary.channels}.`,
    `Como usar: ${summary.redemptionModes.map((mode) => REDEMPTION_MODES[mode].label).join(", ")}.`,
  ];
  if (summary.earlyEndOnSellOut) terms.push(`Quantidade limitada a ${summary.quantity.toLocaleString("pt-BR")} ${summary.quantityUnit}.`);
  return [...terms, ...summary.rules];
}

function benefitFromCampaign(partner: Partner, campaignId: string, summary: CommercialSummary) {
  const window = campaignWindow(summary);
  return {
    partnerId: partner.id,
    partnerName: partner.tradeName,
    partnerLogo: partner.logoUrl,
    partnerBanner: partner.bannerUrl,
    partnerLocation: partner.location,
    categoryId: summary.categoryId || partner.categoryId,
    title: summary.benefitTitle,
    description: summary.benefitDescription,
    discountLabel: summary.catalogLabel.trim() || deriveOfferLabel(summary),
    minPrxLevel: summary.minPrxLevel,
    terms: campaignBenefitTerms(summary),
    campaignId,
    visibilityPlan: summary.plan,
    sponsored: isPaidPlan(summary.plan),
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    quantity: summary.quantity,
    perUserLimit: summary.perUserLimit,
    usageDays: summary.usageDeadlineDays,
  } satisfies Omit<Benefit, "id">;
}

/* -------------------------------------------------------------------------- */
/* Benefícios                                                                  */
/* -------------------------------------------------------------------------- */

export async function getBenefit(id: string): Promise<Benefit | null> {
  if (supabaseAdmin) {
    if (!isUuid(id)) return passStore.getBenefitById(id) ?? null;
    const { data, error } = await supabaseAdmin.from("benefits").select("*").eq("id", id).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar o benefício");
    return data ? mapBenefitRow(data as BenefitRow) : null;
  }
  return passStore.getBenefitById(id) ?? null;
}

export async function listBenefitsByPartner(partnerId: string): Promise<Benefit[]> {
  if (supabaseAdmin) {
    if (!isUuid(partnerId)) return [];
    const { data, error } = await supabaseAdmin.from("benefits").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false });
    if (error) throw dbError(error, "Não foi possível listar os benefícios do parceiro");
    return (data as BenefitRow[]).map(mapBenefitRow);
  }
  return passStore.getBenefits().filter((b) => b.partnerId === partnerId);
}

/** Publica (ou reaproveita) o benefício da campanha aceita. Idempotente por campanha. */
export async function publishCampaignBenefit(partner: Partner, campaign: Pick<Campaign, "id" | "benefitId">, summary: CommercialSummary): Promise<Benefit> {
  if (campaign.benefitId) {
    const existing = await getBenefit(campaign.benefitId);
    if (existing) return existing;
  }
  const data = benefitFromCampaign(partner, campaign.id, summary);

  if (supabaseAdmin) {
    const { data: inserted, error } = await supabaseAdmin
      .from("benefits")
      .insert({
        partner_id: data.partnerId,
        partner_name: data.partnerName,
        partner_logo: data.partnerLogo || null,
        partner_banner: data.partnerBanner || null,
        partner_location: data.partnerLocation,
        category_id: data.categoryId,
        title: data.title,
        description: data.description,
        discount_label: data.discountLabel,
        min_nxt_level: data.minPrxLevel,
        terms: data.terms,
        is_active: true,
        campaign_id: data.campaignId,
        visibility_plan: data.visibilityPlan,
        campaign_starts_at: data.startsAt,
        campaign_ends_at: data.endsAt,
        campaign_quantity: data.quantity,
        campaign_per_user_limit: data.perUserLimit,
        campaign_usage_days: data.usageDays,
      })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível publicar o benefício da campanha");
    const benefit = mapBenefitRow(inserted as BenefitRow);
    passStore.createBenefit(benefit);
    return benefit;
  }

  return passStore.createBenefit({ ...data, id: `ben-${campaign.id}` });
}

/** Tira o benefício do catálogo (campanha encerrada, parceiro suspenso). */
export async function deactivateBenefit(benefitId: string): Promise<void> {
  if (supabaseAdmin && isUuid(benefitId)) {
    const { error } = await supabaseAdmin.from("benefits").update({ is_active: false }).eq("id", benefitId);
    if (error) throw dbError(error, "Não foi possível tirar o benefício do catálogo");
  }
  passStore.deleteBenefit(benefitId);
}

/** Status de cada parceiro, para esconder do catálogo benefícios de parceiros suspensos. */
export async function partnerStatuses(partnerIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(partnerIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  if (supabaseAdmin) {
    const uuids = ids.filter(isUuid);
    if (uuids.length === 0) return map;
    const { data, error } = await supabaseAdmin.from("partners").select("id, status").in("id", uuids);
    if (error) throw dbError(error, "Não foi possível consultar os parceiros");
    (data as Array<{ id: string; status: string }>).forEach((row) => map.set(row.id, row.status));
    return map;
  }
  const partners = await getPartnerRepository().listPartners();
  partners.filter((p) => ids.includes(p.id)).forEach((p) => map.set(p.id, p.status));
  return map;
}

/** Selos de cada parceiro, para somar aos dos benefícios no catálogo. Sem a migração: nenhum. */
export async function partnerBadges(partnerIds: string[]): Promise<Map<string, BadgeCode[]>> {
  const ids = Array.from(new Set(partnerIds.filter(Boolean)));
  const map = new Map<string, BadgeCode[]>();
  if (ids.length === 0) return map;
  if (supabaseAdmin) {
    const uuids = ids.filter(isUuid);
    if (uuids.length === 0 || !(await columnReady("partners", "badges"))) return map;
    const { data, error } = await supabaseAdmin.from("partners").select("id, badges").in("id", uuids);
    if (error) throw dbError(error, "Não foi possível consultar os selos dos parceiros");
    (data as Array<{ id: string; badges: unknown }>).forEach((row) => map.set(row.id, normalizeBadges(row.badges)));
    return map;
  }
  const partners = await getPartnerRepository().listPartners();
  partners.filter((p) => ids.includes(p.id)).forEach((p) => map.set(p.id, normalizeBadges(p.badges)));
  return map;
}

/* -------------------------------------------------------------------------- */
/* Vouchers                                                                    */
/* -------------------------------------------------------------------------- */

export interface CatalogVoucher {
  id: string;
  code: string;
  benefitId: string;
  benefitTitle: string;
  partnerId: string;
  partnerName: string;
  discountLabel: string;
  status: string;
  userId: string;
  userEmail: string;
  userName: string;
  terms: string;
  createdAt: string;
  validatedAt: string | null;
  expiresAt: string | null;
}

function mapVoucherRow(v: VoucherRow): CatalogVoucher {
  return {
    id: v.id,
    code: v.code,
    benefitId: v.benefit_id ?? "",
    benefitTitle: v.benefit_title ?? "",
    partnerId: v.partner_id ?? "",
    partnerName: v.partner_name ?? "",
    discountLabel: v.discount_label ?? "",
    status: v.status,
    userId: v.user_id ?? "",
    userEmail: v.user_email ?? "",
    userName: v.user_name ?? "",
    terms: v.terms ?? "",
    createdAt: v.redeemed_at || v.created_at || new Date(0).toISOString(),
    validatedAt: v.validated_at ?? null,
    expiresAt: v.expires_at ?? null,
  };
}

function mapMemoryVoucher(v: SystemVoucher): CatalogVoucher {
  return {
    id: v.id,
    code: v.code,
    benefitId: v.benefitId,
    benefitTitle: v.benefitTitle,
    partnerId: v.partnerId,
    partnerName: v.partnerName,
    discountLabel: v.discountLabel,
    status: v.status,
    userId: v.userId,
    userEmail: v.userEmail,
    userName: v.userName,
    terms: v.terms,
    createdAt: v.createdAtIso || new Date(0).toISOString(),
    validatedAt: v.validatedAtIso ?? null,
    expiresAt: v.expiresAt ?? null,
  };
}

export async function listVouchersForBenefits(benefitIds: string[], limit = 50_000): Promise<CatalogVoucher[]> {
  if (benefitIds.length === 0) return [];
  if (supabaseAdmin) {
    const ids = benefitIds.filter(isUuid);
    if (ids.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("vouchers")
      .select("*")
      .in("benefit_id", ids)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw dbError(error, "Não foi possível consultar os vouchers");
    return (data as VoucherRow[]).map(mapVoucherRow);
  }
  const ids = new Set(benefitIds);
  return passStore
    .getVouchers()
    .filter((v) => ids.has(v.benefitId))
    .slice(0, limit)
    .map(mapMemoryVoucher);
}

/** Vouchers do benefício que contam para a quantidade garantida (cancelados não contam). */
export async function countBenefitVouchers(benefitId: string, member?: { userId: string; email: string }): Promise<number> {
  if (supabaseAdmin && isUuid(benefitId)) {
    let query = supabaseAdmin.from("vouchers").select("id", { count: "exact", head: true }).eq("benefit_id", benefitId).neq("status", "cancelled");
    if (member) query = isUuid(member.userId) ? query.eq("user_id", member.userId) : query.eq("user_email", member.email);
    const { count, error } = await query;
    if (error) throw dbError(error, "Não foi possível conferir a disponibilidade");
    return count ?? 0;
  }
  return passStore
    .getVouchers()
    .filter((v) => v.benefitId === benefitId)
    .filter((v) => !member || v.userId === member.userId || v.userEmail.toLowerCase() === member.email.toLowerCase()).length;
}

/**
 * Depois de inserir, confere se o voucher está entre os N primeiros do benefício.
 * Dois resgates simultâneos da última unidade não passam os dois: exatamente N
 * vouchers vencem, e o excedente é removido pelo próprio chamador.
 */
export async function isWithinQuota(benefitId: string, voucherId: string, quantity: number): Promise<boolean> {
  if (!supabaseAdmin || !isUuid(benefitId)) return true;
  const { data, error } = await supabaseAdmin
    .from("vouchers")
    .select("id")
    .eq("benefit_id", benefitId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(quantity);
  if (error) throw dbError(error, "Não foi possível conferir a disponibilidade");
  return (data as Array<{ id: string }>).some((row) => row.id === voucherId);
}

/**
 * Insere com colunas novas e, se a migração ainda não rodou no banco, repete
 * sem elas. Mantém o resgate funcionando durante a janela de deploy.
 */
export async function insertWithOptionalColumns<T>(
  table: "vouchers",
  base: Record<string, unknown>,
  optional: Record<string, unknown>
): Promise<T> {
  if (!supabaseAdmin) throw new PartnerError("Supabase não configurado.", 503);
  const first = await supabaseAdmin.from(table).insert({ ...base, ...optional }).select().single();
  if (!first.error) return first.data as T;
  if (!isMissingColumn(first.error)) throw dbError(first.error, "Não foi possível gerar o voucher");
  const retry = await supabaseAdmin.from(table).insert(base).select().single();
  if (retry.error) throw dbError(retry.error, "Não foi possível gerar o voucher");
  return retry.data as T;
}

/* -------------------------------------------------------------------------- */
/* Idade (somente para métricas agregadas)                                     */
/* -------------------------------------------------------------------------- */

export async function birthDatesFor(userIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const ids = Array.from(new Set(userIds.filter(isUuid)));
  if (!supabaseAdmin || ids.length === 0) return map;
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabaseAdmin.from("profiles").select("id, birth_date").in("id", ids.slice(i, i + 500));
    if (error) {
      // Coluna birth_date ausente em bancos antigos: métricas seguem como "não informado".
      if (isMissingColumn(error)) return map;
      throw dbError(error, "Não foi possível consultar as faixas etárias");
    }
    (data as Array<Pick<ProfileRow, "id" | "birth_date">>).forEach((row) => map.set(row.id, row.birth_date ?? null));
  }
  return map;
}
