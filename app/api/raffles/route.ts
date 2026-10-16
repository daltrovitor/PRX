// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { tableReady } from "@/lib/db-features";
import { enterRaffle, memberRaffles } from "@/lib/raffles/service";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/raffles — sorteios publicados, regras, elegibilidade de quem pede, participações e resultados (com privacidade). */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    if (!(await tableReady("raffles"))) return NextResponse.json({ success: true, raffles: [] }, { headers: NO_STORE });
    return NextResponse.json({ success: true, raffles: await memberRaffles(user.id) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os sorteios.");
  }
}

const schema = z.object({ action: z.literal("enter"), id: z.string().trim().min(1).max(80) });

/** POST /api/raffles — participa (gratuito). Elegibilidade, período e limite por pessoa conferidos no servidor. */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    const limit = checkRateLimit(`raffles:${user.id}`, 20, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const result = await enterRaffle(user.id, parsed.data.id);
    return NextResponse.json({ success: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível participar.");
  }
}
