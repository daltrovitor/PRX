// Hello World
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { findMemberById } from "@/lib/members/member-code";
import { insiderForUser, insiderRecordForUser } from "@/lib/resenha/access";
import { resenhaBaseUrl } from "@/lib/resenha/config";
import { insiderEditions } from "@/lib/resenha/service";
import type { InsiderEditionView } from "@/lib/resenha/types";

/** Estado do portal do Insider: o mesmo para a página (servidor) e para /api/insider/me. */
export type InsiderAuthResult =
  | { status: "authenticated"; insider: { name: string; email: string; handle: string; avatarUrl: string }; editions: InsiderEditionView[] }
  | { status: "unauthenticated" }
  | { status: "denied"; message: string };

export const NOT_INSIDER = "Esta conta não é de um Insider. Fale com a equipe PRX.";
export const INSIDER_PENDING = "Seu cadastro de Insider foi enviado e está aguardando a aprovação da equipe PRX. Assim que for aprovado, é só entrar aqui.";
export const INSIDER_REJECTED = "Seu cadastro de Insider não foi aprovado. Fale com a equipe PRX.";

/** Por que a conta não entra no portal: aguardando aprovação, recusada ou sem cadastro. */
export async function insiderDenial(user: { id: string; email?: string }): Promise<string> {
  const record = await insiderRecordForUser({ id: user.id, email: user.email ?? "" });
  if (record?.status === "pending") return INSIDER_PENDING;
  if (record?.status === "rejected") return INSIDER_REJECTED;
  return NOT_INSIDER;
}

/** Base pública a partir do host da requisição (insider.prx.app.br → prx.app.br). */
export function baseUrlFor(headers: Pick<Headers, "get">): string {
  return resenhaBaseUrl(headers.get("host"));
}

export async function resolveInsiderAuth(baseUrl: string, req?: NextRequest): Promise<InsiderAuthResult> {
  const user = await getCurrentUser(req);
  if (!user) return { status: "unauthenticated" };
  const insider = await insiderForUser(user);
  if (!insider) return { status: "denied", message: await insiderDenial(user) };
  return { status: "authenticated", insider: { name: insider.name, email: insider.email, handle: insider.handle, avatarUrl: insider.avatarUrl || (await findMemberById(insider.userId))?.avatarUrl || "" }, editions: await insiderEditions(insider, baseUrl) };
}
