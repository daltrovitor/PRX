// Hello World
import { isValidCnpj } from "@/lib/partners/documents";
import { parsePixPayload } from "@/lib/prx/pix";
import { normalizeIdentifier, normalizeName, type BehaviorCompany, type BehaviorResult, type BehaviorRule, type EvaluationStatus, type Evidence, type MatchMethod } from "@/lib/behaviors/types";

/**
 * Motor dos comportamentos (puro, sem banco): recebe a regra, as empresas-alvo
 * e os pagamentos concluídos do período e devolve o resultado com as
 * evidências. Regras de prudência:
 *   - CNPJ do recebedor ou chave Pix cadastrada são provas; nome parecido é só
 *     um sinal e manda a avaliação para revisão humana;
 *   - "não pagou nenhuma vez" só vale se a conta PRX BANK estava ativa o período
 *     inteiro (sem conta, não dá para afirmar que não houve pagamento);
 *   - sem conta ativa, o resultado é "não verificável".
 */

export interface OutgoingPayment {
  id: string;
  kind: "pix_key" | "pix_qr" | "bill";
  amount: number;
  counterparty: string;
  target: string;
  counterpartyDocument: string | null;
  createdAt: string;
}

export interface EvaluationInput {
  rule: Pick<BehaviorRule, "comparator" | "threshold" | "minAmount" | "channels">;
  /** Empresas-alvo (ligadas à regra ou das categorias da regra), só as ativas. */
  companies: BehaviorCompany[];
  payments: OutgoingPayment[];
  /** Desde quando a conta PRX BANK está ativa (null = sem conta ativa). */
  accountActiveSince: string | null;
  periodStart: string;
  periodEnd: string;
}

export interface EvaluationOutcome {
  result: BehaviorResult;
  status: EvaluationStatus;
  evidence: Evidence[];
  reason: string;
}

interface Index {
  byCnpj: Map<string, BehaviorCompany>;
  byIdentifier: Map<string, BehaviorCompany>;
  byName: Map<string, BehaviorCompany>;
}

function indexCompanies(companies: BehaviorCompany[]): Index {
  const index: Index = { byCnpj: new Map(), byIdentifier: new Map(), byName: new Map() };
  for (const c of companies) {
    index.byCnpj.set(c.cnpj, c);
    for (const id of c.identifiers) index.byIdentifier.set(id, c);
    for (const name of [c.legalName, c.tradeName]) {
      const n = normalizeName(name);
      if (n.length >= 4) index.byName.set(n, c);
    }
  }
  return index;
}

/** Chave Pix de onde o dinheiro foi (por chave: o alvo; por QR: a chave dentro do código). */
function pixKeyOf(payment: OutgoingPayment): string | null {
  if (payment.kind === "pix_key") return payment.target;
  if (payment.kind === "pix_qr") return parsePixPayload(payment.target)?.key ?? null;
  return null;
}

/** Nome do recebedor quando a PRX tem um (boleto e QR guardam o nome; Pix por chave guarda "Tipo chave"). */
function nameOf(payment: OutgoingPayment): string | null {
  if (payment.kind === "pix_key") return null;
  return payment.counterparty || null;
}

export function matchPayment(payment: OutgoingPayment, index: Index): { company: BehaviorCompany; matchedBy: MatchMethod } | null {
  const doc = (payment.counterpartyDocument ?? "").replace(/\D/g, "");
  if (doc.length === 14 && index.byCnpj.has(doc)) return { company: index.byCnpj.get(doc)!, matchedBy: "cnpj" };
  const key = pixKeyOf(payment);
  if (key) {
    const keyDigits = key.replace(/\D/g, "");
    if (keyDigits.length === 14 && isValidCnpj(keyDigits) && index.byCnpj.has(keyDigits)) return { company: index.byCnpj.get(keyDigits)!, matchedBy: "cnpj" };
    const normalized = normalizeIdentifier(key);
    if (normalized && index.byIdentifier.has(normalized)) return { company: index.byIdentifier.get(normalized)!, matchedBy: "pix_key" };
  }
  const name = nameOf(payment);
  if (name) {
    const n = normalizeName(name);
    if (n && index.byName.has(n)) return { company: index.byName.get(n)!, matchedBy: "name" };
    if (n && index.byIdentifier.has(n)) return { company: index.byIdentifier.get(n)!, matchedBy: "name" };
  }
  return null;
}

