// Hello World
import { z } from "zod";
import { PRX_CATEGORIES } from "@/lib/pass-data";
import { inferDocumentType, isValidDocument, onlyDigits } from "@/lib/partners/documents";

/**
 * "Seja um parceiro": empresas (ou membros que indicam uma empresa) pedem para
 * entrar no PRX PASS. Vira um lead para a equipe comercial; o cadastro do
 * parceiro, o contrato e os benefícios continuam no admin.
 */

export const PARTNER_LEADS_MIGRATION = "20261018_prx_atendimento.sql";

export const LEAD_CATEGORY_IDS = [...PRX_CATEGORIES.filter((c) => c.id !== "all").map((c) => c.id), "outro"];
export const leadCategoryName = (id: string) => PRX_CATEGORIES.find((c) => c.id === id)?.name ?? "Outra categoria";

export const LEAD_RELATIONS = ["dono", "socio", "equipe", "indicacao"] as const;
export type LeadRelation = (typeof LEAD_RELATIONS)[number];
export const LEAD_RELATION_LABEL: Record<LeadRelation, string> = {
  dono: "Sou dono(a)",
  socio: "Sou sócio(a)",
  equipe: "Trabalho na empresa",
  indicacao: "Estou indicando a empresa",
};

export const LEAD_STATUSES = ["new", "contacted", "converted", "discarded"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Novo",
  contacted: "Em conversa",
  converted: "Virou parceiro",
  discarded: "Descartado",
};

export interface PartnerLead {
  id: string;
  businessName: string;
  /** CNPJ ou CPF, só dígitos (opcional). */
  document: string;
  categoryId: string;
  city: string;
  contactName: string;
  relation: LeadRelation;
  email: string;
  phone: string;
  link: string;
  offer: string;
  status: LeadStatus;
  note: string;
  submittedBy: string | null;
  /** Aceite do contato pela equipe PRX (LGPD). */
  consentAt: string;
  createdAt: string;
  updatedAt: string;
}

const text = (min: number, max: number, message: string) => z.string().trim().min(min, message).max(max);

export const partnerLeadSchema = z.object({
  businessName: text(2, 120, "Informe o nome da empresa."),
  document: z
    .string()
    .default("")
    .transform(onlyDigits)
    .refine((v) => v === "" || (inferDocumentType(v) !== null && isValidDocument(inferDocumentType(v)!, v)), "CNPJ ou CPF inválido."),
  categoryId: z.string().refine((v) => LEAD_CATEGORY_IDS.includes(v), "Escolha a categoria."),
  city: text(2, 120, "Informe a cidade."),
  contactName: text(2, 120, "Informe seu nome."),
  relation: z.enum(LEAD_RELATIONS, { error: "Conte sua relação com a empresa." }),
  email: z.string().trim().toLowerCase().max(160).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Informe um e-mail válido."),
  phone: z
    .string()
    .transform(onlyDigits)
    .refine((v) => v.length === 10 || v.length === 11, "Informe o telefone com DDD."),
  link: z.string().trim().max(200).default(""),
  offer: text(10, 1000, "Conte em poucas linhas o que a empresa quer oferecer aos membros."),
  consent: z.literal(true, { error: "Autorize o contato da equipe PRX." }),
});
export type PartnerLeadInput = z.output<typeof partnerLeadSchema>;

export const leadUpdateSchema = z.object({
  id: z.string().trim().min(1).max(80),
  status: z.enum(LEAD_STATUSES).optional(),
  note: z.string().trim().max(1000).optional(),
});
