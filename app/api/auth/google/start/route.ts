// Hello World
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { clientIp } from "@/lib/partners/http";
import { GOOGLE_OAUTH_COOKIE, OAUTH_TTL_SECONDS, beginGoogleOAuth, googleOAuthConfig, requestOrigin } from "@/lib/google-oauth";
import { supabaseAdmin } from "@/lib/supabase/client";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/auth/google/start — começa o login com o Google pelo próprio app, para o Google
 * mostrar o endereço do PRX e não o do Supabase. Responde { direct: true, url } quando o servidor
 * tem GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET; sem eles, { direct: false } e o app segue com o
 * Supabase. O cookie assinado guarda state, nonce e PKCE até a volta em /auth/callback.
 */
// nosemgrep: prx-mutation-route-without-auth — início público do login com o Google: só gera o endereço do Google e um cookie assinado
export async function POST(req: NextRequest) {
  const config = googleOAuthConfig();
  if (!config || !supabaseAdmin) return NextResponse.json({ direct: false }, { headers: NO_STORE });

  const rate = checkRateLimit(`google_start_${clientIp(req) ?? "anon"}`, 20, 60);
  if (!rate.allowed) return NextResponse.json({ error: `Muitas tentativas. Tente em ${rate.resetInSeconds}s.` }, { status: 429, headers: NO_STORE });

  const { url, cookie } = beginGoogleOAuth(config, `${requestOrigin(req)}/auth/callback`);
  const response = NextResponse.json({ direct: true, url }, { headers: NO_STORE });
  response.cookies.set({
    name: GOOGLE_OAUTH_COOKIE,
    value: cookie,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_TTL_SECONDS,
  });
  return response;
}
