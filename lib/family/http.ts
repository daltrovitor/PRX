// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, type StoredUser } from "@/lib/auth";
import { errorResponse } from "@/lib/partners/http";
import { PartnerError } from "@/lib/partners/errors";
import { FamilyError } from "@/lib/family/service";
import { TechnicalError, userValidationMessage } from "@/lib/error-messages";

/** Erro com o código que a tela usa para decidir o próximo passo (ex.: PARENT_REQUIRED → Conta Pai). */
export async function familyErrorResponse(error: unknown, fallback: string): Promise<NextResponse> {
  if (error instanceof FamilyError && error.status < 500) return NextResponse.json({ error: error.message, code: error.code ?? null }, { status: error.status });
  return errorResponse(error, fallback);
}

export async function requireUser(req: NextRequest): Promise<StoredUser> {
  const user = await getCurrentUser(req);
  if (!user) throw new PartnerError("Entre na sua conta para continuar.", 401);
  return user;
}

export async function body(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new TechnicalError("Corpo da requisição não é JSON válido.", 400);
  }
}

/** Validação que a pessoa resolve (422); padrão do zod (o app mandou dado errado) vira erro técnico com código. */
export function invalid(issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }>): never {
  throw new PartnerError(userValidationMessage(issues[0]), 422);
}
