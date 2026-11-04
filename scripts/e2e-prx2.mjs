// Hello World
// Teste ponta a ponta da PRX 2.0 (pontos, níveis, Pix em parceiro, Destaques, financeiro,
// LGPD, lista VIP, cadastro sem fricção, abertura do PRX BANK (KYC), Conta Pai e
// biometria). Requer `npm run dev` sem Supabase (contas de demonstração e sandbox).
// Uso: BASE=http://localhost:3000 node scripts/e2e-prx2.mjs
const BASE = process.env.BASE || "http://localhost:3000";
const results = [];
let failures = 0;
const check = (name, cond, extra = "") => {
  if (!cond) failures += 1;
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
};

function client() {
  let cookie = "";
  return async (path, { method = "GET", body, form, headers = {} } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(form ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: form ?? (body ? JSON.stringify(body) : undefined),
      redirect: "manual",
    });
    const set = res.headers.getSetCookie?.() ?? [];
    const session = set.find((c) => c.startsWith("prx_session="));
    if (session) cookie = session.split(";")[0];
    const type = res.headers.get("content-type") || "";
    const data = type.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data };
  };
}

const stamp = Date.now().toString(36);
/** CPF válido a partir de 9 dígitos aleatórios. */
const cpf = () => {
  const d = String(Math.floor(100000000 + Math.random() * 899999999)).split("").map(Number);
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(calc(9));
  d.push(calc(10));
  return d.join("");
};
const admin = client();
const member = client();
const anon = client();

// ---------- LGPD: cadastro exige aceite ----------
const noConsent = await anon("/api/auth/signup", { method: "POST", body: { fullName: "Sem Aceite", email: `sem-${stamp}@prx.dev`, password: "Prx2026!x" } });
check("cadastro sem aceite dos termos é recusado", noConsent.status === 400 && /Termos/.test(noConsent.data.error || ""), noConsent.data.error);
const signup = await member("/api/auth/signup", { method: "POST", body: { fullName: "Nova Geração", email: `ng-${stamp}@prx.dev`, password: "Prx2026!x", termsAccepted: true } });
check("cadastro sem fricção: só nome, e-mail, senha e termos", signup.status === 200, signup.data.error);
const familyMe = (await member("/api/family/me")).data.state;
check("cadastro comum não pede nem guarda documentos ou CPF", familyMe && familyMe.identity === null);

// ---------- Carteira de pontos ----------
let wallet = (await member("/api/points")).data.wallet;
check("carteira nasce com 0 PRX Coins", wallet?.coins === 0, JSON.stringify(wallet?.coins));
check("nível derivado do XP (régua infinita)", wallet?.level >= 1);
const weekly = wallet.rules.find((r) => r.trigger === "checkin" && r.periodicity === "weekly");
const claim = await member("/api/points", { method: "POST", body: { action: "checkin", ruleId: weekly.id, evidence: "Semana inteira sem apostas, foco no curso técnico." } });
check("bom comportamento vai para análise sem creditar", claim.status === 200 && claim.data.claim?.status === "pending" && claim.data.wallet.coins === 0, JSON.stringify(claim.data.claim ?? claim.data.error));
const again = await member("/api/points", { method: "POST", body: { action: "checkin", ruleId: weekly.id, evidence: "Enviando de novo antes da análise." } });
check("novo envio com um em análise é recusado", again.status === 409, again.data.error);

// ---------- Admin: análise, parceiro, benefício e viabilidade ----------
check("admin login", (await admin("/api/admin/login", { method: "POST", body: { email: "admin@prx.dev", password: "AdminPrx2026!" } })).status === 200);
const approved = await admin("/api/admin/points/claims", { method: "POST", body: { id: claim.data.claim?.id, decision: "approve", note: "" } });
check("admin aprova o envio", approved.status === 200, approved.data.error);
wallet = (await member("/api/points")).data.wallet;
check("coins e XP entram só após a aprovação", wallet.coins === weekly.coins && wallet.claims?.[0]?.status === "approved", JSON.stringify(wallet.coins));
const partnerInput = {
  tradeName: `Burger Lab ${stamp}`,
  legalName: "Burger Lab Alimentos LTDA",
  document: "04.252.011/0001-10",
  categoryId: "gastronomia",
  location: "São Paulo, SP",
  representative: { name: "Rafa Lima", document: "52998224725", role: "Sócio", email: "rafa@burger.dev", phone: "11999990000" },
  contact: { name: "Caixa", phone: "1133330000", email: `pix-${stamp}@burger.dev` },
};
const created = await admin("/api/admin/partners", { method: "POST", body: { partner: partnerInput } });
const partnerId = created.data.partner?.id;
check("parceiro criado", Boolean(partnerId), created.data.error);
const activated = await admin("/api/admin/partners", { method: "PUT", body: { id: partnerId, partner: { ...partnerInput, status: "ATIVO" } } });
check("parceiro ativo", activated.status === 200 && activated.data.partner?.status === "ATIVO", activated.data.error);

