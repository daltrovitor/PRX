import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, verifySessionToken, AUTH_COOKIE_NAME } from "@/lib/auth";
import { reportIncident } from "@/lib/incidents";

export async function GET(req: NextRequest) {
  try {
    let token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (!token) {
      const raw = req.headers.get("cookie") || "";
      const match = raw.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
      if (match) token = match[1];
    }
    if (!token) {
      try {
        const cookieStore = await cookies();
        token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
      } catch {}
    }

    if (!token) {
      return NextResponse.json(
        { authenticated: false, isAdmin: false, error: "Nenhuma sessão ativa." },
        { status: 200 }
      );
    }

    const verification = verifySessionToken(token);
    if (!verification.valid || !verification.payload) {
      return NextResponse.json(
        { authenticated: false, isAdmin: false, error: "Sessão expirada ou inválida." },
        { status: 200 }
      );
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json(
        { authenticated: false, isAdmin: false, error: "Usuário não encontrado." },
        { status: 200 }
      );
    }

    if (currentUser.role !== "admin") {
      return NextResponse.json(
        {
          authenticated: true,
          isAdmin: false,
          error: "Acesso negado. Usuário sem privilégios administrativos.",
          user: {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.fullName,
            role: currentUser.role,
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      isAdmin: true,
      user: {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.fullName,
        role: currentUser.role,
        prxLevel: currentUser.prxLevel,
        prxScore: currentUser.prxScore,
      },
    });
  } catch (error) {
    const { message, code } = await reportIncident(error, "Erro ao consultar sessão administrativa.");
    return NextResponse.json({ authenticated: false, isAdmin: false, error: message, code }, { status: 200 });
  }
}
