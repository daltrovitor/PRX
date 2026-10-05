// Hello World
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { insiderForUser } from "@/lib/resenha/access";
import { resenhaBaseUrl } from "@/lib/resenha/config";
import { insiderEditions } from "@/lib/resenha/service";
import type { InsiderEditionView } from "@/lib/resenha/types";

/** Estado do portal do Insider: o mesmo para a página (servidor) e para /api/insider/me. */
export type InsiderAuthResult =
  | { status: "authenticated"; insider: { name: string; email: string; handle: string }; editions: InsiderEditionView[] }
  | { status: "unauthenticated" }
  | { status: "denied"; message: string };

export const NOT_INSIDER = "Esta conta não é de um Insider. Fale com a equipe PRX.";

/** Base pública a partir do host da requisição (insider.prx.app.br → prx.app.br). */
export function baseUrlFor(headers: Pick<Headers, "get">): string {
  return resenhaBaseUrl(headers.get("host"));
}

export async function resolveInsiderAuth(baseUrl: string, req?: NextRequest): Promise<InsiderAuthResult> {
  const user = await getCurrentUser(req);
  if (!user) return { status: "unauthenticated" };
  const insider = await insiderForUser(user);
  if (!insider) return { status: "denied", message: NOT_INSIDER };
  return { status: "authenticated", insider: { name: insider.name, email: insider.email, handle: insider.handle }, editions: await insiderEditions(insider, baseUrl) };
}
