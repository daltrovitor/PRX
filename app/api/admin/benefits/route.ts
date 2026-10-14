// Hello World
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { passStore } from "@/lib/pass-store";
import { supabaseAdmin } from "@/lib/supabase/client";
import type { BenefitRow } from "@/lib/db-rows";
import { MAX_GATE_LEVEL, type Benefit } from "@/lib/pass-data";
import { getBenefit, mapBenefitRow } from "@/lib/partners/catalog";
import { MIGRATION_HINT, PartnerError, dbError, isMissingColumn } from "@/lib/partners/errors";
import { DEFAULT_PARTNER_FEE_PCT, assessBenefitViability, coinsPerRealFromRules } from "@/lib/points/economics";
import { getRulesRepository } from "@/lib/points/repository";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { getPartnerRepository } from "@/lib/partners/repository";
import { firstIssue, type Partner } from "@/lib/partners/types";

/**
 * Benefícios do catálogo. Todo benefício pertence a um parceiro cadastrado:
 * é esse vínculo que decide quem pode validar o QR Code no balcão.
 * Benefícios de campanha são publicados pelo aceite do contrato; aqui o admin
 * cria benefícios avulsos e ajusta textos e imagens.
 */

const imageUrl = z
  .string()
  .trim()
  .max(5_000_000)
  .refine(
    (v) => v === "" || /^https?:\/\//i.test(v) || /^prx:gz:/i.test(v) || /^data:image\//i.test(v),
    "Use um endereço de imagem válido (http, https ou imagem compactada)."
  )
  .optional();

const benefitSchema = z.object({
  partnerId: z.string().min(1, "Escolha o parceiro dono do benefício."),
  categoryId: z.string().trim().min(1, "Escolha a categoria."),
  title: z.string().trim().min(2, "Informe o título.").max(80),
  description: z.string().trim().max(1000).default(""),
  discountLabel: z.string().trim().min(1, "Informe o rótulo da oferta.").max(24),
  minPrxLevel: z.coerce.number().int().min(1).max(MAX_GATE_LEVEL).default(1),
  partnerLocation: z.string().trim().max(160).optional(),
  partnerLogo: imageUrl,
  partnerBanner: imageUrl,
  terms: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  /** Economia PRX: preço em coins e números internos da calculadora de viabilidade. */
  pointsCost: z.coerce.number().int("Coins precisam ser inteiros.").min(0).max(1_000_000).default(0),
  costPrice: z.coerce.number().min(0).max(100_000).default(0),
  prxRevenuePerRedemption: z.coerce.number().min(0).max(100_000).default(0),
  partnerFeePct: z.coerce.number().min(0).max(100).default(DEFAULT_PARTNER_FEE_PCT),
});

// Na edição, campo ausente fica como está: sem os defaults do cadastro (o partial do zod 4 os aplicaria).
const updateSchema = benefitSchema.partial().extend({
  id: z.string().min(1),
  description: z.string().trim().max(1000).optional(),
  minPrxLevel: z.coerce.number().int().min(1).max(MAX_GATE_LEVEL).optional(),
  terms: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
  pointsCost: z.coerce.number().int("Coins precisam ser inteiros.").min(0).max(1_000_000).optional(),
  costPrice: z.coerce.number().min(0).max(100_000).optional(),
  prxRevenuePerRedemption: z.coerce.number().min(0).max(100_000).optional(),
  partnerFeePct: z.coerce.number().min(0).max(100).optional(),
});

type Economics = Pick<Benefit, "pointsCost" | "costPrice" | "prxRevenuePerRedemption" | "partnerFeePct">;

/**
 * Blindagem do caixa: nenhum benefício é publicado ou alterado com margem
 * projetada abaixo do mínimo (30% sobre o custo). Benefícios sem custo passam.
 */
