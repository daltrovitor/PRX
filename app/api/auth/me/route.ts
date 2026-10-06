// Hello World
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, AUTH_COOKIE_NAME } from "@/lib/auth";
import { bankAccountIsActive } from "@/lib/bank/lock";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    // Visitante sem sessão não é erro: 200 com user null evita ruído no console do navegador.
    return NextResponse.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const cookieStore = await cookies();
  const rememberMe = cookieStore.get("prx_remember")?.value !== "0";
  // Conta PRX BANK aberta e funcionando: a cada entrada no app pede senha ou biometria (lib/lock.ts).
  const requiresUnlock = user.role === "user" && (await bankAccountIsActive(user.id));

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role,
      prxScore: user.prxScore,
      prxLevel: user.prxLevel,
      walletBalance: user.walletBalance,
      avatarUrl: user.avatarUrl,
      cpf: user.cpf,
      phone: user.phone,
    },
    rememberMe,
    requiresUnlock,
  }, { headers: { "Cache-Control": "no-store" } });
}

// nosemgrep: prx-mutation-route-without-auth — POST só apaga o cookie da própria sessão
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
