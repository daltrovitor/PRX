// Hello World
import { pgQuote } from "@/lib/postgrest";
import { PartnerError } from "@/lib/partners/errors";
import { supabaseAdmin } from "@/lib/supabase/client";
import { isUuid } from "@/lib/partners/catalog";
import { loadSessionUser, userStore, type StoredUser } from "@/lib/auth";
import { createAccount, discardAccount } from "@/lib/accounts";
import { accountView, sandboxEnabled } from "@/lib/bank/service";
import { sandboxCredit } from "@/lib/bank/repository";
import { getWallet } from "@/lib/points/service";
import { memberWallet } from "@/lib/live/service";
import { passStore, type SystemVoucher } from "@/lib/pass-store";
import { ACTIVATION_REQUIRED, type BankTransaction } from "@/lib/prx/bank";
import { ageGroup, ageOn, allowancePeriodKey, nextAllowanceRun } from "@/lib/family/age";
import { ownsDocument } from "@/lib/family/documents";
import { getFamilyRepository } from "@/lib/family/repository";
import {
  CPF_TAKEN_MESSAGE,
  DEFAULT_MINOR_LIMITS,
  DOCUMENT_LABEL,
  MIN_ACCOUNT_AGE,
  OVER_AGE_MESSAGE,
  PARENTAL_CONSENT_VERSION,
  type GuardianConsent,
  PARENT_REQUIRED_MESSAGE,
  UNDER_AGE_MESSAGE,
  missingParentDocuments,
  type Allowance,
  type AllowanceInput,
  type DocumentRef,
  type EmancipationRequest,
  type FamilyIdentity,
  type FamilyLink,
  type IdentityInput,
  type ParentApplication,
  type ParentApplicationInput,
  type SpendingLimits,
} from "@/lib/family/types";

/*
 * Regras das contas de família.
 *  - Antes de existir conta: idade (horário de Brasília) e CPF único.
 *  - <12: sem conta (mesmo com o responsável). 12–15: só pela Conta Pai. 16–17: Conta Filho (vinculada) ou emancipação com documentos.
 *  - Conta Pai: controle, segurança e mesada. Não guarda dinheiro nem rende.
 *  - Menores: limites de gasto definidos pelo responsável, conferidos no servidor.
 */

const repo = () => getFamilyRepository();

export type MemberRef = Pick<StoredUser, "id" | "email" | "fullName">;

export class FamilyError extends PartnerError {
  constructor(
    message: string,
    status: ConstructorParameters<typeof PartnerError>[1] = 400,
    readonly code?: "PARENT_REQUIRED" | "UNDER_AGE" | "OVER_AGE" | "CPF_TAKEN" | "TEEN_PATH_REQUIRED"
  ) {
    super(message, status);
  }
}

/* -------------------------------------------------------------------------- */
/* Idade e CPF (antes de criar a conta)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Confere idade e caminho escolhido (usado na abertura do PRX BANK e no pedido
 * de vínculo com o responsável). O cadastro comum só confere a idade mínima
 * (signupBirthDateSchema, em age.ts).
 *   <12: sem conta, nem com o responsável.
 *   12–15: só com o responsável (vínculo com a Conta Pai).
 *   16–17: vínculo com o responsável ou emancipação comprovada.
 *   18–29: conta comum. 30+: fora do público do PRX BANK.
 */
/**
 * `allowOver`: acima de 29 anos com a liberação do PRX BANK dada pelo admin
 * (lib/bank/access.ts). A pessoa entra como conta comum; as outras regras não mudam.
 */
export function assertEligibleAge(input: Pick<IdentityInput, "birthDate" | "teenPath" | "parentEmail">, now = new Date(), options: { allowOver?: boolean } = {}) {
  const raw = ageGroup(input.birthDate, now);
  const group = raw === "over" && options.allowOver ? "adult" : raw;
  if (group === "under") throw new FamilyError(UNDER_AGE_MESSAGE, 403, "UNDER_AGE");
  if (group === "over") throw new FamilyError(OVER_AGE_MESSAGE, 403, "OVER_AGE");
  if (group === "child" && input.teenPath !== "linked") throw new FamilyError(PARENT_REQUIRED_MESSAGE, 403, "PARENT_REQUIRED");
  if (group === "teen" && !input.teenPath) {
    throw new FamilyError("Com 16 ou 17 anos, escolha: vincular a conta ao seu responsável ou comprovar emancipação.", 422, "TEEN_PATH_REQUIRED");
  }
  if ((group === "child" || group === "teen") && input.teenPath === "linked" && !input.parentEmail) {
    throw new FamilyError("Informe o e-mail do responsável para vincular a conta.", 422);
  }
  return group;
}

