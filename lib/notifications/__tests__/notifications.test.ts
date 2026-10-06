// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail, type Fetcher } from "@/lib/notifications/email";
import { firstName, maskEmail, maskPhone, unescapeStored } from "@/lib/notifications/format";
import { memoryDeliveries, resetNotificationMemory } from "@/lib/notifications/log";
import { renderWelcomeEmail } from "@/lib/notifications/templates/welcome-email";
import { sendWelcomeEmail } from "@/lib/notifications/welcome";
import { sendWhatsAppCode, whatsappCodePayload } from "@/lib/notifications/whatsapp";
import { sanitizeInput } from "@/lib/security";

const BASE = { email: "gabi@exemplo.com", siteUrl: "https://teste.prx.app.br/", assetsUrl: "https://teste.prx.app.br", startingCoins: 0 };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("formatação", () => {
  it("mascara e-mail e celular", () => {
    expect(maskEmail("Gabi@Exemplo.com")).toBe("g***@exemplo.com");
    expect(maskPhone("11988887777")).toBe("(11) *****-7777");
  });

  it("desfaz o escape do cadastro antes de escapar de novo", () => {
    const stored = sanitizeInput("Ana D'Ávila & Cia");
    expect(unescapeStored(stored)).toBe("Ana D'Ávila & Cia");
    expect(firstName(sanitizeInput("  Gabriela   Souza "))).toBe("Gabriela");
  });
});

describe("e-mail de boas-vindas", () => {
  it("traz a saudação com o primeiro nome e o texto da PRX", () => {
    const email = renderWelcomeEmail({ ...BASE, name: "Gabriela Souza" });
    expect(email.subject).toBe("Você entrou. Welcome to PRX.");
    expect(email.html).toContain("Hey, GABRIELA.");
    expect(email.html).toContain("Aqui, suas escolhas valem.");
    expect(email.html).toContain("Good choices. Real rewards.");
    expect(email.html).toContain('href="mailto:suporte@prx.app.br"');
    expect(email.text).toContain("suporte@prx.app.br");
    for (const pillar of ["PASS", "BANK", "LIVE", "INVEST", "LEVEL", "ME"]) expect(email.html).toContain(`PRX <span style="color:#9468fa;">${pillar}</span>`);
    expect(email.html).toContain("Você entrou<br>no próximo.");
    expect(email.text).toContain("Hey, Gabriela.");
    expect(email.text).toContain("Ideia boa merece sair do bloco de notas.");
    // Links e imagens absolutos, sem barra dupla.
    expect(email.html).toContain('href="https://teste.prx.app.br"');
    expect(email.html).toContain("https://teste.prx.app.br/email/hero.jpg");
    expect(email.html).not.toContain("//email/");
  });

  it("escapa o nome e o e-mail (sem HTML injetado)", () => {
    const email = renderWelcomeEmail({ ...BASE, name: sanitizeInput("<img src=x onerror=alert(1)>"), email: "a<b@x.com" });
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("Hey, &lt;IMG.");
    expect(email.html).toContain("a&lt;b@x.com");
  });

  it("só mostra o saldo inicial quando há coins de boas-vindas", () => {
    expect(renderWelcomeEmail({ ...BASE, name: "Gabi" }).html).not.toContain("Seu saldo inicial");
    const withCoins = renderWelcomeEmail({ ...BASE, name: "Gabi", startingCoins: 50 });
    expect(withCoins.html).toContain("50 PRX COINS");
    expect(withCoins.text).toContain("Seu saldo inicial: 50 PRX COINS");
  });

  it("sem nome, a saudação fica neutra", () => {
    expect(renderWelcomeEmail({ ...BASE, name: "   " }).html).toContain(">Hey.</p>");
  });
});

