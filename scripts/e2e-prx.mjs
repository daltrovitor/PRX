// Hello World
// Teste ponta a ponta do PRX (requer `npm run dev` rodando).
// Uso: BASE=http://localhost:3000 node scripts/e2e-prx.mjs
import { chromium, devices } from "playwright";
import fs from "fs";

const BASE = process.env.BASE || "http://localhost:3000";
const ADMIN = BASE.replace("//localhost", "//admin.localhost");
const PARTNER = BASE.replace("//localhost", "//partner.localhost");
const results = [];
const errors = [];
const ok = (name, cond, extra = "") => {
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync("test-results/pitch.pdf", "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const browser = await chromium.launch();

async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem("prx_intro_seen", "true");
    } catch {}
  });
  return ctx;
}
function watch(page, label) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${label}] console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror: ${e.message}`));
}
async function waitApp(page) {
  await page.waitForSelector(".prx-loader", { state: "detached", timeout: 15000 });
}
async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    ok(name, false, e.message.split("\n")[0]);
  }
}

// ---------- Admin seeds content ----------
const adminCtx = await newCtx();
const admin = await adminCtx.newPage();
watch(admin, "admin");
await step("admin flow", async () => {
  await admin.goto(ADMIN + "/");
  await admin.waitForSelector("text=Painel administrativo", { timeout: 20000 });
  await admin.screenshot({ path: "test-results/admin-login.png" });
  await admin.getByLabel("E-mail").fill("admin@prx.dev");
  await admin.getByLabel("Senha").fill("AdminPrx2026!");
  await admin.getByRole("button", { name: "Entrar no painel" }).click();
  await admin.waitForSelector("text=Painel PRX", { timeout: 20000 });
  ok("admin login via UI", true);
  const post = (url, data) => admin.evaluate(async ([u, d]) => { const res = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); return res.status; }, [url, data]);
  let st = await post("/api/admin/benefits", { partnerName: "Café Vértice", categoryId: "gastronomia", title: "Espresso + pão de queijo", description: "Combo da manhã com desconto para membros PRX.", discountLabel: "30% OFF", minPrxLevel: 1, partnerLocation: "São Paulo, SP", terms: ["Válido de segunda a sexta", "Um uso por dia"] });
  ok("admin creates benefit", st === 200, String(st));
  await post("/api/admin/benefits", { partnerName: "Norte Sneakers", categoryId: "moda", title: "Tênis selecionados", description: "Desconto na coleção de lançamento.", discountLabel: "15% OFF", minPrxLevel: 1, partnerLocation: "Online", terms: ["Somente no site"] });
  st = await post("/api/admin/missions", { title: "Resgatar Primeiro Voucher no PRX PASS", description: "Resgate um benefício do catálogo.", xpReward: 200, total: 1, progress: 0, verificationType: "benefit_redeem", category: "PRX PASS" });
  const r = { ok: () => st === 200, status: () => st };
  ok("admin creates mission", r.ok(), String(r.status()));
  await admin.getByRole("button", { name: /Atualizar dados/ }).click();
  await admin.waitForTimeout(1200);
  await admin.screenshot({ path: "test-results/admin-desktop.png", fullPage: true });
  ok("admin panel renders", await admin.isVisible("h2:has-text('Membros')"));
  await admin.getByRole("tab", { name: /Benefícios/ }).click();
  await admin.waitForSelector("text=Espresso + pão de queijo");
  await admin.getByRole("button", { name: "Novo benefício" }).click();
  await admin.waitForSelector("role=dialog");
  await admin.waitForTimeout(500);
  await admin.screenshot({ path: "test-results/admin-benefit-sheet.png" });
  await admin.keyboard.press("Escape");
});

// ---------- Member ----------
const ctx = await newCtx();
const page = await ctx.newPage();
watch(page, "member");
let voucherCode = "";
const nav = (name) => page.locator("aside nav[aria-label='Seções do app']").getByRole("button", { name });

await step("member home", async () => {
  const r = await page.request.post(`${BASE}/api/auth/login`, { data: { email: "membro@prx.dev", password: "Prx2026!", rememberMe: true } });
  ok("member login API", r.ok(), String(r.status()));
  await page.goto(BASE + "/");
  await waitApp(page);
  await page.waitForSelector("h1:has-text('Olá')", { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: "test-results/home-desktop.png", fullPage: true });
  ok("home renders greeting", await page.isVisible("h1:has-text('Olá, Membro.')"));
  ok("home: single h1", (await page.locator("h1").count()) === 1);
});

await step("pass redeem", async () => {
  await nav("Pass").click();
  await page.waitForSelector("text=Espresso + pão de queijo");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/pass-desktop.png", fullPage: true });
  await page.getByRole("button", { name: /Espresso \+ pão de queijo/ }).first().click();
  await page.getByRole("button", { name: "Gerar voucher" }).click();
  await page.waitForSelector("text=Código para digitar no caixa", { timeout: 10000 });
  voucherCode = ((await page.locator("[role=dialog] p.font-mono").first().textContent()) || "").trim();
  ok("voucher generated", voucherCode.startsWith("PRX-"), voucherCode);
  await page.waitForSelector("img[alt^='QR Code do voucher']", { timeout: 5000 });
  ok("voucher QR image present", true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/voucher-sheet.png" });
  await page.keyboard.press("Escape");
});

await step("missions", async () => {
  await page.getByRole("tab", { name: /Missões/ }).click();
  await page.getByRole("button", { name: "Aceitar missão" }).first().click();
  await page.waitForSelector("text=Missão aceita", { timeout: 10000 });
  ok("mission accepted", true);
  await page.getByRole("button", { name: "Verificar missão" }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "test-results/missions.png", fullPage: true });
  ok("mission verified", await page.isVisible("text=/creditados|Concluída/"));
});

let payload = "";
await step("bank pix", async () => {
  await nav("Bank").click();
  await page.waitForSelector("h1:has-text('PRX BANK')");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/bank-desktop.png", fullPage: true });
  await page.getByRole("tab", { name: "Pix", exact: true }).first().click();
  await page.getByLabel("Chave Pix").fill("529.982.247-25");
  await page.getByLabel("Valor", { exact: true }).fill("12,50");
  await page.getByRole("button", { name: "Revisar Pix" }).click();
  await page.getByRole("button", { name: /Enviar R\$/ }).click();
  await page.waitForSelector("text=Pix enviado");
  ok("pix sent by CPF key", true);
  await page.locator("[role=dialog]").getByRole("button", { name: "Fechar" }).last().click();
});

await step("bank keys + charge", async () => {
  await page.getByRole("tab", { name: /Chaves Pix/ }).click();
  await page.getByRole("button", { name: "Cadastrar chave" }).click();
  await page.waitForTimeout(300);
  ok("random pix key registered", (await page.locator("li p.font-mono").count()) > 0);
  await page.getByRole("tab", { name: "Cobrar" }).click();
  await page.getByLabel(/Valor/).fill("25");
  await page.getByRole("button", { name: "Gerar QR Code" }).click();
  await page.waitForSelector("img[alt='QR Code da cobrança Pix']");
  payload = ((await page.locator("p.break-all.font-mono").first().textContent()) || "").trim();
  ok("pix charge BR Code generated", payload.startsWith("000201") && /6304[0-9A-F]{4}$/.test(payload), payload.slice(0, 30) + "…");
  await page.getByRole("button", { name: "Simular pagamento" }).click();
  ok("charge marked received", await page.isVisible("text=Recebido"));
  await page.getByRole("tab", { name: "Pix", exact: true }).first().click();
  await page.getByRole("tab", { name: "Copia e cola" }).click();
  await page.getByLabel("Código Pix Copia e Cola").fill(payload);
  await page.getByRole("button", { name: "Ler código" }).click();
  await page.waitForSelector("text=Confirmar Pix", { timeout: 5000 });
  ok("copia e cola parsed + CRC valid", true);
  await page.keyboard.press("Escape");
});

await step("bank cards", async () => {
  await page.getByRole("tab", { name: "Cartões" }).click();
  await page.getByRole("button", { name: "Ver dados" }).click();
  ok("card reveal shows full number", await page.isVisible("text=/\\d{4} \\d{4} \\d{4} \\d{4}/"));
  await page.getByRole("button", { name: "Bloquear" }).click();
  ok("card lock", await page.isVisible("text=BLOQUEADO"));
  await page.getByRole("button", { name: "Desbloquear" }).click();
  await page.getByRole("button", { name: "Solicitar cartão físico" }).click();
  await page.getByLabel("CEP").fill("01310-100");
  await page.getByLabel("Endereço", { exact: true }).fill("Av. Paulista");
  await page.getByLabel("Número").fill("1000");
  await page.getByLabel("Cidade / UF").fill("São Paulo / SP");
  await page.getByRole("button", { name: "Confirmar pedido" }).click();
  await page.waitForSelector("text=Pedido recebido", { timeout: 5000 });
  ok("physical card tracking", true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/cards.png", fullPage: true });
});

await step("live", async () => {
  await nav("Live").click();
  await page.waitForSelector("h1:has-text('PRX LIVE')");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/live-desktop.png", fullPage: true });
  await page.getByRole("button", { name: /Session Sunset/ }).click();
  await page.getByRole("button", { name: /Pagar R\$/ }).click();
  await page.waitForSelector("text=Ingresso garantido", { timeout: 5000 });
  await page.waitForSelector("img[alt^='QR Code do ingresso']", { timeout: 5000 });
  ok("ticket purchased with PRX balance", true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/ticket.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "PRX RUN" }).click();
  await page.locator("label:has-text('10k')").first().click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Inscrever-se/ }).click();
  await page.waitForSelector("text=Inscrição confirmada", { timeout: 5000 });
  ok("RUN registration + kit QR", true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/run.png", fullPage: true });
  await page.getByRole("tab", { name: "Founders" }).click();
  await page.getByLabel("Nome da startup").fill("Rota Verde");
  await page.getByLabel("Em uma frase, o que ela resolve?").fill("Marketplace de caronas para universitários com pagamento via Pix.");
  await page.setInputFiles("input[type=file][accept='application/pdf']", "test-results/pitch.pdf");
  await page.getByRole("button", { name: "Enviar para análise" }).click();
  await page.waitForSelector("li:has-text('Rota Verde')", { timeout: 5000 });
  ok("founders submission pipeline", true);
  await page.screenshot({ path: "test-results/founders.png", fullPage: true });
});

await step("profile", async () => {
  await nav("Perfil").click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "test-results/profile-desktop.png", fullPage: true });
  await nav("Início").click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/home-after.png", fullPage: true });
  ok("profile + home after flows", true);
});

// ---------- Partner ----------
const pctx = await newCtx();
const partner = await pctx.newPage();
watch(partner, "partner");
await step("partner validation", async () => {
  await partner.goto(PARTNER + "/");
  await partner.waitForSelector("text=Portal do parceiro", { timeout: 20000 });
  await partner.getByLabel("E-mail").fill("parceiro@prx.dev");
  await partner.getByLabel("Senha").fill("PartnerPrx2026!");
  await partner.getByRole("button", { name: "Entrar no portal" }).click();
  await partner.waitForSelector("text=Validar voucher", { timeout: 20000 });
  await partner.getByRole("tab", { name: "Código" }).click();
  await partner.getByLabel("Código do voucher").fill(voucherCode);
  await partner.getByRole("button", { name: "Consultar voucher" }).click();
  await partner.waitForSelector("text=Voucher válido", { timeout: 10000 });
  await partner.waitForTimeout(400);
  await partner.screenshot({ path: "test-results/partner-lookup.png" });
  await partner.getByRole("button", { name: "Confirmar uso e dar baixa" }).click();
  await partner.waitForSelector("text=Baixa registrada", { timeout: 10000 });
  ok("partner redeems voucher", true);
  const again = await partner.evaluate(async (code) => (await fetch("/api/partner/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, action: "redeem" }) })).status, voucherCode);
  ok("double redemption blocked", again === 400 || again === 409, String(again));
});

// ---------- Security checks ----------
await step("security", async () => {
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  let r = await ap.request.post(`${BASE}/api/pass/redeem`, { data: { benefitId: "x" } });
  ok("anonymous redeem rejected (401)", r.status() === 401, String(r.status()));
  r = await ap.request.get(`${BASE}/api/admin/users`);
  ok("anonymous admin API rejected", r.status() === 401 || r.status() === 403, String(r.status()));
  r = await ap.request.post(`${BASE}/api/auth/signup`, { data: { fullName: "Invasor", email: "adminv@nxtgen.com", password: "123456789", termsAccepted: true } });
  ok("signup with reserved admin email blocked", r.status() === 400, String(r.status()));
  r = await ap.request.get(`${BASE}/api/auth/me`);
  ok("guest /api/auth/me returns 200 null", r.status() === 200, String(r.status()));
  await anon.close();
});

// ---------- Mobile ----------
for (const width of [320, 390]) {
  const mctx = await newCtx({ ...devices["iPhone 13"], viewport: { width, height: 800 } });
  const m = await mctx.newPage();
  watch(m, `mobile-${width}`);
  await step(`mobile ${width}`, async () => {
    await m.request.post(`${BASE}/api/auth/login`, { data: { email: "membro@prx.dev", password: "Prx2026!", rememberMe: true } });
    for (const tab of ["home", "pass", "bank", "live", "profile"]) {
      await m.goto(`${BASE}/#${tab}`);
      await waitApp(m);
      await m.waitForTimeout(800);
      ok(`mobile ${width} #${tab} no horizontal overflow`, await noOverflow(m));
      await m.screenshot({ path: `shots/m${width}-${tab}.png`, fullPage: true });
    }
    const targets = await m.$$eval("nav[aria-label='Seções do app'] button", (els) =>
      els.filter((e) => e.offsetParent).map((e) => {
        const b = e.getBoundingClientRect();
        return [Math.round(b.width), Math.round(b.height)];
      })
    );
    ok(`mobile ${width} tab bar targets >= 48px`, targets.length === 5 && targets.every(([w, h]) => w >= 48 && h >= 48), JSON.stringify(targets));
  });
  await mctx.close();
}

// ---------- Guest landing with full intro ----------
const gctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const g = await gctx.newPage();
watch(g, "guest");
await step("guest landing", async () => {
  const t0 = Date.now();
  await g.goto(BASE + "/");
  await g.waitForSelector(".prx-loader", { state: "detached", timeout: 15000 });
  ok("guest intro total duration", true, `${Date.now() - t0}ms (incluindo carregamento)`);
  await g.waitForTimeout(800);
  await g.screenshot({ path: "test-results/landing.png" });
});

console.log(results.join("\n"));
console.log("\nERRORS:\n" + ([...new Set(errors)].join("\n") || "none"));
await browser.close();
