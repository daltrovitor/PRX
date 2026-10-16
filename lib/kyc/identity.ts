// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError } from "@/lib/partners/errors";
import { columnReady } from "@/lib/db-features";
import { FAMILY_BUCKET, ownsDocument } from "@/lib/family/documents";
import { DOCUMENT_LABEL, type DocumentKind, type DocumentRef } from "@/lib/family/types";
import { getKycRepository, type NewKycEvent } from "@/lib/kyc/repository";
import type { BankKycApplication, DocumentReview, DocumentReviews, IdentityDocumentItem, KycEvent } from "@/lib/kyc/types";

/**
 * Verificação de identidade da PRX. A equipe confere cada documento da
 * abertura do PRX BANK (frente e verso do documento com foto, selfie da
 * câmera e, para emancipados, a certidão) e decide documento a documento:
 * aprovado, ou recusado com o motivo. Com algum recusado, pede o reenvio: a
 * pessoa troca só aquele arquivo, sem refazer a abertura. A identidade só é
 * aprovada com todos os documentos aprovados, por decisão explícita de um
 * admin. Isso não substitui o banco parceiro: depois da aprovação, os mesmos
 * documentos seguem ao Asaas, que faz a análise dele.
 * Tudo fica no histórico (bank_kyc_events): quem, o quê, quando, inclusive
 * cada vez que um documento é aberto.
 */

export const IDENTITY_MIGRATION_HINT = "Falta aplicar a migração supabase/migrations/20261015_prx_bank_identity.sql no Supabase para a análise de identidade por documento.";

/** Frente e verso do documento com foto e a selfie da câmera; a certidão só para emancipados. */
export function requiredDocuments(app: Pick<BankKycApplication, "minorPath">): DocumentKind[] {
  return app.minorPath === "emancipated" ? ["id_front", "id_back", "selfie", "emancipation_certificate"] : ["id_front", "id_back", "selfie"];
}

const kyc = () => getKycRepository();

export const identitySchemaReady = () => columnReady("bank_kyc_applications", "document_reviews");

async function requireIdentitySchema(): Promise<void> {
  if (!(await identitySchemaReady())) throw new PartnerError(IDENTITY_MIGRATION_HINT, 503);
}

/** Histórico de melhor esforço: falha no registro não desfaz a ação, mas fica no log do servidor. */
export async function recordKycEvent(event: NewKycEvent): Promise<void> {
  try {
    await kyc().insertEvent(event);
  } catch (err) {
    console.warn("[kyc] histórico não registrado:", event.action, err instanceof Error ? err.message : err);
  }
}

/** Situação de cada documento: a análise salva, ou "recebido" quando ainda não foi analisado. */
export function identityChecklist(app: Pick<BankKycApplication, "minorPath" | "documents" | "documentReviews" | "status" | "reviewedBy">): IdentityDocumentItem[] {
  const kinds = [...requiredDocuments(app)];
  for (const d of app.documents) if (!kinds.includes(d.kind)) kinds.push(d.kind);
  return kinds.map((kind) => {
    const has = app.documents.some((d) => d.kind === kind);
    const review = app.documentReviews[kind];
    // Abertura aprovada antes desta análise (automática): os documentos contam como aprovados.
    const legacyApproved = app.status === "approved" && !review && has;
    return {
      kind,
      label: DOCUMENT_LABEL[kind],
      status: !has ? "missing" : legacyApproved ? "approved" : (review?.status ?? "received"),
      reason: review?.status === "rejected" ? review.reason : "",
    };
  });
}

/** Revisões iniciais de um envio: tudo recebido agora. */
export function receivedReviews(documents: DocumentRef[], at: string): DocumentReviews {
  const reviews: DocumentReviews = {};
  for (const d of documents) reviews[d.kind] = { status: "received", reason: "", reviewedBy: null, reviewedAt: null, receivedAt: at };
  return reviews;
}

async function pendingApp(id: string): Promise<BankKycApplication> {
  const app = await kyc().get(id);
  if (!app) throw new PartnerError("Abertura não encontrada.", 404);
  if (app.status !== "pending") throw new PartnerError(app.status === "approved" ? "Esta abertura já foi aprovada." : "Esta abertura já foi recusada.", 409);
  return app;
}

async function saveReview(app: BankKycApplication, patch: Parameters<ReturnType<typeof kyc>["updateReview"]>[1]): Promise<BankKycApplication> {
  const saved = await kyc().updateReview(app.id, patch);
  if (!saved) throw new PartnerError("A abertura mudou enquanto você analisava. Atualize a página.", 409);
  return saved;
}

