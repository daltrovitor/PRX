// Hello World
import { NextRequest, NextResponse } from "next/server";
import { baseUrlFor, resolveInsiderAuth } from "@/lib/resenha/session";

/** GET /api/insider/me — sessão do portal e as Resenhas do Insider. Sempre 200, com o motivo quando não há acesso. */
export async function GET(req: NextRequest) {
  const auth = await resolveInsiderAuth(baseUrlFor(req.headers), req);
  return NextResponse.json(auth, { headers: { "Cache-Control": "no-store" } });
}
