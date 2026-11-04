// Hello World
import { describe, expect, it } from "vitest";
import { bankLogLine, deployTag } from "@/lib/bank/log";
import { bankMessage } from "@/lib/bank/messages";
import { maskDocumentNumber, sanitizePayload, scrubText } from "@/lib/bank/sanitize";
import { decryptSecret, encryptSecret } from "@/lib/bank/secrets";

describe("sanitização de payloads e textos", () => {
  it("remove chaves e tokens e mascara dados pessoais", () => {
    const clean = sanitizePayload({
      name: "Ana Souza Lima",
      email: "ana@prx.dev",
      cpfCnpj: "52998224725",
      birthDate: "2000-05-10",
      mobilePhone: "11987654321",
      address: "Avenida Paulista",
      addressNumber: "1000",
      postalCode: "01310100",
      incomeValue: 4500,
      apiKey: "sk_live_abc",
      accessToken: { id: "tok_1", apiKey: "sk_live_def" },
      webhooks: [{ authToken: "t".repeat(40), email: "suporte@prx.app.br", url: "https://prx.app.br/api/bank/webhooks/pix" }],
    }) as Record<string, unknown>;
    const text = JSON.stringify(clean);
    expect(text).not.toContain("sk_live");
    expect(text).not.toContain("t".repeat(40));
    expect(text).not.toContain("52998224725");
    expect(text).not.toContain("ana@prx.dev");
    expect(text).not.toContain("987654321");
    expect(clean).toMatchObject({ name: "Ana S. L.", cpfCnpj: "***.982.247-**", birthDate: "2000-**-**", postalCode: "01310100", incomeValue: 4500, addressNumber: "***", address: "Ave***" });
    expect((clean.accessToken as Record<string, unknown>).id).toBe("tok_1");
  });

  it("limpa textos livres e descreve arquivos sem o conteúdo", () => {
    expect(scrubText("O CPF 529.982.247-25 e o e-mail ana@prx.dev já existem")).toBe("O CPF ***.982.247-** e o e-mail a***@prx.dev já existem");
    expect(scrubText("falhou com Bearer abcdef123456 e api_key=sk_live_123456")).toBe("falhou com Bearer [removido] e api_key=[removido]");
    expect(maskDocumentNumber("11.222.333/0001-81")).toBe("**.222.333/0001-**");
    const form = new FormData();
    form.append("type", "IDENTIFICATION");
    form.append("documentFile", new Blob(["conteudo-secreto"], { type: "application/pdf" }), "rg.pdf");
    expect(sanitizePayload(form)).toEqual({ type: "IDENTIFICATION", documentFile: { arquivo: "rg.pdf", tipo: "application/pdf", bytes: 16 } });
  });
});

describe("linha de log estruturada", () => {
  it("JSON com o deploy, sem campos vazios e com CPF, e-mail e chave mascarados", () => {
    const line = bankLogLine(
      "error",
      "bank.provisioning",
      { userId: "u-1", error: "CPF 529.982.247-25 de ana@prx.dev recusado com api_key=sk_live_abcdef123456", providerId: null, detail: "" },
      new Date("2026-10-13T12:00:00Z")
    );
    const entry = JSON.parse(line) as Record<string, unknown>;
    expect(entry).toMatchObject({ ts: "2026-10-13T12:00:00.000Z", level: "error", scope: "prx-bank", event: "bank.provisioning", userId: "u-1" });
    expect(entry).not.toHaveProperty("providerId");
    expect(entry).not.toHaveProperty("detail");
    expect(line).not.toContain("529.982.247-25");
    expect(line).not.toContain("ana@prx.dev");
    expect(line).not.toContain("sk_live_abcdef123456");
  });

  it("identifica o deploy que escreveu a linha", () => {
    expect(deployTag({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "abcdef123" })).toBe("production@abcdef1");
    expect(deployTag({})).toBe("local");
  });
});

describe("cifra das chaves de API do banco parceiro", () => {
  const env = { BANK_ENCRYPTION_KEY: "k".repeat(40) };
  /** Formato v1:<kid>:<iv>:<tag>:<dados>, tudo em base64url. */
  const FORMAT = /^v1:[a-z]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/;

  it("cifra e decifra, sem o texto aberto", () => {
    const sealed = encryptSecret("chave-da-conta", env);
    expect(sealed).toMatch(FORMAT);
    expect(sealed).not.toContain("chave-da-conta");
    expect(decryptSecret(sealed, env)).toBe("chave-da-conta");
    expect(encryptSecret("chave-da-conta", env)).not.toBe(sealed);
  });

  it("detecta adulteração", () => {
    const parts = encryptSecret("segredo", env).split(":");
    parts[4] = Buffer.from("outro").toString("base64url");
    expect(() => decryptSecret(parts.join(":"), env)).toThrow();
  });

  it("guarda qual chave cifrou: ligar BANK_ENCRYPTION_KEY depois não perde as antigas", () => {
    const before = { SUPABASE_SERVICE_ROLE_KEY: "eyJservice" };
    const sealed = encryptSecret("antiga", before);
    expect(sealed.split(":")[1]).toBe("s");
    const after = { ...before, ...env };
    expect(decryptSecret(sealed, after)).toBe("antiga");
    expect(encryptSecret("nova", after).split(":")[1]).toBe("k");
  });

  it("sem nenhuma chave configurada, recusa cifrar", () => {
    expect(() => encryptSecret("x", {})).toThrow(/BANK_ENCRYPTION_KEY/);
  });
});

describe("textos dos avisos", () => {
  const full = (m: { title: string; body: string }) => `${m.title} ${m.body}`.replace(/ /g, " ");

  it("seguem as mensagens combinadas para cada evento", () => {
    expect(full(bankMessage("pix_received", { amount: 10, counterparty: "Bruno" }))).toBe("Pix recebido! R$ 10,00 de Bruno. O valor já está no seu saldo.");
    expect(full(bankMessage("pix_sent", { amount: 25.5, counterparty: "Ana" }))).toMatch(/^Pix enviado com sucesso! R\$ 25,50 para Ana\./);
    expect(full(bankMessage("transfer_failed", { amount: 15 }))).toBe("Falha na transferência de R$ 15,00. O valor foi estornado ao seu saldo.");
    expect(full(bankMessage("bill_paid", { amount: 80 }))).toBe("Boleto pago com sucesso! Pagamento de R$ 80,00 compensado.");
    expect(full(bankMessage("bill_failed"))).toBe("Falha no pagamento de conta. O saldo foi liberado.");
    expect(full(bankMessage("account_approved"))).toBe("Sua conta bancária foi aprovada! 🎉 Você já pode enviar e receber Pix.");
    expect(full(bankMessage("account_rejected"))).toBe("Atenção aos seus documentos Refaça o envio para ativar sua conta.");
  });
});
