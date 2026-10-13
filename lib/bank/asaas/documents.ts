// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { AsaasError, toPartnerError } from "@/lib/asaas/errors";
import { withAsaasAudit } from "@/lib/asaas/audit";
import { listDocuments, uploadDocument, type DocumentGroup } from "@/lib/asaas/accounts";
import type { DocumentKind } from "@/lib/family/types";
import type { BankKycApplication } from "@/lib/kyc/types";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { bankMessage } from "@/lib/bank/asaas/messages";
import { buildDocumentFile, MAX_DOCUMENT_BYTES, type DocumentUpload } from "@/lib/bank/asaas/document-file";
import { describeError, logProvisioning } from "@/lib/bank/asaas/provisioning-log";
import { bankLog } from "@/lib/asaas/log";
import { requireSubaccount } from "@/lib/bank/asaas/subaccount";

/**
 * Documentos que o Asaas pede para aprovar a subconta (docs: onboarding-e-envio-
 * de-documentos-via-link). Regras da documentação seguidas aqui:
 *   - consultar só 15 s depois da criação (antes, vêm pedidos que deixam de valer);
 *   - grupo com onboardingUrl: o titular envia pelo link do Asaas (documento e
 *     selfie); nunca pela API;
 *   - um arquivo por grupo: frente e verso vão juntos num PDF (um segundo envio
 *     substituiria o primeiro); qualquer foto (JPG, PNG, WebP, HEIF) ou PDF do
 *     cadastro é convertida para o que o Asaas aceita (document-file.ts).
 * O que o PRX não consegue enviar sozinho, o membro envia pela aba PRX BANK.
 * Se o Asaas recusar o envio pela API (ex.: "Esse tipo de documento não pode
 * ser enviado via API"), o grupo segue pelo link seguro ou pelo suporte, e o
 * motivo fica para o admin.
 */

export interface DocumentGroupView {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  /** Link seguro do Asaas quando o envio precisa ser feito por lá (ex.: selfie). */
  onboardingUrl: string | null;
  canUpload: boolean;
}

