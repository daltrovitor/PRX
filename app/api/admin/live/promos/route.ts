// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, LARGE_JSON_BODY_BYTES, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { promoInputSchema, promoLabel } from "@/lib/live/promo";
import { createPromo, listPromos, updatePromo } from "@/lib/live/promo-service";
import { getLiveRepository } from "@/lib/live/repository";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/live/promos — cupons/links com conversões e os eventos que podem recebê-los. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const [promos, events] = await Promise.all([listPromos(), getLiveRepository().listEvents({ statuses: ["draft", "published"] })]);
    return NextResponse.json(
      {
        success: true,
        promos,
        events: events.map((e) => ({ id: e.id, title: e.title, status: e.status, startsAt: e.startsAt, batches: e.batches.map((b) => ({ id: b.id, name: b.name, price: b.price })) })),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os cupons.");
  }
}

/** POST /api/admin/live/promos — cria o cupom (nasce inativo, para pré-visualizar antes de divulgar). */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = promoInputSchema.safeParse(await readJson(req, LARGE_JSON_BODY_BYTES));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const promo = await createPromo(parsed.data, admin.email || admin.sub);
    await recordAdminAction(admin, { action: "promo.created", targetType: "promo", targetId: promo.id, summary: `Cupom ${promo.code} (${promoLabel(promo)}) criado`, meta: { eventId: promo.eventId, maxUses: promo.maxUses, active: promo.active } }, req);
    return NextResponse.json({ success: true, promo }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao criar o cupom.");
  }
}

const patchSchema = z.object({
  id: z.string().min(1).max(80),
  active: z.boolean().optional(),
  label: z.string().trim().max(80).optional(),
  endsAt: z.union([z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida."), z.null()]).optional(),
  maxUses: z.union([z.coerce.number().int().min(1).max(100_000), z.null()]).optional(),
  perUserLimit: z.coerce.number().int().min(1).max(20).optional(),
});

/** PUT /api/admin/live/promos — ativa/desativa e ajusta limites e validade (código, evento e valor não mudam). */
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = patchSchema.safeParse(await readJson(req, LARGE_JSON_BODY_BYTES));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const { id, ...patch } = parsed.data;
    const promo = await updatePromo(id, patch);
    await recordAdminAction(admin, { action: "promo.updated", targetType: "promo", targetId: promo.id, summary: `Cupom ${promo.code}: ${promo.active ? "ativo" : "inativo"}`, meta: patch }, req);
    return NextResponse.json({ success: true, promo }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar o cupom.");
  }
}
