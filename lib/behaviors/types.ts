// Hello World
import { z } from "zod";
import { isValidCnpj } from "@/lib/partners/documents";

/**
 * Comportamentos financeiros verificáveis. A PRX cadastra empresas (CNPJ,
 * nomes, chaves Pix) e regras configuráveis; o motor confere as regras com os
 * pagamentos que saíram das contas PRX BANK. Nada é presumido: sem dado
 * suficiente, o resultado é "não verificável".
 */

export const BEHAVIORS_MIGRATION = "20261016_prx_behaviors.sql";

/** Canais que a PRX enxerga hoje: Pix por chave, Pix QR Code e boleto pagos pela conta PRX BANK. Cartão ainda não existe. */
export const BEHAVIOR_CHANNELS = ["pix_key", "pix_qr", "bill"] as const;
export type BehaviorChannel = (typeof BEHAVIOR_CHANNELS)[number];
export const CHANNEL_LABEL: Record<BehaviorChannel, string> = { pix_key: "Pix por chave", pix_qr: "Pix QR Code", bill: "Boleto" };

export const COMPARATORS = ["at_least", "none"] as const;
export type Comparator = (typeof COMPARATORS)[number];
export const COMPARATOR_LABEL: Record<Comparator, string> = { at_least: "Pagou pelo menos N vezes", none: "Não pagou nenhuma vez" };

export const POLARITIES = ["positive", "negative"] as const;
export type Polarity = (typeof POLARITIES)[number];
export const POLARITY_LABEL: Record<Polarity, string> = { positive: "Positivo", negative: "Negativo" };

export const RESULTS = ["identified", "not_identified", "unverifiable"] as const;
export type BehaviorResult = (typeof RESULTS)[number];
export const RESULT_LABEL: Record<BehaviorResult, string> = { identified: "Identificado", not_identified: "Não identificado", unverifiable: "Não verificável" };

export const EVALUATION_STATUSES = ["final", "under_review", "corrected"] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];
export const EVALUATION_STATUS_LABEL: Record<EvaluationStatus, string> = { final: "Definitivo", under_review: "Em revisão", corrected: "Corrigido pela equipe" };

/** Como o pagamento foi ligado à empresa. Nome é sinal fraco: vai para revisão humana. */
export type MatchMethod = "cnpj" | "pix_key" | "name";
export const MATCH_LABEL: Record<MatchMethod, string> = { cnpj: "CNPJ do recebedor", pix_key: "Chave Pix cadastrada", name: "Nome parecido (revisar)" };

export interface BehaviorCompany {
  id: string;
  cnpj: string;
  legalName: string;
  tradeName: string;
  identifiers: string[];
  category: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BehaviorRule {
  id: string;
  name: string;
  description: string;
  polarity: Polarity;
  comparator: Comparator;
  threshold: number;
  minAmount: number;
  channels: BehaviorChannel[];
  categories: string[];
  observationDays: number;
  startsAt: string | null;
  endsAt: string | null;
  coins: number;
  xp: number;
  status: "active" | "inactive";
  companyIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  outgoingId: string;
  date: string;
  amount: number;
  channel: BehaviorChannel;
  counterparty: string;
  companyId: string;
  companyName: string;
  matchedBy: MatchMethod;
}

export interface BehaviorEvaluation {
  id: string;
  ruleId: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  result: BehaviorResult;
  status: EvaluationStatus;
  evidence: Evidence[];
  dataSource: string;
  reason: string;
  rewardApplied: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
}

export interface ImportRun {
  id: string;
  fileName: string;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  errors: Array<{ row: number; message: string }>;
  actor: string;
  createdAt: string;
}

const onlyDigits = (v: string) => v.replace(/\D/g, "");

/** Chave Pix ou nome alternativo no formato usado na comparação. */
export function normalizeIdentifier(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (value.includes("@")) return value.toLowerCase();
  const digits = onlyDigits(value);
  // Telefone com ou sem +55; CPF/CNPJ só dígitos.
  if (/^\+?[\d\s().-]+$/.test(value) && digits.length >= 10) return digits.length === 13 && digits.startsWith("55") ? digits.slice(2) : digits;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value.toLowerCase();
  return normalizeName(value);
}

const COMPANY_SUFFIXES = /\b(ltda|me|epp|eireli|s\/?a|sa|limitada|mei|ss|cia|comercio|servicos)\b/g;

/** Nome para comparação: sem acento, pontuação e sufixos societários. */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]/g, " ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const cnpjField = z
  .string()
  .trim()
  .transform(onlyDigits)
  .refine((v) => v.length === 14, "CNPJ precisa de 14 dígitos.")
  .refine(isValidCnpj, "CNPJ inválido (dígitos verificadores).");

export const companyInputSchema = z.object({
  cnpj: cnpjField,
  legalName: z.string().trim().min(2, "Informe a razão social.").max(200),
  tradeName: z.string().trim().max(200).default(""),
  identifiers: z
    .array(z.string().max(140))
    .max(20, "No máximo 20 identificadores por empresa.")
    .default([])
    .transform((list) => [...new Set(list.map(normalizeIdentifier).filter(Boolean))]),
  category: z.string().trim().max(60).default(""),
  notes: z.string().trim().max(500).default(""),
  active: z.boolean().default(true),
});
export type CompanyInput = z.output<typeof companyInputSchema>;

const iso = z.union([z.null(), z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida.")]).default(null);

export const ruleInputSchema = z
  .object({
    name: z.string().trim().min(3, "Dê um nome à regra.").max(120),
    description: z.string().trim().max(600).default(""),
    polarity: z.enum(POLARITIES),
    comparator: z.enum(COMPARATORS),
    threshold: z.coerce.number().int().min(1).max(1000).default(1),
    minAmount: z.coerce.number().min(0).max(1_000_000).default(0),
    channels: z.array(z.enum(BEHAVIOR_CHANNELS)).min(1, "Escolha ao menos um canal.").default([...BEHAVIOR_CHANNELS]),
    categories: z
      .array(z.string().trim().max(60))
      .max(20)
      .default([])
      .transform((list) => [...new Set(list.filter(Boolean))]),
    companyIds: z.array(z.string().trim().min(1).max(80)).max(5000).default([]),
    observationDays: z.coerce.number().int().min(1, "O período mínimo é 1 dia.").max(366, "O período máximo é 366 dias."),
    startsAt: iso,
    endsAt: iso,
    coins: z.coerce.number().int().min(0).max(100_000).default(0),
    xp: z.coerce.number().int().min(0).max(1_000_000).default(0),
    status: z.enum(["active", "inactive"]).default("inactive"),
  })
  .refine((r) => r.companyIds.length > 0 || r.categories.length > 0, { path: ["companyIds"], message: "Ligue a regra a empresas ou a categorias." })
  .refine((r) => r.polarity === "positive" || (r.coins === 0 && r.xp === 0), { path: ["coins"], message: "Só comportamento positivo dá coins ou XP." })
  .refine((r) => !r.startsAt || !r.endsAt || Date.parse(r.endsAt) > Date.parse(r.startsAt), { path: ["endsAt"], message: "O fim precisa ser depois do início." });
export type RuleInput = z.output<typeof ruleInputSchema>;
