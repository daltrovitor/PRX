// Hello World
import { z } from "zod";
import { MAX_GATE_LEVEL } from "@/lib/pass-data";

/**
 * Domínio do PRX LIVE: eventos criados pelo admin, ingressos (reserva, convite,
 * gratuito), etapas da PRX RUN e submissões do PRX FOUNDERS.
 * Pagamento online ainda não existe: ingresso pago nasce como reserva
 * "aguardando pagamento" e a PRX confirma o pagamento pelo admin.
 */

export const EVENT_SERIES = ["founders", "session", "ctrl", "talks", "run", "outro", "resenha"] as const;
export type EventSeries = (typeof EVENT_SERIES)[number];

export const SERIES_LABEL: Record<EventSeries, string> = {
  founders: "PRX Founders",
  session: "PRX Session",
  ctrl: "Ctrl + PRX",
  talks: "PRX Talks",
  run: "PRX RUN",
  outro: "PRX LIVE",
  resenha: "Resenha",
};

/** Série só por lista: não aparece na agenda dos membros e não tem reserva direta. */
export const LIST_ONLY_SERIES: ReadonlyArray<EventSeries> = ["resenha"];

export const EVENT_STATUSES = ["draft", "published", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  cancelled: "Cancelado",
};

export const RUN_MODALITIES = ["5k", "10k", "21k", "42k"] as const;
export type RunModality = (typeof RUN_MODALITIES)[number];
export const SHIRT_SIZES = ["PP", "P", "M", "G", "GG", "XGG"] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];
export const DEFAULT_RUN_CATEGORIES = ["Geral", "Sub-18", "Sub-23", "Sub-30"];

export interface TicketBatch {
  id: string;
  name: string;
  price: number;
  /** Quantidade do lote; null = limitado só pela capacidade do evento. */
  quantity: number | null;
  closed: boolean;
}

export interface RunResult {
  position: number;
  name: string;
  category: string;
  modality: string;
  time: string;
}

export interface RunConfig {
  modalities: RunModality[];
  categories: string[];
  kitPickup: string;
  results: RunResult[];
}

export interface LiveEvent {
  id: string;
  series: EventSeries;
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  city: string;
  address: string;
  coverUrl: string;
  /** Lotação total; null = sem limite além dos lotes. */
  capacity: number | null;
  perUserLimit: number;
  minPrxLevel: number;
  /** Parceiro ligado ao evento (opcional): ele valida os ingressos na porta. */
  partnerId: string | null;
  partnerName: string | null;
  /** A equipe PRX pode validar ingressos deste evento. */
  staffCheckin: boolean;
  /** Idade mínima para comprar e entrar. null = ainda não definida (não publica); 0 = livre. */
  minAge: number | null;
  /** Documento oficial com foto conferido na portaria. */
  idCheckRequired: boolean;
  /** Condições de entrada além da idade (texto mostrado antes da compra). */
  entryRequirements: string;
  cancellationPolicy: string;
  organizerName: string;
  /** Quando o fluxo de portaria foi testado com um ingresso de teste (entrada + bloqueio da 2ª leitura). */
  doorTestVerifiedAt: string | null;
  doorTestVerifiedBy: string | null;
  status: EventStatus;
  batches: TicketBatch[];
  run: RunConfig | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const TICKET_STATUSES = ["pending_payment", "valid", "used", "cancelled"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  pending_payment: "Aguardando pagamento",
  valid: "Válido",
  used: "Utilizado",
  cancelled: "Cancelado",
};

export type TicketSource = "purchase" | "free" | "invite";
export type ValidatorRole = "admin" | "partner" | "staff";

export interface RunDetails {
  modality: RunModality;
  category: string;
  shirtSize: ShirtSize;
  termsAcceptedAt: string;
}

export interface LiveTicket {
  id: string;
  code: string;
  eventId: string;
  batchId: string;
  batchName: string;
  userId: string;
  userEmail: string;
  holderName: string;
  price: number;
  status: TicketStatus;
  source: TicketSource;
  runDetails: RunDetails | null;
  issuedBy: string | null;
  note: string;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  checkedInAt: string | null;
  checkedInBy: string | null;
  checkedInByRole: ValidatorRole | null;
  checkedInByName: string | null;
  /** Ingresso de teste (simulação/portaria): não é venda, não ocupa lugar e não libera entrada real. */
  isTest: boolean;
  /** Preço do lote antes do desconto; null em ingressos antigos (sem desconto). */
  originalPrice: number | null;
  discount: number;
  promoCodeId: string | null;
}

export const FOUNDERS_STATUSES = ["sent", "review", "selected", "not_selected"] as const;
export type FoundersStatus = (typeof FOUNDERS_STATUSES)[number];

export const FOUNDERS_PIPELINE: ReadonlyArray<{ status: FoundersStatus; label: string; detail: string }> = [
  { status: "sent", label: "Enviada", detail: "Recebemos sua startup." },
  { status: "review", label: "Em análise", detail: "O time de Rafael Molina avalia o pitch." },
  { status: "selected", label: "Selecionada", detail: "Convite para o Demo Day e mentoria." },
];

export const FOUNDERS_STATUS_LABEL: Record<FoundersStatus, string> = {
  sent: "Enviada",
  review: "Em análise",
  selected: "Selecionada",
  not_selected: "Não selecionada",
};

export type StartupStage = "ideia" | "mvp" | "tracao";
export const STARTUP_STAGE_LABEL: Record<StartupStage, string> = { ideia: "Ideia", mvp: "MVP no ar", tracao: "Com tração" };

export interface FoundersSubmission {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  startupName: string;
  oneLiner: string;
  stage: StartupStage;
  videoUrl: string;
  deckFileName: string;
  /** Caminho do PDF no storage privado (ou chave do arquivo em memória no modo dev). */
  deckPath: string | null;
  status: FoundersStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Schemas de entrada                                                          */
/* -------------------------------------------------------------------------- */

/** Capa: URL pública (storage) ou imagem embutida/compactada no banco. */
const coverUrl = z
  .string()
  .trim()
  .max(5_000_000)
  .refine(
    (v) => v === "" || /^https:\/\/\S+$/i.test(v) || /^prx:gz:/i.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
    "Imagem de capa inválida."
  );

const isoDateTime = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Data e hora inválidas.");

export const batchSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1, "Dê um nome ao lote.").max(60),
  price: z.coerce.number().min(0, "Preço não pode ser negativo.").max(100_000),
  quantity: z.union([z.coerce.number().int().min(1, "Quantidade mínima de 1."), z.null()]).default(null),
  closed: z.boolean().default(false),
});