/** Aprova ou recusa um documento (recusa exige o motivo, que a pessoa vê). */
export async function reviewDocument(id: string, kind: DocumentKind, decision: "approve" | "reject", reason: string, reviewer: string, now = new Date()): Promise<BankKycApplication> {
  await requireIdentitySchema();
  const app = await pendingApp(id);
  if (!app.documents.some((d) => d.kind === kind)) throw new PartnerError("Este documento não foi enviado.", 404);
  const text = reason.trim().slice(0, 280);
  if (decision === "reject" && text.length < 5) throw new PartnerError("Escreva o motivo da recusa (a pessoa vê esse texto para reenviar).", 422);
  const previous = app.documentReviews[kind];
  const review: DocumentReview = {
    status: decision === "approve" ? "approved" : "rejected",
    reason: decision === "reject" ? text : "",
    reviewedBy: reviewer,
    reviewedAt: now.toISOString(),
    receivedAt: previous?.receivedAt ?? app.createdAt,
  };
  const saved = await saveReview(app, { documentReviews: { ...app.documentReviews, [kind]: review } });
  await recordKycEvent({
    applicationId: app.id,
    userId: app.userId,
    actor: reviewer,
    actorRole: "admin",
    action: decision === "approve" ? "document_approved" : "document_rejected",
    documentKind: kind,
    detail: decision === "reject" ? text : "",
  });
  return saved;
}

/** Pede à pessoa o reenvio dos documentos recusados (precisa de ao menos um recusado). */
export async function requestResubmission(id: string, note: string, reviewer: string, now = new Date()): Promise<BankKycApplication> {
  await requireIdentitySchema();
  const app = await pendingApp(id);
  const rejected = identityChecklist(app).filter((d) => d.status === "rejected");
  if (rejected.length === 0) throw new PartnerError("Recuse ao menos um documento (com o motivo) antes de pedir o reenvio.", 409);
  const saved = await saveReview(app, { resubmissionRequestedAt: now.toISOString() });
  await recordKycEvent({
    applicationId: app.id,
    userId: app.userId,
    actor: reviewer,
    actorRole: "admin",
    action: "resubmission_requested",
    documentKind: null,
    detail: [rejected.map((d) => d.label).join(", "), note.trim().slice(0, 300)].filter(Boolean).join(" · "),
  });
  await notifyMember(app.userId, `identity:${app.id}:resubmit:${now.toISOString()}`, "Envie de novo um documento da sua conta", "Abra a aba PRX BANK: mostramos qual documento precisa ser trocado e o motivo.");
  return saved;
}

/** A pessoa troca um documento recusado, sem refazer a abertura. */
export async function resubmitDocument(user: { id: string; email: string }, kind: DocumentKind, ref: DocumentRef, now = new Date()): Promise<BankKycApplication> {
  await requireIdentitySchema();
  if (ref.kind !== kind || !ownsDocument(user.id, ref)) throw new PartnerError("Documento inválido. Envie o arquivo de novo.", 422);
  const app = await kyc().latestForUser(user.id);
  if (!app || app.status !== "pending") throw new PartnerError("Não há abertura em análise para trocar documentos.", 409);
  const current = identityChecklist(app).find((d) => d.kind === kind);
  if (current?.status !== "rejected" && current?.status !== "missing") throw new PartnerError("Este documento não precisa ser enviado de novo.", 409);
  const documents = [...app.documents.filter((d) => d.kind !== kind), { kind, path: ref.path, name: ref.name ?? "" }];
  const reviews: DocumentReviews = { ...app.documentReviews, [kind]: { status: "received", reason: "", reviewedBy: null, reviewedAt: null, receivedAt: now.toISOString() } };
  const stillRejected = identityChecklist({ ...app, documents, documentReviews: reviews }).some((d) => d.status === "rejected" || d.status === "missing");
  const saved = await saveReview(app, { documents, documentReviews: reviews, resubmissionRequestedAt: stillRejected ? app.resubmissionRequestedAt : null });
  await recordKycEvent({ applicationId: app.id, userId: app.userId, actor: user.email, actorRole: "member", action: "document_resubmitted", documentKind: kind, detail: "" });
  return saved;
}

/**
 * Pronta para a decisão final: todos os documentos exigidos aprovados. Só o
 * admin aprova, explicitamente; o servidor confere de novo aqui.
 */
export async function assertIdentityApprovable(app: BankKycApplication): Promise<void> {
  if (!(await identitySchemaReady())) return; // sem a migração vale a decisão única do admin, como antes
  const pending = identityChecklist(app).filter((d) => d.status !== "approved");
  if (pending.length > 0) throw new PartnerError(`Aprove cada documento antes: falta ${pending.map((d) => d.label).join(", ")}.`, 409);
}

