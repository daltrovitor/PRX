import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { passStore } from "@/lib/pass-store";
import { supabaseAdmin } from "@/lib/supabase/client";
import type { VoucherRow } from "@/lib/db-rows";
import { incidentResponse } from "@/lib/incidents";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    // 1. Try Supabase
    if (supabaseAdmin) {
      let query = supabaseAdmin
        .from("vouchers")
        .select("*")
        .order("created_at", { ascending: false });

      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data: dbVouchers, error } = await query;
      if (!error && dbVouchers) {
        const mapped = dbVouchers.map((v: VoucherRow) => ({
          id: v.id,
          code: v.code,
          benefitId: v.benefit_id,
          benefitTitle: v.benefit_title,
          partnerId: v.partner_id || v.id,
          partnerName: v.partner_name,
          discountLabel: v.discount_label,
          status: v.status,
          qrPayload: v.qr_payload,
          redeemedAt: new Date(v.redeemed_at || v.created_at || Date.now()).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
          terms: v.terms || "Apresente o QR Code no balcão ao pedir a conta.",
          userId: v.user_id,
          userEmail: v.user_email,
          userName: v.user_name,
        }));
        return NextResponse.json({ success: true, vouchers: mapped });
      }
    }

    // 2. Fallback to passStore
    const vouchers = userId
      ? passStore.getUserVouchers(userId)
      : passStore.getVouchers();

    return NextResponse.json({ success: true, vouchers });
  } catch (error) {
    return incidentResponse(error, "Erro ao consultar vouchers.");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { id, status } = body;

    if (!id || !status || !["valid", "used"].includes(status)) {
      return NextResponse.json(
        { error: "Informe o ID e o novo status ('valid' ou 'used')." },
        { status: 400 }
      );
    }

    // 1. Try Supabase
    if (supabaseAdmin) {
      const { data: updated, error } = await supabaseAdmin
        .from("vouchers")
        .update({
          status,
          validated_at: status === "used" ? new Date().toISOString() : null,
        })
        .eq("id", id)
        .select()
        .single();

      if (!error && updated) {
        passStore.updateVoucherStatus(id, status);
        return NextResponse.json({
          success: true,
          message: `Status do voucher alterado para '${status === "used" ? "Utilizado" : "Válido"}'.`,
          voucher: updated,
        });
      }
    }

    // 2. Fallback to passStore
    const updated = passStore.updateVoucherStatus(id, status);
    if (!updated) {
      return NextResponse.json({ error: "Voucher não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Status do voucher ${updated.code} alterado para '${status === "used" ? "Utilizado" : "Válido"}'.`,
      voucher: updated,
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao atualizar voucher.");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID do voucher é obrigatório." }, { status: 400 });
    }

    // 1. Try Supabase
    if (supabaseAdmin) {
      const { error } = await supabaseAdmin.from("vouchers").delete().eq("id", id);
      if (!error) {
        passStore.deleteVoucher(id);
        return NextResponse.json({
          success: true,
          message: "Voucher excluído com sucesso!",
        });
      }
    }

    // 2. Fallback to passStore
    const deleted = passStore.deleteVoucher(id);
    if (!deleted) {
      return NextResponse.json({ error: "Voucher não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Voucher excluído com sucesso!",
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao excluir voucher.");
  }
}
