// Hello World
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { errorResponse, LARGE_JSON_BODY_BYTES, MAX_JSON_BODY_BYTES, readJson } from "@/lib/partners/http";
import { PartnerError } from "@/lib/partners/errors";

function post(body: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/x", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  });
}

describe("readJson: teto de bytes (pentest H1)", () => {
  it("lê JSON pequeno normalmente", async () => {
    await expect(readJson(post(JSON.stringify({ ok: true })))).resolves.toEqual({ ok: true });
  });

  it("recusa com 413 quando o Content-Length declarado passa do teto", async () => {
    const req = post("{}", { "content-length": String(MAX_JSON_BODY_BYTES + 1) });
    await expect(readJson(req)).rejects.toMatchObject({ status: 413 });
  });

  it("recusa com 413 corpo que passa do teto mesmo sem Content-Length confiável", async () => {
    const big = JSON.stringify({ blob: "a".repeat(MAX_JSON_BODY_BYTES) });
    await expect(readJson(post(big))).rejects.toBeInstanceOf(PartnerError);
    await expect(readJson(post(big))).rejects.toMatchObject({ status: 413 });
  });

  it("aborta a leitura de um stream infinito sem carregá-lo todo", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(64 * 1024).fill(97));
      },
    });
    await expect(readJson(post(endless))).rejects.toMatchObject({ status: 413 });
    // 1 MB / 64 KB = 16 blocos; a leitura para logo depois do teto.
    expect(pulled).toBeLessThan(40);
  });

  it("aceita corpo maior quando a rota declara o teto grande (foto em data URL)", async () => {
    const photo = JSON.stringify({ photo: "a".repeat(MAX_JSON_BODY_BYTES + 1024) });
    await expect(readJson(post(photo), LARGE_JSON_BODY_BYTES)).resolves.toMatchObject({ photo: expect.any(String) });
  });

  it("corpo vazio ou inválido continua sendo 400", async () => {
    await expect(readJson(post("não é json"))).rejects.toMatchObject({ status: 400 });
    await expect(readJson(post(""))).rejects.toMatchObject({ status: 400 });
  });
});

describe("errorResponse: Cache-Control (pentest M13)", () => {
  it("erro 4xx de negócio sai com no-store", async () => {
    const res = await errorResponse(new PartnerError("Não pode.", 409), "teste");
    expect(res.status).toBe(409);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("erro técnico (5xx) também sai com no-store", async () => {
    const res = await errorResponse(new Error("boom"), "teste");
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
