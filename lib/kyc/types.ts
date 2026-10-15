// Hello World
import { z } from "zod";
import { INCOME_RANGES, TEEN_PATHS, birthDateSchema, cpfSchema, documentRefSchema, onlyDigits, type DocumentRef, type IncomeRange, type TeenPath } from "@/lib/family/types";

/*
 * Abertura do PRX BANK (KYC bancário). É o único momento, fora da Conta Pai,
 * em que pedimos documentos: CPF, documento com foto (frente e verso),
 * endereço para o cartão e as declarações exigidas na qualificação do cliente
 * (Circular BCB 3.978/2020 — renda, ocupação e condição de pessoa
 * politicamente exposta). A conta só movimenta dinheiro depois da aprovação.
 */

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
export type Uf = (typeof UFS)[number];

/** DDDs válidos no Brasil (Anatel). */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75,
  77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Celular brasileiro só com dígitos: DDD válido + 9 + 8 dígitos. */
export function isBrMobile(digits: string): boolean {
  return /^\d{11}$/.test(digits) && DDDS.has(Number(digits.slice(0, 2))) && digits[2] === "9";
}

/** Nome civil: pelo menos nome e sobrenome, só letras (com acentos), espaços, hífen e apóstrofo. */
const personName = (label: string) =>
  z
    .string()
    .trim()
    .max(120, `${label} muito longo.`)
    .transform((v) => v.replace(/\s+/g, " "))
    .refine((v) => /^[\p{L}][\p{L}'’ -]*[\p{L}]$/u.test(v), `${label}: use só letras.`)
    .refine((v) => v.split(" ").filter((p) => p.length >= 2).length >= 2, `Informe o ${label.toLowerCase()} completo, com sobrenome.`);

export const kycAddressSchema = z.object({
  cep: z
    .string()
    .transform(onlyDigits)
    .refine((v) => /^\d{8}$/.test(v) && !/^(\d)\1{7}$/.test(v), "CEP inválido."),
  street: z.string().trim().min(3, "Informe a rua.").max(120),
  number: z
    .string()
    .trim()
    .min(1, "Informe o número.")
    .max(10)
    .refine((v) => /^(\d+[A-Za-z]?|S\/?N)$/i.test(v), "Número inválido (use S/N se não houver)."),
  complement: z.string().trim().max(60).default(""),
  district: z.string().trim().min(2, "Informe o bairro.").max(80),
  city: z.string().trim().min(2, "Informe a cidade.").max(80),
  state: z.enum(UFS, { error: "Escolha a UF." }),
});
export type KycAddress = z.output<typeof kycAddressSchema>;

export const bankKycSchema = z
  .object({
    fullName: personName("Nome"),
    cpf: cpfSchema,
    birthDate: birthDateSchema,
    motherName: z
      .string()
      .trim()
      .max(120, "Nome da mãe muito longo.")
      .transform((v) => v.replace(/\s+/g, " "))
      .optional()
      .default(""),
    phone: z
      .string()
      .trim()
      .transform(onlyDigits)
      .refine(isBrMobile, "Informe um celular válido com DDD."),
    occupation: z.string().trim().min(2, "Informe a ocupação.").max(80),
    incomeRange: z.enum(INCOME_RANGES, { error: "Escolha a faixa de renda." }),
    /** Pessoa politicamente exposta (Resolução COAF 40/2021): exige diligência reforçada, não bloqueia. */
    pep: z.boolean(),
    address: kycAddressSchema,
    documents: z
      .array(documentRefSchema, { error: "Envie os documentos com foto solicitados." })
      .min(2, "Envie a frente e o verso do seu documento com foto (RG ou CNH).")
      .max(6, "Máximo de 6 documentos permitidos."),
    /** Menores de 18: vínculo com o responsável ou emancipação (16–17). */
    minorPath: z.enum(TEEN_PATHS).optional(),
    parentEmail: z.string().trim().toLowerCase().email("Informe o e-mail do responsável.").max(160).optional().or(z.literal("")),
    termsAccepted: z.literal(true, { error: "Aceite os termos da conta de pagamento para continuar." }),
  })
  .refine((v) => !v.motherName || v.fullName.toLowerCase() !== v.motherName.toLowerCase(), { message: "O nome da mãe não pode ser igual ao seu.", path: ["motherName"] });
export type BankKycInput = z.output<typeof bankKycSchema>;

export const KYC_STATUSES = ["pending", "approved", "rejected"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export const KYC_STATUS_LABEL: Record<KycStatus, string> = { pending: "Em análise", approved: "Aprovada", rejected: "Não aprovada" };

/** Sinais para a análise humana (não bloqueiam sozinhos). */
export const RISK_FLAGS = ["pep", "minor", "emancipation"] as const;
export type RiskFlag = (typeof RISK_FLAGS)[number];
export const RISK_FLAG_LABEL: Record<RiskFlag, string> = {
  pep: "Pessoa politicamente exposta — diligência reforçada",
  minor: "Menor de idade — exige responsável vinculado",
  emancipation: "Emancipação — conferir a certidão",
};

export interface BankKycApplication {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  cpf: string;
  birthDate: string;
  motherName: string;
  phone: string;
  occupation: string;
  incomeRange: IncomeRange;
  pep: boolean;
  address: KycAddress;
  documents: DocumentRef[];
  minorPath: TeenPath | null;
  riskFlags: RiskFlag[];
  status: KycStatus;
  reviewNote: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** Trilha antifraude: IP e navegador de quem enviou. */
  ip: string | null;
  userAgent: string;
  createdAt: string;
}

/** Situação da abertura de conta, como o app mostra na aba PRX BANK. */
export interface BankKycState {
  status: KycStatus | "none";
  reviewNote: string;
  /** Menor aguardando o responsável aceitar o vínculo na Conta Pai. */
  awaitingGuardian: boolean;
  /** Emancipação ainda em análise. */
  awaitingEmancipation: boolean;
  /** Quando a abertura atual foi enviada (para o membro reconhecer os dados salvos). */
  submittedAt: string | null;
}

export const KYC_REQUIRED_MESSAGE = "Abra sua conta PRX BANK primeiro: envie seus dados e documentos na aba PRX BANK.";
/** Envio encerrado pelo suporte ("Recomeçar abertura"): o membro volta ao formulário sem aviso de recusa. */
export const KYC_RESTART_NOTE = "Abertura recomeçada pelo suporte PRX.";
export const KYC_PENDING_MESSAGE = "Sua abertura de conta ainda está em andamento (responsável, emancipação ou PRX BANK). Acompanhe na aba PRX BANK.";
