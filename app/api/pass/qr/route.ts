// Hello World
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { checkRateLimit } from "@/lib/security";
import { findVoucher } from "@/lib/validation/vouchers";
import { issuePassQr } from "@/lib/pass/dynamic-qr";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * POST /api/pass/qr — QR Code dinâmico do voucher do próprio membro.
 * body: { code: "PRX-1234-5678" }. Devolve o conteúdo do QR da janela atual,
 * os 6 dígitos do momento e até quando valem. Só o titular recebe.
 */
// nosemgrep: prx-mutation-route-without-auth — sessão do membro conferida em getCurrentUser; não grava nada
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Entre na sua conta para ver o voucher.", 401);
    const rate = checkRateLimit(`pass-qr:${user.id}`, 30, 60);
    if (!rate.allowed) throw new PartnerError(`Muitas atualizações seguidas. Aguarde ${rate.resetInSeconds}s.`, 429);

    const body = (await readJson(req)) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase().slice(0, 40) : "";
    if (!/^PRX-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new PartnerError("Voucher inválido.", 400);

    const voucher = await findVoucher(code, code);
    const owns = voucher && (voucher.userId === user.id || (voucher.userEmail && voucher.userEmail.toLowerCase() === user.email.toLowerCase()));
    // Voucher de outra pessoa responde igual a inexistente.
    if (!voucher || !owns) throw new PartnerError("Voucher não encontrado.", 404);
    if (voucher.status === "used") return NextResponse.json({ success: false, state: "used", error: "Este voucher já foi utilizado." }, { status: 409, headers: NO_STORE });
    if (voucher.expiresAt && Date.now() > new Date(voucher.expiresAt).getTime()) {
      return NextResponse.json({ success: false, state: "expired", error: "Este voucher expirou." }, { status: 409, headers: NO_STORE });
    }

    const token = issuePassQr({ id: voucher.id, code: voucher.code, userId: voucher.userId });
    return NextResponse.json({ success: true, state: "valid", serverTime: new Date().toISOString(), ...token }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível gerar o QR Code agora.");
  }
}
