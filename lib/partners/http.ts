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
const NO_STORE = "no-store, no-cache, must-revalidate";

export async function errorResponse(error: unknown, fallback: string): Promise<NextResponse> {
  if (error instanceof PartnerError && error.status < 500) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": NO_STORE } });
  }
  const res = await incidentResponse(error, fallback, error instanceof PartnerError ? error.status : undefined);
  res.headers.set("Cache-Control", NO_STORE);
  return res;
}

/** Teto padrão do corpo JSON: 1 MB por requisição (anti-DoS por payload gigante). */
export const MAX_JSON_BODY_BYTES = 1_048_576;
/** Rotas cujo schema aceita foto/capa em data URL (até 5 MB de texto): parceiros, eventos, resenha e insiders. */
export const LARGE_JSON_BODY_BYTES = 5_242_880;

function tooLarge(maxBytes: number): PartnerError {
  return new PartnerError(`O envio é grande demais. O máximo é ${Math.round(maxBytes / 1_048_576)} MB.`, 413);
}

/** Lê o corpo aos poucos e aborta ao passar do teto: não carrega um corpo gigante (ou sem Content-Length) inteiro na memória. */
async function readBodyText(req: NextRequest, maxBytes: number): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge(maxBytes);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PartnerError) throw error;
    throw new TechnicalError("Falha ao ler o corpo da requisição.", 400);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJson(req: NextRequest, maxBytes: number = MAX_JSON_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge(maxBytes);
  const text = await readBodyText(req, maxBytes);
  try {
    return JSON.parse(text);
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
