// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, revokeAllSessions, verifySessionToken } from "@/lib/auth";

// nosemgrep: prx-mutation-route-without-auth — logout só apaga o cookie da própria sessão (e, se pedido, revoga as da própria conta)
export async function POST(req: NextRequest) {
  // { "allDevices": true }: invalida também as sessões abertas em outros aparelhos (pentest H5).
  const body = (await req.json().catch(() => null)) as { allDevices?: unknown } | null;
  if (body?.allDevices === true) {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? verifySessionToken(token) : null;
    if (session?.valid && session.payload?.sub) await revokeAllSessions(session.payload.sub);
  }

  const response = NextResponse.json({ success: true, message: "Sessão encerrada com sucesso." });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    path: "/",
    expires: new Date(0),
  });
  response.cookies.set({
    name: "prx_remember",
    value: "",
    path: "/",
    expires: new Date(0),
  });

  try {
    const cookieStore = await cookies();
    for (const c of cookieStore.getAll()) {
      if (c.name.startsWith("sb-")) {
        response.cookies.set({
          name: c.name,
          value: "",
          path: "/",
          expires: new Date(0),
        });
      }
    }
  } catch {
    // Ignore
  }

  return response;
}
