// Hello World
// Teste ponta a ponta da preparação do lançamento (PRX LIVE, cupons, idade por
// evento, simulação, portaria, PRX PASS dinâmico, Founders e admin).
// Requer `npm run dev` SEM Supabase (modo memória, contas de demonstração).
// Todos os dados criados aqui são sintéticos e somem ao reiniciar o servidor.
// Uso: BASE=http://localhost:3100 node scripts/e2e-launch.mjs
const BASE = process.env.BASE || "http://localhost:3100";
const results = [];
let failures = 0;
const check = (name, cond, extra = "") => {
  if (!cond) failures += 1;
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra && !cond ? `  — ${typeof extra === "string" ? extra : JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

function client() {
  let cookie = "";
  return async (path, { method = "GET", body } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const session = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("prx_session="));
    if (session) cookie = session.split(";")[0];
    const type = res.headers.get("content-type") || "";
    return { status: res.status, data: type.includes("json") ? await res.json() : await res.text() };
  };
}

/** CPF sintético com dígitos verificadores válidos (só para o cadastro de teste em memória). */
function fakeCpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (digits) => {
    const sum = digits.reduce((acc, d, i) => acc + d * (digits.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(dv(n));
  n.push(dv(n));
  return n.join("");
}

const stamp = Date.now().toString(36).slice(-5).toUpperCase();
const inDays = (d) => new Date(Date.now() + d * 86_400_000).toISOString();

const admin = client();
const staff = client();
const member = client();
const teen = client();
const adult = client();

check("admin entra", (await admin("/api/admin/login", { method: "POST", body: { email: "admin@prx.dev", password: "AdminPrx2026!" } })).status === 200);
check("membro demo entra", (await member("/api/auth/login", { method: "POST", body: { email: "membro@prx.dev", password: "Prx2026!" } })).status === 200);

const teenSignup = await teen("/api/auth/signup", {
  method: "POST",
  body: { fullName: "Teste Dezesseis Anos", email: `teen-${stamp.toLowerCase()}@exemplo.com`, password: "Prx2026!x9", confirmPassword: "Prx2026!x9", cpf: fakeCpf(), phone: "62999990000", birthDate: "2010-05-01", termsAccepted: true },
});
check("conta de 16 anos é criada (idade mínima da PRX é 12)", teenSignup.status === 200 || teenSignup.status === 201, teenSignup.data);
const adultSignup = await adult("/api/auth/signup", {
  method: "POST",
  body: { fullName: "Teste Adulto Comprador", email: `adulto-${stamp.toLowerCase()}@exemplo.com`, password: "Prx2026!x9", confirmPassword: "Prx2026!x9", cpf: fakeCpf(), phone: "62999990001", birthDate: "1999-04-10", termsAccepted: true },
});
check("conta adulta é criada", adultSignup.status === 200 || adultSignup.status === 201, adultSignup.data);

const staffEmail = `portaria-${stamp.toLowerCase()}@prx.dev`;
const createdStaff = await admin("/api/admin/staff", { method: "POST", body: { mode: "create", name: "Portaria Teste", email: staffEmail, canValidateTickets: true, canValidateBenefits: true } });
check("admin cria operador de portaria", createdStaff.status === 201 && Boolean(createdStaff.data.temporaryPassword), createdStaff.data);
check("operador entra no portal da equipe", (await staff("/api/staff/login", { method: "POST", body: { email: staffEmail, password: createdStaff.data.temporaryPassword } })).status === 200);
check("operador NÃO acessa o admin", (await staff("/api/admin/overview")).status === 403);
check("membro NÃO acessa o admin", [401, 403].includes((await member("/api/admin/members")).status));

// ---------- Evento: publicação exige dados reais ----------
const base = {
  series: "session",
  title: `Evento de teste ${stamp}`,
  summary: "Evento sintético do roteiro de testes automatizados.",
  startsAt: inDays(20),
  endsAt: null,
  venue: "Local de teste",
  city: "Cidade de teste",
  address: "",
  coverUrl: "",
  capacity: 50,
  perUserLimit: 2,
  minPrxLevel: 1,
  partnerId: null,
  staffCheckin: true,
  minAge: null,
  idCheckRequired: false,
  entryRequirements: "",
  cancellationPolicy: "",
  organizerName: "",
  status: "draft",
  batches: [{ id: "pista", name: "Pista", price: 100, quantity: null, closed: false }],
  run: null,
};
const draft = await admin("/api/admin/live/events", { method: "POST", body: base });
const eventId = draft.data.event?.id;
check("evento criado em rascunho", draft.status === 201 && Boolean(eventId), draft.data);
const blocked = await admin("/api/admin/live/events", { method: "PUT", body: { id: eventId, action: "status", status: "published" } });
check("publicar sem classificação/organizador/cancelamento é recusado", blocked.status === 422 && /Classificação etária/.test(blocked.data.error), blocked.data);

const complete = { ...base, minAge: 18, idCheckRequired: true, organizerName: "Organizador de teste", cancellationPolicy: "Reembolso integral até 48 h antes do início (teste)." };
check("admin completa o evento", (await admin("/api/admin/live/events", { method: "PUT", body: { id: eventId, action: "update", event: complete } })).status === 200);
check("evento publicado", (await admin("/api/admin/live/events", { method: "PUT", body: { id: eventId, action: "status", status: "published" } })).status === 200);

// ---------- Cupom ----------
const code = `AMIGOS${stamp}`;
const promo = await admin("/api/admin/live/promos", { method: "POST", body: { eventId, code, kind: "percent", value: 20, maxUses: 2, perUserLimit: 1 } });
check("cupom nasce inativo", promo.status === 201 && promo.data.promo?.active === false, promo.data);
const preview = await admin("/api/admin/live/simulation", { method: "POST", body: { action: "quote", eventId, batchId: "pista", promoCode: code } });
check("admin pré-visualiza o desconto (cupom inativo)", preview.data.quote?.total === 80 && preview.data.quote?.discount === 20, preview.data);
const inactive = await member("/api/live", { method: "POST", body: { action: "quote", eventId, batchId: "pista", promoCode: code } });
check("membro não usa cupom inativo", inactive.status === 422, inactive.data);
check("admin ativa o cupom", (await admin("/api/admin/live/promos", { method: "PUT", body: { id: promo.data.promo.id, active: true } })).data.promo?.active === true);

const quote = await adult("/api/live", { method: "POST", body: { action: "quote", eventId, batchId: "pista", promoCode: code.toLowerCase() } });
check("resumo do pedido: 100 − 20 = 80 (servidor)", quote.data.quote?.original === 100 && quote.data.quote?.total === 80, quote.data);
check("data de nascimento do cadastro já vale para o evento 18+", quote.data.quote?.age?.needsBirthDate === false && quote.data.quote?.age?.eligible === true, quote.data.quote?.age);
const demoAge = (await member("/api/live", { method: "POST", body: { action: "quote", eventId, batchId: "pista" } })).data.quote?.age;
if (demoAge?.needsBirthDate) {
  const noBirth = await member("/api/live", { method: "POST", body: { action: "reserve", eventId, batchId: "pista" } });
  check("conta sem data de nascimento não reserva evento 18+", noBirth.status === 422, noBirth.data);
} else {
  results.push("SKIP  conta sem data de nascimento: o membro demo já confirmou a data numa execução anterior (coberto pelos testes unitários).");
}
const forged = await adult("/api/live", { method: "POST", body: { action: "reserve", eventId, batchId: "pista", promoCode: code, price: 1, discount: 99 } });
check("reserva com desconto calculado no servidor (preço do navegador ignorado)", forged.status === 201 && forged.data.ticket?.price === 80 && forged.data.ticket?.discount === 20, forged.data);
check("pedido tem código", /^PED-/.test(forged.data.ticket?.purchaseCode ?? ""), forged.data.ticket);
const again = await adult("/api/live", { method: "POST", body: { action: "reserve", eventId, batchId: "pista", promoCode: code } });
check("mesmo membro não usa o cupom duas vezes", again.status === 409, again.data);

const teenTry = await teen("/api/live", { method: "POST", body: { action: "reserve", eventId, batchId: "pista" } });
check("16 anos não compra evento 18+", teenTry.status === 403 && /menores de 18/.test(teenTry.data.error), teenTry.data);

// ---------- Simulação e teste de portaria ----------
const sim = await admin("/api/admin/live/simulation", { method: "POST", body: { action: "issue", eventId, batchId: "pista", promoCode: code, holderLabel: "Insider de teste" } });
const testQr = sim.data.ticket?.qrPayload;
check("ingresso de TESTE emitido sem cobrança", sim.status === 201 && /^TESTE/.test(sim.data.ticket?.card?.holderName ?? "") && Boolean(testQr), sim.data);
const stats = (await admin("/api/admin/live/events")).data.events?.find((e) => e.id === eventId)?.stats;
check("teste fora da receita e da lotação", stats?.test === 1 && stats?.confirmedRevenue === 0 && stats?.capacityLeft === 49, stats);

const otherEvent = await admin("/api/admin/live/events", { method: "POST", body: { ...complete, title: `Outro evento ${stamp}`, status: "published" } });
const wrongEvent = await staff("/api/validate", { method: "POST", body: { code: testQr, action: "lookup", eventId: otherEvent.data.event?.id } });
check("portaria recusa ingresso de outro evento", wrongEvent.status === 409, wrongEvent.data);
const first = await staff("/api/validate", { method: "POST", body: { code: testQr, action: "confirm", eventId } });
check("1ª leitura: entrada de teste registrada", first.status === 200 && first.data.ticket?.isTest === true && first.data.ticket?.status === "used", first.data);
check("portaria vê a regra de idade e documento", first.data.ticket?.minAge === 18 && first.data.ticket?.idCheckRequired === true, first.data.ticket);
const second = await staff("/api/validate", { method: "POST", body: { code: testQr, action: "confirm", eventId } });
check("2ª leitura do mesmo QR é bloqueada", second.status === 400 && /já foi utilizado/.test(second.data.error), second.data);
const pending = await staff("/api/validate", { method: "POST", body: { code: forged.data.ticket?.code ?? "UP-0000-0000", action: "confirm", eventId } });
check("reserva não paga é recusada", pending.status === 409 && /Pagamento pendente/.test(pending.data.error), pending.data);
const readiness = (await admin("/api/admin/live/events")).data.events?.find((e) => e.id === eventId)?.readiness;
check("evento fica pronto para operar após o teste de portaria", readiness?.operational === true, readiness);

const door = await staff("/api/staff/events");
const doorEvent = door.data.events?.find((e) => e.event.id === eventId);
check("portaria não recebe valores financeiros", doorEvent && !("confirmedRevenue" in doorEvent.stats) && !("pendingRevenue" in doorEvent.stats), doorEvent?.stats);

const log = await admin("/api/admin/audit?log=validations&outcome=refused");
check("recusas ficam no registro de validações", log.data.total >= 3, log.data);
const audit = await admin("/api/admin/audit?log=admin");
check("ações críticas ficam na auditoria", (audit.data.entries ?? []).some((e) => e.action === "promo.created") && (audit.data.entries ?? []).some((e) => e.action === "live.test_ticket"), audit.data.entries?.map((e) => e.action));

// ---------- PRX PASS (QR dinâmico) ----------
// Parceiro e benefício sintéticos (memória) para gerar um voucher real de teste.
const partner = await admin("/api/admin/partners", {
  method: "POST",
  body: { partner: { tradeName: `Parceiro Teste ${stamp}`, legalName: "Parceiro de Teste LTDA", document: "11.444.777/0001-61", categoryId: "gastronomia", location: "Cidade de teste" }, access: { mode: "create", email: `parceiro-${stamp.toLowerCase()}@exemplo.com`, name: "Balcão Teste" } },
});
const benefit = partner.data.partner?.id
  ? await admin("/api/admin/benefits", { method: "POST", body: { partnerId: partner.data.partner.id, categoryId: "gastronomia", title: `Benefício teste ${stamp}`, discountLabel: "10% OFF", terms: ["Teste"] } })
  : null;
const redeem = benefit?.data.benefit?.id ? await adult("/api/pass/redeem", { method: "POST", body: { benefitId: benefit.data.benefit.id } }) : null;
const valid = redeem?.data?.voucher ?? null;
if (!valid) results.push(`SKIP  PRX PASS sem voucher de teste: ${JSON.stringify(redeem?.data ?? benefit?.data ?? partner.data).slice(0, 160)}`);
const owner = adult;
if (valid) {
  const qr = await owner("/api/pass/qr", { method: "POST", body: { code: valid.code } });
  check("membro recebe QR dinâmico do próprio voucher", qr.status === 200 && /^PRX_PASS2::/.test(qr.data.payload) && /^\d{6}$/.test(qr.data.momentCode), qr.data);
  const staticTry = await staff("/api/validate", { method: "POST", body: { code: valid.code, action: "confirm" } });
  check("código estático não dá baixa", staticTry.status !== 200, staticTry.data);
  const ok = await staff("/api/validate", { method: "POST", body: { code: qr.data.payload, action: "confirm" } });
  check("QR dinâmico dá baixa", ok.status === 200, ok.data);
  const reuse = await staff("/api/validate", { method: "POST", body: { code: qr.data.payload, action: "confirm" } });
  check("mesmo QR não dá baixa de novo", reuse.status !== 200, reuse.data);
}
const otherQr = await teen("/api/pass/qr", { method: "POST", body: { code: valid?.code ?? "PRX-1234-5678" } });
check("ninguém gera QR de voucher alheio", otherQr.status === 404, otherQr.data);

// ---------- Founders ----------
const meeting = await admin("/api/admin/founders", { method: "POST", body: { action: "save", kind: "meeting", data: { title: `Encontro de teste ${stamp}`, startsAt: inDays(10), status: "draft" } } });
check("admin cadastra encontro (rascunho)", meeting.status === 201, meeting.data);
check("rascunho não aparece para o membro", !((await member("/api/founders")).data.meetings ?? []).some((m) => m.id === meeting.data.item?.id));
await admin("/api/admin/founders", { method: "POST", body: { action: "save", kind: "meeting", id: meeting.data.item?.id, data: { title: `Encontro de teste ${stamp}`, startsAt: inDays(10), status: "published" } } });
const hub = await member("/api/founders");
check("publicado aparece como próximo encontro", hub.data.nextMeeting?.id === meeting.data.item?.id, hub.data);
await admin("/api/admin/founders", { method: "POST", body: { action: "delete", kind: "meeting", id: meeting.data.item?.id } });

// ---------- Admin: diretório e visão geral ----------
const page = await admin("/api/admin/members?q=membro&pageSize=5&sort=name");
check("busca de membros paginada no servidor", page.status === 200 && page.data.pageSize === 5 && Array.isArray(page.data.members), page.data);
const overview = await admin("/api/admin/overview");
check("visão geral responde com indicadores", overview.status === 200 && typeof overview.data.overview?.members?.total === "number", overview.data);
check("termos do QR Code publicados", (await member("/termos-qrcode")).status === 200);

console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} PASS · ${failures} FAIL`);
process.exit(failures > 0 ? 1 : 0);