/** Espera mínima entre a criação da subconta e a consulta dos documentos. */
export const DOCUMENT_WAIT_MS = 15_000;
/** Status do grupo que já não pedem envio (PENDING = enviado, em análise). */
const SETTLED = new Set(["PENDING", "APPROVED", "IGNORED", "AWAITING_APPROVAL"]);
/** Foto (qualquer formato que o servidor converte) ou PDF; tipo vazio acontece com HEIC em alguns aparelhos. */
const UPLOAD_TYPES = new Set(["", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);
const MAX_PARTS = 4;
/** Ordem das partes no PDF do documento de identificação. */
const ID_KINDS: readonly DocumentKind[] = ["id_front", "id_back", "id_document", "cnh", "rg"];

/** Mensagem ao membro quando o Asaas não aceita o documento pela API. */
export const DOCUMENT_REFUSED =
  "O PRX BANK não recebe este documento pelo app. Se aparecer o botão “Enviar pelo link seguro”, use-o; se não, a equipe PRX já foi avisada e fala com você.";

/** Recusa de negócio do Asaas para o envio (4xx que não é credencial nem limite): o arquivo não vai por aqui. */
function refusedByAsaas(err: unknown): err is AsaasError {
  return err instanceof AsaasError && !err.ambiguous && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 403 && err.status !== 429;
}

export const needsUpload = (group: DocumentGroup): boolean => !SETTLED.has(group.status.toUpperCase());

function view(group: DocumentGroup): DocumentGroupView {
  return {
    id: group.id,
    type: group.type,
    title: group.title ?? "Documento",
    description: group.description ?? "",
    status: group.status,
    onboardingUrl: needsUpload(group) ? group.onboardingUrl : null,
    canUpload: needsUpload(group) && !group.onboardingUrl,
  };
}

export async function subaccountDocuments(userId: string, deps: AsaasDeps): Promise<{ groups: DocumentGroupView[]; rejectReasons: string | null }> {
  return withAsaasAudit({ userId }, async () => {
    const { apiKey } = await requireSubaccount(userId, deps);
    try {
      const docs = await listDocuments(deps.client, apiKey);
      return { groups: docs.data.map(view), rejectReasons: docs.rejectReasons };
    } catch (err) {
      throw toPartnerError(err, "Não foi possível consultar os documentos no PRX BANK.");
    }
  });
}

async function readBytes(path: string, deps: AsaasDeps): Promise<Uint8Array | null> {
  const file = await deps.readDocument(path);
  return file ? new Uint8Array(await file.blob.arrayBuffer()) : null;
}

/** O arquivo único que o PRX manda para o grupo, ou null quando só o membro consegue enviar. */
async function fileForGroup(userId: string, type: string, app: BankKycApplication | null, deps: AsaasDeps): Promise<DocumentUpload | null> {
  const docs = app?.documents ?? [];
  const wanted =
    type === "IDENTIFICATION"
      ? ID_KINDS.flatMap((kind) => docs.filter((d) => d.kind === kind))
      : type === "EMANCIPATION_OF_MINORS"
        ? docs.filter((d) => d.kind === "emancipation_certificate")
        : [];
  if (wanted.length === 0) return null;
  const parts = await Promise.all(wanted.slice(0, MAX_PARTS).map((d) => readBytes(d.path, deps)));
  if (parts.some((p) => p === null)) return null;
  try {
    return await buildDocumentFile(parts as Uint8Array[], type === "IDENTIFICATION" ? "documento-de-identificacao" : "certidao-de-emancipacao");
  } catch (err) {
    bankLog("warn", "bank.documents", { step: "documentos.converter", userId, outcome: "unreadable", detail: `${type}: ${describeError(err)}` });
    return null;
  }
}

export type DocumentSyncResult = { state: "wait"; retryInMs: number } | { state: "done"; sent: number; viaLink: number; memberUpload: number; refused: number };

/**
 * Consulta o que o Asaas pede e envia o que o PRX já tem (documento do
 * cadastro, certidão de emancipação). Grupos do link seguro e os que só o
 * membro tem ficam para ele, que é avisado uma vez no sino do app.
 */
export async function syncOnboardingDocuments(userId: string, deps: AsaasDeps): Promise<DocumentSyncResult> {
  return withAsaasAudit({ userId }, async () => {
    const { sub, apiKey } = await requireSubaccount(userId, deps);
    const createdAt = Date.parse(sub.accountCreatedAt ?? sub.createdAt);
    const wait = DOCUMENT_WAIT_MS - (deps.now().getTime() - createdAt);
    if (wait > 0) return { state: "wait", retryInMs: wait };

    const step = { userId, step: "documents" as const, asaasAccountId: sub.asaasAccountId };
    let sent = 0;
    let viaLink = 0;
    let memberUpload = 0;
    const refused: string[] = [];
    try {
      const [docs, app] = await Promise.all([listDocuments(deps.client, apiKey), deps.latestKyc(userId)]);
      for (const group of docs.data) {
        if (!needsUpload(group)) continue;
        if (group.onboardingUrl) {
          viaLink += 1;
          continue;
        }
        // Recusado: reenviar o mesmo arquivo do cadastro não adianta; o membro manda outro.
        const file = group.status.toUpperCase() === "REJECTED" ? null : await fileForGroup(userId, group.type, app, deps);
        if (!file) {
          memberUpload += 1;
          continue;
        }
        try {
          await uploadDocument(deps.client, apiKey, group.id, group.type, file.blob, file.filename);
          sent += 1;
        } catch (err) {
          // Recusa de um grupo não derruba os outros: o motivo vai para o admin.
          if (!refusedByAsaas(err)) throw err;
          refused.push(`${group.type}: ${describeError(err)}`);
        }
      }
    } catch (err) {
      await logProvisioning(deps, { ...step, outcome: "failed", detail: describeError(err) });
      throw toPartnerError(err, "Não foi possível enviar os documentos ao PRX BANK.");
    }

    const now = deps.now().toISOString();
    const pendingForMember = viaLink + memberUpload + refused.length > 0;
    await deps.store.saveSubaccount(userId, { documentsSyncedAt: now, ...(pendingForMember && !sub.onboardingNotifiedAt ? { onboardingNotifiedAt: now } : {}) });
    if (pendingForMember && !sub.onboardingNotifiedAt) {
      await deps.store.insertNotification({ userId, eventType: "ACCOUNT_STATUS_DOCUMENT_PENDING", ...bankMessage("onboarding_pending"), amount: null, eventId: `account:${sub.asaasAccountId}:onboarding:${now}` });
    }
    const recusas = refused.length ? ` Recusado(s) pelo Asaas na API: ${refused.join(" | ")}.` : "";
    const detail = `${sent} enviado(s) pela API; ${viaLink} pelo link seguro do Asaas; ${memberUpload} aguardando envio do membro.${recusas}${pendingForMember ? " Membro avisado no app." : ""}`;
    await logProvisioning(deps, { ...step, outcome: sent > 0 || !pendingForMember ? "sent" : "blocked", detail });
    return { state: "done", sent, viaLink, memberUpload, refused: refused.length };
  });
}

/**
 * Envio feito pelo membro para um grupo pendente: uma ou mais partes (frente e
 * verso, páginas), em foto ou PDF, viram um arquivo só. O tipo vem do próprio
 * Asaas, nunca do cliente.
 */
export async function uploadSubaccountDocument(userId: string, groupId: string, files: File[], deps: AsaasDeps): Promise<void> {
  if (files.length === 0) throw new PartnerError("Escolha o arquivo do documento.", 422);
  if (files.length > MAX_PARTS) throw new PartnerError(`Envie até ${MAX_PARTS} arquivos por documento.`, 422);
  if (files.some((f) => !UPLOAD_TYPES.has(f.type))) throw new PartnerError("Envie foto (JPG, PNG, WebP ou HEIC) ou PDF.", 422);
  if (files.some((f) => !(f.size > 0) || f.size > MAX_DOCUMENT_BYTES)) throw new PartnerError("Cada arquivo precisa ter até 10 MB.", 422);
  await withAsaasAudit({ userId }, async () => {
    const { sub, apiKey } = await requireSubaccount(userId, deps);
    try {
      const docs = await listDocuments(deps.client, apiKey);
      const group = docs.data.find((g) => g.id === groupId);
      if (!group) throw new PartnerError("Documento não encontrado. Atualize a lista e tente de novo.", 404);
      if (group.onboardingUrl) throw new PartnerError("Este documento é enviado pelo link seguro do PRX BANK.", 409);
      if (!needsUpload(group)) throw new PartnerError("Este documento já foi enviado.", 409);
      const file = await buildDocumentFile(await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer()))), group.type.toLowerCase());
      try {
        await uploadDocument(deps.client, apiKey, group.id, group.type, file.blob, file.filename);
      } catch (err) {
        if (!refusedByAsaas(err)) throw err;
        await logProvisioning(deps, { userId, step: "documents", outcome: "blocked", asaasAccountId: sub.asaasAccountId, detail: `Envio do membro recusado pelo Asaas na API (${group.type}): ${describeError(err)}` });
        throw new PartnerError(DOCUMENT_REFUSED, 409);
      }
    } catch (err) {
      throw toPartnerError(err, "Não foi possível enviar o documento ao PRX BANK.");
    }
  });
}
