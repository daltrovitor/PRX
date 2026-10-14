// Hello World
import { NextRequest, NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PASSKEY_CHALLENGE_COOKIE, PasskeyError, challengeCookie, registrationOptions, verifyRegistration } from "@/lib/passkeys/service";
import { incidentResponse } from "@/lib/incidents";

/**
 * Cadastro da biometria neste aparelho. Só com sessão ativa: quem cadastra
 * acabou de provar a senha. GET gera o desafio; POST confere a resposta.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Entre na sua conta para ativar a biometria." }, { status: 401 });
  try {
    const { options, sealed } = await registrationOptions(req, { id: user.id, email: user.email, name: user.fullName });
    const res = NextResponse.json({ options });
    res.cookies.set(challengeCookie(sealed));
    return res;
  } catch (error) {
    return incidentResponse(error, "Não foi possível iniciar o cadastro da biometria.");
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Entre na sua conta para ativar a biometria." }, { status: 401 });
  const rate = checkRateLimit(`passkey_register_${user.id}`, 10, 60);
  if (!rate.allowed) return NextResponse.json({ error: `Muitas tentativas. Tente em ${rate.resetInSeconds}s.` }, { status: 429 });
  try {
    const body = (await req.json().catch(() => null)) as { response?: RegistrationResponseJSON } | null;
    if (!body?.response?.id) return NextResponse.json({ error: "Resposta da biometria ausente." }, { status: 400 });
    const record = await verifyRegistration(req, user.id, req.cookies.get(PASSKEY_CHALLENGE_COOKIE)?.value, body.response);
    const res = NextResponse.json({ success: true, passkey: { id: record.id, deviceName: record.deviceName, createdAt: record.createdAt } });
    res.cookies.set(challengeCookie(""));
    return res;
  } catch (err) {
    const res = err instanceof PasskeyError ? NextResponse.json({ error: err.message }, { status: err.status }) : await incidentResponse(err, "Não foi possível ativar a biometria.");
    res.cookies.set(challengeCookie(""));
    return res;
  }
}