/** Aprova de uma vez os documentos recebidos (o admin confirma que conferiu todos). */
export async function approveReceivedDocuments(id: string, reviewer: string, now = new Date()): Promise<BankKycApplication> {
  await requireIdentitySchema();
  const app = await pendingApp(id);
  const missing = identityChecklist(app).filter((d) => d.status === "missing");
  if (missing.length > 0) throw new PartnerError(`Ainda falta: ${missing.map((d) => d.label).join(", ")}.`, 409);
  const reviews: DocumentReviews = { ...app.documentReviews };
  const approved: DocumentKind[] = [];
  for (const item of identityChecklist(app)) {
    if (item.status !== "received") continue;
    reviews[item.kind] = { status: "approved", reason: "", reviewedBy: reviewer, reviewedAt: now.toISOString(), receivedAt: app.documentReviews[item.kind]?.receivedAt ?? app.createdAt };
    approved.push(item.kind);
  }
  const saved = await saveReview(app, { documentReviews: reviews });
  for (const kind of approved) await recordKycEvent({ applicationId: app.id, userId: app.userId, actor: reviewer, actorRole: "admin", action: "document_approved", documentKind: kind, detail: "" });
  return saved;
}

/** Abre um documento para o admin: o caminho só sai daqui, e cada abertura fica no histórico. */
export async function documentForReview(id: string, kind: DocumentKind, reviewer: string): Promise<DocumentRef> {
  const app = await kyc().get(id);
  const doc = app?.documents.find((d) => d.kind === kind);
  if (!app || !doc) throw new PartnerError("Documento não encontrado.", 404);
  if (app.documentsPurgedAt) throw new PartnerError("Os documentos desta abertura já foram apagados pela política de retenção.", 404);
  await recordKycEvent({ applicationId: app.id, userId: app.userId, actor: reviewer, actorRole: "admin", action: "document_viewed", documentKind: kind, detail: "" });
  return doc;
}

export async function identityHistory(id: string): Promise<KycEvent[]> {
  try {
    return await kyc().listEvents(id, 100);
  } catch {
    return [];
  }
}

/** Aviso no sino do app (o mesmo dos avisos do PRX BANK). Nunca derruba a ação. */
export async function notifyMember(userId: string, eventId: string, title: string, body: string): Promise<void> {
  try {
    const { getAsaasBankStore } = await import("@/lib/bank/asaas/store");
    await getAsaasBankStore().insertNotification({ userId, eventType: "PRX_IDENTITY", title, body, amount: null, eventId });
  } catch (err) {
    console.warn("[kyc] aviso não enviado:", err instanceof Error ? err.message : err);
  }
}

/**
 * Retenção (LGPD, art. 15 e 16): aberturas recusadas não viraram conta, então
 * os arquivos de documento e selfie são apagados depois deste prazo; os dados
 * cadastrais e o histórico ficam como registro da decisão. Aberturas aprovadas
 * seguem o prazo legal de guarda das instituições de pagamento, a definir com
 * o jurídico (não são apagadas aqui).
 */
export const REJECTED_DOCUMENTS_RETENTION_DAYS = 180;

export async function purgeRejectedDocuments(now = new Date(), limit = 50): Promise<{ purged: number }> {
  if (!(await identitySchemaReady())) return { purged: 0 };
  const before = new Date(now.getTime() - REJECTED_DOCUMENTS_RETENTION_DAYS * 86_400_000).toISOString();
  const apps = await kyc().listForPurge(before, limit);
  let purged = 0;
  for (const app of apps) {
    const paths = app.documents.map((d) => d.path);
    if (paths.length > 0 && supabaseAdmin) {
      const { error } = await supabaseAdmin.storage.from(FAMILY_BUCKET).remove(paths);
      if (error) {
        console.warn("[kyc] retenção: arquivos não apagados", app.id, error.message);
        continue;
      }
    }
    const saved = await kyc().updateReview(app.id, { documents: [], documentsPurgedAt: now.toISOString() }, "rejected");
    if (!saved) continue;
    purged += 1;
    await recordKycEvent({ applicationId: app.id, userId: app.userId, actor: "retenção automática", actorRole: "system", action: "documents_purged", documentKind: null, detail: `${paths.length} arquivo(s) apagado(s) após ${REJECTED_DOCUMENTS_RETENTION_DAYS} dias da recusa.` });
  }
  return { purged };
}