async function assertViable(economics: Economics): Promise<void> {
  const rules = await getRulesRepository().listRules();
  const result = assessBenefitViability({
    costPrice: economics.costPrice ?? 0,
    revenuePerRedemption: economics.prxRevenuePerRedemption ?? 0,
    partnerFeePct: economics.partnerFeePct ?? DEFAULT_PARTNER_FEE_PCT,
    coinsPerReal: coinsPerRealFromRules(rules),
    pointsCost: economics.pointsCost ?? 0,
  });
  if (result.status === "ok") return;
  const hint = result.suggestedPoints === null ? " Aumente a receita por resgate ou a comissão do parceiro." : ` Preço mínimo sugerido: ${result.suggestedPoints.toLocaleString("pt-BR")} PRX Coins.`;
  throw new PartnerError(`Benefício bloqueado pela calculadora de viabilidade. ${result.message}${hint}`, 422);
}

function writeError(error: { code?: string; message?: string }, fallback: string): ReturnType<typeof dbError> {
  if (isMissingColumn(error)) return new PartnerError(MIGRATION_HINT, 503);
  return dbError(error, fallback);
}

async function requirePartner(partnerId: string): Promise<Partner> {
  const partner = await getPartnerRepository().getPartner(partnerId);
  if (!partner) throw new PartnerError("Parceiro não encontrado. Cadastre-o na aba Parceiros.", 404);
  return partner;
}

function toRow(input: Partial<z.infer<typeof benefitSchema>>, partner?: Partner): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (partner) {
    row.partner_id = partner.id;
    row.partner_name = partner.tradeName;
    row.partner_location = input.partnerLocation?.trim() || partner.location;
    row.partner_logo = input.partnerLogo?.trim() || partner.logoUrl || null;
    row.partner_banner = input.partnerBanner?.trim() || partner.bannerUrl || null;
  } else {
    if (input.partnerLocation !== undefined) row.partner_location = input.partnerLocation.trim();
    if (input.partnerLogo !== undefined) row.partner_logo = input.partnerLogo.trim() || null;
    if (input.partnerBanner !== undefined) row.partner_banner = input.partnerBanner.trim() || null;
  }
  if (input.categoryId !== undefined) row.category_id = input.categoryId;
  if (input.title !== undefined) row.title = input.title;
  if (input.description !== undefined) row.description = input.description;
  if (input.discountLabel !== undefined) row.discount_label = input.discountLabel;
  if (input.minPrxLevel !== undefined) row.min_nxt_level = input.minPrxLevel;
  if (input.terms !== undefined) row.terms = input.terms.length > 0 ? input.terms : ["Apresente o QR Code no balcão."];
  if (input.pointsCost !== undefined) row.points_cost = input.pointsCost;
  if (input.costPrice !== undefined) row.cost_price = input.costPrice;
  if (input.prxRevenuePerRedemption !== undefined) row.prx_revenue_per_redemption = input.prxRevenuePerRedemption;
  if (input.partnerFeePct !== undefined) row.partner_fee_pct = input.partnerFeePct;
  return row;
}

