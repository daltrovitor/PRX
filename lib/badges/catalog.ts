// Hello World
import { z } from "zod";

/**
 * Selos PRX (badges). Nomes curtos que o membro quer exibir no perfil; o
 * significado aparece abaixo do nome. A equipe escolhe quais selos cada
 * benefício ou parceiro concede: o selo do parceiro vale para todos os
 * benefícios dele, e um benefício pode somar selos (FIT CHECK + GREEN FLAG).
 *
 * Base: os 10 selos que recebem praticamente qualquer parceiro.
 * Especiais: recortes mais específicos.
 * Progressão: a PRX concede por consistência e evolução, não por compra.
 */

export const BADGES_MIGRATION = "20261018_prx_badges.sql";

/** A regra que acompanha os selos em todo lugar. */
export const PRX_COINS_PRINCIPLE = "PRX COINS não compram bom comportamento. Reconhecem boas escolhas.";

export const BADGE_CODES = [
  "green_flag",
  "well_mode",
  "page_up",
  "irl",
  "moneywise",
  "a_plus",
  "fit_check",
  "move",
  "builder",
  "good_human",
  "mindset",
  "world_plus",
  "creator",
  "first_move",
  "self_care",
  "social_mode",
  "smart_buy",
  "rare",
  "streak",
  "level_up",
] as const;
export type BadgeCode = (typeof BADGE_CODES)[number];

export type BadgeTier = "base" | "special" | "progress";
export const BADGE_TIER_LABEL: Record<BadgeTier, string> = {
  base: "Selos base",
  special: "Selos especiais",
  progress: "Progressão",
};

export interface Badge {
  code: BadgeCode;
  /** Nome exibido, sempre em caixa alta. */
  name: string;
  emoji: string;
  /** O que o selo reconhece (aparece abaixo do nome). */
  recognizes: string;
  /** Onde pode ser conquistado: exemplos para a equipe escolher o selo certo. */
  earnedAt: string;
  tier: BadgeTier;
  tagline?: string;
}

