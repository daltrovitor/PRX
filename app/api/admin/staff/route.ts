// Hello World
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { recordAdminAction } from "@/lib/admin/audit";
import { firstIssue } from "@/lib/partners/types";
import { createStaff, listStaff, staffCreateSchema, staffUpdateSchema, updateStaff } from "@/lib/staff/service";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/staff — equipe PRX. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json({ success: true, staff: await listStaff() }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao listar a equipe.");
  }
}

/**
 * POST /api/admin/staff — cria o login (senha temporária exibida uma única vez)
 * ou vincula uma conta PRX existente à equipe.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = staffCreateSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const { staff, account } = await createStaff(parsed.data);
    await recordAdminAction(
      admin,
      { action: "staff.created", targetType: "staff", targetId: staff.id, summary: `Equipe: ${staff.name} (${staff.email})`, meta: { tickets: staff.canValidateTickets, benefits: staff.canValidateBenefits } },
      req
    );
    return NextResponse.json({ success: true, staff, temporaryPassword: account.temporaryPassword }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao cadastrar o funcionário.");
  }
}

const putSchema = z.object({ id: z.string().min(1) }).and(staffUpdateSchema);

/** PUT /api/admin/staff — permissões, nome e ativação (desativar revoga o login na hora). */
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = putSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const { id, ...patch } = parsed.data;
    const staff = await updateStaff(id, patch);
    await recordAdminAction(admin, { action: "staff.updated", targetType: "staff", targetId: staff.id, summary: `Equipe: ${staff.name}${staff.active ? "" : " (desativado)"}`, meta: patch }, req);
    return NextResponse.json({ success: true, staff }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar o funcionário.");
  }
}