export const runResultSchema = z.object({
  position: z.coerce.number().int().min(1),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(40).default(""),
  modality: z.string().trim().max(10).default(""),
  time: z.string().trim().max(20).default(""),
});

export const runConfigSchema = z.object({
  modalities: z.array(z.enum(RUN_MODALITIES)).min(1, "Escolha ao menos uma distância."),
  categories: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  kitPickup: z.string().trim().max(300).default(""),
  results: z.array(runResultSchema).max(5000).default([]),
});

export const eventInputSchema = z
  .object({
    series: z.enum(EVENT_SERIES),
    title: z.string().trim().min(3, "Dê um título ao evento.").max(120),
    summary: z.string().trim().min(10, "Descreva o evento em pelo menos 10 caracteres.").max(2000),
    startsAt: isoDateTime,
    endsAt: z.union([isoDateTime, z.null()]).default(null),
    venue: z.string().trim().min(2, "Informe o local.").max(120),
    city: z.string().trim().min(2, "Informe a cidade.").max(120),
    address: z.string().trim().max(300).default(""),
    coverUrl: coverUrl.default(""),
    capacity: z.union([z.coerce.number().int().min(1), z.null()]).default(null),
    perUserLimit: z.coerce.number().int().min(1).max(20).default(1),
    minPrxLevel: z.coerce.number().int().min(1).max(MAX_GATE_LEVEL).default(1),
    partnerId: z.union([z.string().trim().min(1), z.null()]).default(null),
    staffCheckin: z.boolean().default(true),
    // null primeiro: z.coerce.number() transformaria null em 0 ("Livre") e liberaria a publicação.
    minAge: z.union([z.null(), z.coerce.number().int().min(0).max(21)]).default(null),
    idCheckRequired: z.boolean().default(false),
    entryRequirements: z.string().trim().max(600).default(""),
    cancellationPolicy: z.string().trim().max(1500).default(""),
    organizerName: z.string().trim().max(120).default(""),
    status: z.enum(EVENT_STATUSES).default("draft"),
    batches: z.array(batchSchema).min(1, "Crie ao menos um lote (pode ser gratuito).").max(20),
    run: z.union([runConfigSchema, z.null()]).default(null),
  })
  .superRefine((e, ctx) => {
    if (e.endsAt && new Date(e.endsAt) < new Date(e.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O fim não pode ser antes do início." });
    }
    if (e.series === "run" && !e.run) {
      ctx.addIssue({ code: "custom", path: ["run"], message: "Etapas da PRX RUN precisam de distâncias e categorias." });
    }
    const ids = new Set(e.batches.map((b) => b.id));
    if (ids.size !== e.batches.length) ctx.addIssue({ code: "custom", path: ["batches"], message: "Lotes repetidos." });
  });

export type EventInput = z.output<typeof eventInputSchema>;

export const runDetailsInputSchema = z.object({
  modality: z.enum(RUN_MODALITIES),
  category: z.string().trim().min(1).max(40),
  shirtSize: z.enum(SHIRT_SIZES),
  acceptedTerms: z.literal(true, { error: "Aceite o termo de responsabilidade para concluir a inscrição." }),
});

export const foundersInputSchema = z.object({
  startupName: z.string().trim().min(2, "Informe o nome da startup.").max(80),
  oneLiner: z.string().trim().min(20, "Descreva a startup em pelo menos 20 caracteres.").max(280),
  stage: z.enum(["ideia", "mvp", "tracao"]),
  videoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/\S+\.\S+/.test(v), "O link do vídeo precisa começar com https://")
    .default(""),
});
