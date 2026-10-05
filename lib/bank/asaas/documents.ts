// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { toPartnerError } from "@/lib/asaas/errors";
import { listDocuments, uploadDocument, type DocumentGroup } from "@/lib/asaas/accounts";
import type { DocumentKind } from "@/lib/family/types";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { requireSubaccount } from "@/lib/bank/asaas/onboarding";

/**
 * Documentos que o Asaas pede para aprovar a subconta. Frente e verso do
 * documento com foto já enviados no KYC do PRX seguem direto do bucket privado;
 * o que faltar (selfie, comprovantes) o membro envia aqui ou pelo link seguro
 * do Asaas (onboardingUrl), sem sair da marca PRX nos demais passos.
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

const DONE = new Set(["APPROVED", "AWAITING_APPROVAL"]);
const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024;
/** Documentos do KYC do PRX e o grupo do banco parceiro a que cada conjunto serve (a emancipação só vale para menores). */
const FORWARDED_GROUPS: ReadonlyArray<{ type: string; kinds: readonly DocumentKind[] }> = [
  { type: "IDENTIFICATION", kinds: ["id_front", "id_back"] },
  { type: "EMANCIPATION_OF_MINORS", kinds: ["emancipation_certificate"] },
];

function view(group: DocumentGroup): DocumentGroupView {
  return {
    id: group.id,
    type: group.type,
    title: group.title ?? "Documento",
    description: group.description ?? "",
    status: group.status,
    onboardingUrl: group.onboardingUrl,
    canUpload: !DONE.has(group.status.toUpperCase()) && !group.onboardingUrl,
  };
}

export async function subaccountDocuments(userId: string, deps: AsaasDeps): Promise<{ groups: DocumentGroupView[]; rejectReasons: string | null }> {
  const { apiKey } = await requireSubaccount(userId, deps);
  try {
    const docs = await listDocuments(deps.client, apiKey);
    return { groups: docs.data.map(view), rejectReasons: docs.rejectReasons };
  } catch (err) {
    throw toPartnerError(err, "Não foi possível consultar os documentos no PRX BANK.");
  }
}

/** Reaproveita os documentos enviados na abertura (frente e verso; certidão de emancipação do menor). Devolve quantos arquivos foram enviados. */
export async function forwardKycDocuments(userId: string, deps: AsaasDeps): Promise<number> {
  const { apiKey } = await requireSubaccount(userId, deps);
  const app = await deps.latestKyc(userId);
  const documents = app?.documents ?? [];
  if (!documents.some((d) => FORWARDED_GROUPS.some((g) => g.kinds.includes(d.kind)))) return 0;
  try {
    const docs = await listDocuments(deps.client, apiKey);
    let sent = 0;
    for (const group of FORWARDED_GROUPS) {
      const files = documents.filter((d) => group.kinds.includes(d.kind));
      const target = docs.data.find((g) => g.type === group.type && !DONE.has(g.status.toUpperCase()) && !g.onboardingUrl);
      if (files.length === 0 || !target) continue;
      for (const ref of files) {
        const file = await deps.readDocument(ref.path);
        if (!file) continue;
        await uploadDocument(deps.client, apiKey, target.id, target.type, file.blob, file.filename);
        sent += 1;
      }
    }
    return sent;
  } catch (err) {
    throw toPartnerError(err, "Não foi possível enviar os documentos ao PRX BANK.");
  }
}

/** Envio feito pelo membro para um grupo pendente. O tipo vem do próprio Asaas, nunca do cliente. */
export async function uploadSubaccountDocument(userId: string, groupId: string, file: File, deps: AsaasDeps): Promise<void> {
  if (!UPLOAD_TYPES.has(file.type)) throw new PartnerError("Envie foto (JPG ou PNG) ou PDF.", 422);
  if (!(file.size > 0) || file.size > MAX_BYTES) throw new PartnerError("O arquivo precisa ter até 10 MB.", 422);
  const { apiKey } = await requireSubaccount(userId, deps);
  try {
    const docs = await listDocuments(deps.client, apiKey);
    const group = docs.data.find((g) => g.id === groupId);
    if (!group) throw new PartnerError("Documento não encontrado. Atualize a lista e tente de novo.", 404);
    if (group.onboardingUrl) throw new PartnerError("Este documento é enviado pelo link seguro do PRX BANK.", 409);
    if (DONE.has(group.status.toUpperCase())) throw new PartnerError("Este documento já foi enviado.", 409);
    await uploadDocument(deps.client, apiKey, group.id, group.type, file, file.name || "documento");
  } catch (err) {
    throw toPartnerError(err, "Não foi possível enviar o documento ao PRX BANK.");
  }
}