export function evaluateBehavior(input: EvaluationInput): EvaluationOutcome {
  const { rule, periodStart, periodEnd } = input;
  if (!input.accountActiveSince) {
    return { result: "unverifiable", status: "final", evidence: [], reason: "Sem conta PRX BANK ativa: a PRX não tem os pagamentos desta pessoa." };
  }
  if (rule.comparator === "none" && Date.parse(input.accountActiveSince) > Date.parse(periodStart)) {
    return { result: "unverifiable", status: "final", evidence: [], reason: "A conta PRX BANK não estava ativa o período inteiro: não dá para afirmar que não houve pagamento." };
  }

  const index = indexCompanies(input.companies.filter((c) => c.active));
  const start = Date.parse(periodStart);
  const end = Date.parse(periodEnd);
  const evidence: Evidence[] = [];
  for (const p of input.payments) {
    const at = Date.parse(p.createdAt);
    if (at < start || at > end) continue;
    if (!rule.channels.includes(p.kind)) continue;
    if (p.amount < rule.minAmount) continue;
    const match = matchPayment(p, index);
    if (!match) continue;
    evidence.push({
      outgoingId: p.id,
      date: p.createdAt,
      amount: p.amount,
      channel: p.kind,
      counterparty: p.counterparty.slice(0, 140),
      companyId: match.company.id,
      companyName: match.company.tradeName || match.company.legalName,
      matchedBy: match.matchedBy,
    });
  }
  const strong = evidence.filter((e) => e.matchedBy !== "name").length;
  const weak = evidence.length - strong;

  if (rule.comparator === "at_least") {
    if (strong >= rule.threshold) return { result: "identified", status: "final", evidence, reason: `${strong} pagamento(s) confirmados por CNPJ ou chave Pix.` };
    if (strong + weak >= rule.threshold) {
      return { result: "identified", status: "under_review", evidence, reason: `${strong} confirmado(s) e ${weak} só pelo nome: a equipe confere antes de valer.` };
    }
    return { result: "not_identified", status: "final", evidence, reason: `${strong + weak} de ${rule.threshold} pagamento(s) necessários no período.` };
  }
  // "Nenhum pagamento": qualquer prova derruba; só sinal fraco vai para revisão.
  if (strong > 0) return { result: "not_identified", status: "final", evidence, reason: `${strong} pagamento(s) às empresas da regra no período.` };
  if (weak > 0) return { result: "identified", status: "under_review", evidence, reason: `Nenhum pagamento confirmado, mas ${weak} parecido(s) pelo nome: a equipe confere.` };
  return { result: "identified", status: "final", evidence, reason: "Nenhum pagamento às empresas da regra no período, com a conta ativa o tempo todo." };
}

/** Período avaliado: os últimos N dias até `asOf`, dentro da vigência da regra. null quando a regra não vale nessa data. */
export function evaluationWindow(rule: Pick<BehaviorRule, "observationDays" | "startsAt" | "endsAt">, asOf: Date): { start: string; end: string } | null {
  // Fim do período: o fim do dia (UTC) de asOf, para reavaliar o mesmo dia não duplicar.
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate(), 23, 59, 59));
  const cappedEnd = rule.endsAt && Date.parse(rule.endsAt) < end.getTime() ? new Date(rule.endsAt) : end;
  if (rule.startsAt && Date.parse(rule.startsAt) > cappedEnd.getTime()) return null;
  const start = new Date(cappedEnd.getTime() - rule.observationDays * 86_400_000 + 1000);
  const cappedStart = rule.startsAt && Date.parse(rule.startsAt) > start.getTime() ? new Date(rule.startsAt) : start;
  return { start: cappedStart.toISOString(), end: cappedEnd.toISOString() };
}
