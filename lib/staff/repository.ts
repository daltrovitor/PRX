// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { DEMO_ACCOUNTS_ENABLED } from "@/lib/server-secrets";
import { PartnerError, dbError } from "@/lib/partners/errors";

/**
 * Equipe PRX: funcionários da própria PRX que validam ingressos e benefícios
 * no portal staff.prx.app.br. O login tem papel "staff"; as permissões ficam aqui.
 */
export interface StaffMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  canValidateTickets: boolean;
  canValidateBenefits: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NewStaff = Omit<StaffMember, "id" | "createdAt" | "updatedAt">;
export type StaffPatch = Partial<Pick<StaffMember, "name" | "canValidateTickets" | "canValidateBenefits" | "active" | "userId" | "email">>;

export interface StaffRepository {
  list(): Promise<StaffMember[]>;
  get(id: string): Promise<StaffMember | null>;
  getByUser(userId: string, email?: string | null): Promise<StaffMember | null>;
  insert(staff: NewStaff): Promise<StaffMember>;
  update(id: string, patch: StaffPatch): Promise<StaffMember>;
}

interface StaffRow {
  id: string;
  user_id: string;
  email: string;
  name: string;
  can_validate_tickets: boolean;
  can_validate_benefits: boolean;
  active: boolean;
  created_at: string;
  updated_at: string | null;
}

function mapStaff(r: StaffRow): StaffMember {
  return {
    id: r.id,
    userId: r.user_id,
    email: r.email,
    name: r.name,
    canValidateTickets: r.can_validate_tickets,
    canValidateBenefits: r.can_validate_benefits,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}

function staffToRow(p: StaffPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.userId !== undefined) row.user_id = p.userId;
  if (p.email !== undefined) row.email = p.email;
  if (p.name !== undefined) row.name = p.name;
  if (p.canValidateTickets !== undefined) row.can_validate_tickets = p.canValidateTickets;
  if (p.canValidateBenefits !== undefined) row.can_validate_benefits = p.canValidateBenefits;
  if (p.active !== undefined) row.active = p.active;
  return row;
}

type SupabaseClient = NonNullable<typeof supabaseAdmin>;

class SupabaseStaffRepository implements StaffRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list() {
    const { data, error } = await this.db.from("staff_members").select("*").order("created_at", { ascending: false });
    if (error) throw dbError(error, "Não foi possível listar a equipe");
    return (data as StaffRow[]).map(mapStaff);
  }

  async get(id: string) {
    const { data, error } = await this.db.from("staff_members").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (error.code === "22P02") return null;
      throw dbError(error, "Não foi possível consultar o funcionário");
    }
    return data ? mapStaff(data as StaffRow) : null;
  }

  async getByUser(userId: string, email?: string | null) {
    const { data, error } = await this.db.from("staff_members").select("*").eq("user_id", userId).maybeSingle();
    if (error && error.code !== "22P02") throw dbError(error, "Não foi possível consultar o funcionário");
    if (data) return mapStaff(data as StaffRow);
    if (!email) return null;
    const byEmail = await this.db.from("staff_members").select("*").eq("email", email.toLowerCase()).maybeSingle();
    if (byEmail.error) throw dbError(byEmail.error, "Não foi possível consultar o funcionário");
    return byEmail.data ? mapStaff(byEmail.data as StaffRow) : null;
  }

  async insert(staff: NewStaff) {
    const { data, error } = await this.db.from("staff_members").insert(staffToRow(staff)).select("*").single();
    if (error) {
      if (error.code === "23505") throw new PartnerError("Esta conta já faz parte da equipe.", 409);
      throw dbError(error, "Não foi possível cadastrar o funcionário");
    }
    return mapStaff(data as StaffRow);
  }

  async update(id: string, patch: StaffPatch) {
    const { data, error } = await this.db
      .from("staff_members")
      .update({ ...staffToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw dbError(error, "Não foi possível atualizar o funcionário");
    if (!data) throw new PartnerError("Funcionário não encontrado.", 404);
    return mapStaff(data as StaffRow);
  }
}

class MemoryStaffRepository implements StaffRepository {
  constructor(private readonly staff: StaffMember[]) {}

  async list() {
    return structuredClone([...this.staff].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async get(id: string) {
    const found = this.staff.find((s) => s.id === id);
    return found ? structuredClone(found) : null;
  }

  async getByUser(userId: string, email?: string | null) {
    const lower = email?.toLowerCase();
    const found = this.staff.find((s) => s.userId === userId) ?? (lower ? this.staff.find((s) => s.email === lower) : undefined);
    return found ? structuredClone(found) : null;
  }

  async insert(staff: NewStaff) {
    if (this.staff.some((s) => s.userId === staff.userId)) throw new PartnerError("Esta conta já faz parte da equipe.", 409);
    const now = new Date().toISOString();
    const created: StaffMember = { ...staff, id: `stf_${crypto.randomBytes(6).toString("hex")}`, createdAt: now, updatedAt: now };
    this.staff.push(created);
    return structuredClone(created);
  }

  async update(id: string, patch: StaffPatch) {
    const index = this.staff.findIndex((s) => s.id === id);
    if (index === -1) throw new PartnerError("Funcionário não encontrado.", 404);
    this.staff[index] = { ...this.staff[index], ...patch, updatedAt: new Date().toISOString() };
    return structuredClone(this.staff[index]);
  }
}

const globalState = globalThis as unknown as { __prxStaff?: StaffMember[] };

function memoryStaff(): StaffMember[] {
  if (!globalState.__prxStaff) {
    const now = new Date().toISOString();
    // Conta de demonstração (só em desenvolvimento): staff@prx.dev
    globalState.__prxStaff = DEMO_ACCOUNTS_ENABLED
      ? [
          {
            id: "stf_demo",
            userId: "usr_demo_staff",
            email: "staff@prx.dev",
            name: "Equipe Demo",
            canValidateTickets: true,
            canValidateBenefits: true,
            active: true,
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [];
  }
  return globalState.__prxStaff;
}

export function getStaffRepository(): StaffRepository {
  return supabaseAdmin ? new SupabaseStaffRepository(supabaseAdmin) : new MemoryStaffRepository(memoryStaff());
}
