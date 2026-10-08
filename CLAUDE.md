# PRX — Plataforma Digital (Next.js 16 + React 19 + TypeScript)

@AGENTS.md

> Memória de projeto para Claude Code e agentes de IA. Mantenha este arquivo conciso e de alto sinal.
> Skill ativa do projeto: `.agents/skills/vibe-coding-toolkit/SKILL.md`

## Diretrizes de Comportamento (Vibe Coding Toolkit)

1. **Pense antes de codar (Superpowers)** — Declare premissas explicitamente. Se houver mais de uma interpretação razoável, pergunte ou apresente as alternativas antes de codificar. Se uma solução simples existir, use-a.
2. **Simplicidade primeiro (Ponytail)** — Mínimo de código que resolve o problema. Zero over-engineering, zero abstrações para uso único, zero complexidade especulativa.
3. **Mudanças cirúrgicas** — Altere apenas os arquivos estritamente necessários para a demanda. Respeite os padrões existentes de tipagem e arquitetura.
4. **Execução orientada a objetivos verificáveis** — Toda alteração deve ser validada com `npm run typecheck`, `npm run lint` ou testes antes de concluir.
5. **Comunicação de alto sinal (Caveman)** — Direto ao ponto: explique o que foi feito, caminhos de arquivo, comandos e verificação empírica, sem enrolação.
6. **Teto de 350 linhas por arquivo** — Divida componentes grandes em módulos de responsabilidade única (UI, lógica de negócios, acesso a dados).
7. **Assinatura obrigatória** — A primeira linha de todo componente/página deve ser `// Hello World`.

## Stack Tecnológica

- **Framework**: Next.js 16 (App Router, Server Components + Server Actions)
- **UI / Frontend**: React 19, Tailwind CSS v4, Framer Motion, GSAP (`@gsap/react`), Lenis smooth scroll
- **Linguagem**: TypeScript estrito (zero `any`, tipagem rigorosa Zod em rotas e formulários)
- **Banco & Auth**: Supabase (SSR cookies, `supabaseAdmin` service role) + Store in-memory fallback
- **Ícones**: Lucide React (`lucide-react`) + Hugeicons

## Comandos Canônicos

- **Dev**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Typecheck**: `npm run typecheck`
- **Testes**: `npm run test`
- **Segurança**: `npm run security:scan`

## Estrutura de Diretórios Chave

- `app/admin/`: Painel administrativo de controle (membros, parceiros, benefícios, financeiro).
- `app/em-breve/`: Landing page teaser com captura de e-mails VIP para lista de espera.
- `app/api/admin/`: Endpoints de administração protegidos por sessão de administrador.
- `app/api/waitlist/`: Endpoint público de cadastro na lista de espera VIP.
- `lib/waitlist.ts`: Serviço de persistência de leads (Supabase `waitlist_signups` + fallback in-memory).
- `lib/auth.ts`: Mecanismo central de autenticação e verificação de papéis (`verifyAdminRequest`).
- `components/admin/`: Componentes modulares das abas do painel administrativo.

## Skills / Práticas Sempre Ativas

Aplicar em toda tarefa, sem precisar ser pedido:

1. **Vercel React Best Practices** — Server Components por padrão, `"use client"` só nas folhas; evitar waterfalls (`Promise.all`, `Suspense`); imports diretos (sem barrel files pesados); `next/dynamic` para código pesado; `next/image` e `next/font`; minimizar props serializadas RSC→cliente; derivar estado em vez de `useEffect`; listas com keys estáveis.
2. **code-search** — consultar `graphify query/explain/path` primeiro; depois Grep/Glob direcionados. Nunca varrer o repo inteiro.
3. **targeted-reading** — ler só o trecho necessário (`offset`/`limit`), nunca arquivos inteiros sem motivo.
4. **minimal-output** — respostas curtas: o que mudou, caminhos, verificação. Sem recapitular código.
5. **incremental-editing** — `Edit` cirúrgico em vez de reescrever arquivos; uma mudança coesa por vez; validar (`typecheck`/`lint`) a cada etapa.
6. **project-memory** — registrar decisões não óbvias em `memory/` e manter este arquivo conciso.
