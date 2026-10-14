// Hello World
import { z } from "zod";
import { userValidationMessage } from "@/lib/error-messages";
import { MAX_GATE_LEVEL } from "@/lib/pass-data";
import { inferDocumentType, isValidCpf, isValidDocument, onlyDigits, type DocumentType } from "@/lib/partners/documents";
import {
  REDEMPTION_MODE_IDS,
  VISIBILITY_PLAN_IDS,
  type OfferKind,
  type QuantityUnit,
  type RedemptionMode,
  type VisibilityPlan,
} from "@/lib/partners/plans";

/* -------------------------------------------------------------------------- */
/* Parceiro                                                                    */
/* -------------------------------------------------------------------------- */

/** Mesmos valores do enum partner_status do banco (migração 00001). */
export const PARTNER_STATUSES = ["PENDENTE", "ATIVO", "SUSPENSO", "BLOQUEADO"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  PENDENTE: "Pendente",
  ATIVO: "Ativo",
  SUSPENSO: "Suspenso",
  BLOQUEADO: "Bloqueado",
};

export interface PartnerRepresentative {
  name: string;
  /** CPF, só dígitos. */
  document: string;
  role: string;
  email: string;
  phone: string;
}

export interface PartnerContact {
  name: string;
  phone: string;
  email: string;
}