export async function assertCpfAvailable(cpf: string): Promise<void> {
  if (await repo().findIdentityByCpf(cpf)) throw new FamilyError(CPF_TAKEN_MESSAGE, 409, "CPF_TAKEN");
}

export async function getIdentity(userId: string): Promise<FamilyIdentity | null> {
  return repo().getIdentity(userId);
}

async function insertIdentityOr409(identity: Omit<FamilyIdentity, "createdAt" | "updatedAt">): Promise<FamilyIdentity> {
  try {
    return await repo().insertIdentity(identity);
  } catch (err) {
    if (err instanceof PartnerError && err.status === 409) {
      const byCpf = await repo().findIdentityByCpf(identity.cpf);
      if (byCpf && byCpf.userId !== identity.userId) throw new FamilyError(CPF_TAKEN_MESSAGE, 409, "CPF_TAKEN");
      throw new FamilyError("Seus dados de identidade já foram registrados.", 409);
    }
    throw err;
  }
}

/**
 * Registra CPF e nascimento da conta de um jovem (cadastro por e-mail, entrada
 * pelo Google ou conta antiga sem esses dados). Define o tipo e a situação.
 */
export async function registerIdentity(user: MemberRef, input: IdentityInput, now = new Date(), options: { allowOver?: boolean } = {}): Promise<FamilyIdentity> {
  if (await repo().getIdentity(user.id)) throw new FamilyError("Seus dados de identidade já foram registrados.", 409);
  const group = assertEligibleAge(input, now, options);
  await assertCpfAvailable(input.cpf);

  if (group === "adult") {
    return insertIdentityOr409({ userId: user.id, accountType: "member", status: "active", cpf: input.cpf, birthDate: input.birthDate, parentUserId: null });
  }
  if (input.teenPath === "emancipated") {
    return insertIdentityOr409({ userId: user.id, accountType: "minor", status: "emancipation_pending", cpf: input.cpf, birthDate: input.birthDate, parentUserId: null });
  }

  // Conta Filho: pedido de vínculo com o e-mail do responsável (a Conta Pai pode ainda nem existir).
  const parentEmail = (input.parentEmail || "").toLowerCase();
  if (parentEmail === user.email.toLowerCase()) throw new FamilyError("Use o e-mail do seu responsável, não o seu.", 422);
  const identity = await insertIdentityOr409({ userId: user.id, accountType: "minor", status: "link_pending", cpf: input.cpf, birthDate: input.birthDate, parentUserId: null });
  const parent = await findParentByEmail(parentEmail);
  await repo().insertLink({ parentUserId: parent?.id ?? null, parentEmail, childUserId: user.id, childName: user.fullName, status: "pending" });
  return identity;
}

async function findParentByEmail(email: string): Promise<StoredUser | null> {
  let user: StoredUser | null = null;
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (data?.id) user = await loadSessionUser(data.id as string, { email });
  } else {
    user = userStore.findByEmail(email) ?? null;
  }
  if (!user) return null;
  const identity = await repo().getIdentity(user.id);
  return identity?.accountType === "parent" ? user : null;
}

/* -------------------------------------------------------------------------- */
/* Emancipação (16–17)                                                        */
/* -------------------------------------------------------------------------- */

function assertOwnedDocuments(userId: string, documents: DocumentRef[]) {
  if (documents.some((d) => !ownsDocument(userId, d))) throw new FamilyError("Documento inválido. Envie os arquivos de novo.", 422);
}

