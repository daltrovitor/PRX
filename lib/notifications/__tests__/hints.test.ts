// Hello World
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail, type Fetcher } from "@/lib/notifications/email";
import { emailErrorHint, senderDomain } from "@/lib/notifications/hints";

const FROM = "PRX <noreply@prx.app.br>";
const message = { to: "gabi@exemplo.com", subject: "Oi", html: "<p>Oi</p>", text: "Oi", template: "welcome_email" as const };

/** Respostas do Resend como a API devolve (formato conferido com chamadas reais sem chave e com chave falsa). */
const jsonResponse = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** O texto que o painel mostra: o erro que sendEmail grava para uma resposta do Resend. */
async function failureFor(status: number, name: string, text: string): Promise<string> {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  const fetcher: Fetcher = async () => jsonResponse(status, { statusCode: status, name, message: text });
  const result = await sendEmail(message, fetcher);
  if (result.status !== "failed") throw new Error(`esperava falha, veio ${result.status}`);
  return result.error;
}

afterEach(() => vi.unstubAllEnvs());

describe("domínio do remetente", () => {
  it("tira o domínio do endereço, com ou sem nome", () => {
    expect(senderDomain("PRX <noreply@prx.app.br>")).toBe("prx.app.br");
    expect(senderDomain("noreply@send.PRX.app.br")).toBe("send.prx.app.br");
    expect(senderDomain("sem arroba")).toBeNull();
    expect(senderDomain("")).toBeNull();
  });
});

describe("dicas para quando o e-mail não sai", () => {
  it("sem chave no servidor (produção): diz onde criar a chave e onde colocá-la", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    const result = await sendEmail(message);
    expect(result).toMatchObject({ status: "skipped" });
    const hint = emailErrorHint(result.status === "skipped" ? result.reason : null, FROM) ?? "";
    expect(hint).toContain("API Keys");
    expect(hint).toContain("Sending access");
    expect(hint).toContain("RESEND_API_KEY");
    expect(hint).toContain("novo deploy");
  });

  it("chave inválida: 401 validation_error 'API key is invalid' (resposta real do Resend)", async () => {
    const error = await failureFor(401, "validation_error", "API key is invalid");
    expect(error).toBe("401 validation_error API key is invalid");
    expect(emailErrorHint(error, FROM)).toContain("recusou a chave");
  });

  it("chave ausente, inativa ou suspensa", async () => {
    expect(emailErrorHint(await failureFor(401, "missing_api_key", "Missing API Key"), FROM)).toContain("não tem a chave");
    expect(emailErrorHint(await failureFor(403, "restricted_api_key", "API key is not active"), FROM)).toContain("recusou a chave");
    expect(emailErrorHint(await failureFor(403, "suspended_api_key", "This API key is suspended"), FROM)).toContain("recusou a chave");
  });

  it("domínio não verificado: cita o domínio do remetente e o PRX_EMAIL_FROM", async () => {
    const error = await failureFor(403, "validation_error", "The `prx.app.br` domain is not verified. Please, add and verify your domain on https://resend.com/domains");
    const hint = emailErrorHint(error, FROM) ?? "";
    expect(hint).toContain("prx.app.br");
    expect(hint).toContain('"Verified"');
    expect(hint).toContain("PRX_EMAIL_FROM");
    // com remetente de subdomínio, a dica fala do subdomínio
    expect(emailErrorHint(error, "PRX <noreply@send.prx.app.br>")).toContain("send.prx.app.br");
  });

  it("só e-mail de teste para o dono da conta (remetente do Resend ou domínio sem verificar)", async () => {
    const error = await failureFor(403, "validation_error", "You can only send testing emails to your own email address (dono@exemplo.com).");
    expect(emailErrorHint(error, FROM)).toContain("domínio verificado");
  });

  it("remetente em formato inválido", async () => {
    const error = await failureFor(422, "invalid_from_address", "Invalid `from` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.");
    expect(emailErrorHint(error, "PRX noreply")).toContain("formato inválido");
  });

  it("limites do plano, velocidade, instabilidade e rede", async () => {
    expect(emailErrorHint(await failureFor(429, "daily_quota_exceeded", "You have exceeded your daily email sending quota."), FROM)).toContain("limite de envios");
    expect(emailErrorHint(await failureFor(429, "monthly_quota_exceeded", "You have exceeded your monthly email sending quota."), FROM)).toContain("limite de envios");
    expect(emailErrorHint(await failureFor(429, "rate_limit_exceeded", "Too many requests. Please limit the number of requests per second."), FROM)).toContain("velocidade");
    expect(emailErrorHint(await failureFor(500, "application_error", "An unexpected error occurred."), FROM)).toContain("instável");
    expect(emailErrorHint(await failureFor(503, "service_unavailable", "API is temporarily unavailable"), FROM)).toContain("instável");

    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const offline: Fetcher = async () => {
      throw new Error("fetch failed");
    };
    const result = await sendEmail(message, offline);
    expect(emailErrorHint(result.status === "failed" ? result.error : null, FROM)).toContain("falar com o Resend");
  });

  it("destinatário inválido", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const result = await sendEmail({ ...message, to: "isso-nao-e-email" });
    expect(emailErrorHint(result.status === "skipped" ? result.reason : null, FROM)).toContain("destinatário é inválido");
  });

  it("erro desconhecido ou vazio não inventa dica", () => {
    expect(emailErrorHint("400 validation_error Algo que ninguém previu", FROM)).toBeNull();
    expect(emailErrorHint("", FROM)).toBeNull();
    expect(emailErrorHint(null, FROM)).toBeNull();
    expect(emailErrorHint(undefined, FROM)).toBeNull();
  });
});
