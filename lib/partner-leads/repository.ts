// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { requireTable } from "@/lib/db-features";
import {
  LEAD_RELATIONS,
  LEAD_STATUSES,
  PARTNER_LEADS_MIGRATION,
  type LeadRelation,
  type LeadStatus,
  type PartnerLead,
  type PartnerLeadInput,
} from "@/lib/partner-leads/types";

/** Leads do "Seja um parceiro": Supabase (partner_leads) ou memória no desenvolvimento. */

type Row = Record<string, unknown>;
const need = () => requireTable("partner_leads", PARTNER_LEADS_MIGRATION);
const now = () => new Date().toISOString();

function mapLead(r: Row): PartnerLead {
  return {
    id: String(r.id),
    businessName: String(r.business_name ?? ""),
    document: String(r.document ?? ""),
    categoryId: String(r.category_id ?? "outro"),
    city: String(r.city ?? ""),
    contactName: String(r.contact_name ?? ""),
    relation: (LEAD_RELATIONS as readonly string[]).includes(String(r.relation)) ? (r.relation as LeadRelation) : "indicacao",
    email: String(r.email ?? ""),
    phone: String(r.phone ?? ""),
    link: String(r.link ?? ""),
    offer: String(r.offer ?? ""),
    status: (LEAD_STATUSES as readonly string[]).includes(String(r.status)) ? (r.status as LeadStatus) : "new",
    note: String(r.note ?? ""),
    submittedBy: (r.submitted_by as string | null) ?? null,
    consentAt: String(r.consent_at ?? r.created_at),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at ?? r.created_at),
  };
}

const state = (): PartnerLead[] => ((globalThis as unknown as { __prxPartnerLeads?: PartnerLead[] }).__prxPartnerLeads ??= []);

export async function createPartnerLead(input: PartnerLeadInput, submittedBy: string | null): Promise<PartnerLead> {
  const { consent, ...lead } = input;
  const consentAt = consent ? now() : "";
  if (supabaseAdmin) {
    await need();
    const { data, error } = await supabaseAdmin
      .from("partner_leads")
      .insert({
        business_name: lead.businessName,
        document: lead.document || null,
        category_id: lead.categoryId,
        city: lead.city,
        contact_name: lead.contactName,
        relation: lead.relation,
        email: lead.email,
        phone: lead.phone,
        link: lead.link,
        offer: lead.offer,
        submitted_by: submittedBy,
        consent_at: consentAt,
      })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível enviar o pedido de parceria");
    return mapLead(data as Row);
  }
  const at = now();
  const created: PartnerLead = { ...lead, id: crypto.randomUUID(), status: "new", note: "", submittedBy, consentAt, createdAt: at, updatedAt: at };
  state().unshift(created);
  return structuredClone(created);
}

export async function listPartnerLeads(status?: LeadStatus): Promise<PartnerLead[]> {
  if (supabaseAdmin) {
    await need();
    let q = supabaseAdmin.from("partner_leads").select("*").order("created_at", { ascending: false }).limit(500);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw dbError(error, "Não foi possível listar os pedidos de parceria");
    return ((data ?? []) as Row[]).map(mapLead);
  }
  return structuredClone(state().filter((l) => !status || l.status === status));
}

export async function updatePartnerLead(id: string, patch: { status?: LeadStatus; note?: string }): Promise<PartnerLead> {
  if (supabaseAdmin) {
    await need();
    const row: Row = { updated_at: now() };
    if (patch.status) row.status = patch.status;
    if (patch.note !== undefined) row.note = patch.note;
    const { data, error } = await supabaseAdmin.from("partner_leads").update(row).eq("id", id).select("*").maybeSingle();
    if (error?.code === "22P02") throw new PartnerError("Pedido não encontrado.", 404);
    if (error) throw dbError(error, "Não foi possível atualizar o pedido de parceria");
    if (!data) throw new PartnerError("Pedido não encontrado.", 404);
    return mapLead(data as Row);
  }
  const lead = state().find((l) => l.id === id);
  if (!lead) throw new PartnerError("Pedido não encontrado.", 404);
  if (patch.status) lead.status = patch.status;
  if (patch.note !== undefined) lead.note = patch.note;
  lead.updatedAt = now();
  return structuredClone(lead);
}
