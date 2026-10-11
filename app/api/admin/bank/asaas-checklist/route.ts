// Hello World
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { asaasEnabled, getAsaasClient } from "@/lib/asaas/client";
import { completeAsaasSandboxChecklist } from "@/lib/bank/asaas/sandbox-checklist";
import { errorMessage } from "@/lib/errors";
import { PartnerError } from "@/lib/partners/errors";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!asaasEnabled()) {
      return NextResponse.json(
        { error: "A integração com o Asaas não está ligada ou configurada neste ambiente." },
        { status: 503 }
      );
    }

    const client = getAsaasClient();
    if (!client) {
      return NextResponse.json(
        { error: "Cliente HTTP do Asaas indisponível." },
        { status: 503 }
      );
    }

    const result = await completeAsaasSandboxChecklist(client);

    return NextResponse.json({
      success: true,
      message: "Checklist do Sandbox Asaas executado: cliente criado, cobrança gerada e pagamento confirmado.",
      result,
    });
  } catch (error) {
    if (error instanceof PartnerError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: errorMessage(error) || "Erro ao executar checklist do Asaas Sandbox." },
      { status: 500 }
    );
  }
}
