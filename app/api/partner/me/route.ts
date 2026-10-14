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
        { authenticated: false, isPartner: false, error: "Nenhuma sessão ativa." },
        { status: 200 }
      );
    }

    const verification = verifySessionToken(token);
    if (!verification.valid || !verification.payload) {
      return NextResponse.json(
        { authenticated: false, isPartner: false, error: "Sessão expirada ou inválida." },
        { status: 200 }
      );
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json(
        { authenticated: false, isPartner: false, error: "Usuário não encontrado." },
        { status: 200 }
      );
    }

    if (currentUser.role !== "partner") {
      return NextResponse.json(
        {
          authenticated: true,
          isPartner: false,
          error: "Acesso negado. Apenas parceiros credenciados podem acessar este portal.",
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
      isPartner: true,
      user: {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.fullName,
        role: currentUser.role,
        avatarUrl: currentUser.avatarUrl,
      },
    });
  } catch (error) {
    const { message, code } = await reportIncident(error, "Erro ao consultar sessão do parceiro.");
    return NextResponse.json({ authenticated: false, isPartner: false, error: message, code }, { status: 200 });
  }
}
