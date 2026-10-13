// Hello World
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivationPanel } from "@/components/app/bank/activation-panel";
import { BankKycPanel } from "@/components/app/bank/bank-kyc";
import type { User } from "@/hooks/use-auth";
import type { BankAccountView, BankActivation, BankProviderView } from "@/lib/prx/bank";
import type { BankKycState } from "@/lib/kyc/types";

/**
 * O que o membro vê em cada etapa da abertura (render no servidor, sem banco):
 * quem já enviou os dados nunca recebe o formulário vazio de novo.
 */

const member = { id: "33333333-3333-4333-8333-333333333333", name: "Pessoa Teste", email: "p@prx.dev" } as unknown as User;
const approved: BankKycState = { status: "approved", reviewNote: "", awaitingGuardian: false, awaitingEmancipation: false, submittedAt: "2026-10-12T15:00:00Z" };

function account(activation: BankActivation, provider: BankProviderView["state"] | null): BankAccountView {
  return {
    status: "pending_activation",
    balance: 0,
    agency: null,
    accountNumber: null,
    activatedAt: null,
    transactions: [],
    pixKeys: [],
    virtualCard: null,
    cardRequest: null,
    charges: [],
    sandbox: false,
    kyc: approved,
    provider: provider ? { name: "asaas", environment: "production", state: provider, rejectReason: null } : null,
    activation,
  };
}

const render = (activation: BankActivation, provider: BankProviderView["state"] | null) =>
  renderToStaticMarkup(createElement(ActivationPanel, { account: account(activation, provider), member, onChanged: () => undefined }));

describe("tela de ativação por etapa", () => {
  it("banco indisponível: dados salvos, sem formulário nem pedido de reenvio", () => {
    const html = render("unavailable", null);
    expect(html).toContain("Recebemos seus dados");
    expect(html).toContain("12/10/2026");
    expect(html).toContain("não precisa enviar");
    expect(html).not.toContain("Abrir minha conta");
    expect(html).not.toContain("Ativar minha conta");
  });

  it("conta ainda não criada no banco: abre com os dados salvos; corrigir é opcional", () => {
    const html = render("ready", "none");
    expect(html).toContain("Abrir conta");
    expect(html).toContain("dados enviados em 12/10/2026");
    expect(html).toContain("Corrigir meus dados");
    expect(html).not.toContain("Abrir minha conta");
  });

  it("conta criada e em análise: documentos do banco, sem formulário", () => {
    const html = render("review", "pending_activation");
    expect(html).toContain("Documentos para o PRX BANK");
    expect(html).not.toContain("Corrigir meus dados");
  });

  it("abertura pendente mostra a espera, nunca o formulário nem aprovação", () => {
    const html = renderToStaticMarkup(createElement(BankKycPanel, { member, kyc: { ...approved, status: "pending" }, onDone: () => undefined }));
    expect(html).toContain("Recebemos sua abertura de conta");
    expect(html).toContain("não precisa enviar nada de novo");
    expect(html).not.toContain("Abrir minha conta");
    expect(html).not.toMatch(/aprovada/i);
  });
});
