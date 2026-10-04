// Hello World
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "@/lib/auth";
import { setAdminBankBalance } from "@/lib/bank/repository";
import { errorMessage } from "@/lib/errors";
import { PartnerError } from "@/lib/partners/errors";

const balanceSchema = z.object({
  userId: z.string().min(1, "ID do usuário é obrigatório."),
  balance: z.coerce.number().min(0, "O saldo não pode ser negativo."),
  note: z.string().trim().max(120).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const json = await req.json().catch(() => ({}));
    const parsed = balanceSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }

    const { userId, balance, note } = parsed.data;
    const result = await setAdminBankBalance(userId, balance, note || "Ajuste de saldo administrativo (Sandbox)");

    return NextResponse.json({
      success: true,
      userId,
      balance: result.balance,
      status: result.status,
    });
  } catch (error) {
    if (error instanceof PartnerError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: errorMessage(error) || "Erro ao atualizar saldo." }, { status: 500 });
  }
}