const base = { partnerId, categoryId: "gastronomia", title: `Combo ${stamp}`, discountLabel: "2 por 1", minPrxLevel: 1, terms: [] };
const loss = await admin("/api/admin/benefits", { method: "POST", body: { ...base, costPrice: 20, prxRevenuePerRedemption: 2, partnerFeePct: 8, pointsCost: 100 } });
check("calculadora bloqueia benefício com prejuízo", loss.status === 422 && /viabilidade/.test(loss.data.error || ""), loss.data.error);
const ok = await admin("/api/admin/benefits", { method: "POST", body: { ...base, costPrice: 20, prxRevenuePerRedemption: 2, partnerFeePct: 8, pointsCost: 300 } });
check("benefício com 30% de margem é publicado", ok.status === 200 && ok.data.benefit?.pointsCost === 300, ok.data.error);
const benefitId = ok.data.benefit?.id;

const passData = (await member("/api/pass/data")).data;
const memberBenefit = passData.benefits?.find((b) => b.id === benefitId);
check("membro vê o preço em coins", memberBenefit?.pointsCost === 300);
check("membro não vê custo, receita nem comissão", memberBenefit && !("costPrice" in memberBenefit) && !("prxRevenuePerRedemption" in memberBenefit) && !("partnerFeePct" in memberBenefit));

const poor = await member("/api/pass/redeem", { method: "POST", body: { benefitId } });
check("resgate sem coins suficientes é recusado", poor.status === 409 && /insuficientes/.test(poor.data.error || ""), poor.data.error);

// ---------- PRX Bank sandbox + motor de compra em parceiro ----------
const lookup = await member("/api/bank", { method: "POST", body: { action: "lookup_partner", key: "04252011000110", amount: 250 } });
check("chave CNPJ reconhecida como parceiro", lookup.data.partner?.partnerId === partnerId && lookup.data.partner?.verticalCode === "BITE", JSON.stringify(lookup.data));
const beforeKyc = await member("/api/bank", { method: "POST", body: { action: "sandbox_activate" } });
check("PRX BANK bloqueado sem abertura de conta (KYC)", beforeKyc.status === 403 && /Abra sua conta/.test(beforeKyc.data.error || ""), beforeKyc.data.error);
const pixBeforeKyc = await member("/api/bank", { method: "POST", body: { action: "send_pix", key: "04252011000110", amount: 10 } });
check("movimentação bloqueada sem conta ativa", pixBeforeKyc.status === 403 || pixBeforeKyc.status === 409, pixBeforeKyc.data.error);