export async function submitEmancipation(user: MemberRef, documents: DocumentRef[]): Promise<EmancipationRequest> {
  const identity = await repo().getIdentity(user.id);
  if (!identity || identity.accountType !== "minor" || !["emancipation_pending", "rejected"].includes(identity.status)) {
    throw new FamilyError("A comprovação de emancipação é para contas de 16 e 17 anos.", 403);
  }
  assertOwnedDocuments(user.id, documents);
  const missing: Array<"emancipation_certificate" | "id_document"> = [];
  if (!documents.some((d) => d.kind === "emancipation_certificate")) missing.push("emancipation_certificate");
  if (!documents.some((d) => d.kind === "id_document" || d.kind === "id_front")) missing.push("id_document");
  if (missing.length > 0) throw new FamilyError(`Faltam documentos: ${missing.map((k) => DOCUMENT_LABEL[k]).join(" e ")}.`, 422);
  const latest = await repo().latestEmancipation(user.id);
  if (latest?.status === "pending") throw new FamilyError("Seus documentos já estão em análise.", 409);
  if (identity.status === "rejected") await repo().updateIdentity(user.id, { status: "emancipation_pending" });
  return repo().insertEmancipation({ userId: user.id, fullName: user.fullName, email: user.email, documents });
}

export async function reviewEmancipation(id: string, decision: "approve" | "reject", note: string, reviewer: string): Promise<EmancipationRequest> {
  const request = await repo().getEmancipation(id);
  if (!request) throw new FamilyError("Pedido não encontrado.", 404);
  const targetStatus = decision === "approve" ? "approved" : "rejected";
  if (request.status === targetStatus) throw new FamilyError(`Este pedido já foi ${targetStatus === "approved" ? "aprovado" : "recusado"}.`, 409);
  const decided = await repo().decideEmancipation(id, targetStatus, note, reviewer);
  if (!decided) throw new FamilyError("Não foi possível atualizar a decisão.", 409);
  // Emancipação aprovada: conta comum, sem responsável e sem limites de menor.
  await repo().updateIdentity(request.userId, decision === "approve" ? { accountType: "member", status: "active" } : { status: "rejected" });
  return decided;
}

/* -------------------------------------------------------------------------- */
/* Conta Pai                                                                  */
/* -------------------------------------------------------------------------- */

export async function registerParent(input: { fullName: string; email: string; password: string; cpf: string; birthDate: string; phone: string }, now = new Date()) {
  if (ageOn(input.birthDate, now) < 18) throw new FamilyError("A Conta Pai é para responsáveis maiores de 18 anos.", 403);
  await assertCpfAvailable(input.cpf);
  const user = await createAccount({ email: input.email, fullName: input.fullName, password: input.password });
  try {
    const identity = await insertIdentityOr409({ userId: user.id, accountType: "parent", status: "parent_review", cpf: input.cpf, birthDate: input.birthDate, parentUserId: null });
    return { user, identity };
  } catch (err) {
    await discardAccount(user.id);
    throw err;
  }
}

async function requireParentIdentity(userId: string): Promise<FamilyIdentity> {
  const identity = await repo().getIdentity(userId);
  if (!identity || identity.accountType !== "parent") throw new FamilyError("Esta área é da Conta Pai.", 403);
  return identity;
}

/** Operações que mexem na vida do filho exigem Conta Pai aprovada. */
async function requireApprovedParent(userId: string): Promise<FamilyIdentity> {
  const identity = await requireParentIdentity(userId);
  if (identity.status === "parent_review") throw new FamilyError("Seu cadastro de Conta Pai está em análise. Liberamos o controle assim que os documentos forem conferidos.", 403);
  if (identity.status !== "active") throw new FamilyError("Seu cadastro de Conta Pai não foi aprovado. Fale com o suporte PRX.", 403);
  return identity;
}

export async function submitParentApplication(user: MemberRef & { phone?: string }, input: ParentApplicationInput, now = new Date()): Promise<ParentApplication> {
  const identity = await requireParentIdentity(user.id);
  if (identity.status === "active") throw new FamilyError("Sua Conta Pai já está aprovada.", 409);
  assertOwnedDocuments(user.id, input.documents);
  const missing = missingParentDocuments(input.documents);
  if (missing.length > 0) throw new FamilyError(`Faltam documentos: ${missing.map((k) => DOCUMENT_LABEL[k]).join(", ")}.`, 422);
  if (ageOn(input.childBirthDate, now) >= 18) throw new FamilyError("A Conta Pai acompanha filhos menores de 18 anos.", 422);
  const latest = await repo().latestParentApplication(user.id);
  if (latest?.status === "pending") throw new FamilyError("Seu cadastro já está em análise.", 409);
  if (identity.status === "rejected") await repo().updateIdentity(user.id, { status: "parent_review" });
  return repo().insertParentApplication({ ...input, userId: user.id, fullName: user.fullName, email: user.email, phone: user.phone ?? "" });
}

