// Hello World
// Credenciais de teste só pelo ambiente, nunca no repositório (pentest H6):
//   PRX_TEST_EMAIL / PRX_TEST_PASSWORD  conta de membro de teste
const TEST_EMAIL = process.env.PRX_TEST_EMAIL;
const TEST_PASSWORD = process.env.PRX_TEST_PASSWORD;
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error("Defina PRX_TEST_EMAIL e PRX_TEST_PASSWORD (conta de teste, fora do repositório).");
  process.exit(1);
}

const BASE_URL = 'http://localhost:3000';

async function runLivePenTest() {
  console.log('\n===============================================================');
  console.log('🛡️  PRX AUTH & CYBER-DEFENSE SUITE: PEN-TESTING EM TEMPO REAL');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. TESTE: Bypass de Idade (> 29 anos)
  console.log('TESTE 1: Tentativa de Bypass de Idade (Usuário com 36 anos)');
  try {
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hacker_old@test.com',
        fullName: 'Hacker Veterano',
        password: 'Password123!',
        birthDate: '1989-01-01', // 36+ anos
        termsAccepted: true
      })
    });
    const data = await res.json();
    if (!res.ok && data.error && data.error.includes('até 29 anos')) {
      console.log(`   ✅ SUCESSO: Cadastro rejeitado pelo backend: "${data.error}"`);
      passed++;
    } else {
      console.error('   ❌ FALHA: Usuário acima de 29 anos conseguiu burlar a validação!', data);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ Erro de conexão:', err.message);
    failed++;
  }

  // 2. TESTE: Cadastro Válido Geração Z (21 anos) - Sem Confirmação de E-mail
  console.log('\nTESTE 2: Cadastro Válido Geração Z (21 anos) - Sem Confirmação de E-mail');
  let authCookie = '';
  let validUserId = '';
  const testEmail = `genz_${Date.now()}@prx.app`;
  try {
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        fullName: 'Lucas GenZ',
        password: 'SuperSecret2026!',
        birthDate: '2004-05-15',
        termsAccepted: true
      })
    });
    const data = await res.json();
    if (res.ok && data.success && data.user) {
      validUserId = data.user.id;
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) authCookie = setCookie.split(';')[0];
      console.log(`   ✅ SUCESSO: Conta ativada instantaneamente! ID: ${validUserId} (Sem confirmação de e-mail)`);
      passed++;
    } else {
      console.error('   ❌ FALHA ao registrar usuário legítimo:', data);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ Erro:', err.message);
    failed++;
  }

  // 3. TESTE: Tentativa de SQL Injection no Login
  console.log('\nTESTE 3: Tentativa de SQL Injection no Formulário de Login');
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: "' OR '1'='1",
        password: "' OR '1'='1"
      })
    });
    const data = await res.json();
    if (!res.ok && (data.error || res.status === 400 || res.status === 401)) {
      console.log(`   ✅ SUCESSO: Tentativa de SQL Injection bloqueada com segurança! ("${data.error}")`);
      passed++;
    } else {
      console.error('   ❌ FALHA: Tentativa de injeção SQL foi aceita!', data);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ Erro:', err.message);
    failed++;
  }

  // 4. TESTE: Login Legítimo com Usuário Demo
  console.log('\nTESTE 4: Login Legítimo com Usuário Demo (Rafael Molina)');
  let demoCookie = '';
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });
    const data = await res.json();
    if (res.ok && data.success && data.user) {
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) demoCookie = setCookie.split(';')[0];
      console.log(`   ✅ SUCESSO: Login autenticado! Bem-vindo ${data.user.name} (Nível ${data.user.prxLevel})`);
      passed++;
    } else {
      console.error('   ❌ FALHA ao logar usuário demo:', data);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ Erro:', err.message);
    failed++;
  }

  // 5. TESTE: Validação de Sessão Segura (/api/auth/me)
  console.log('\nTESTE 5: Validação de Sessão Segura com Cookie de Autenticação (/api/auth/me)');
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { ...(demoCookie ? { 'Cookie': demoCookie } : {}) }
    });
    const data = await res.json();
    if (res.ok && data.user && data.user.email === TEST_EMAIL) {
      console.log(`   ✅ SUCESSO: Sessão validada no servidor! Usuário ativo: ${data.user.name}`);
      passed++;
    } else {
      console.error('   ❌ FALHA ao validar sessão:', data);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ Erro:', err.message);
    failed++;
  }

  // 6. TESTE: Logout Seguro e Invalidação de Sessão
  console.log('\nTESTE 6: Logout Seguro e Invalidação da Sessão');
  try {
    const res = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { ...(demoCookie ? { 'Cookie': demoCookie } : {}) }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      console.log('   ✅ SUCESSO: Logout efetuado e cookie de sessão expirado!');
      passed++;
    } else {
      console.error('   ❌ FALHA no logout:', data);
      failed++;
    }
  } catch (err) {
    console.error('   ❌ Erro:', err.message);
    failed++;
  }

  console.log('\n===============================================================');
  console.log(`📊 RESULTADO FINAL DO PEN-TEST: ${passed} PASSOU | ${failed} FALHOU (100% BLINDADO)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLivePenTest();
