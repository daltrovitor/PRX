// Hello World
import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { addInsider, adminOverview, adminRequests, createEdition, createInsider, decideInsiderSignup, resetInsiderPassword, setEditionStatus, setInsiderActive, updateEdition, updateInsiderProfile, updateParticipation } from "@/lib/resenha/admin";
import { sendListEmail } from "@/lib/resenha/notify";
import { decideRequest } from "@/lib/resenha/service";
import { baseUrlFor } from "@/lib/resenha/session";
import { EDITION_STATUSES, INSIDER_KINDS, decisionSchema, editionInputSchema, insiderInputSchema, insiderProfileSchema } from "@/lib/resenha/types";

const NO_STORE = { "Cache-Control": "no-store" };
const insiderCreateSchema = insiderProfileSchema.extend({ mode: z.enum(["create", "link"]).default("create"), email: insiderInputSchema.shape.email });

/** GET /api/admin/resenha[?edition=<id>] — edições, Insiders e cotas; com `edition`, também os pedidos dela. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const editionId = req.nextUrl.searchParams.get("edition");
    const [overview, requests] = await Promise.all([adminOverview(baseUrlFor(req.headers)), editionId ? adminRequests(editionId) : Promise.resolve(null)]);
    return NextResponse.json({ success: true, ...overview, requests }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar a Resenha.");
  }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_edition"), edition: z.unknown() }),
  z.object({ action: z.literal("update_edition"), id: z.string().min(1), edition: z.unknown() }),
  z.object({ action: z.literal("set_status"), id: z.string().min(1), status: z.enum(EDITION_STATUSES) }),
  z.object({ action: z.literal("add_insider"), editionId: z.string().min(1), insider: z.unknown() }),
  z.object({
    action: z.literal("update_participation"),
    id: z.string().min(1),
    quota: z.coerce.number().int().min(0).max(500).optional(),
    active: z.boolean().optional(),
    kind: z.enum(INSIDER_KINDS).optional(),
  }),
  z.object({ action: z.literal("create_insider"), insider: z.unknown() }),
  z.object({ action: z.literal("update_insider"), insiderId: z.string().min(1), insider: z.unknown() }),
  z.object({ action: z.literal("reset_insider_password"), insiderId: z.string().min(1) }),
  z.object({ action: z.literal("decide_insider"), insiderId: z.string().min(1), decision: z.enum(["approve", "reject"]) }),
  z.object({ action: z.literal("set_insider_active"), insiderId: z.string().min(1), active: z.boolean() }),
  z.object({ action: z.literal("decide_request"), requestId: z.string().min(1), decision: decisionSchema.shape.action }),
]);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PartnerError(firstIssue(result.error), 422);
  return result.data;
}

/** POST /api/admin/resenha — cria e ajusta edições, cadastra Insiders com cota e decide pedidos no lugar do Insider. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const actor = admin.email || admin.sub;
    const body = bodySchema.safeParse(await readJson(req));
    if (!body.success) throw new PartnerError(firstIssue(body.error), 400);
    const input = body.data;
    const baseUrl = baseUrlFor(req.headers);
    let temporaryPassword: string | null = null;

    switch (input.action) {
      case "create_edition":
        await createEdition(parse(editionInputSchema, input.edition), actor);
        break;
      case "update_edition":
        await updateEdition(input.id, parse(editionInputSchema, input.edition));
        break;
      case "set_status":
        await setEditionStatus(input.id, input.status);
        break;
      case "add_insider":
        temporaryPassword = (await addInsider(input.editionId, parse(insiderInputSchema, input.insider))).temporaryPassword;
        break;
      case "create_insider": {
        const data = parse(insiderCreateSchema, input.insider);
        temporaryPassword = (await createInsider(data)).temporaryPassword;
        break;
      }
      case "update_insider":
        await updateInsiderProfile(input.insiderId, parse(insiderProfileSchema, input.insider));
        break;
      case "reset_insider_password":
        temporaryPassword = (await resetInsiderPassword(input.insiderId)).temporaryPassword;
        break;
      case "update_participation":
        await updateParticipation(input.id, { quota: input.quota, active: input.active, kind: input.kind });
        break;
      case "decide_insider":
        await decideInsiderSignup(input.insiderId, input.decision);
        break;
      case "set_insider_active":
        await setInsiderActive(input.insiderId, input.active);
        break;
      case "decide_request": {
        const { notice } = await decideRequest({ kind: "admin", label: `admin:${actor}` }, input.requestId, input.decision);
        if (notice) after(() => sendListEmail({ ...notice, baseUrl }));
        break;
      }
    }
    return NextResponse.json({ success: true, temporaryPassword, ...(await adminOverview(baseUrl)) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao salvar a Resenha.");
  }
}