export async function reviewParentApplication(id: string, decision: "approve" | "reject", note: string, reviewer: string): Promise<ParentApplication> {
  const app = await repo().getParentApplication(id);
  if (!app) throw new FamilyError("Pedido não encontrado.", 404);
  const targetStatus = decision === "approve" ? "approved" : "rejected";
  if (app.status === targetStatus) throw new FamilyError(`Este pedido já foi ${targetStatus === "approved" ? "aprovado" : "recusado"}.`, 409);
  const decided = await repo().decideParentApplication(id, targetStatus, note, reviewer);
  if (!decided) throw new FamilyError("Não foi possível atualizar a decisão.", 409);
  await repo().updateIdentity(app.userId, { status: decision === "approve" ? "active" : "rejected" });
  return decided;
}

/* -------------------------------------------------------------------------- */
/* Filhos: criação, vínculos e acesso                                         */
/* -------------------------------------------------------------------------- */

/** Vínculo ativo entre responsável e filho; sem ele nenhum dado do filho aparece. */
async function requireChild(parentId: string, childId: string): Promise<FamilyLink> {
  const links = await repo().listLinksByChild(childId);
  const link = links.find((l) => l.parentUserId === parentId && l.status === "active");
  if (!link) throw new FamilyError("Filho não encontrado na sua família.", 404);
  return link;
}

export async function createChildAccount(
  parent: MemberRef,
  input: { fullName: string; email: string; password: string; cpf: string; birthDate: string } & GuardianConsent,
  ip: string | null = null,
  now = new Date()
) {
  await requireApprovedParent(parent.id);
  if (ageOn(input.birthDate, now) < MIN_ACCOUNT_AGE) throw new FamilyError(UNDER_AGE_MESSAGE, 422, "UNDER_AGE");
  if (ageOn(input.birthDate, now) >= 18) throw new FamilyError("Maiores de 18 anos abrem a própria conta PRX.", 422);
  if (input.email === parent.email.toLowerCase()) throw new FamilyError("Use um e-mail do seu filho, diferente do seu.", 422);
  await assertCpfAvailable(input.cpf);
  const child = await createAccount({ email: input.email, fullName: input.fullName, password: input.password });
  try {
    await insertIdentityOr409({ userId: child.id, accountType: "minor", status: "active", cpf: input.cpf, birthDate: input.birthDate, parentUserId: parent.id });
  } catch (err) {
    await discardAccount(child.id);
    throw err;
  }
  // Tutela declarada e consentimento parental (LGPD, Art. 14) ficam gravados no vínculo.
  const link = await repo().insertLink(
    { parentUserId: parent.id, parentEmail: parent.email.toLowerCase(), childUserId: child.id, childName: child.fullName, status: "active" },
    { relationship: input.relationship, version: PARENTAL_CONSENT_VERSION, ip }
  );
  await repo().setLimits(child.id, DEFAULT_MINOR_LIMITS, parent.id);
  return { child, link };
}

/**
 * Resposta do responsável a um pedido de vínculo. Aprovar exige parentesco,
 * declaração de tutela e o consentimento parental explícito (LGPD, Art. 14).
 */
