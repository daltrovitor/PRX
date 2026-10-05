// Hello World
import type { NextRequest } from "next/server";
import { verifyPartnerRequest, verifyStaffRequest } from "@/lib/auth";
import { PartnerError } from "@/lib/partners/errors";
import { assertPartnerOperational, requirePartnerForUser } from "@/lib/partners/service";
import type { Partner } from "@/lib/partners/types";
import { requireStaffActor } from "@/lib/staff/service";

/**
 * Quem está validando um QR (voucher de benefício ou ingresso de evento).
 * - admin: tudo;
 * - parceiro: só vouchers dos próprios benefícios e ingressos dos eventos ligados a ele;
 * - equipe PRX: conforme as permissões do cadastro (e o evento precisa aceitar a equipe).
 */
export type Validator =
  | { role: "admin"; userId: string; name: string }
  | { role: "partner"; userId: string; name: string; partner: Partner }
  | { role: "staff"; userId: string; name: string; canValidateTickets: boolean; canValidateBenefits: boolean };

async function fromStaffSession(staffUser: Parameters<typeof requireStaffActor>[0]): Promise<Validator> {
  const actor = await requireStaffActor(staffUser);
  if (actor.isAdmin) return { role: "admin", userId: actor.userId, name: actor.name };
  return { role: "staff", userId: actor.userId, name: actor.name, canValidateTickets: actor.canValidateTickets, canValidateBenefits: actor.canValidateBenefits };
}

/** Sessão do portal da equipe (staff.prx.app.br): funcionário ativo ou admin. */
export async function requireStaffValidator(req: NextRequest): Promise<Validator> {
  const auth = await verifyStaffRequest(req);
  if (!auth.authorized || !auth.staffUser) throw new PartnerError(auth.error || "Acesso negado.", auth.status === 401 ? 401 : 403);
  return fromStaffSession(auth.staffUser);
}

/** Sessão do Portal do Parceiro, com a parceria operante. */
export async function requirePartnerValidator(req: NextRequest): Promise<Validator & { role: "partner" }> {
  const auth = await verifyPartnerRequest(req);
  if (!auth.authorized || !auth.partnerUser) throw new PartnerError(auth.error || "Acesso negado.", auth.status === 401 ? 401 : 403);
  const user = { ...auth.partnerUser, email: (auth.partnerUser.email || "").toLowerCase() };
  const partner = await requirePartnerForUser(user);
  assertPartnerOperational(partner);
  return { role: "partner", userId: user.sub, name: partner.tradeName, partner };
}

/** Qualquer validador: tenta equipe/admin e depois parceiro. */
export async function requireValidator(req: NextRequest): Promise<Validator> {
  const staff = await verifyStaffRequest(req);
  if (staff.authorized && staff.staffUser) return fromStaffSession(staff.staffUser);
  if (staff.status === 401) throw new PartnerError(staff.error || "Não autenticado.", 401);
  return requirePartnerValidator(req);
}
