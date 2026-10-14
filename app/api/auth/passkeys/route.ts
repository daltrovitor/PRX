// Hello World
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPasskeyRepository } from "@/lib/passkeys/repository";
import { incidentResponse } from "@/lib/incidents";

/** Biometrias cadastradas pelo membro (lista do perfil) e remoção de um aparelho. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  try {
    const passkeys = await getPasskeyRepository().listByUser(user.id);
    return NextResponse.json({ passkeys: passkeys.map(({ id, deviceName, createdAt, lastUsedAt }) => ({ id, deviceName, createdAt, lastUsedAt })) });
  } catch (error) {
    return incidentResponse(error, "Não foi possível carregar suas biometrias.");
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id || id.length > 512) return NextResponse.json({ error: "Biometria inválida." }, { status: 400 });
  try {
    const removed = await getPasskeyRepository().remove(user.id, id);
    return removed ? NextResponse.json({ success: true }) : NextResponse.json({ error: "Biometria não encontrada." }, { status: 404 });
  } catch (error) {
    return incidentResponse(error, "Não foi possível remover a biometria.");
  }
}