function rowToMemory(row: Record<string, unknown>): Partial<Benefit> {
  const out: Partial<Benefit> = {};
  if ("partner_id" in row) out.partnerId = String(row.partner_id);
  if ("partner_name" in row) out.partnerName = String(row.partner_name);
  if ("partner_location" in row) out.partnerLocation = String(row.partner_location ?? "");
  if ("partner_logo" in row) out.partnerLogo = String(row.partner_logo ?? "");
  if ("partner_banner" in row) out.partnerBanner = String(row.partner_banner ?? "");
  if ("category_id" in row) out.categoryId = String(row.category_id);
  if ("title" in row) out.title = String(row.title);
  if ("description" in row) out.description = String(row.description ?? "");
  if ("discount_label" in row) out.discountLabel = String(row.discount_label);
  if ("min_nxt_level" in row) out.minPrxLevel = Number(row.min_nxt_level);
  if ("terms" in row) out.terms = row.terms as string[];
  if ("points_cost" in row) out.pointsCost = Number(row.points_cost);
  if ("cost_price" in row) out.costPrice = Number(row.cost_price);
  if ("prx_revenue_per_redemption" in row) out.prxRevenuePerRedemption = Number(row.prx_revenue_per_redemption);
  if ("partner_fee_pct" in row) out.partnerFeePct = Number(row.partner_fee_pct);
  return out;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from("benefits").select("*").order("created_at", { ascending: false });
      if (error) throw dbError(error, "Erro ao consultar benefícios");
      const mapped = (data as BenefitRow[]).map(mapBenefitRow);
      passStore.setBenefits(mapped);
      return NextResponse.json({ success: true, benefits: mapped });
    }
    return NextResponse.json({ success: true, benefits: passStore.getBenefits() });
  } catch (error) {
    return errorResponse(error, "Erro ao consultar benefícios.");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const parsed = benefitSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const partner = await requirePartner(parsed.data.partnerId);
    await assertViable(parsed.data);
    const row = toRow(parsed.data, partner);

    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from("benefits").insert({ ...row, is_active: true }).select("*").single();
      if (error) throw writeError(error, "Não foi possível criar o benefício");
      const benefit = mapBenefitRow(data as BenefitRow);
      passStore.createBenefit(benefit);
      return NextResponse.json({ success: true, message: "Benefício criado.", benefit });
    }

    const benefit = passStore.createBenefit({
      ...(rowToMemory(row) as Omit<Benefit, "id">),
      visibilityPlan: "basico",
      sponsored: false,
    });
    return NextResponse.json({ success: true, message: "Benefício criado.", benefit });
  } catch (error) {
    return errorResponse(error, "Erro ao criar benefício.");
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
    const parsed = updateSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const { id, ...updates } = parsed.data;
    const partner = updates.partnerId ? await requirePartner(updates.partnerId) : undefined;
    const touchesEconomics = (["pointsCost", "costPrice", "prxRevenuePerRedemption", "partnerFeePct"] as const).some((key) => updates[key] !== undefined);
    if (touchesEconomics) {
      const current = await getBenefit(id);
      if (!current) throw new PartnerError("Benefício não encontrado.", 404);
      await assertViable({
        pointsCost: updates.pointsCost ?? current.pointsCost,
        costPrice: updates.costPrice ?? current.costPrice,
        prxRevenuePerRedemption: updates.prxRevenuePerRedemption ?? current.prxRevenuePerRedemption,
        partnerFeePct: updates.partnerFeePct ?? current.partnerFeePct,
      });
    }
    const row = toRow(updates, partner);

    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from("benefits").update(row).eq("id", id).select("*").maybeSingle();
      if (error) throw writeError(error, "Não foi possível atualizar o benefício");
      if (!data) throw new PartnerError("Benefício não encontrado.", 404);
      const benefit = mapBenefitRow(data as BenefitRow);
      passStore.updateBenefit(id, benefit);
      return NextResponse.json({ success: true, message: "Benefício atualizado.", benefit });
    }

    const benefit = passStore.updateBenefit(id, rowToMemory(row));
    if (!benefit) throw new PartnerError("Benefício não encontrado.", 404);
    return NextResponse.json({ success: true, message: "Benefício atualizado.", benefit });
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar benefício.");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new PartnerError("ID do benefício é obrigatório.", 400);

    // Excluir apagaria os vouchers em cascata: a campanha é encerrada pelo cancelamento.
    const current = await getBenefit(id);
    if (current?.campaignId) {
      throw new PartnerError("Benefício de campanha contratada: encerre pela campanha, na aba Parceiros.", 409);
    }

    if (supabaseAdmin) {
      const { error } = await supabaseAdmin.from("benefits").delete().eq("id", id);
      if (error) throw dbError(error, "Não foi possível excluir o benefício");
      passStore.deleteBenefit(id);
      return NextResponse.json({ success: true, message: "Benefício removido." });
    }

    if (!passStore.deleteBenefit(id)) throw new PartnerError("Benefício não encontrado.", 404);
    return NextResponse.json({ success: true, message: "Benefício removido." });
  } catch (error) {
    return errorResponse(error, "Erro ao excluir benefício.");
  }
}
