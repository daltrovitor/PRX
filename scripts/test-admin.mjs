import { chromium } from "playwright";
import fs from "fs";
import path from "path";

// Credenciais de teste só pelo ambiente, nunca no repositório (pentest H6):
//   PRX_TEST_EMAIL / PRX_TEST_PASSWORD  conta de membro de teste
const TEST_EMAIL = process.env.PRX_TEST_EMAIL;
const TEST_PASSWORD = process.env.PRX_TEST_PASSWORD;
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error("Defina PRX_TEST_EMAIL e PRX_TEST_PASSWORD (conta de teste, fora do repositório).");
  process.exit(1);
}
//   PRX_TEST_ADMIN_EMAIL / PRX_TEST_ADMIN_PASSWORD  conta admin de teste
const TEST_ADMIN_EMAIL = process.env.PRX_TEST_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.env.PRX_TEST_ADMIN_PASSWORD;
if (!TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD) {
  console.error("Defina PRX_TEST_ADMIN_EMAIL e PRX_TEST_ADMIN_PASSWORD (conta admin de teste, fora do repositório).");
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });

  const outDir = path.join(process.cwd(), "public", "screenshots", "admin");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Test visiting /admin as normal user (Rafael Molina, role = 'user')
  const userContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const userPage = await userContext.newPage();
  
  // Login as normal user
  await userPage.goto("http://localhost:3000");
  await userPage.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
  });

  // Navigate to /admin
  await userPage.goto("http://localhost:3000/admin", { waitUntil: "networkidle" });
  await userPage.waitForTimeout(500);
  await userPage.screenshot({ path: path.join(outDir, "01_user_blocked_403.png") });
  console.log("📸 Captured 01_user_blocked_403.png");

  // 2. Test visiting /admin as admin (conta PRX_TEST_ADMIN_EMAIL, role = 'admin')
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await adminContext.newPage();

  // Login as admin
  await adminPage.goto("http://localhost:3000");
  await adminPage.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD }),
    });
  });

  // Navigate to /admin
  await adminPage.goto("http://localhost:3000/admin", { waitUntil: "networkidle" });
  await adminPage.waitForTimeout(600);
  await adminPage.screenshot({ path: path.join(outDir, "02_admin_dashboard_allowed.png") });
  console.log("📸 Captured 02_admin_dashboard_allowed.png");

  await browser.close();
}

main().catch(console.error);
