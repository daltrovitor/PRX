// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { ownsDocument } from "@/lib/family/documents";
import { getFamilyRepository } from "@/lib/family/repository";
import { PARENT_NO_MONEY } from "@/lib/family/guards";
import { FamilyError, assertEligibleAge, registerIdentity, submitEmancipation, type MemberRef } from "@/lib/family/service";
import { ageGroup } from "@/lib/family/age";
import { CPF_TAKEN_MESSAGE, DOCUMENT_LABEL, type DocumentKind } from "@/lib/family/types";
import { getKycRepository } from "@/lib/kyc/repository";
import type { BankKycApplication, BankKycInput, KycStatus, RiskFlag } from "@/lib/kyc/types";
import { assertIdentityApprovable, identitySchemaReady, notifyMember, receivedReviews, recordKycEvent } from "@/lib/kyc/identity";
import { OVER_AGE_BANK_MESSAGE, bankAgeAllowed } from "@/lib/bank/access";

/*
 * Abertura do PRX BANK (KYC bancário) com validações antifraude no servidor:
 *   - CPF com dígitos verificadores (zod) e único na PRX; igual ao já registrado na conta;
 *   - idade: menor de 18 só com responsável vinculado (ou emancipação a partir de 16);
 *   - documentos da própria pasta do usuário, frente e verso;
 *   - nomes civis coerentes, celular com DDD válido, CEP e UF válidos;
 *   - Conta Pai não abre conta (não guarda dinheiro); um pedido em análise por vez;
 *   - IP e navegador gravados como trilha de auditoria; PEP sinalizado para diligência reforçada.
 * Passadas as regras, a abertura fica em análise pela PRX (lib/kyc/identity.ts):
 * a equipe confere cada documento e a selfie e aprova explicitamente. Só então
 * os dados e documentos seguem ao Asaas, que faz a análise dele e aprova a conta.
 * Acima de 29 anos, só com a liberação do admin (lib/bank/access.ts).
 */

/** Frente e verso do documento com foto e a foto do rosto (selfie da câmera): o Asaas exige do titular pessoa física. */
const REQUIRED_DOCS: DocumentKind[] = ["id_front", "id_back", "selfie"];
const kycRepo = () => getKycRepository();
const familyRepo = () => getFamilyRepository();

export { bankKycState } from "@/lib/kyc/guards";

const SYSTEM_REVIEWER = "sistema";

/**
 * `allowRedo`: a conta ainda não existe no banco parceiro, então o membro pode
 * trocar uma abertura já aprovada (ex.: enviou fotos de teste). CPF e nascimento
 * continuam travados. A nova abertura volta para a análise da PRX.
 */