describe("envio de e-mail (Resend)", () => {
  const message = { to: "gabi@exemplo.com", subject: "Oi", html: "<p>Oi</p>", text: "Oi", template: "welcome_email" as const };

  it("simula no desenvolvimento sem chave", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetcher = vi.fn<Fetcher>();
    await expect(sendEmail(message, fetcher)).resolves.toEqual({ status: "simulated" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("pula em produção sem chave", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendEmail(message)).resolves.toMatchObject({ status: "skipped" });
  });

  it("sem configuração, sai do noreply com resposta para o suporte", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("PRX_EMAIL_FROM", "");
    vi.stubEnv("PRX_EMAIL_REPLY_TO", "");
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, { id: "email_1" }));
    await sendEmail(message, fetcher);
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toMatchObject({ from: "PRX <noreply@prx.app.br>", reply_to: "suporte@prx.app.br" });
  });

  it("envia com a chave, remetente e idempotência", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("PRX_EMAIL_FROM", "PRX <noreply@prx.app.br>");
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, { id: "email_123" }));
    const result = await sendEmail({ ...message, idempotencyKey: "welcome-u1" }, fetcher);
    expect(result).toEqual({ status: "sent", provider: "resend", providerId: "email_123" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    expect(headers["Idempotency-Key"]).toBe("welcome-u1");
    expect(JSON.parse(String(init.body))).toMatchObject({ from: "PRX <noreply@prx.app.br>", to: ["gabi@exemplo.com"], subject: "Oi" });
  });

  it("devolve a falha do provedor sem lançar", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(422, { name: "validation_error", message: "Domínio não verificado" }));
    await expect(sendEmail(message, fetcher)).resolves.toMatchObject({ status: "failed", provider: "resend", error: expect.stringContaining("Domínio não verificado") });
    const offline = vi.fn<Fetcher>(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(sendEmail(message, offline)).resolves.toMatchObject({ status: "failed", error: "ECONNRESET" });
  });

  it("recusa destinatário inválido", async () => {
    await expect(sendEmail({ ...message, to: "sem-arroba" })).resolves.toMatchObject({ status: "skipped" });
  });
});

describe("boas-vindas com registro de envio", () => {
  beforeEach(() => resetNotificationMemory());

  it("registra o envio mascarado e nunca lança", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendWelcomeEmail({ id: "u1", email: "gabi@exemplo.com", fullName: "Gabi" })).resolves.toEqual({ status: "simulated" });
    const [record] = memoryDeliveries();
    expect(record).toMatchObject({ userId: "u1", channel: "email", template: "welcome_email", recipient: "g***@exemplo.com", status: "simulated" });
  });
});

describe("código no WhatsApp (Cloud API)", () => {
  it("monta o template de autenticação com o código no corpo e no botão", () => {
    vi.stubEnv("WHATSAPP_OTP_TEMPLATE", "prx_codigo_verificacao");
    const payload = whatsappCodePayload("11988887777", "123456");
    expect(payload.to).toBe("5511988887777");
    expect(payload.template.name).toBe("prx_codigo_verificacao");
    expect(payload.template.language.code).toBe("pt_BR");
    expect(payload.template.components[0]).toEqual({ type: "body", parameters: [{ type: "text", text: "123456" }] });
    expect(payload.template.components[1]).toEqual({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] });
  });

  it("simula sem credenciais e envia com elas", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    await expect(sendWhatsAppCode("11988887777", "123456")).resolves.toEqual({ status: "simulated" });

    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "EAAG-test");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1098765");
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, { messages: [{ id: "wamid.abc" }] }));
    await expect(sendWhatsAppCode("11988887777", "123456", fetcher)).resolves.toEqual({ status: "sent", provider: "whatsapp_cloud", providerId: "wamid.abc" });
    expect(fetcher.mock.calls[0][0]).toBe("https://graph.facebook.com/v23.0/1098765/messages");
  });

  it("devolve o erro da Meta", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "EAAG-test");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1098765");
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(400, { error: { message: "Template name does not exist", code: 132001 } }));
    await expect(sendWhatsAppCode("11988887777", "123456", fetcher)).resolves.toMatchObject({ status: "failed", error: expect.stringContaining("132001") });
  });

  it("não envia número ou código inválido", async () => {
    await expect(sendWhatsAppCode("119888", "123456")).resolves.toMatchObject({ status: "skipped" });
    await expect(sendWhatsAppCode("11988887777", "12a456")).resolves.toMatchObject({ status: "skipped" });
  });
});