export interface Partner {
  id: string;
  /** Nome fantasia (exibido no app). */
  tradeName: string;
  /** Razão social. */
  legalName: string;
  documentType: DocumentType;
  /** CNPJ ou CPF, só dígitos. */
  document: string;
  categoryId: string;
  location: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  status: PartnerStatus;
  /** Conta que entra no Portal do Parceiro e valida os QR Codes. */
  ownerUserId: string | null;
  ownerEmail: string | null;
  representative: PartnerRepresentative;
  contact: PartnerContact;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Campanha e Resumo Comercial (cláusula 3)                                   */
/* -------------------------------------------------------------------------- */

export interface CommercialSummary {
  benefitTitle: string;
  benefitDescription: string;
  eligibleItem: string;
  categoryId: string;
  normalPrice: number | null;
  offerKind: OfferKind;
  prxPrice: number | null;
  discountPercent: number | null;
  giftDescription: string;
  /** Sobrescreve o rótulo automático do card ("25% OFF", "Grátis"...). */
  catalogLabel: string;
  quantity: number;
  quantityUnit: QuantityUnit;
  perUserLimit: number;
  /** AAAA-MM-DD, horário de Brasília. */
  startDate: string;
  endDate: string;
  channels: string;
  redemptionModes: RedemptionMode[];
  usageDeadlineDays: number;
  /** Cláusula 5.1: a oferta autoriza encerrar antes do fim quando esgotar. */
  earlyEndOnSellOut: boolean;
  /** "Benefício Exclusivo PRX" (cláusula 7.2). */
  exclusive: boolean;
  /** Exclusividade pós-campanha, limitada a 3 meses (7.4). */
  exclusivityMonths: number;
  plan: VisibilityPlan;
  mediaPeriods: number;
  mediaPrice: number;
  commission: string;
  minPrxLevel: number;
  rules: string[];
}

export const CAMPAIGN_STATUSES = ["draft", "sent", "accepted", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Rascunho",
  sent: "Aguardando aceite",
  accepted: "Aceita",
  cancelled: "Cancelada",
};

export interface Campaign {
  id: string;
  partnerId: string;
  status: CampaignStatus;
  /** Sobe a cada edição do Resumo Comercial. O aceite referencia a versão exata. */
  version: number;
  summary: CommercialSummary;
  /** Benefício publicado no catálogo depois do aceite. */
  benefitId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface CampaignRevision {
  campaignId: string;
  version: number;
  summary: CommercialSummary;
  changedBy: string;
  changedAt: string;
}

/** Dados do parceiro congelados no momento do aceite. */
export interface PartnerSnapshot {
  tradeName: string;
  legalName: string;
  documentType: DocumentType;
  document: string;
  location: string;
  representative: PartnerRepresentative;
  contact: PartnerContact;
}

/** Registro imutável do aceite eletrônico (cláusula 1.3 e Anexo Operacional). */
export interface ContractAcceptance {
  id: string;
  campaignId: string;
  partnerId: string;
  certificateId: string;
  termsVersion: string;
  campaignVersion: number;
  /** SHA-256 do texto integral do contrato exibido ao representante. */
  contentHash: string;
  partnerSnapshot: PartnerSnapshot;
  summarySnapshot: CommercialSummary;
  declaration: string;
  acceptedAt: string;
  userId: string;
  userEmail: string;
  authMethod: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/* -------------------------------------------------------------------------- */
/* Schemas de entrada (validação na fronteira HTTP)                           */
/* -------------------------------------------------------------------------- */

const trimmed = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);
const optionalUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Use um endereço http(s).");
const optionalImageUrl = z
  .string()
  .trim()
  .max(5_000_000)
  .refine(
    (v) => v === "" || /^https?:\/\//i.test(v) || /^prx:gz:/i.test(v) || /^data:image\//i.test(v),
    "Use um endereço de imagem válido (http, https ou imagem compactada)."
  );
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(160)
  .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido.");

export const representativeSchema = z.object({
  name: trimmed(120).default(""),
  document: z
    .string()
    .default("")
    .transform(onlyDigits)
    .refine((v) => v === "" || isValidCpf(v), "CPF do representante inválido."),
  role: trimmed(80).default(""),
  email: optionalEmail.default(""),
  phone: trimmed(30).default(""),
});

export const contactSchema = z.object({
  name: trimmed(120).default(""),
  phone: trimmed(30).default(""),
  email: optionalEmail.default(""),
});

export const partnerInputSchema = z
  .object({
    tradeName: z.string().trim().min(2, "Informe o nome fantasia.").max(120),
    legalName: z.string().trim().min(2, "Informe a razão social ou o nome completo.").max(160),
    documentType: z.enum(["CNPJ", "CPF"]).optional(),
    document: z.string().transform(onlyDigits),
    categoryId: z.string().trim().min(1, "Escolha a categoria."),
    location: z.string().trim().min(2, "Informe a cidade ou o alcance.").max(160),
    description: trimmed(600).default(""),
    logoUrl: optionalImageUrl.default(""),
    bannerUrl: optionalImageUrl.default(""),
    status: z.enum(PARTNER_STATUSES).default("ATIVO"),
    representative: representativeSchema.default({ name: "", document: "", role: "", email: "", phone: "" }),
    contact: contactSchema.default({ name: "", phone: "", email: "" }),
  })
  .transform((input, ctx) => {
    const documentType = input.documentType ?? inferDocumentType(input.document);
    if (!documentType || !isValidDocument(documentType, input.document)) {
      ctx.addIssue({ code: "custom", path: ["document"], message: "CNPJ ou CPF inválido." });
      return z.NEVER;
    }
    return { ...input, documentType };
  });

export type PartnerInput = z.output<typeof partnerInputSchema>;

/** O parceiro edita só representante e contato; dados societários ficam com a PRX. */
export const partnerSelfUpdateSchema = z.object({
  representative: representativeSchema,
  contact: contactSchema,
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD.");
const money = z.coerce.number().min(0, "Valor não pode ser negativo.").max(10_000_000);
const nullableMoney = z.union([money, z.null()]).default(null);

export const commercialSummarySchema = z
  .object({
    benefitTitle: z.string().trim().min(3, "Dê um título curto ao benefício.").max(80),
    benefitDescription: z.string().trim().min(10, "Descreva o benefício de forma clara e completa.").max(1000),
    eligibleItem: z.string().trim().min(2, "Informe o produto, serviço ou experiência.").max(200),
    categoryId: z.string().trim().min(1),
    normalPrice: nullableMoney,
    offerKind: z.enum(["preco", "percentual", "brinde"]),
    prxPrice: nullableMoney,
    discountPercent: z.union([z.coerce.number().min(1).max(100), z.null()]).default(null),
    giftDescription: trimmed(300).default(""),
    catalogLabel: trimmed(24).default(""),
    quantity: z.coerce.number().int().min(1, "A quantidade garantida precisa ser pelo menos 1.").max(1_000_000),
    quantityUnit: z.enum(["unidades", "vagas", "resgates"]),
    perUserLimit: z.coerce.number().int().min(1).max(100),
    startDate: isoDate,
    endDate: isoDate,
    channels: z.string().trim().min(2, "Informe as unidades ou canais participantes.").max(400),
    redemptionModes: z.array(z.enum(REDEMPTION_MODE_IDS as [RedemptionMode, ...RedemptionMode[]])).min(1, "Escolha ao menos uma modalidade de uso."),
    usageDeadlineDays: z.coerce.number().int().min(1).max(365),
    earlyEndOnSellOut: z.boolean().default(false),
    exclusive: z.boolean().default(true),
    exclusivityMonths: z.coerce.number().int().min(0).max(3, "A exclusividade pós-campanha é limitada a 3 meses."),
    plan: z.enum(VISIBILITY_PLAN_IDS as [VisibilityPlan, ...VisibilityPlan[]]),
    mediaPeriods: z.coerce.number().int().min(1).max(52),
    mediaPrice: money,
    commission: z.string().trim().min(2, "Descreva repasse, comissão ou taxa (ou “Sem comissão”).").max(400),
    minPrxLevel: z.coerce.number().int().min(1).max(MAX_GATE_LEVEL).default(1),
    rules: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  })
  .superRefine((s, ctx) => {
    if (s.endDate < s.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "O fim não pode ser antes do início." });
    }
    if (s.offerKind === "preco") {
      if (s.prxPrice === null) ctx.addIssue({ code: "custom", path: ["prxPrice"], message: "Informe o preço PRX." });
      if (s.normalPrice === null) ctx.addIssue({ code: "custom", path: ["normalPrice"], message: "Informe o preço normal." });
      if (s.prxPrice !== null && s.normalPrice !== null && s.prxPrice >= s.normalPrice) {
        ctx.addIssue({ code: "custom", path: ["prxPrice"], message: "O preço PRX precisa ser menor que o preço normal." });
      }
    }
    if (s.offerKind === "percentual" && s.discountPercent === null) {
      ctx.addIssue({ code: "custom", path: ["discountPercent"], message: "Informe o percentual de desconto." });
    }
    if (s.offerKind === "brinde" && s.giftDescription.length < 3) {
      ctx.addIssue({ code: "custom", path: ["giftDescription"], message: "Descreva o brinde." });
    }
    if (!s.exclusive && s.exclusivityMonths > 0) {
      ctx.addIssue({ code: "custom", path: ["exclusivityMonths"], message: "Sem “Benefício Exclusivo PRX”, a exclusividade pós-campanha é 0." });
    }
    if (s.plan === "basico" && s.mediaPrice > 0) {
      ctx.addIssue({ code: "custom", path: ["mediaPrice"], message: "O plano Básico não tem custo de mídia." });
    }
  });

/** Primeira mensagem legível de um erro do Zod. */
/** Primeira frase de validação para a tela (padrão do zod vira erro técnico com código). */
export function firstIssue(error: z.ZodError): string {
  return userValidationMessage(error.issues[0]);
}
