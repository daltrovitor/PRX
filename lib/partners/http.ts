// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest, verifyPartnerRequest, type SessionPayload } from "@/lib/auth";
import { PartnerError } from "@/lib/partners/errors";
import { TechnicalError } from "@/lib/error-messages";
import { incidentResponse } from "@/lib/incidents";
import { requirePartnerForUser } from "@/lib/partners/service";
import type { Partner } from "@/lib/partners/types";

/**
 * Resposta de erro das rotas. Erro que a pessoa resolve (PartnerError 4xx):
 * a frase do próprio erro. O resto é técnico: "Deu um erro ao fazer isso" com
 * código, e o motivo vai para os logs (lib/incidents.ts). `fallback` descreve a
 * ação para o registro, nunca vai para a tela.
 */
export async function errorResponse(error: unknown, fallback: string): Promise<NextResponse> {
  if (error instanceof PartnerError && error.status < 500) return NextResponse.json({ error: error.message }, { status: error.status });
  return incidentResponse(error, fallback, error instanceof PartnerError ? error.status : undefined);
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new TechnicalError("Corpo da requisição não é JSON válido.", 400);
  }
}

export async function requireAdmin(req: NextRequest): Promise<SessionPayload> {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.adminUser) throw new PartnerError(auth.error || "Acesso negado.", auth.status === 401 ? 401 : 403);
  return auth.adminUser;
}

export async function requirePartnerSession(req: NextRequest): Promise<{ user: SessionPayload & { email: string }; partner: Partner }> {
  const auth = await verifyPartnerRequest(req);
  if (!auth.authorized || !auth.partnerUser) throw new PartnerError(auth.error || "Acesso negado.", auth.status === 401 ? 401 : 403);
  const user = { ...auth.partnerUser, email: (auth.partnerUser.email || "").toLowerCase() };
  return { user, partner: await requirePartnerForUser(user) };
}

/** IP de origem informado pelo proxy da hospedagem (primeiro da cadeia). */
export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "";
  return ip ? ip.slice(0, 64) : null;
}
