// Hello World
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, LARGE_JSON_BODY_BYTES, requireAdmin } from "@/lib/partners/http";
import { createPartner, listPartnersOverview, updatePartner } from "@/lib/partners/service";
import { firstIssue, partnerInputSchema } from "@/lib/partners/types";

const accessSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("link"), email: z.email("E-mail de acesso inválido.") }),
  z.object({ mode: z.literal("create"), email: z.email("E-mail de acesso inválido."), name: z.string().trim().min(2).max(120) }),
]);

const createSchema = z.object({ partner: partnerInputSchema, access: accessSchema.default({ mode: "none" }) });
const updateSchema = z.object({ id: z.string().min(1), partner: partnerInputSchema });

/** GET /api/admin/partners — parceiros com contagem de benefícios e campanhas. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json({ success: true, partners: await listPartnersOverview() });
  } catch (error) {
    return errorResponse(error, "Erro ao listar parceiros.");
  }
}

/** POST /api/admin/partners — cadastra empresa, representante e (opcional) login. */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const parsed = createSchema.safeParse(await readJson(req, LARGE_JSON_BODY_BYTES));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const { partner: input, access } = parsed.data;
    const { partner, account } = await createPartner(input, access.mode === "none" ? undefined : access);
    return NextResponse.json({
      success: true,
      message: `Parceiro ${partner.tradeName} cadastrado.`,
      partner,
      temporaryPassword: account?.temporaryPassword,
    });
  } catch (error) {
    return errorResponse(error, "Erro ao cadastrar parceiro.");
  }
}

/** PUT /api/admin/partners — atualiza dados societários, representante, contato e status. */
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
    const parsed = updateSchema.safeParse(await readJson(req, LARGE_JSON_BODY_BYTES));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const partner = await updatePartner(parsed.data.id, parsed.data.partner);
    return NextResponse.json({ success: true, message: `Parceiro ${partner.tradeName} atualizado.`, partner });
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar parceiro.");
  }
}
