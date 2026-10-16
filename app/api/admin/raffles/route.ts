// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { pageParams } from "@/lib/admin/paging";
import { memberContacts } from "@/lib/admin/members";
import { getRafflesRepository } from "@/lib/raffles/repository";
import { cancelRaffle, closeRaffle, drawRaffle, publishRaffle, saveRaffle, setPaused } from "@/lib/raffles/service";
import type { Raffle } from "@/lib/raffles/types";

const NO_STORE = { "Cache-Control": "no-store, private" };

/** A semente só aparece para o admin depois do sorteio (antes, nem ele vê: o compromisso fica de pé). */
const safe = (r: Raffle) => ({ ...r, seed: r.status === "drawn" ? r.seed : null });

/**
 * GET /api/admin/raffles            sorteios (paginados)
 * GET /api/admin/raffles?id=…       detalhe, participações (com nome e e-mail) e histórico
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const repo = getRafflesRepository();
    const params = req.nextUrl.searchParams;
    const id = params.get("id");
    if (id) {
      const raffle = await repo.get(id.slice(0, 80));
      if (!raffle) throw new PartnerError("Sorteio não encontrado.", 404);
      const [entries, events] = await Promise.all([repo.allEntries(raffle.id), repo.events(raffle.id)]);
      const contacts = await memberContacts(entries.map((e) => e.userId));
      const rows = entries.slice(0, 500).map((e) => ({ ...e, name: contacts.get(e.userId)?.name ?? "Conta excluída", email: contacts.get(e.userId)?.email ?? "" }));
      return NextResponse.json({ success: true, raffle: safe(raffle), entries: rows, entriesTotal: entries.length, events }, { headers: NO_STORE });
    }
    const { page, pageSize } = pageParams(params, 20);
    const result = await repo.list({ offset: (page - 1) * pageSize, limit: pageSize });
    const counts = await Promise.all(result.items.map((r) => repo.countEntries(r.id)));
    return NextResponse.json({ success: true, items: result.items.map((r, i) => ({ ...safe(r), entries: counts[i] })), total: result.total, page, pageSize }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os sorteios.");
  }
}

const id = z.string().trim().min(1).max(80);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: id.optional(), data: z.unknown() }),
  z.object({ action: z.literal("publish"), id, acknowledged: z.boolean() }),
  z.object({ action: z.literal("pause"), id }),
  z.object({ action: z.literal("resume"), id }),
  z.object({ action: z.literal("close"), id }),
  z.object({ action: z.literal("draw"), id, publicEntropy: z.string().max(200).default("") }),
  z.object({ action: z.literal("cancel"), id, reason: z.string().max(500) }),
  z.object({ action: z.literal("delete"), id }),
]);

/** POST /api/admin/raffles — criar/editar, publicar (com aceite legal), pausar, retomar, encerrar, sortear, cancelar, excluir rascunho. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    const actor = admin.email || admin.sub;
    let raffle: Raffle | null = null;
    switch (body.action) {
      case "save":
        raffle = await saveRaffle(body.data, actor, body.id);
        break;
      case "publish":
        raffle = await publishRaffle(body.id, body.acknowledged, actor);
        break;
      case "pause":
      case "resume":
        raffle = await setPaused(body.id, body.action === "pause", actor);
        break;
      case "close":
        raffle = await closeRaffle(body.id, actor);
        break;
      case "draw":
        raffle = await drawRaffle(body.id, body.publicEntropy, actor);
        break;
      case "cancel":
        raffle = await cancelRaffle(body.id, body.reason, actor);
        break;
      case "delete": {
        const current = await getRafflesRepository().get(body.id);
        if (current && current.status !== "draft") throw new PartnerError("Só rascunhos podem ser excluídos. Cancele o sorteio publicado.", 409);
        await getRafflesRepository().remove(body.id);
        break;
      }
    }
    const targetId = raffle?.id ?? ("id" in body ? (body.id ?? "") : "");
    await recordAdminAction(admin, { action: `raffles.${body.action}`, targetType: "raffle", targetId, summary: `Sorteio ${raffle?.title ?? ""}: ${body.action}` }, req);
    return NextResponse.json({ success: true, raffle: raffle ? safe(raffle) : null }, { status: body.action === "save" && !body.id ? 201 : 200, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao salvar o sorteio.");
  }
}
