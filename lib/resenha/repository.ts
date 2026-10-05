// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError } from "@/lib/partners/errors";
import { SupabaseResenhaRepository } from "@/lib/resenha/repository-supabase";
import { padNumber, type AccessRequest, type EditionInsider, type Insider, type RequestStatus, type ResenhaEdition } from "@/lib/resenha/types";

export type NewEdition = Omit<ResenhaEdition, "id" | "slug" | "createdAt" | "updatedAt">;
export type EditionPatch = Partial<Pick<ResenhaEdition, "hostName" | "hostArticle" | "status">>;
export type NewInsider = Omit<Insider, "id" | "createdAt">;
export type InsiderPatch = Partial<Pick<Insider, "name" | "handle" | "active">>;
export type NewParticipation = Omit<EditionInsider, "id" | "createdAt">;
export type ParticipationPatch = Partial<Pick<EditionInsider, "kind" | "quota" | "active">>;
export type NewRequest = Omit<AccessRequest, "id" | "createdAt" | "status" | "ticketId" | "decidedAt" | "decidedBy">;
export type RequestPatch = Partial<Pick<AccessRequest, "status" | "ticketId" | "decidedAt" | "decidedBy">>;

export interface ResenhaRepository {
  readonly mode: "supabase" | "memory";

  listEditions(): Promise<ResenhaEdition[]>;
  getEdition(id: string): Promise<ResenhaEdition | null>;
  getEditionBySlug(slug: string): Promise<ResenhaEdition | null>;
  nextEditionNumber(): Promise<number>;
  insertEdition(edition: NewEdition): Promise<ResenhaEdition>;
  updateEdition(id: string, patch: EditionPatch): Promise<ResenhaEdition>;

  listInsiders(): Promise<Insider[]>;
  getInsider(id: string): Promise<Insider | null>;
  getInsiderByUser(userId: string): Promise<Insider | null>;
  getInsiderByEmail(email: string): Promise<Insider | null>;
  insertInsider(insider: NewInsider): Promise<Insider>;
  updateInsider(id: string, patch: InsiderPatch): Promise<Insider>;

  listParticipations(filter?: { editionId?: string; insiderId?: string }): Promise<EditionInsider[]>;
  getParticipation(id: string): Promise<EditionInsider | null>;
  getParticipationByCode(code: string): Promise<EditionInsider | null>;
  /** 409 quando o código já existe (o serviço tenta outro). */
  insertParticipation(participation: NewParticipation): Promise<EditionInsider>;
  updateParticipation(id: string, patch: ParticipationPatch): Promise<EditionInsider>;

  listRequests(filter: { editionId?: string; editionInsiderId?: string }): Promise<AccessRequest[]>;
  getRequest(id: string): Promise<AccessRequest | null>;
  getRequestByToken(token: string): Promise<AccessRequest | null>;
  findRequest(editionId: string, email: string): Promise<AccessRequest | null>;
  insertRequest(request: NewRequest): Promise<AccessRequest>;
  /** Atualização condicional: só aplica se o status atual estiver em `fromStatuses`. */
  updateRequest(id: string, patch: RequestPatch, fromStatuses: RequestStatus[]): Promise<AccessRequest | null>;
  /** Ids dos N primeiros pedidos liberados do link (ordem da decisão): base do controle da cota. */
  firstApprovedIds(editionInsiderId: string, limit: number): Promise<string[]>;
}

/* -------------------------------------------------------------------------- */
/* Memória (desenvolvimento e testes)                                          */
/* -------------------------------------------------------------------------- */

interface MemoryState {
  editions: ResenhaEdition[];
  insiders: Insider[];
  participations: EditionInsider[];
  requests: AccessRequest[];
}

const conflict = (message: string) => new PartnerError(message, 409);
const notFound = (what: string) => new PartnerError(`${what} não encontrado.`, 404);
const now = () => new Date().toISOString();

class MemoryResenhaRepository implements ResenhaRepository {
  readonly mode = "memory" as const;
  constructor(private readonly state: MemoryState) {}

  async listEditions() {
    return structuredClone([...this.state.editions].sort((a, b) => b.number - a.number));
  }
  async getEdition(id: string) {
    return structuredClone(this.state.editions.find((e) => e.id === id) ?? null);
  }
  async getEditionBySlug(slug: string) {
    return structuredClone(this.state.editions.find((e) => e.slug === slug) ?? null);
  }
  async nextEditionNumber() {
    return Math.max(0, ...this.state.editions.map((e) => e.number)) + 1;
  }
  async insertEdition(edition: NewEdition) {
    if (this.state.editions.some((e) => e.number === edition.number || e.eventId === edition.eventId)) throw conflict("Já existe uma edição com este número.");
    const row: ResenhaEdition = { ...edition, id: crypto.randomUUID(), slug: padNumber(edition.number), createdAt: now(), updatedAt: now() };
    this.state.editions.push(row);
    return structuredClone(row);
  }
  async updateEdition(id: string, patch: EditionPatch) {
    const row = this.state.editions.find((e) => e.id === id);
    if (!row) throw notFound("Edição");
    Object.assign(row, patch, { updatedAt: now() });
    return structuredClone(row);
  }