export async function submitBankKyc(
  user: MemberRef,
  input: BankKycInput,
  meta: { ip: string | null; userAgent: string },
  now = new Date(),
  options: { allowRedo?: boolean } = {}
): Promise<BankKycApplication> {
  const identity = await familyRepo().getIdentity(user.id);
  if (identity?.accountType === "parent") throw new FamilyError(PARENT_NO_MONEY, 403);

  const latest = await kycRepo().latestForUser(user.id);
  // Abertura já em análise: um novo envio é repetição (toque duplo, rede lenta), não erro. A tela mostra "Conta em análise".
  if (latest?.status === "pending") return latest;
  if (latest?.status === "approved" && !options.allowRedo) throw new FamilyError("Sua conta PRX BANK já foi aberta.", 409);

  // Documentos: só da própria pasta, com frente e verso do documento com foto.
  if (input.documents.some((d) => !ownsDocument(user.id, d))) throw new FamilyError("Documento inválido. Envie os arquivos de novo.", 422);
  const missing = REQUIRED_DOCS.filter((k) => !input.documents.some((d) => d.kind === k));
  if (missing.length > 0) throw new FamilyError(`Faltam documentos: ${missing.map((k) => DOCUMENT_LABEL[k]).join(" e ")}.`, 422);

  // Acima de 29 anos, só com a liberação do admin (conferida aqui, no servidor).
  const allowOver = ageGroup(input.birthDate, now) === "over" && (await bankAgeAllowed(user.id, input.birthDate, now));
  if (ageGroup(input.birthDate, now) === "over" && !allowOver) throw new FamilyError(OVER_AGE_BANK_MESSAGE, 403, "OVER_AGE");
  const group = assertEligibleAge({ birthDate: input.birthDate, teenPath: input.minorPath, parentEmail: input.parentEmail ?? "" }, now, { allowOver });
  const isMinor = group === "child" || group === "teen";
  if (isMinor && input.minorPath === "emancipated" && !input.documents.some((d) => d.kind === "emancipation_certificate")) {
    throw new FamilyError("Envie a certidão de emancipação.", 422);
  }

  if (identity) {
    // O CPF e o nascimento de uma conta não mudam: divergência é sinal de fraude.
    if (identity.cpf !== input.cpf) throw new FamilyError("O CPF informado é diferente do já registrado na sua conta.", 409);
    if (identity.birthDate !== input.birthDate) throw new FamilyError("A data de nascimento é diferente da já registrada na sua conta.", 409);
    if (identity.accountType === "minor" && identity.status === "rejected") {
      if (input.minorPath === "emancipated") {
        // submitEmancipation volta a situação para "em análise".
      } else if (input.parentEmail) {
        await familyRepo().insertLink({ parentUserId: null, parentEmail: input.parentEmail, childUserId: user.id, childName: user.fullName, status: "pending" }).catch((err: unknown) => {
          if (!(err instanceof PartnerError && err.status === 409)) throw err;
        });
        await familyRepo().updateIdentity(user.id, { status: "link_pending" });
      }
    }
  } else {
    // Primeira verificação da conta: registra CPF (único) e nascimento; menor gera o pedido de vínculo.
    try {
      await registerIdentity(user, { cpf: input.cpf, birthDate: input.birthDate, teenPath: input.minorPath, parentEmail: input.parentEmail ?? "" }, now, { allowOver });
    } catch (err) {
      // Envio repetido ao mesmo tempo: o outro já registrou exatamente estes dados nesta conta.
      const same = err instanceof FamilyError && err.status === 409 && err.code !== "CPF_TAKEN" ? await familyRepo().getIdentity(user.id) : null;
      if (!same || same.cpf !== input.cpf || same.birthDate !== input.birthDate) throw err;
    }
  }

  if (isMinor && input.minorPath === "emancipated") {
    const current = await familyRepo().getIdentity(user.id);
    if (current?.status === "emancipation_pending" || current?.status === "rejected") {
      const pending = await familyRepo().latestEmancipation(user.id);
      if (pending?.status !== "pending") {
        await submitEmancipation(
          user,
          input.documents.filter((d) => d.kind === "emancipation_certificate" || d.kind === "id_front" || d.kind === "id_back")
        );
      }
    }
  }

  const riskFlags: RiskFlag[] = [];
  if (input.pep) riskFlags.push("pep");
  if (isMinor) riskFlags.push("minor");
  if (isMinor && input.minorPath === "emancipated") riskFlags.push("emancipation");

  const record = {
    userId: user.id,
    email: user.email.toLowerCase(),
    fullName: input.fullName,
    cpf: input.cpf,
    birthDate: input.birthDate,
    motherName: input.motherName?.trim() || "Não informado",
    phone: input.phone,
    occupation: input.occupation,
    incomeRange: input.incomeRange,
    pep: input.pep,
    address: input.address,
    documents: input.documents,
    minorPath: isMinor ? (input.minorPath ?? null) : null,
    riskFlags,
    ip: meta.ip,
    userAgent: meta.userAgent.slice(0, 300),
    documentReviews: (await identitySchemaReadySafe()) ? receivedReviews(input.documents, now.toISOString()) : undefined,
  };
  let created: BankKycApplication | null = null;
  try {
    created = await kycRepo().insert(record);
  } catch (err) {
    // Um pedido em análise por pessoa (índice único): o envio repetido já foi gravado pela outra chamada.
    if (!(err instanceof PartnerError && err.status === 409)) throw err;
    const current = await kycRepo().latestForUser(user.id);
    if (!current || current.status === "rejected") throw err;
  }
  if (created) {
    await recordKycEvent({ applicationId: created.id, userId: user.id, actor: user.email, actorRole: "member", action: "submitted", documentKind: null, detail: riskFlags.join(", ") });
  }
  // Em análise pela PRX: nada vai ao banco parceiro antes da aprovação da equipe.
  const app = await kycRepo().latestForUser(user.id);
  if (!app) throw new FamilyError("Não foi possível registrar a abertura de conta.", 500);
  return app;
}

const identitySchemaReadySafe = (): Promise<boolean> => identitySchemaReady().catch(() => false);

const SUPERSEDED_NOTE = "Substituída por um envio mais recente da mesma pessoa.";

/**
 * Um CPF aprovado por vez (índice único no Supabase). Ao aprovar um envio novo
 * da mesma pessoa (reabertura ou envio repetido), o aprovado anterior é
 * aposentado antes; CPF aprovado em outra conta continua barrado.
 */
async function retireOlderApprovals(app: BankKycApplication): Promise<void> {
  const others = (await kycRepo().approvedForCpf(app.cpf)).filter((a) => a.id !== app.id);
  if (others.some((a) => a.userId !== app.userId)) throw new FamilyError(CPF_TAKEN_MESSAGE, 409, "CPF_TAKEN");
  for (const older of others) await kycRepo().decide(older.id, "rejected", SUPERSEDED_NOTE, SYSTEM_REVIEWER);
}

