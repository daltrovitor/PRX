// Hello World
import { NextRequest, NextResponse } from "next/server";
import { missingForAcceptance } from "@/lib/partners/contract";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, LARGE_JSON_BODY_BYTES, requirePartnerSession } from "@/lib/partners/http";
import { snapshotOf, updateOwnProfile } from "@/lib/partners/service";
import { firstIssue, partnerSelfUpdateSchema, type Partner } from "@/lib/partners/types";

function view(partner: Partner) {
  return {
    id: partner.id,
    tradeName: partner.tradeName,
    legalName: partner.legalName,
    documentType: partner.documentType,
    document: partner.document,
    location: partner.location,
    categoryId: partner.categoryId,
    status: partner.status,
    representative: partner.representative,
    contact: partner.contact,
  };
}

/** GET /api/partner/profile — empresa vinculada ao login e o que falta para aceitar contratos. */
export async function GET(req: NextRequest) {
  try {
    const { partner } = await requirePartnerSession(req);
    return NextResponse.json({ success: true, partner: view(partner), missing: missingForAcceptance(snapshotOf(partner)) });
  } catch (error) {
    return errorResponse(error, "Erro ao consultar o cadastro.");
  }
}

/** PUT /api/partner/profile — o parceiro completa representante e contato operacional. */
export async function PUT(req: NextRequest) {
  try {
    const { partner } = await requirePartnerSession(req);
    const parsed = partnerSelfUpdateSchema.safeParse(await readJson(req, LARGE_JSON_BODY_BYTES));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const updated = await updateOwnProfile(partner, parsed.data);
    return NextResponse.json({
      success: true,
      message: "Cadastro atualizado.",
      partner: view(updated),
      missing: missingForAcceptance(snapshotOf(updated)),
    });
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar o cadastro.");
  }
}
