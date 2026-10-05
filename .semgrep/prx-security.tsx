// Hello World
// Casos de teste das regras de .semgrep/prx-security.yml (não é código do app).
//   semgrep --test --config .semgrep/prx-security.yml .semgrep/prx-security.tsx
// `ruleid:` marca a linha seguinte como achado esperado; `ok:` marca o que não pode ser acusado.
/* eslint-disable */
// @ts-nocheck

// ruleid: prx-mutation-route-without-auth
export async function POST(req: NextRequest) {
  const body = await req.json();
  await db.from("t").insert(body);
  return NextResponse.json({ ok: true });
}

// ok: prx-mutation-route-without-auth
export async function DELETE(req: NextRequest) {
  const user = await requireUser(req);
  await db.from("t").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

// ok: prx-mutation-route-without-auth
export async function PATCH(req: NextRequest) {
  const { insider } = await requireInsider(req);
  await db.from("t").update({ ok: true }).eq("insider_id", insider.id);
  return NextResponse.json({ ok: true });
}

// ok: prx-mutation-route-without-auth
export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true });
}

export async function storagePaths(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "";
  // ruleid: prx-storage-path-from-request
  await supabaseAdmin.storage.from("family-docs").createSignedUrl(path, 60);
  const checked = requireAttachedDocument(req.nextUrl.searchParams.get("path"));
  // ok: prx-storage-path-from-request
  await supabaseAdmin.storage.from("family-docs").createSignedUrl(checked, 60);
  const form = await req.formData();
  const folder = uploadFolder(form.get("folder"));
  // ok: prx-storage-path-from-request
  await supabaseAdmin.storage.from("public").upload(`${folder}/${crypto.randomUUID()}.png`, form.get("file"));
  // ruleid: prx-storage-path-from-request
  await supabaseAdmin.storage.from("public").upload(`${form.get("folder")}/logo.png`, form.get("file"));
}

export async function filesystem(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  // ruleid: prx-fs-path-from-request
  fs.readFileSync(`./uploads/${name}`);
  // ok: prx-fs-path-from-request
  fs.readFileSync("./uploads/fixed.json");
}

export async function logs(req: NextRequest) {
  const who = req.headers.get("x-user");
  // ruleid: prx-log-forging
  console.warn("pedido de", who);
  // ok: prx-log-forging
  console.warn("pedido de", JSON.stringify(who));
  // ok: prx-log-forging
  console.warn("pedido de", who.replace(/[\r\n]/g, " "));
  // ok: prx-log-forging
  console.warn("pedido recusado");
}

export async function postgrest(email: string, cpf: string) {
  // ruleid: prx-postgrest-filter-injection
  await db.from("t").select("*").or(`email.eq.${email},cpf.eq.${cpf}`);
  // ok: prx-postgrest-filter-injection
  await db.from("t").select("*").or(`email.eq.${pgQuote(email)}`);
  // ok: prx-postgrest-filter-injection
  await db.from("t").select("*").or("status.eq.active,status.eq.pending");
}

export function code(input: string) {
  // ruleid: prx-code-injection
  eval(input);
  // ruleid: prx-code-injection
  const fn = new Function("a", input);
  // ok: prx-code-injection
  JSON.parse(input);
}

export function Html({ html }: { html: string }) {
  // ruleid: prx-dangerous-html
  const raw = <div dangerouslySetInnerHTML={{ __html: html }} />;
  // ok: prx-dangerous-html
  const escaped = <div>{html}</div>;
  return [raw, escaped];
}

export async function redirects(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next");
  // ruleid: prx-open-redirect
  if (next) return NextResponse.redirect(next);
  // ok: prx-open-redirect
  return NextResponse.redirect(new URL(safeRedirectPath(req.nextUrl.searchParams.get("next")), req.url));
}

export async function ssrf(req: NextRequest) {
  const body = await req.json();
  // ruleid: prx-ssrf-fetch
  await fetch(body.url);
  // ok: prx-ssrf-fetch
  await fetch("https://api.prx.dev/health", { method: "POST", body: JSON.stringify(body) });
}

export function tokens() {
  // ruleid: prx-insecure-random-server
  const weak = Math.random().toString(36);
  // ok: prx-insecure-random-server
  const strong = crypto.randomBytes(16).toString("hex");
  return weak + strong;
}

export function hashes(value: string) {
  // ruleid: prx-weak-hash
  crypto.createHash("md5").update(value);
  // ok: prx-weak-hash
  crypto.createHash("sha256").update(value);
}

export function compare(signature: string, expected: string) {
  // ruleid: prx-timing-unsafe-secret-compare
  if (signature === expected) return true;
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  // ok: prx-timing-unsafe-secret-compare
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

export function cookies(res: NextResponse, token: string) {
  // ruleid: prx-session-cookie-flags
  res.cookies.set({ name: AUTH_COOKIE_NAME, value: token, path: "/" });
  // ok: prx-session-cookie-flags
  res.cookies.set({ name: AUTH_COOKIE_NAME, value: token, httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  // ok: prx-session-cookie-flags
  res.cookies.set({ name: AUTH_COOKIE_NAME, value: "", maxAge: 0, path: "/" });
}
