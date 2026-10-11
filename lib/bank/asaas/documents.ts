// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { toPartnerError } from "@/lib/asaas/errors";
import { withAsaasAudit } from "@/lib/asaas/audit";
import { listDocuments, uploadDocument, type DocumentGroup } from "@/lib/asaas/accounts";
import type { DocumentKind } from "@/lib/family/types";
import type { BankKycApplication } from "@/lib/kyc/types";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { bankMessage } from "@/lib/bank/asaas/messages";
import { jpegsToPdf, sniffKind } from "@/lib/bank/asaas/pdf";
import { describeError, logProvisioning } from "@/lib/bank/asaas/provisioning-log";
import { requireSubaccount } from "@/lib/bank/asaas/subaccount";

/**
 * Documentos que o Asaas pede para aprovar a subconta (docs: onboarding-e-envio-
 * de-documentos-via-link). Regras da documentação seguidas aqui:
 *   - consultar só 15 s depois da criação (antes, vêm pedidos que deixam de valer);
 *   - grupo com onboardingUrl: o titular envia pelo link do Asaas (documento e
 *     selfie); nunca pela API;
 *   - um arquivo por grupo: frente e verso vão juntos num PDF (um segundo envio
 *     substituiria o primeiro).
 * O que o PRX não consegue enviar sozinho, o membro envia pela aba PRX BANK.
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
const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024;
const ID_KINDS: readonly DocumentKind[] = ["id_front", "id_back"];
const SINGLE_ID_KINDS: readonly DocumentKind[] = ["id_document", "cnh", "rg"];

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

type Readable = { blob: Blob; filename: string; bytes: Uint8Array };

async function read(path: string, deps: AsaasDeps): Promise<Readable | null> {
  const file = await deps.readDocument(path);
  if (!file) return null;
  return { ...file, bytes: new Uint8Array(await file.blob.arrayBuffer()) };
}

const MIME = { jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" } as const;

/** Um arquivo do cadastro como o Asaas aceita (JPG, PNG ou PDF), conferido pelos bytes. */
function asUpload(file: Readable): { blob: Blob; filename: string } | null {
  const kind = sniffKind(file.bytes);
  if (kind === "other") return null;
  return { blob: new Blob([file.bytes as BlobPart], { type: MIME[kind] }), filename: file.filename };
}

/** O arquivo único que o PRX manda para o grupo, ou null quando só o membro consegue enviar. */
async function fileForGroup(type: string, app: BankKycApplication | null, deps: AsaasDeps): Promise<{ blob: Blob; filename: string } | null> {
  const docs = app?.documents ?? [];
  if (type === "IDENTIFICATION") {
    const sides = docs.filter((d) => ID_KINDS.includes(d.kind));
    if (sides.length >= 2) {
      const files = (await Promise.all(sides.slice(0, 2).map((d) => read(d.path, deps)))).filter((f): f is Readable => f !== null);
      const pdf = files.length === 2 ? jpegsToPdf(files.map((f) => f.bytes)) : null;
      return pdf ? { blob: new Blob([pdf as BlobPart], { type: "application/pdf" }), filename: "documento-frente-e-verso.pdf" } : null;
    }
    const single = docs.find((d) => SINGLE_ID_KINDS.includes(d.kind) || ID_KINDS.includes(d.kind));
    const file = single ? await read(single.path, deps) : null;
    return file ? asUpload(file) : null;
  }
  if (type === "EMANCIPATION_OF_MINORS") {
    const certificate = docs.find((d) => d.kind === "emancipation_certificate");
    const file = certificate ? await read(certificate.path, deps) : null;
    return file ? asUpload(file) : null;
  }
  return null;
}

export type DocumentSyncResult = { state: "wait"; retryInMs: number } | { state: "done"; sent: number; viaLink: number; memberUpload: number };

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
    try {
      const [docs, app] = await Promise.all([listDocuments(deps.client, apiKey), deps.latestKyc(userId)]);
      for (const group of docs.data) {
        if (!needsUpload(group)) continue;
        if (group.onboardingUrl) {
          viaLink += 1;
          continue;
        }
        const file = await fileForGroup(group.type, app, deps);
        if (!file) {
          memberUpload += 1;
          continue;
        }
        await uploadDocument(deps.client, apiKey, group.id, group.type, file.blob, file.filename);
        sent += 1;
      }
    } catch (err) {
      await logProvisioning(deps, { ...step, outcome: "failed", detail: describeError(err) });
      throw toPartnerError(err, "Não foi possível enviar os documentos ao PRX BANK.");
    }

    const now = deps.now().toISOString();
    const pendingForMember = viaLink + memberUpload > 0;
    await deps.store.saveSubaccount(userId, { documentsSyncedAt: now, ...(pendingForMember && !sub.onboardingNotifiedAt ? { onboardingNotifiedAt: now } : {}) });
    if (pendingForMember && !sub.onboardingNotifiedAt) {
      await deps.store.insertNotification({ userId, eventType: "ACCOUNT_STATUS_DOCUMENT_PENDING", ...bankMessage("onboarding_pending"), amount: null, eventId: `account:${sub.asaasAccountId}:onboarding:${now}` });
    }
    const detail = `${sent} enviado(s) pela API; ${viaLink} pelo link seguro do Asaas; ${memberUpload} aguardando envio do membro.${pendingForMember ? " Membro avisado no app." : ""}`;
    await logProvisioning(deps, { ...step, outcome: sent > 0 || !pendingForMember ? "sent" : "blocked", detail });
    return { state: "done", sent, viaLink, memberUpload };
  });
}

/** Envio feito pelo membro para um grupo pendente. O tipo vem do próprio Asaas, nunca do cliente. */
export async function uploadSubaccountDocument(userId: string, groupId: string, file: File, deps: AsaasDeps): Promise<void> {
  if (!UPLOAD_TYPES.has(file.type)) throw new PartnerError("Envie foto (JPG ou PNG) ou PDF.", 422);
  if (!(file.size > 0) || file.size > MAX_BYTES) throw new PartnerError("O arquivo precisa ter até 10 MB.", 422);
  await withAsaasAudit({ userId }, async () => {
    const { apiKey } = await requireSubaccount(userId, deps);
    try {
      const docs = await listDocuments(deps.client, apiKey);
      const group = docs.data.find((g) => g.id === groupId);
      if (!group) throw new PartnerError("Documento não encontrado. Atualize a lista e tente de novo.", 404);
      if (group.onboardingUrl) throw new PartnerError("Este documento é enviado pelo link seguro do PRX BANK.", 409);
      if (!needsUpload(group)) throw new PartnerError("Este documento já foi enviado.", 409);
      await uploadDocument(deps.client, apiKey, group.id, group.type, file, file.name || "documento");
    } catch (err) {
      throw toPartnerError(err, "Não foi possível enviar o documento ao PRX BANK.");
    }
  });
}
