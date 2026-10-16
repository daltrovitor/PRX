// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/partners/http";
import { PartnerError } from "@/lib/partners/errors";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/family/types";
import { documentViewUrl, readMemoryDocument } from "@/lib/family/documents";
import { documentForReview } from "@/lib/kyc/identity";
import { familyErrorResponse } from "@/lib/family/http";

const PRIVATE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

/**
 * GET /api/admin/bank/identity/document?id=&kind= — abre um documento da
 * abertura para o admin. O caminho do arquivo nunca sai do servidor: cada
 * abertura fica no histórico da análise e vira um link assinado de 60 s.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const id = (req.nextUrl.searchParams.get("id") ?? "").slice(0, 80);
    const kind = req.nextUrl.searchParams.get("kind") ?? "";
    if (!id || !(DOCUMENT_KINDS as readonly string[]).includes(kind)) throw new PartnerError("Documento não encontrado.", 404);
    const doc = await documentForReview(id, kind as DocumentKind, admin.email || admin.sub);
    const memory = readMemoryDocument(doc.path);
    if (memory) return new NextResponse(new Uint8Array(memory.data), { headers: { ...PRIVATE, "Content-Type": memory.type, "Content-Disposition": "inline" } });
    const url = await documentViewUrl(doc.path);
    if (!url) throw new PartnerError("Arquivo indisponível no armazenamento.", 404);
    return NextResponse.redirect(new URL(url, req.nextUrl.origin), { headers: PRIVATE });
  } catch (error) {
    return familyErrorResponse(error, "Erro ao abrir o documento.");
  }
}
