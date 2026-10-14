// Hello World
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { passStore, type SystemVoucher } from "@/lib/pass-store";
import { supabaseAdmin } from "@/lib/supabase/client";
import type { VoucherRow } from "@/lib/db-rows";
import {
  availabilityIssue,
  countBenefitVouchers,
  getBenefit,
  insertWithOptionalColumns,
  isUuid,
  isWithinQuota,
} from "@/lib/partners/catalog";
import { PartnerError } from "@/lib/partners/errors";
import { getPartnerRepository } from "@/lib/partners/repository";
import { assertCanAfford, chargeRedemption } from "@/lib/points/service";
import { incidentResponse } from "@/lib/incidents";

const SHORT_DATE: Intl.DateTimeFormatOptions = {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

function mapExisting(row: VoucherRow, fallback: { partnerId: string; terms: string; userId: string; email: string; name: string }): SystemVoucher {
  return {
    id: row.id,
    code: row.code,
    benefitId: row.benefit_id ?? "",
    benefitTitle: row.benefit_title ?? "",
    partnerId: row.partner_id || fallback.partnerId,
    partnerName: row.partner_name ?? "",
    discountLabel: row.discount_label ?? "",
    status: "valid",
    qrPayload: row.qr_payload ?? "",
    redeemedAt: new Date(row.redeemed_at || row.created_at || Date.now()).toLocaleString("pt-BR", SHORT_DATE),
    terms: row.terms || fallback.terms,
    expiresAt: row.expires_at ?? null,
    userId: row.user_id || fallback.userId,
    userEmail: row.user_email || fallback.email,
    userName: row.user_name || fallback.name,
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const body = await req.json();
    const { benefitId } = body;

    if (!benefitId) {
      return NextResponse.json({ error: "Informe o ID do benefício." }, { status: 400 });
    }

    if (!user) {
      return NextResponse.json({ error: "Entre na sua conta para resgatar benefícios." }, { status: 401 });
    }

    const effectiveUserId = user.id;
    const effectiveEmail = user.email;
    const effectiveName = user.fullName;

    // 1. Benefício sempre lido da fonte (as condições da campanha não podem vir de cache).
    const benefit = await getBenefit(String(benefitId));
    if (!benefit) {
      return NextResponse.json({ error: "Benefício não encontrado." }, { status: 404 });
    }

    // 2. Condições do contrato: parceiro dono, vigência e parceria ativa.
    const unavailable = availabilityIssue(benefit);
    if (unavailable) return NextResponse.json({ error: unavailable }, { status: 409 });
    const partner = await getPartnerRepository().getPartner(benefit.partnerId);
    if (!partner || partner.status === "SUSPENSO" || partner.status === "BLOQUEADO") {
      return NextResponse.json({ error: "Este benefício está indisponível no momento." }, { status: 409 });
    }

    const terms = benefit.terms[0] || "Apresente o QR Code no balcão ao pedir a conta.";
    const fallback = { partnerId: benefit.partnerId, terms, userId: effectiveUserId, email: effectiveEmail, name: effectiveName };

    // 3. Voucher ativo já existente para este benefício.
    const existingStoreVoucher = passStore
      .getUserVouchers(effectiveUserId)
      .find((v) => (v.benefitId === benefit.id || v.benefitTitle === benefit.title) && v.status === "valid");

    if (existingStoreVoucher) {
      return NextResponse.json({
        success: true,
        message: "Você já possui um voucher ativo para este benefício.",
        voucher: existingStoreVoucher,
        alreadyActive: true,
      });
    }

    if (supabaseAdmin) {
      let query = supabaseAdmin.from("vouchers").select("*").eq("status", "valid");
      query = isUuid(benefit.id) ? query.eq("benefit_id", benefit.id) : query.eq("benefit_title", benefit.title);
      query = isUuid(effectiveUserId) ? query.eq("user_id", effectiveUserId) : query.eq("user_email", effectiveEmail);
      const { data: dbExisting } = await query.limit(1).maybeSingle<VoucherRow>();
      if (dbExisting) {
        const mappedExisting = mapExisting(dbExisting, fallback);
        passStore.createVoucher(mappedExisting);
        return NextResponse.json({
          success: true,
          message: "Você já possui um voucher ativo para este benefício.",
          voucher: mappedExisting,
          alreadyActive: true,
        });
      }
    }

    // 4. Limite por membro e quantidade garantida da campanha.
    if (benefit.perUserLimit) {
      const used = await countBenefitVouchers(benefit.id, { userId: effectiveUserId, email: effectiveEmail });
      if (used >= benefit.perUserLimit) {
        return NextResponse.json(
          { error: `Você já usou este benefício ${benefit.perUserLimit === 1 ? "1 vez" : `${benefit.perUserLimit} vezes`}, o limite por membro.` },
          { status: 409 }
        );
      }
    }
    if (benefit.quantity && (await countBenefitVouchers(benefit.id)) >= benefit.quantity) {
      return NextResponse.json({ error: "Este benefício esgotou." }, { status: 409 });
    }

    // 5. PRX Coins: o preço do benefício precisa caber no saldo antes de gerar o voucher.
    const pointsCost = Math.max(0, Math.floor(benefit.pointsCost ?? 0));
    await assertCanAfford(effectiveUserId, pointsCost);

    // 6. Código com gerador criptográfico e prazo de uso da campanha.
    const uniqueCode = `PRX-${crypto.randomInt(1000, 10000)}-${crypto.randomInt(1000, 10000)}`;
    const qrPayload = `PRX_PASS::${uniqueCode}::${benefit.partnerName.replace(/\s+/g, "")}`;
    const now = new Date();
    const expiresAt = benefit.usageDays ? new Date(now.getTime() + benefit.usageDays * 86_400_000).toISOString() : null;

    let createdId: string | undefined;
    if (supabaseAdmin) {
      const base: Record<string, unknown> = {
        code: uniqueCode,
        benefit_title: benefit.title,
        partner_name: benefit.partnerName,
        discount_label: benefit.discountLabel,
        user_email: effectiveEmail,
        user_name: effectiveName,
        status: "valid",
        qr_payload: qrPayload,
        terms,
        redeemed_at: now.toISOString(),
      };
      if (isUuid(benefit.id)) base.benefit_id = benefit.id;
      if (isUuid(effectiveUserId)) base.user_id = effectiveUserId;

      const optional: Record<string, unknown> = { expires_at: expiresAt };
      if (isUuid(benefit.partnerId)) optional.partner_id = benefit.partnerId;

      const inserted = await insertWithOptionalColumns<VoucherRow>("vouchers", base, optional);
      createdId = inserted.id;

      // Resgates simultâneos da última unidade: só os N primeiros ficam.
      if (benefit.quantity && !(await isWithinQuota(benefit.id, inserted.id, benefit.quantity))) {
        await supabaseAdmin.from("vouchers").delete().eq("id", inserted.id);
        return NextResponse.json({ error: "Este benefício esgotou." }, { status: 409 });
      }
    }

    const voucherId = createdId ?? `vouch-${crypto.randomUUID()}`;

    // 7. Débito dos coins e XP de fidelidade (idempotente pelo voucher). Se o saldo mudou
    //    entre a checagem e o débito (duas abas), o voucher recém-criado é desfeito.
    let points: { coins: number; xp: number; level: number } | null = null;
    try {
      const charged = await chargeRedemption(effectiveUserId, benefit, voucherId);
      if (charged) points = { coins: charged.coins, xp: charged.xp, level: charged.level };
    } catch (chargeError) {
      if (supabaseAdmin && createdId) await supabaseAdmin.from("vouchers").delete().eq("id", createdId);
      throw chargeError;
    }

    const newVoucher = passStore.createVoucher({
      id: voucherId,
      code: uniqueCode,
      benefitId: benefit.id,
      benefitTitle: benefit.title,
      partnerId: benefit.partnerId,
      partnerName: benefit.partnerName,
      discountLabel: benefit.discountLabel,
      status: "valid",
      qrPayload,
      redeemedAt: now.toLocaleString("pt-BR", SHORT_DATE),
      createdAtIso: now.toISOString(),
      expiresAt,
      terms,
      userId: effectiveUserId,
      userEmail: effectiveEmail,
      userName: effectiveName,
    });

    return NextResponse.json({
      success: true,
      message: "Benefício resgatado com sucesso!",
      voucher: newVoucher,
      points,
    });
  } catch (error) {
    if (error instanceof PartnerError && error.status < 500) return NextResponse.json({ error: error.message }, { status: error.status });
    return incidentResponse(error, "Erro ao resgatar benefício.");
  }
}
