import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Credenciais de teste só pelo ambiente, nunca no repositório (pentest H6):
//   PRX_TEST_EMAIL / PRX_TEST_PASSWORD  conta de membro de teste
const TEST_EMAIL = process.env.PRX_TEST_EMAIL;
const TEST_PASSWORD = process.env.PRX_TEST_PASSWORD;
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error("Defina PRX_TEST_EMAIL e PRX_TEST_PASSWORD (conta de teste, fora do repositório).");
  process.exit(1);
}

const envText = fs.readFileSync(".env", "utf8");
const envVars = {};
envText.split("\n").forEach(line => {
  const [k, ...v] = line.trim().split("=");
  if (k && v.length) envVars[k] = v.join("=");
});

const supabaseAdmin = createClient(envVars.URL, envVars.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testCreateUser() {
  const demoEmail = TEST_EMAIL;
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const found = existing?.users?.find(u => u.email === demoEmail);

  if (!found) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: demoEmail,
      password: TEST_PASSWORD,
      email_confirm: true, // No email confirmation required!
      user_metadata: {
        full_name: "Rafael Molina",
        nxt_score: 2150,
        nxt_level: 3,
        avatar_url: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&q=80",
        wallet_balance: 124.50
      }
    });
    console.log("Created demo user in Supabase:", { data, error });
  } else {
    console.log("Demo user already exists in Supabase Auth:", found.id, found.email);
  }

  // Test sign in with password via Supabase Client (Anon Key)
  const client = createClient(envVars.URL, envVars.ANON_KEY);
  const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({
    email: demoEmail,
    password: TEST_PASSWORD
  });
  console.log("Sign in test:", {
    success: !!signInData.session,
    userId: signInData.user?.id,
    metadata: signInData.user?.user_metadata,
    error: signInErr?.message
  });
}

testCreateUser();
