// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { DOCUMENT_KINDS, documentRefSchema } from "@/lib/family/types";
import { resubmitDocument } from "@/lib/kyc/identity";
import { bankKycState } from "@/lib/kyc/service";
import { body, familyErrorResponse, invalid, requireUser } from "@/lib/family/http";

const schema = z.object({ kind: z.enum(DOCUMENT_KINDS), document: documentRefSchema });

/**
 * POST /api/bank/kyc/documents — troca um documento que a PRX recusou (ou que
 * faltava), sem refazer a abertura. O arquivo já subiu para a pasta privada do
 * membro (/api/family/uploads); aqui só entra o caminho, conferido no servidor.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const rate = checkRateLimit(`bank_kyc_doc_${user.id}`, 10, 300);
    if (!rate.allowed) throw new PartnerError(`Muitas tentativas. Tente em ${rate.resetInSeconds}s.`, 429);
    const parsed = schema.safeParse(await body(req));
    if (!parsed.success) invalid(parsed.error.issues);
    await resubmitDocument(user, parsed.data.kind, parsed.data.document);
    return NextResponse.json({ success: true, kyc: await bankKycState(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível enviar o documento.");
  }
}