export async function respondLink(parent: MemberRef, linkId: string, decision: "approve" | "reject", consent: GuardianConsent | null = null, ip: string | null = null): Promise<FamilyLink> {
  await requireApprovedParent(parent.id);
  const link = await repo().getLink(linkId);
  const mine = link && (link.parentUserId === parent.id || (!link.parentUserId && link.parentEmail === parent.email.toLowerCase()));
  if (!link || !mine) throw new FamilyError("Pedido de vínculo não encontrado.", 404);
  if (link.status !== "pending") throw new FamilyError("Este pedido já foi respondido.", 409);
  if (decision === "reject") {
    const updated = await repo().updateLink(linkId, { status: "revoked" });
    await repo().updateIdentity(link.childUserId, { status: "rejected" });
    return updated!;
  }
  if (!consent) throw new FamilyError("Para aceitar, informe o parentesco e aceite o termo de consentimento parental (LGPD, Art. 14).", 422);
  const updated = await repo().updateLink(linkId, { status: "active", parentUserId: parent.id, consent: { relationship: consent.relationship, version: PARENTAL_CONSENT_VERSION, ip } });
  await repo().updateIdentity(link.childUserId, { status: "active", parentUserId: parent.id });
  if (!(await repo().getLimits(link.childUserId))) await repo().setLimits(link.childUserId, DEFAULT_MINOR_LIMITS, parent.id);
  return updated!;
}

/* -------------------------------------------------------------------------- */
/* Panorama da família (dashboard da Conta Pai)                               */
/* -------------------------------------------------------------------------- */

async function memberVouchers(user: Pick<StoredUser, "id" | "email">): Promise<SystemVoucher[]> {
  if (supabaseAdmin && isUuid(user.id)) {
    const { data } = await supabaseAdmin
      .from("vouchers")
      .select("id, code, benefit_title, partner_name, discount_label, status, created_at, redeemed_at")
      .or(`user_id.eq.${pgQuote(user.id)},user_email.eq.${pgQuote(user.email)}`)
      .order("created_at", { ascending: false })
      .limit(50);
    return ((data ?? []) as Array<Record<string, string | null>>).map((v) => ({
      id: String(v.id),
      code: String(v.code ?? ""),
      benefitId: "",
      benefitTitle: String(v.benefit_title ?? ""),
      partnerId: "",
      partnerName: String(v.partner_name ?? ""),
      expiresAt: null,
      discountLabel: String(v.discount_label ?? ""),
      status: (v.status as SystemVoucher["status"]) ?? "valid",
      qrPayload: "",
      redeemedAt: String(v.redeemed_at ?? v.created_at ?? ""),
      terms: "",
      userId: user.id,
      userEmail: user.email,
      userName: "",
      createdAtIso: String(v.created_at ?? ""),
    }));
  }
  const byId = passStore.getUserVouchers(user.id);
  return byId.length > 0 ? byId : passStore.getUserVouchers(user.email);
}

export interface ChildSummary {
  id: string;
  name: string;
  email: string;
  age: number;
  status: FamilyIdentity["status"];
  balance: number;
  bankStatus: string;
  coins: number;
  xp: number;
  level: number;
  allowance: Allowance | null;
  limits: SpendingLimits;
}

async function childSummary(childId: string): Promise<ChildSummary | null> {
  const [user, identity] = await Promise.all([loadSessionUser(childId), repo().getIdentity(childId)]);
  if (!user || !identity) return null;
  const [bank, wallet, allowance, limits] = await Promise.all([
    accountView(childId).catch(() => null),
    getWallet(childId).catch(() => null),
    repo().getAllowance(childId),
    repo().getLimits(childId),
  ]);
  return {
    id: childId,
    name: user.fullName,
    email: user.email,
    age: ageOn(identity.birthDate),
    status: identity.status,
    balance: bank?.balance ?? 0,
    bankStatus: bank?.status ?? "pending_activation",
    coins: wallet?.coins ?? 0,
    xp: wallet?.xp ?? user.prxScore,
    level: wallet?.level ?? user.prxLevel,
    allowance,
    limits: limits ?? DEFAULT_MINOR_LIMITS,
  };
}

export interface FamilyOverview {
  identity: FamilyIdentity;
  application: ParentApplication | null;
  children: ChildSummary[];
  pendingLinks: FamilyLink[];
}

export async function familyOverview(parent: MemberRef): Promise<FamilyOverview> {
  const identity = await requireParentIdentity(parent.id);
  // Mesadas vencidas são pagas quando a família abre o painel (o agendador diário cobre o resto).
  await runDueAllowances().catch(() => 0);
  const [application, links] = await Promise.all([repo().latestParentApplication(parent.id), repo().listLinksByParent(parent.id, parent.email.toLowerCase())]);
  const active = links.filter((l) => l.status === "active" && l.parentUserId === parent.id);
  const children = (await Promise.all(active.map((l) => childSummary(l.childUserId)))).filter((c): c is ChildSummary => c !== null);
  return { identity, application, children, pendingLinks: links.filter((l) => l.status === "pending") };
}