async function upload(who, kind) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), `${kind}.png`);
  const res = await who("/api/family/uploads", { method: "POST", form });
  return { kind, path: res.data.path, name: `${kind}.png` };
}
const memberCpf = cpf();
const kycBody = {
  fullName: "Nova Geração Silva",
  cpf: memberCpf,
  birthDate: "2004-08-20",
  motherName: "Maria Geração Silva",
  phone: "(11) 98888-7777",
  occupation: "Estudante",
  incomeRange: "ate_3k",
  pep: false,
  address: { cep: "01310-100", street: "Avenida Paulista", number: "1000", complement: "", district: "Bela Vista", city: "São Paulo", state: "SP" },
  documents: [await upload(member, "id_front"), await upload(member, "id_back")],
  termsAccepted: true,
};
const badCpf = await member("/api/bank/kyc", { method: "POST", body: { ...kycBody, cpf: "529.982.247-26" } });
check("KYC valida o dígito verificador do CPF no servidor", badCpf.status === 422, badCpf.data.error);
const traversal = await member("/api/bank/kyc", { method: "POST", body: { ...kycBody, documents: [{ kind: "id_front", path: "../outro/f.png" }, kycBody.documents[1]] } });
check("KYC recusa documento fora da pasta do usuário", traversal.status === 422, traversal.data.error);
const kyc = await member("/api/bank/kyc", { method: "POST", body: kycBody });
check("abertura do PRX BANK enviada para análise", kyc.status === 200 && kyc.data.kyc?.status === "pending", kyc.data.error);
const queue = (await admin("/api/admin/family?status=pending")).data.bankKyc ?? [];
const kycApp = queue.find((k) => k.cpf === memberCpf);
check("admin vê a abertura na fila de verificações", Boolean(kycApp) && kycApp.documents.length === 2);
const approveKyc = await admin("/api/admin/family", { method: "POST", body: { kind: "bank", id: kycApp?.id, decision: "approve", note: "" } });
check("admin aprova a abertura", approveKyc.status === 200, approveKyc.data.error);
const intruder = client();
await intruder("/api/auth/signup", { method: "POST", body: { fullName: "Outra Pessoa", email: `dup-${stamp}@prx.dev`, password: "Prx2026!x", termsAccepted: true } });
const dupKyc = await intruder("/api/bank/kyc", { method: "POST", body: { ...kycBody, documents: [await upload(intruder, "id_front"), await upload(intruder, "id_back")] } });
check("CPF já usado em outra conta é recusado na abertura", dupKyc.status === 409 && dupKyc.data.code === "CPF_TAKEN", dupKyc.data.error);

const sandbox = await member("/api/bank", { method: "POST", body: { action: "sandbox_activate" } });
check("conta sandbox ativada com saldo fictício", sandbox.status === 200 && sandbox.data.account.status === "active" && sandbox.data.account.balance === 1000);
const pix = await member("/api/bank", { method: "POST", body: { action: "send_pix", key: "04252011000110", amount: 300, description: "Almoço" } });
check("Pix para parceiro credita coins e XP", pix.status === 200 && pix.data.reward?.coins === 300 && pix.data.reward?.xp === 600, JSON.stringify(pix.data.reward ?? pix.data.error));
const categorized = pix.data.account?.transactions?.find((t) => t.kind === "pix_out");
check("gasto categorizado no nicho do parceiro (PRX Map)", categorized?.categoryId === "gastronomia" && categorized?.counterparty?.startsWith("Burger Lab"));
const other = await member("/api/bank", { method: "POST", body: { action: "send_pix", key: `ninguem-${stamp}@exemplo.dev`, amount: 10 } });
check("Pix para quem não é parceiro não pontua", other.status === 200 && other.data.reward === null);

wallet = (await member("/api/points")).data.wallet;
check("extrato registra a compra em parceiro", wallet.purchases.length === 1 && wallet.transactions.some((t) => t.source === "partner_purchase"));

const redeem = await member("/api/pass/redeem", { method: "POST", body: { benefitId } });
check("resgate debita os coins do preço", redeem.status === 200 && redeem.data.points?.coins === wallet.coins - 300, JSON.stringify(redeem.data.points ?? redeem.data.error));

// ---------- Destaques (vídeos de parceiros) ----------
const reel = await admin("/api/admin/reels", {
  method: "POST",
  body: { partnerId, title: "Drop do combo", videoUrl: "https://cdn.prx.app.br/reels/combo.mp4", collection: "drops", ctaKind: "benefit", ctaTarget: benefitId },
});
check("admin publica Reel com botão para o benefício", reel.status === 200, reel.data.error);
const feed = (await member("/api/reels")).data.reels ?? [];
const mine = feed.find((r) => r.id === reel.data.reel?.id);
check("Reel aparece no feed com o botão padrão", mine?.ctaLabel === "Aproveitar Benefício");
check("feed não expõe métricas de negócio", mine && !("views" in mine) && !("ctaClicks" in mine));
const brandOnly = await admin("/api/admin/reels", { method: "POST", body: { brandName: "Marca Convidada", title: "Novidade", videoUrl: "https://cdn.prx.app.br/reels/marca.mp4", collection: "drops", ctaKind: "catalog", ctaTarget: "" } });
check("vídeo só com o nome da marca (sem parceiro cadastrado)", brandOnly.status === 200 && brandOnly.data.reel?.partnerName === "Marca Convidada", brandOnly.data.error);
const like = await member("/api/reels", { method: "POST", body: { action: "like", reelId: mine?.id } });
check("curtida conta uma vez", like.data.state?.likes === 1 && like.data.state?.liked === true);
await member("/api/reels", { method: "POST", body: { action: "like", reelId: mine?.id } });
const metrics = (await admin("/api/admin/reels")).data.reels?.find((r) => r.id === mine?.id);
check("admin vê curtidas sem duplicar", metrics?.likes === 1);