  async listInsiders() {
    return structuredClone([...this.state.insiders].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
  }
  async getInsider(id: string) {
    return structuredClone(this.state.insiders.find((i) => i.id === id) ?? null);
  }
  async getInsiderByUser(userId: string) {
    return structuredClone(this.state.insiders.find((i) => i.userId === userId) ?? null);
  }
  async getInsiderByEmail(email: string) {
    return structuredClone(this.state.insiders.find((i) => i.email === email.toLowerCase()) ?? null);
  }
  async insertInsider(insider: NewInsider) {
    if (this.state.insiders.some((i) => i.email === insider.email || i.userId === insider.userId)) throw conflict("Este Insider já está cadastrado.");
    const row: Insider = { ...insider, id: crypto.randomUUID(), createdAt: now() };
    this.state.insiders.push(row);
    return structuredClone(row);
  }
  async updateInsider(id: string, patch: InsiderPatch) {
    const row = this.state.insiders.find((i) => i.id === id);
    if (!row) throw notFound("Insider");
    Object.assign(row, patch);
    return structuredClone(row);
  }

  async listParticipations(filter: { editionId?: string; insiderId?: string } = {}) {
    return structuredClone(
      this.state.participations
        .filter((p) => (!filter.editionId || p.editionId === filter.editionId) && (!filter.insiderId || p.insiderId === filter.insiderId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    );
  }
  async getParticipation(id: string) {
    return structuredClone(this.state.participations.find((p) => p.id === id) ?? null);
  }
  async getParticipationByCode(code: string) {
    return structuredClone(this.state.participations.find((p) => p.code === code) ?? null);
  }
  async insertParticipation(participation: NewParticipation) {
    if (this.state.participations.some((p) => p.code === participation.code)) throw conflict("Código de link repetido.");
    if (this.state.participations.some((p) => p.editionId === participation.editionId && p.insiderId === participation.insiderId)) throw conflict("Este Insider já está nesta edição.");
    const row: EditionInsider = { ...participation, id: crypto.randomUUID(), createdAt: now() };
    this.state.participations.push(row);
    return structuredClone(row);
  }
  async updateParticipation(id: string, patch: ParticipationPatch) {
    const row = this.state.participations.find((p) => p.id === id);
    if (!row) throw notFound("Insider da edição");
    Object.assign(row, patch);
    return structuredClone(row);
  }

  async listRequests(filter: { editionId?: string; editionInsiderId?: string }) {
    return structuredClone(
      this.state.requests
        .filter((r) => (!filter.editionId || r.editionId === filter.editionId) && (!filter.editionInsiderId || r.editionInsiderId === filter.editionInsiderId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    );
  }
  async getRequest(id: string) {
    return structuredClone(this.state.requests.find((r) => r.id === id) ?? null);
  }
  async getRequestByToken(token: string) {
    return structuredClone(this.state.requests.find((r) => r.token === token) ?? null);
  }
  async findRequest(editionId: string, email: string) {
    return structuredClone(this.state.requests.find((r) => r.editionId === editionId && r.email === email.toLowerCase()) ?? null);
  }
  async insertRequest(request: NewRequest) {
    if (this.state.requests.some((r) => r.editionId === request.editionId && r.email === request.email)) throw conflict("Já existe um pedido com este e-mail.");
    const row: AccessRequest = { ...request, id: crypto.randomUUID(), status: "pending", ticketId: null, decidedAt: null, decidedBy: null, createdAt: now() };
    this.state.requests.push(row);
    return structuredClone(row);
  }
  async updateRequest(id: string, patch: RequestPatch, fromStatuses: RequestStatus[]) {
    const row = this.state.requests.find((r) => r.id === id);
    if (!row || !fromStatuses.includes(row.status)) return null;
    Object.assign(row, patch);
    return structuredClone(row);
  }
  async firstApprovedIds(editionInsiderId: string, limit: number) {
    return this.state.requests
      .filter((r) => r.editionInsiderId === editionInsiderId && r.status === "approved")
      .sort((a, b) => (a.decidedAt ?? "").localeCompare(b.decidedAt ?? "") || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((r) => r.id);
  }
}

const globalState = globalThis as unknown as { __prxResenha?: MemoryState };

function memoryState(): MemoryState {
  globalState.__prxResenha ??= { editions: [], insiders: [], participations: [], requests: [] };
  return globalState.__prxResenha;
}

export function resetResenhaMemory(): void {
  delete globalState.__prxResenha;
}

export function getResenhaRepository(): ResenhaRepository {
  return supabaseAdmin ? new SupabaseResenhaRepository(supabaseAdmin) : new MemoryResenhaRepository(memoryState());
}