export interface ChildDetail extends ChildSummary {
  transactions: BankTransaction[];
  points: Array<{ id: string; description: string; coinsDelta: number; xpDelta: number; createdAt: string }>;
  vouchers: Array<{ id: string; benefitTitle: string; partnerName: string; discountLabel: string; status: string; when: string }>;
  tickets: Array<{ id: string; eventTitle: string; startsAt: string | null; status: string }>;
  projects: Array<{ id: string; title: string; status: string; createdAt: string }>;
}

export async function childDetail(parent: MemberRef, childId: string): Promise<ChildDetail> {
  await requireParentIdentity(parent.id);
  await requireChild(parent.id, childId);
  const summary = await childSummary(childId);
  if (!summary) throw new FamilyError("Filho não encontrado.", 404);
  const [bank, wallet, vouchers, live] = await Promise.all([
    accountView(childId).catch(() => null),
    getWallet(childId).catch(() => null),
    memberVouchers({ id: childId, email: summary.email }).catch(() => []),
    memberWallet({ id: childId }).catch(() => null),
  ]);
  return {
    ...summary,
    transactions: (bank?.transactions ?? []).slice(0, 60),
    points: (wallet?.transactions ?? []).slice(0, 30).map((t) => ({ id: t.id, description: t.description, coinsDelta: t.coinsDelta, xpDelta: t.xpDelta, createdAt: t.createdAt })),
    vouchers: vouchers.slice(0, 30).map((v) => ({ id: v.id, benefitTitle: v.benefitTitle, partnerName: v.partnerName, discountLabel: v.discountLabel, status: v.status, when: v.createdAtIso || v.redeemedAt })),
    tickets: (live?.tickets ?? []).slice(0, 30).map((t) => ({ id: t.id, eventTitle: t.event?.title ?? "Evento", startsAt: t.event?.startsAt ?? null, status: t.status })),
    projects: (live?.submissions ?? []).slice(0, 20).map((s) => ({ id: s.id, title: s.startupName, status: s.status, createdAt: s.createdAt })),
  };
}

/* -------------------------------------------------------------------------- */
/* Dinheiro: Pix para o filho, mesada e limites                               */
/* -------------------------------------------------------------------------- */

/**
 * Crédito na conta do filho vindo do responsável. A Conta Pai não tem saldo:
 * o dinheiro sai do banco do responsável e cai direto na conta do filho. No
 * sandbox o repasse liquida na hora; nas contas reais depende da ativação do banco parceiro.
 */
async function creditChild(parentName: string, childId: string, amount: number, description: string) {
  if (!sandboxEnabled(childId)) throw new FamilyError(`${ACTIVATION_REQUIRED} O envio para o seu filho usa a conta dele.`, 409);
  return sandboxCredit(childId, { amount, counterparty: `${parentName} (responsável)`.slice(0, 80), description });
}

export async function sendToChild(parent: MemberRef, childId: string, input: { amount: number; note: string }) {
  await requireApprovedParent(parent.id);
  await requireChild(parent.id, childId);
  const amount = Math.round(input.amount * 100) / 100;
  return creditChild(parent.fullName, childId, amount, input.note || "Pix do responsável");
}

export async function setAllowance(parent: MemberRef, childId: string, input: AllowanceInput, now = new Date()): Promise<Allowance> {
  await requireApprovedParent(parent.id);
  await requireChild(parent.id, childId);
  const next = nextAllowanceRun(input.frequency, input.weekday, input.monthDay, now);
  return repo().upsertAllowance(parent.id, childId, input, next.toISOString());
}

export async function cancelAllowance(parent: MemberRef, childId: string): Promise<void> {
  await requireApprovedParent(parent.id);
  await requireChild(parent.id, childId);
  await repo().deleteAllowance(childId);
}

/**
 * Paga as mesadas vencidas, uma vez por período (registro idempotente).
 * Conta do filho ainda sem banco ativo: o período passa e a próxima data avança.
 */