async function approve(app: BankKycApplication, note: string, reviewer: string): Promise<BankKycApplication | null> {
  await retireOlderApprovals(app);
  try {
    return await kycRepo().decide(app.id, "approved", note, reviewer);
  } catch (err) {
    if (!(err instanceof PartnerError && err.status === 409)) throw err;
    // Outra chamada aprovou um envio igual no mesmo instante: aposenta e tenta uma vez mais.
    await retireOlderApprovals(app);
    return kycRepo().decide(app.id, "approved", note, reviewer);
  }
}

/** Menor só é aprovado com o responsável vinculado (ou emancipação aprovada, que vira conta comum). */
export async function guardianReady(userId: string, birthDate: string): Promise<boolean> {
  const identity = await familyRepo().getIdentity(userId);
  if (!identity) return false;
  if (identity.accountType === "member") return ageGroup(birthDate) === "adult" || identity.status === "active";
  if (identity.accountType !== "minor" || identity.status !== "active" || !identity.parentUserId) return false;
  const links = await familyRepo().listLinksByChild(userId);
  return links.some((l) => l.status === "active" && l.parentUserId === identity.parentUserId);
}

export async function reviewBankKyc(id: string, decision: "approve" | "reject", note: string, reviewer: string): Promise<BankKycApplication> {
  const app = await kycRepo().get(id);
  if (!app) throw new FamilyError("Pedido não encontrado.", 404);
  const targetStatus: KycStatus = decision === "approve" ? "approved" : "rejected";
  if (app.status === targetStatus) {
    throw new FamilyError(`Este pedido já foi ${targetStatus === "approved" ? "aprovado" : "recusado"}.`, 409);
  }
  if (decision === "approve" && app.riskFlags.includes("minor") && app.minorPath !== "emancipated" && !(await guardianReady(app.userId, app.birthDate))) {
    throw new FamilyError("Menor de idade: aprove só depois que o responsável aceitar o vínculo na Conta Pai (ou a emancipação ser aprovada).", 409);
  }
  if (decision === "approve") {
    if (!(await bankAgeAllowed(app.userId, app.birthDate))) throw new FamilyError("Acima de 29 anos sem a liberação do PRX BANK vigente: libere em PRX BANK → Liberação antes de aprovar.", 409);
    await assertIdentityApprovable(app);
  } else if (note.trim().length < 5) {
    throw new FamilyError("Escreva o motivo da recusa (a pessoa vê esse texto).", 422);
  }
  const decided = targetStatus === "approved" ? await approve(app, note, reviewer) : await kycRepo().decide(id, targetStatus, note, reviewer);
  if (!decided) throw new FamilyError("Não foi possível atualizar a decisão do pedido.", 409);
  await recordKycEvent({ applicationId: app.id, userId: app.userId, actor: reviewer, actorRole: "admin", action: targetStatus === "approved" ? "approved" : "rejected", documentKind: null, detail: note.trim().slice(0, 500) });
  if (targetStatus === "rejected") {
    await notifyMember(app.userId, `identity:${app.id}:rejected`, "Sua abertura do PRX BANK não foi aprovada", "Abra a aba PRX BANK para ver o motivo e enviar de novo.");
  } else {
    await notifyMember(app.userId, `identity:${app.id}:approved`, "Identidade confirmada pela PRX", "Agora o PRX BANK abre a sua conta. O aviso da aprovação chega aqui.");
  }

  if (targetStatus === "approved") {
    try {
      const { asaasEnabled } = await import("@/lib/asaas/client");
      if (asaasEnabled()) {
        const { ensureAsaasCustomerAndAccount } = await import("@/lib/bank/asaas/onboarding");
        await ensureAsaasCustomerAndAccount(decided.userId);
      } else {
        const { logAsaasUnavailable } = await import("@/lib/bank/asaas/provisioning-log");
        await logAsaasUnavailable(decided.userId);
      }
    } catch (err) {
      const { logDeferred } = await import("@/lib/bank/asaas/provisioning-log");
      logDeferred(decided.userId, "abertura.conta", err);
    }
  }

  return decided;
}

export async function listBankKyc(status: KycStatus | "all"): Promise<Array<BankKycApplication & { guardianReady: boolean }>> {
  const apps = await kycRepo().list(status);
  return Promise.all(apps.map(async (a) => ({ ...a, guardianReady: a.riskFlags.includes("minor") ? await guardianReady(a.userId, a.birthDate) : true })));
}

/** O admin só abre arquivos anexados a um pedido de abertura. */
export async function kycDocumentIsAttached(path: string): Promise<boolean> {
  const apps = await kycRepo().list("all");
  return apps.some((a) => a.documents.some((d) => d.path === path));
}
