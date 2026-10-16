// Hello World
import crypto from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError, isMissingTable } from "@/lib/partners/errors";
import { requireTable } from "@/lib/db-features";

/**
 * Documentos jurídicos que o responsável aceita na liberação de um menor
 * (tabela consent_documents, migração 20261016_prx_checkout.sql). O admin
 * cadastra versões (texto e, quando chegar, o certificado em PDF), escolhe a
 * vigente e registra a aprovação do jurídico. Enquanto não houver versão
 * cadastrada, vale o texto padrão abaixo, marcado como "aguardando revisão
 * jurídica": a PRX não afirma validação que ainda não aconteceu. Cada
 * liberação guarda a versão e o hash do texto aceito.
 */

export const GUARDIAN_DOC_KEY = "guardian_event_authorization";

export interface ConsentDocument {
  id: string | null;
  key: string;
  version: string;
  title: string;
  body: string;
  certificateUrl: string | null;
  active: boolean;
  legalStatus: "pending_review" | "approved";
  legalReviewedBy: string | null;
  legalReviewedAt: string | null;
  legalNote: string;
  createdAt: string | null;
}

/** Texto usado desde 12/10/2026 na página de liberação (antes do documento oficial). */
export const BUILTIN_GUARDIAN_DOCUMENT: ConsentDocument = {
  id: null,
  key: GUARDIAN_DOC_KEY,
  version: "padrao-2026-10-12",
  title: "Termo de Consentimento e Responsabilidade (ECA - Lei Federal nº 8.069/1990)",
  body: "Declaro sob as penas da lei que sou pai, mãe ou responsável legal do(a) participante menor de idade indicado(a), tendo ciência plena do horário, local e classificação indicativa do evento. Autorizo expressamente sua entrada, permanência e participação, responsabilizando-me pela veracidade das informações ora prestadas.",
  certificateUrl: null,
  active: true,
  legalStatus: "pending_review",
  legalReviewedBy: null,
  legalReviewedAt: null,
  legalNote: "Texto padrão da PRX: aguardando o documento oficial e a revisão jurídica.",
  createdAt: null,
};

export const documentHash = (doc: Pick<ConsentDocument, "version" | "body">): string => crypto.createHash("sha256").update(`${doc.version}\n${doc.body}`, "utf8").digest("hex");

type Row = Record<string, unknown>;
const map = (r: Row): ConsentDocument => ({
  id: String(r.id),
  key: String(r.key),
  version: String(r.version),
  title: String(r.title),
  body: String(r.body),
  certificateUrl: (r.certificate_url as string | null) ?? null,
  active: r.active === true,
  legalStatus: r.legal_status === "approved" ? "approved" : "pending_review",
  legalReviewedBy: (r.legal_reviewed_by as string | null) ?? null,
  legalReviewedAt: (r.legal_reviewed_at as string | null) ?? null,
  legalNote: String(r.legal_note ?? ""),
  createdAt: String(r.created_at),
});

const memory = () => ((globalThis as unknown as { __prxConsentDocs?: ConsentDocument[] }).__prxConsentDocs ??= []);

/** Versão vigente (ou o texto padrão). */
export async function activeConsentDocument(key = GUARDIAN_DOC_KEY): Promise<ConsentDocument> {
  if (!supabaseAdmin) return structuredClone(memory().find((d) => d.key === key && d.active) ?? BUILTIN_GUARDIAN_DOCUMENT);
  const { data, error } = await supabaseAdmin.from("consent_documents").select("*").eq("key", key).eq("active", true).maybeSingle();
  if (isMissingTable(error) || !data) return BUILTIN_GUARDIAN_DOCUMENT;
  if (error) throw dbError(error, "Não foi possível ler o documento de autorização");
  return map(data as Row);
}