// ---------- Financeiro ----------
const finance = (await admin("/api/admin/finance?period=30")).data.finance;
check("financeiro soma a comissão da compra em parceiro", finance?.summary.purchaseRevenue >= 20, JSON.stringify(finance?.summary));
check("financeiro lista a viabilidade do benefício", finance?.benefits.some((b) => b.id === benefitId && b.status === "ok"));

// ---------- Lista VIP ----------
const vipBad = await anon("/api/waitlist", { method: "POST", body: { name: "Teste", email: "nao-e-email", phone: "11912345678", age: 20, consent: true } });
check("lista VIP valida o e-mail", vipBad.status === 422);
const vip = await anon("/api/waitlist", { method: "POST", body: { name: "Teste VIP", email: `vip-${stamp}@prx.dev`, phone: "11912345678", age: 20, consent: true } });
check("lista VIP aceita o cadastro", vip.status === 200, vip.data.error);

// ---------- Conta Pai ----------
const parent = client();
const parentSignup = await parent("/api/family/parent/signup", {
  method: "POST",
  body: { fullName: "Maria Responsável", email: `pai-${stamp}@prx.dev`, password: "SenhaForte123", cpf: cpf(), birthDate: "1984-04-12", phone: "11988887777", termsAccepted: true },
});
check("Conta Pai criada em análise", parentSignup.status === 200 && (await parent("/api/family/me")).data.state?.identity?.status === "parent_review", parentSignup.data.error);
const parentSandbox = await parent("/api/bank", { method: "POST", body: { action: "sandbox_activate" } });
check("Conta Pai não guarda dinheiro", parentSandbox.status === 403, parentSandbox.data.error);
const childNoConsent = await parent("/api/family/children", { method: "POST", body: { fullName: "Filho", email: `f-${stamp}@prx.dev`, password: "SenhaFilho123", cpf: cpf(), birthDate: "2013-01-01" } });
check("criar filho exige parentesco e consentimento parental (LGPD Art. 14)", childNoConsent.status === 422 && /parentesco|responsável legal|consentimento/i.test(childNoConsent.data.error || ""), childNoConsent.data.error);
const earlyChild = await parent("/api/family/children", {
  method: "POST",
  body: { fullName: "Filho", email: `f-${stamp}@prx.dev`, password: "SenhaFilho123", cpf: cpf(), birthDate: "2013-01-01", relationship: "mae", guardianshipDeclared: true, consentAccepted: true },
});
check("filho só depois da aprovação", earlyChild.status === 403, earlyChild.data.error);

// ---------- Biometria ----------
const noPasskey = await anon(`/api/auth/passkeys/login?userId=usr_sem_biometria_${stamp}`);
check("biometria não cadastrada responde 404", noPasskey.status === 404);
check("cadastro de biometria exige sessão", (await anon("/api/auth/passkeys/register")).status === 401);

// ---------- Rotas públicas ----------
for (const path of ["/termos", "/privacidade", "/em-breve", "/sou-pai"]) {
  check(`rota ${path} abre`, (await anon(path)).status === 200);
}
check("página institucional antiga removida", (await anon("/institucional")).status === 307);
check("antiga prévia /nova-landing volta para / (a landing nova já é a página inicial)", (await anon("/nova-landing")).status === 307);
check("rota desconhecida volta para /", (await anon("/qualquer-coisa")).status === 307);

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} verificações passaram.`);
process.exit(failures ? 1 : 0);