export async function runDueAllowances(now = new Date()): Promise<number> {
  const due = await repo().listDueAllowances(now.toISOString());
  let paid = 0;
  for (const allowance of due) {
    const runAt = new Date(allowance.nextRunAt);
    const next = nextAllowanceRun(allowance.frequency, allowance.weekday, allowance.monthDay, now > runAt ? now : runAt);
    const link = (await repo().listLinksByChild(allowance.childUserId)).find((l) => l.parentUserId === allowance.parentUserId && l.status === "active");
    if (link && sandboxEnabled(allowance.childUserId) && (await repo().claimAllowanceRun(allowance.id, allowancePeriodKey(runAt), allowance.amount))) {
      const parent = await loadSessionUser(allowance.parentUserId);
      try {
        await creditChild(parent?.fullName ?? "Responsável", allowance.childUserId, allowance.amount, allowance.frequency === "weekly" ? "Mesada semanal" : "Mesada mensal");
        paid += 1;
      } catch {
        // conta do filho não ativa: o registro do período fica, a próxima data avança
      }
    }
    await repo().markAllowanceRun(allowance.id, now.toISOString(), next.toISOString());
  }
  return paid;
}

export async function setLimits(parent: MemberRef, childId: string, limits: SpendingLimits): Promise<SpendingLimits> {
  await requireApprovedParent(parent.id);
  await requireChild(parent.id, childId);
  return repo().setLimits(childId, limits, parent.id);
}

/* Travas do PRX BANK (Conta Pai sem saldo, limites do menor) ficam em guards.ts: o banco importa sem ciclo. */
export { assertCanHoldMoney, assertMinorSpend } from "@/lib/family/guards";

/* -------------------------------------------------------------------------- */
/* Situação para o app (banners e telas de pendência)                          */
/* -------------------------------------------------------------------------- */

export interface FamilyState {
  identity: Pick<FamilyIdentity, "accountType" | "status" | "birthDate"> | null;
  age: number | null;
  application: Pick<ParentApplication, "status" | "reviewNote"> | null;
  emancipation: Pick<EmancipationRequest, "status" | "reviewNote"> | null;
  link: Pick<FamilyLink, "status" | "parentEmail"> | null;
  limits: SpendingLimits | null;
}

export async function familyState(user: MemberRef): Promise<FamilyState> {
  const identity = await repo().getIdentity(user.id);
  if (!identity) return { identity: null, age: null, application: null, emancipation: null, link: null, limits: null };
  const [application, emancipation, links, limits] = await Promise.all([
    identity.accountType === "parent" ? repo().latestParentApplication(user.id) : Promise.resolve(null),
    identity.accountType === "minor" ? repo().latestEmancipation(user.id) : Promise.resolve(null),
    identity.accountType === "minor" ? repo().listLinksByChild(user.id) : Promise.resolve([]),
    identity.accountType === "minor" ? repo().getLimits(user.id) : Promise.resolve(null),
  ]);
  const link = links.find((l) => l.status === "active") ?? links[0] ?? null;
  return {
    identity: { accountType: identity.accountType, status: identity.status, birthDate: identity.birthDate },
    age: ageOn(identity.birthDate),
    application: application ? { status: application.status, reviewNote: application.reviewNote } : null,
    emancipation: emancipation ? { status: emancipation.status, reviewNote: emancipation.reviewNote } : null,
    link: link ? { status: link.status, parentEmail: link.parentEmail } : null,
    limits: identity.accountType === "minor" ? (limits ?? DEFAULT_MINOR_LIMITS) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

export async function reviewQueues(status: "pending" | "approved" | "rejected" | "all") {
  const [parents, emancipations] = await Promise.all([repo().listParentApplications(status), repo().listEmancipations(status)]);
  return { parents, emancipations };
}

export async function reviewFamilyRequest(kind: "parent" | "emancipation", id: string, decision: "approve" | "reject", note: string, reviewer: string) {
  return kind === "parent" ? reviewParentApplication(id, decision, note, reviewer) : reviewEmancipation(id, decision, note, reviewer);
}

/** O documento pertence a um pedido existente? (o admin só abre arquivos anexados a pedidos) */
export async function documentIsAttached(path: string): Promise<boolean> {
  const { parents, emancipations } = await reviewQueues("all");
  return [...parents, ...emancipations].some((r) => r.documents.some((d) => d.path === path));
}