export const BADGES: Record<BadgeCode, Badge> = {
  green_flag: { code: "green_flag", name: "GREEN FLAG", emoji: "🌱", recognizes: "Sustentabilidade e escolhas de menor impacto", earnedAt: "Moto elétrica, produtos eco, reciclagem", tier: "base", tagline: "Your choices have receipts." },
  well_mode: { code: "well_mode", name: "WELL MODE", emoji: "⚡", recognizes: "Alimentação saudável, esporte e wellness", earnedAt: "Juistreet, academia, futvôlei, wake", tier: "base" },
  page_up: { code: "page_up", name: "PAGE UP", emoji: "📚", recognizes: "Livros e leitura", earnedAt: "Livrarias, Kindle, eventos literários", tier: "base" },
  irl: { code: "irl", name: "IRL", emoji: "📵", recognizes: "Experiências offline e vida real", earnedAt: "Wake, esportes, eventos, celular parking", tier: "base" },
  moneywise: { code: "moneywise", name: "MONEYWISE", emoji: "💸", recognizes: "Educação e responsabilidade financeira", earnedAt: "PRX BANK, investimentos, cursos", tier: "base" },
  a_plus: { code: "a_plus", name: "A+", emoji: "🎓", recognizes: "Desempenho e evolução acadêmica", earnedAt: "Escolas, cursos, idiomas", tier: "base" },
  fit_check: { code: "fit_check", name: "FIT CHECK", emoji: "👟", recognizes: "Moda, estilo e identidade", earnedAt: "Osklen, sneakers, roupas, acessórios", tier: "base", tagline: "Style with a point." },
  move: { code: "move", name: "MOVE", emoji: "🏃", recognizes: "Atividade física e esporte", earnedAt: "Academias, corrida, tênis, futvôlei", tier: "base" },
  builder: { code: "builder", name: "BUILDER", emoji: "🚀", recognizes: "Empreendedorismo e criação", earnedAt: "PRX Founders, Link, projetos", tier: "base" },
  good_human: { code: "good_human", name: "GOOD HUMAN", emoji: "🫶", recognizes: "Solidariedade e impacto positivo", earnedAt: "ONGs, voluntariado, doações", tier: "base" },
  mindset: { code: "mindset", name: "MINDSET", emoji: "🧠", recognizes: "Conhecimento e desenvolvimento pessoal", earnedAt: "Cursos, mentorias, palestras", tier: "special" },
  world_plus: { code: "world_plus", name: "WORLD+", emoji: "✈️", recognizes: "Idiomas, intercâmbio e experiências internacionais", earnedAt: "CI, viagens educacionais", tier: "special" },
  creator: { code: "creator", name: "CREATOR", emoji: "🎨", recognizes: "Criatividade, arte e produção", earnedAt: "Fotografia, música, design, conteúdo", tier: "special" },
  first_move: { code: "first_move", name: "FIRST MOVE", emoji: "💼", recognizes: "Primeiros passos de independência", earnedAt: "Primeiro emprego, estágio, Moto Chef", tier: "special" },
  self_care: { code: "self_care", name: "SELF CARE", emoji: "🧴", recognizes: "Autocuidado responsável", earnedAt: "Dermatologia, odontologia, skincare", tier: "special" },
  social_mode: { code: "social_mode", name: "SOCIAL MODE", emoji: "☕", recognizes: "Convivência e experiências presenciais", earnedAt: "Cafeterias, restaurantes, encontros", tier: "special" },
  smart_buy: { code: "smart_buy", name: "SMART BUY", emoji: "💰", recognizes: "Consumo consciente", earnedAt: "Parceiros de varejo, planejamento de compra", tier: "special" },
  rare: { code: "rare", name: "RARE", emoji: "💎", recognizes: "Experiências extraordinárias PRX", earnedAt: "Ações especiais e desafios secretos", tier: "special" },
  streak: { code: "streak", name: "STREAK", emoji: "🔥", recognizes: "Consistência", earnedAt: "Sequência de bons comportamentos", tier: "progress" },
  level_up: { code: "level_up", name: "LEVEL UP", emoji: "🏆", recognizes: "Evolução e conquista pessoal", earnedAt: "Selo especial por progressão", tier: "progress" },
};

export const BADGE_LIST: readonly Badge[] = BADGE_CODES.map((code) => BADGES[code]);
export const BADGE_TIERS: readonly BadgeTier[] = ["base", "special", "progress"];

/** Quantos selos um benefício ou parceiro pode conceder (mais que isso vira álbum de figurinha). */
export const MAX_BADGES_PER_ITEM = 4;

export const badgesSchema = z
  .array(z.enum(BADGE_CODES, { error: "Selo desconhecido." }))
  .max(MAX_BADGES_PER_ITEM, `Escolha até ${MAX_BADGES_PER_ITEM} selos.`)
  .transform((codes) => orderBadges(codes));

const isBadgeCode = (value: unknown): value is BadgeCode => typeof value === "string" && (BADGE_CODES as readonly string[]).includes(value);

/** Sem repetição e na ordem do catálogo. */
function orderBadges(codes: Iterable<BadgeCode>): BadgeCode[] {
  const set = new Set(codes);
  return BADGE_CODES.filter((code) => set.has(code));
}

/** Valor vindo do banco (text[]) → selos conhecidos; códigos desconhecidos são ignorados. */
export function normalizeBadges(value: unknown): BadgeCode[] {
  return Array.isArray(value) ? orderBadges(value.filter(isBadgeCode)) : [];
}

/** Selos do benefício somados aos do parceiro dono. */
export function mergeBadges(...lists: ReadonlyArray<ReadonlyArray<BadgeCode> | undefined>): BadgeCode[] {
  return orderBadges(lists.flatMap((list) => list ?? []));
}
