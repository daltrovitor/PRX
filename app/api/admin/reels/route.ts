// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { getReelsRepository } from "@/lib/reels/repository";
import { createReel, deleteReel, updateReel } from "@/lib/reels/service";
import { reelInputSchema } from "@/lib/reels/types";

/** Destaques (vídeos de parceiros): listagem com métricas, publicação, edição e exclusão (admin). */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json({ success: true, reels: await getReelsRepository().list() });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os Destaques.");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const parsed = reelInputSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    return NextResponse.json({ success: true, reel: await createReel(parsed.data) });
  } catch (error) {
    return errorResponse(error, "Erro ao publicar o vídeo.");
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await readJson(req);
    const id = z.object({ id: z.string().min(1).max(100) }).safeParse(body);
    if (!id.success) throw new PartnerError("Informe o vídeo.", 400);
    const parsed = reelInputSchema.safeParse(body);
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const { cleanupWarning, cleanupStatus, ...reel } = await updateReel(id.data.id, parsed.data);
    return NextResponse.json({ success: true, reel, cleanupWarning, cleanupStatus });
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar o vídeo.");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new PartnerError("Informe o vídeo.", 400);
    const result = await deleteReel(id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "Erro ao excluir o vídeo.");
  }
}