export async function listConsentDocuments(key = GUARDIAN_DOC_KEY): Promise<ConsentDocument[]> {
  if (!supabaseAdmin) return structuredClone(memory().filter((d) => d.key === key)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  await requireTable("consent_documents", "20261016_prx_checkout.sql");
  const { data, error } = await supabaseAdmin.from("consent_documents").select("*").eq("key", key).order("created_at", { ascending: false }).limit(50);
  if (error) throw dbError(error, "Não foi possível listar os documentos");
  return ((data ?? []) as Row[]).map(map);
}

export const consentDocumentSchema = z.object({
  version: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[\w.-]+$/, "Versão: letras, números, ponto, hífen."),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(20, "Cole o texto completo do documento.").max(20000),
  certificateUrl: z.union([z.null(), z.string().trim().url().max(2000).refine((v) => v.startsWith("https://"), "O link precisa começar com https://")]).default(null),
});

/** Nova versão (não vigente até ser ativada). */
export async function createConsentDocument(raw: unknown, actor: string, key = GUARDIAN_DOC_KEY): Promise<ConsentDocument> {
  const parsed = consentDocumentSchema.safeParse(raw);
  if (!parsed.success) throw new PartnerError(parsed.error.issues[0]?.message ?? "Confira o documento.", 422);
  const input = parsed.data;
  if (input.version === BUILTIN_GUARDIAN_DOCUMENT.version) throw new PartnerError("Esta versão é a do texto padrão. Use outra.", 409);
  if (!supabaseAdmin) {
    if (memory().some((d) => d.key === key && d.version === input.version)) throw new PartnerError("Já existe esta versão.", 409);
    const created: ConsentDocument = { ...BUILTIN_GUARDIAN_DOCUMENT, ...input, id: crypto.randomUUID(), key, active: false, legalStatus: "pending_review", legalNote: "", createdAt: new Date().toISOString() };
    memory().push(created);
    return structuredClone(created);
  }
  await requireTable("consent_documents", "20261016_prx_checkout.sql");
  const { data, error } = await supabaseAdmin
    .from("consent_documents")
    .insert({ key, version: input.version, title: input.title, body: input.body, certificate_url: input.certificateUrl, created_by: actor })
    .select("*")
    .single();
  if (error?.code === "23505") throw new PartnerError("Já existe esta versão.", 409);
  if (error) throw dbError(error, "Não foi possível salvar o documento");
  return map(data as Row);
}

/** Torna a versão vigente (as outras deixam de valer para novas liberações). */
export async function activateConsentDocument(id: string, key = GUARDIAN_DOC_KEY): Promise<void> {
  if (!supabaseAdmin) {
    for (const d of memory()) if (d.key === key) d.active = d.id === id;
    return;
  }
  await requireTable("consent_documents", "20261016_prx_checkout.sql");
  const off = await supabaseAdmin.from("consent_documents").update({ active: false }).eq("key", key).neq("id", id);
  if (off.error) throw dbError(off.error, "Não foi possível trocar a versão vigente");
  const on = await supabaseAdmin.from("consent_documents").update({ active: true }).eq("id", id).eq("key", key);
  if (on.error) throw dbError(on.error, "Não foi possível trocar a versão vigente");
}

/** Registro explícito da aprovação jurídica (quem, quando e o parecer). */
export async function approveConsentDocument(id: string, note: string, actor: string): Promise<void> {
  if (note.trim().length < 5) throw new PartnerError("Descreva a aprovação (ex.: parecer nº, advogado responsável).", 422);
  const patch = { legalStatus: "approved" as const, legalReviewedBy: actor, legalReviewedAt: new Date().toISOString(), legalNote: note.trim().slice(0, 1000) };
  if (!supabaseAdmin) {
    const found = memory().find((d) => d.id === id);
    if (!found) throw new PartnerError("Documento não encontrado.", 404);
    Object.assign(found, patch);
    return;
  }
  const { error } = await supabaseAdmin
    .from("consent_documents")
    .update({ legal_status: "approved", legal_reviewed_by: actor, legal_reviewed_at: patch.legalReviewedAt, legal_note: patch.legalNote })
    .eq("id", id);
  if (error) throw dbError(error, "Não foi possível registrar a aprovação");
}

/** Só para testes. */
export function resetConsentDocumentsMemory(): void {
  (globalThis as unknown as { __prxConsentDocs?: ConsentDocument[] }).__prxConsentDocs = [];
}
