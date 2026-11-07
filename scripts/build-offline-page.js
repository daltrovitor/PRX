// Hello World
const fs = require('fs');
const path = require('path');

const gsapMin = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'gsap', 'dist', 'gsap.min.js'), 'utf8');

const htmlContent = `<!-- Hello World -->
<!DOCTYPE html>
<html lang="pt-BR" class="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">
  <meta name="theme-color" content="#ffffff">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="PRX">
  <title>Modo Offline · PRX</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" type="image/svg+xml" href="/brand/prx-app-icon.svg">
  <link rel="apple-touch-icon" href="/brand/prx-icon-192.png">

  <!-- Script imediato para evitar FOUC de tema -->
  <script>
    (function() {
      try {
        var t = localStorage.getItem('prx-app-theme') || localStorage.getItem('prx-theme');
        if (t === 'dark' || (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
          document.documentElement.style.colorScheme = 'dark';
        } else {
          document.documentElement.classList.add('light');
          document.documentElement.classList.remove('dark');
          document.documentElement.style.colorScheme = 'light';
        }
      } catch (e) {}
    })();
  </script>

  <!-- GSAP Engine Inlined (100% autossuficiente e offline sem dependência de rede) -->
  <script>
${gsapMin}
  </script>

  <style>
    :root {
      --bg: #ffffff;
      --surface: #f8fafc;
      --surface-card: #ffffff;
      --border: #e2e8f0;
      --border-strong: rgba(15, 23, 42, 0.12);
      --text-main: #0b0b10;
      --text-muted: #64748b;
      --primary: #6c0cf0;
      --primary-hover: #5708c9;
      --primary-rgb: 108, 12, 240;
      --accent: #00f0ff;
      --online: #10b981;
      --offline-amber: #f59e0b;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color-scheme: light;
    }

    html.dark {
      --bg: #000000;
      --surface: #0a0b0e;
      --surface-card: #0a0b0e;
      --border: rgba(255, 255, 255, 0.08);
      --border-strong: rgba(255, 255, 255, 0.16);
      --text-main: #f3f4f6;
      --text-muted: #94a3b8;
      --primary: #7c3aed;
      --primary-hover: #6d28d9;
      --primary-rgb: 124, 58, 237;
      color-scheme: dark;
    }

    html.dark body {
      background-color: #000000;
      color: #f3f4f6;
    }

    html.dark .offline-card {
      background-color: #0a0b0e;
      border-color: rgba(255, 255, 255, 0.08);
      box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.6);
    }

    html.dark .icon-wrapper {
      background-color: #12151e;
      border-color: rgba(255, 255, 255, 0.12);
    }

    html.dark .btn-home {
      border-color: rgba(255, 255, 255, 0.12);
      color: #f3f4f6;
    }

    html.dark .btn-home:hover {
      background-color: #141722;
      border-color: rgba(255, 255, 255, 0.2);
    }

    html.dark .theme-toggle-btn {
      background-color: #0a0b0e;
      border-color: rgba(255, 255, 255, 0.12);
      color: #f3f4f6;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    ::selection {
      background-color: var(--primary);
      color: #ffffff;
    }

    html, body {
      width: 100%;
      height: 100%;
      min-height: 100vh;
      min-height: -webkit-fill-available;
      background-color: var(--bg);
      color: var(--text-main);
      font-family: var(--font-sans);
      overflow-x: hidden;
      transition: background-color 0.3s ease, color 0.3s ease;
    }

    .top-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 4.5rem;
      padding: 0 1.5rem;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      z-index: 50;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.5s ease;
    }

    .top-header.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .theme-toggle-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.65rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background-color: var(--surface);
      color: var(--text-main);
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      transition: transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
    }

    .theme-toggle-btn:hover {
      transform: scale(1.05);
      border-color: var(--border-strong);
    }

    .theme-toggle-btn:active {
      transform: scale(0.95);
    }

    /* Estágio do Logo: Inicia centralizado na tela */
    .logo-stage {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(82vw, 520px);
      z-index: 40;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
      will-change: transform, top, width;
    }

    .prx-logo-svg {
      width: 100%;
      height: auto;
      display: block;
      overflow: visible;
      color: var(--text-main);
      filter: drop-shadow(0 0 24px rgba(var(--primary-rgb), 0.22));
      transition: color 0.3s ease;
    }

    .page-viewport {
      width: 100%;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 6.5rem 1.5rem 2.5rem;
      position: relative;
      z-index: 10;
    }

    .logo-placeholder {
      width: min(76vw, 400px);
      height: 5.5rem;
      margin-bottom: 1.5rem;
      visibility: hidden;
    }

    .offline-card {
      width: 100%;
      max-width: 480px;
      background-color: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2.25rem 1.75rem;
      box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);
      text-align: center;
      opacity: 0;
      transform: translateY(35px);
      pointer-events: none;
      transition: background-color 0.3s ease, border-color 0.3s ease;
    }

    .offline-card.visible {
      pointer-events: auto;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.25);
      color: var(--offline-amber);
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1.25rem;
      transition: all 0.3s ease;
    }

    .status-badge.online-restored {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(16, 185, 129, 0.3);
      color: var(--online);
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--offline-amber);
      box-shadow: 0 0 8px var(--offline-amber);
      transition: background-color 0.3s ease, box-shadow 0.3s ease;
    }

    .status-badge.online-restored .status-dot {
      background-color: var(--online);
      box-shadow: 0 0 8px var(--online);
    }

    .icon-wrapper {
      width: 56px;
      height: 56px;
      margin: 0 auto 1.25rem;
      border-radius: 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary);
    }

    h1 {
      font-size: 1.625rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.25;
      color: var(--text-main);
      margin-bottom: 0.75rem;
    }

    @media (min-width: 640px) {
      h1 {
        font-size: 1.875rem;
      }
    }

    p.description {
      font-size: 0.9375rem;
      line-height: 1.6;
      color: var(--text-muted);
      margin-bottom: 1.75rem;
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
    }

    @media (min-width: 480px) {
      .actions {
        flex-direction: row;
      }
    }

    button.btn-retry {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.875rem 1.5rem;
      min-height: 48px;
      background-color: var(--primary);
      color: #ffffff;
      font-family: var(--font-sans);
      font-size: 0.9375rem;
      font-weight: 600;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(var(--primary-rgb), 0.35);
      transition: transform 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
    }

    button.btn-retry:hover {
      background-color: var(--primary-hover);
      box-shadow: 0 6px 20px rgba(var(--primary-rgb), 0.45);
      transform: translateY(-1px);
    }

    button.btn-retry:active {
      transform: translateY(1px);
    }

    button.btn-retry.loading {
      opacity: 0.85;
      pointer-events: none;
    }

    button.btn-home {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.875rem 1.25rem;
      min-height: 48px;
      background-color: transparent;
      color: var(--text-main);
      font-family: var(--font-sans);
      font-size: 0.9375rem;
      font-weight: 500;
      border: 1px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }

    button.btn-home:hover {
      background-color: var(--surface);
      border-color: var(--border-strong);
    }

    .network-indicator {
      margin-top: 1.25rem;
      font-size: 0.8125rem;
      font-family: var(--font-mono);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
    }

    .pulse-ring {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: currentColor;
      opacity: 0.7;
    }

    @keyframes spin {
      100% {
        transform: rotate(360deg);
      }
    }

    .spinning {
      animation: spin 0.85s linear infinite;
    }

    @supports (padding: env(safe-area-inset-top)) {
      .top-header {
        top: env(safe-area-inset-top);
      }
      body {
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
      }
    }
      .credit {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
      font-size: 12px;
      color: #5b5b66;
    }
    .credit a { display: inline-flex; align-items: center; min-height: 40px; cursor: pointer; border-radius: 6px; }
    .credit img { height: 20px; width: auto; }
    html.dark .credit { color: #9ca3af; }
    html.dark .credit a { background: rgba(255, 255, 255, 0.95); padding: 0 8px; }
</style>
</head>
<body>
  <!-- Header com Theme Toggle -->
  <header class="top-header" id="top-header">
    <button type="button" class="theme-toggle-btn" id="theme-toggle" aria-label="Alternar Tema" title="Alternar Tema">
      <svg id="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
      <svg id="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    </button>
  </header>

  <!-- Estágio do Logo: Inicia centralizado na tela -->
  <div class="logo-stage" id="logo-stage" aria-label="PRX">
    <svg id="prx-logo" class="prx-logo-svg" style="visibility: hidden;" viewBox="0 0 776.5 181" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ld-s" gradientUnits="userSpaceOnUse" cx="330" cy="172" r="140">
          <stop offset="0" stop-color="#7607FD"/>
          <stop offset="0.42" stop-color="#6430FA"/>
          <stop offset="0.7" stop-color="#3C9CFD"/>
          <stop offset="1" stop-color="#0BD9FD"/>
        </radialGradient>
        <linearGradient id="ld-x" gradientUnits="userSpaceOnUse" x1="450" y1="310" x2="570" y2="405">
          <stop offset="0" stop-color="#7C04F0"/>
          <stop offset="0.4" stop-color="#6420F9"/>
          <stop offset="0.55" stop-color="#4F80FE"/>
          <stop offset="1" stop-color="#06E4F9"/>
        </linearGradient>

        <clipPath id="ld-wc">
          <rect x="90" y="296" width="500" height="112"/>
        </clipPath>
        <clipPath id="ld-tc">
          <rect data-tag-clip id="tag-clip-rect" x="0" y="0" width="0" height="181"/>
        </clipPath>
      </defs>

      <!-- FASE 1: Somente o Ícone (inicia no centro) -->
      <g data-symbol-group id="symbol-group">
        <g transform="translate(-214 -92)">
          <path data-piece="white" id="piece-white" fill="currentColor" d="M214 119H312L340 147.8H282.2L333.7 199.7L261.2 272.7H221L293.5 199Z"/>
          <path data-piece="color" id="piece-color" fill="url(#ld-s)" d="M414 92H464.5L383.3 173L458.2 253.2H359.5L332 223.2H389.5L339.2 167.8Z"/>
        </g>
      </g>

      <!-- FASE 2: PRX (oculto no frame zero, revelado somente após o ícone deslizar à esquerda) -->
      <g id="wordmark-group" transform="translate(205.0 -290.78)">
        <g clip-path="url(#ld-wc)" style="clip-path: url(#ld-wc);">
          <path data-letter id="letter-p" fill="currentColor" fill-rule="evenodd" d="M101 306.2H174A31.3 31.3 0 0 1 174 368.8H118.5V405.6H101ZM118.5 320.8H172A15.8 16.7 0 0 1 172 354.2H118.5Z"/>
          <path data-letter id="letter-r" fill="currentColor" fill-rule="evenodd" d="M279.2 306.2H350.5A32.5 31.6 0 0 1 350.5 369.4H348L383.5 405.6H361.2L324.2 369.4H296.8V405.6H279.2ZM296.8 321H350.5A16 16.95 0 0 1 350.5 354.9H296.8Z"/>
          <path data-letter id="letter-x" fill="url(#ld-x)" d="M447.5 306.5H471.5L570.6 405.6H546.6L508.4 367.5L469.8 405.6H447L496 355.5Z"/>
        </g>
        <path data-piece="x-arm" id="piece-x-arm" fill="url(#ld-x)" d="M548 306.5H571.5L527 351L515.5 339.5Z"/>
      </g>

      <!-- FASE 3: Assinatura "NEXT IS YOURS" (oculta no frame zero, desdobra após o PRX) -->
      <g id="tagline-group" clip-path="url(#ld-tc)" style="clip-path: url(#ld-tc);">
        <text x="549" y="153" text-anchor="middle" fill="currentColor" style="font-family: var(--font-sans, system-ui, sans-serif); font-size: 28px; font-weight: 400; letter-spacing: 0.6em;">NEXT IS YOURS</text>
      </g>
    </svg>
  </div>

  <!-- Conteúdo Principal -->
  <main class="page-viewport">
    <div class="logo-placeholder" id="logo-placeholder" aria-hidden="true"></div>

    <div class="offline-card" id="offline-panel">
      <div class="status-badge" id="badge-status">
        <span class="status-dot"></span>
        <span id="badge-text">Sem Conexão</span>
      </div>

      <div class="icon-wrapper" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter">
          <path d="M1 1l22 22"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"/>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <path d="M12 20h.01"/>
        </svg>
      </div>

      <h1>Você está offline</h1>
      <p class="description" id="offline-message">
        Não foi possível carregar a página solicitada porque o dispositivo está sem conexão com a internet. Verifique seu Wi-Fi ou dados móveis.
      </p>

      <div class="actions">
        <button type="button" class="btn-retry" id="btn-retry" aria-label="Tentar recarregar a página">
          <svg id="retry-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
            <path d="M20 4v6h-6"/>
            <path d="M20 10 16 5.5H4v5"/>
            <path d="M4 20v-6h6"/>
            <path d="M4 14l4 4.5h12v-5"/>
          </svg>
          <span id="retry-label">Tentar novamente</span>
        </button>

        <button type="button" class="btn-home" id="btn-home" aria-label="Voltar para o início">
          Início
        </button>
      </div>

      <div class="network-indicator" id="network-indicator">
        <span class="pulse-ring"></span>
        <span id="indicator-text">Aguardando sinal para reconectar automaticamente...</span>
      </div>
    </div>
  </main>

  <footer class="credit">
    <span>Desenvolvido por</span>
    <a href="https://viraweb.dev.br" target="_blank" rel="noopener noreferrer" aria-label="ViraWeb (abre em nova aba)">
      <img src="https://viraweb.dev.br/viraweb3.png" alt="ViraWeb" height="20" loading="lazy" decoding="async">
    </a>
  </footer>

  <script>
    // 1. Gerenciamento do Tema Claro / Escuro sincronizado
    (function setupThemeSystem() {
      var btn = document.getElementById('theme-toggle');
      var iconSun = document.getElementById('icon-sun');
      var iconMoon = document.getElementById('icon-moon');

      function getSavedTheme() {
        try {
          var appTheme = localStorage.getItem('prx-app-theme');
          var landingTheme = localStorage.getItem('prx-theme');
          var theme = appTheme || landingTheme;
          if (theme === 'dark' || theme === 'light') return theme;
        } catch (e) {}
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      }

      function applyTheme(newTheme) {
        var root = document.documentElement;
        root.classList.remove('dark', 'light');
        root.classList.add(newTheme);
        root.setAttribute('data-theme', newTheme);
        root.style.colorScheme = newTheme;

        var metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.setAttribute('content', newTheme === 'dark' ? '#000000' : '#ffffff');

        if (newTheme === 'dark') {
          if (iconSun) iconSun.style.display = 'block';
          if (iconMoon) iconMoon.style.display = 'none';
          if (btn) {
            btn.setAttribute('title', 'Mudar para Modo Claro');
            btn.setAttribute('aria-label', 'Alternar para modo claro');
          }
        } else {
          if (iconSun) iconSun.style.display = 'none';
          if (iconMoon) iconMoon.style.display = 'block';
          if (btn) {
            btn.setAttribute('title', 'Mudar para Modo Escuro');
            btn.setAttribute('aria-label', 'Alternar para modo escuro');
          }
        }

        try {
          localStorage.setItem('prx-theme', newTheme);
          localStorage.setItem('prx-app-theme', newTheme);
        } catch (e) {}
      }

      var currentTheme = getSavedTheme();
      applyTheme(currentTheme);

      if (btn) {
        btn.addEventListener('click', function() {
          var next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
          applyTheme(next);
        });
      }
    })();

    // 2. Animação Oficial GSAP 100% idêntica ao PrxLoader online
    (function runOfficialAnimation() {
      var logoStage = document.getElementById('logo-stage');
      var logoSvg = document.getElementById('prx-logo');
      var panel = document.getElementById('offline-panel');
      var header = document.getElementById('top-header');

      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function transitionLogoToTop() {
        if (!logoStage) return;

        var targetTop = '4.5rem';
        var targetWidth = Math.min(window.innerWidth * 0.76, 400);

        if (window.gsap && !reduceMotion) {
          var transTl = gsap.timeline();
          
          transTl.to(logoStage, {
            top: targetTop,
            yPercent: 0,
            y: 0,
            transform: 'translate(-50%, 0)',
            width: targetWidth,
            duration: 0.95,
            ease: "power3.inOut"
          })
          .fromTo(panel, 
            { autoAlpha: 0, y: 35 }, 
            { autoAlpha: 1, y: 0, duration: 0.75, ease: "power3.out" }, 
            "-=0.4"
          )
          .to(header, {
            autoAlpha: 1,
            duration: 0.45,
            ease: "power2.out",
            onComplete: function() {
              if (panel) panel.classList.add('visible');
              if (header) header.classList.add('visible');
            }
          }, "-=0.5");
        } else {
          if (panel) {
            panel.style.opacity = '1';
            panel.style.transform = 'translateY(0)';
            panel.classList.add('visible');
          }
          if (header) {
            header.style.opacity = '1';
            header.classList.add('visible');
          }
          if (logoStage) {
            logoStage.style.top = targetTop;
            logoStage.style.transform = 'translate(-50%, 0)';
            logoStage.style.width = targetWidth + 'px';
          }
        }
      }

      if (reduceMotion) {
        var tagClip = document.getElementById('tag-clip-rect');
        if (tagClip) tagClip.setAttribute('width', '776.5');
        if (window.gsap) {
          gsap.set("#symbol-group", { x: 0 });
          gsap.set("[data-piece='white'], [data-piece='color'], [data-piece='x-arm']", { autoAlpha: 1, x: 0, y: 0 });
          gsap.set("[data-letter]", { y: 0 });
          gsap.set(logoSvg, { autoAlpha: 1 });
        }
        transitionLogoToTop();
        return;
      }

      if (window.gsap) {
        var SYMBOL_CENTER_OFFSET = 263; // 776.5 / 2 - 250.5 / 2

        var tl = gsap.timeline({
          paused: true,
          defaults: { ease: "expo.out" },
          onComplete: function() {
            setTimeout(transitionLogoToTop, 200);
          }
        });

        gsap.set("#symbol-group", { x: SYMBOL_CENTER_OFFSET });
        tl.from("#piece-white", { x: -90, y: -20, autoAlpha: 0, duration: 0.85 }, 0.1)
          .from("#piece-color", { x: 90, y: 20, autoAlpha: 0, duration: 0.85 }, 0.18)
          .to("#symbol-group", { x: 0, duration: 0.85, ease: "expo.inOut" }, 0.8)
          .from("[data-letter]", { y: 130, duration: 0.9, stagger: 0.09 }, 1.38)
          .from("#piece-x-arm", { x: 46, y: -46, autoAlpha: 0, duration: 0.7, ease: "back.out(2)" }, 1.78)
          .to("#tag-clip-rect", { attr: { width: 776.5 }, duration: 0.9, ease: "power3.inOut" }, 2.0)
          .to({}, { duration: 0.7 }, 2.35) // a barra saiu da marca; o tempo da sequência segue igual ao do PrxLoader online
          .to({}, { duration: 0.35 });

        // Revela o SVG já nos estados iniciais aplicados pelos .from()
        gsap.set(logoSvg, { autoAlpha: 1 });

        var elapsed = 0;
        var last = performance.now();
        var frame = 0;
        function step(now) {
          elapsed += Math.min(now - last, 1000 / 30) / 1000;
          last = now;
          tl.time(elapsed);
          if (tl.progress() < 1) frame = requestAnimationFrame(step);
        }
        frame = requestAnimationFrame(function(now) {
          last = now;
          frame = requestAnimationFrame(step);
        });
      } else {
        var clip = document.getElementById('tag-clip-rect');
        if (clip) clip.setAttribute('width', '776.5');
        transitionLogoToTop();
      }
    })();

    // 3. Lógica de Reconexão e Botão "Tentar Novamente"
    (function setupReconnection() {
      var btnRetry = document.getElementById('btn-retry');
      var btnHome = document.getElementById('btn-home');
      var retryIcon = document.getElementById('retry-icon');
      var retryLabel = document.getElementById('retry-label');
      var badgeStatus = document.getElementById('badge-status');
      var badgeText = document.getElementById('badge-text');
      var indicatorText = document.getElementById('indicator-text');
      var isRetrying = false;

      function attemptReload(manual) {
        if (isRetrying) return;
        isRetrying = true;

        if (btnRetry) btnRetry.classList.add('loading');
        if (retryIcon) retryIcon.classList.add('spinning');
        if (retryLabel) retryLabel.textContent = 'Verificando conexão...';
        if (indicatorText) indicatorText.textContent = 'Testando resposta da rede...';

        var pingUrl = '/manifest.json?_t=' + Date.now();

        fetch(pingUrl, { method: 'HEAD', cache: 'no-store' })
          .then(function(res) {
            if (res.ok || res.status < 500) {
              if (badgeStatus) badgeStatus.classList.add('online-restored');
              if (badgeText) badgeText.textContent = 'Conectado!';
              if (retryLabel) retryLabel.textContent = 'Conectado! Recarregando...';
              if (indicatorText) indicatorText.textContent = 'Sinal restabelecido! Recarregando página...';

              setTimeout(function() {
                window.location.reload();
              }, 400);
            } else {
              throw new Error('Offline');
            }
          })
          .catch(function() {
            isRetrying = false;
            if (btnRetry) btnRetry.classList.remove('loading');
            if (retryIcon) retryIcon.classList.remove('spinning');
            if (retryLabel) retryLabel.textContent = 'Tentar novamente';
            if (badgeStatus) badgeStatus.classList.remove('online-restored');
            if (badgeText) badgeText.textContent = 'Ainda Sem Conexão';
            if (indicatorText) {
              indicatorText.textContent = manual
                ? 'Sem conexão no momento. Tente novamente em instantes.'
                : 'Aguardando sinal para reconectar automaticamente...';
            }
          });
      }

      if (btnRetry) {
        btnRetry.addEventListener('click', function() {
          attemptReload(true);
        });
      }

      if (btnHome) {
        btnHome.addEventListener('click', function() {
          window.location.href = '/';
        });
      }

      window.addEventListener('online', function() {
        attemptReload(false);
      });

      setInterval(function() {
        if (navigator.onLine && !isRetrying) {
          attemptReload(false);
        }
      }, 3500);
    })();
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '..', 'public', 'offline.html'), htmlContent, 'utf8');
console.log('Successfully generated public/offline.html with inlined GSAP');
