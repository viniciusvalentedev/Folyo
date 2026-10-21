# Folyo — front-end (v1)

**Aprenda. Pratique. Demonstre.** Plataforma de cursos práticos que terminam em projetos reais e viram um currículo.

Esta é a **versão 1 do front-end**: todas as telas da área do aluno, fiéis ao protótipo da Gigi, funcionando com
**dados de demonstração** (a conta da "Ana Souza"). Ainda **não existe** banco de dados, login de verdade nem
pagamento — isso entra nas próximas etapas, uma de cada vez.

---

## Como rodar no seu computador

Precisa do **Node.js 20.9 ou mais novo** (recomendado: versão 22 LTS). Confira com `node -v`.

```bash
npm install      # instala as dependências (só na primeira vez)
npm run dev      # abre em http://localhost:3000
```

Ao abrir, você cai na tela **Entrar**. Preencha qualquer e-mail e senha (com 6+ caracteres) e entre na
demonstração. Nada do que você digita ali é enviado ou guardado.

Outros comandos úteis:

| Comando             | Para que serve                                          |
| ------------------- | ------------------------------------------------------- |
| `npm run build`     | Gera a versão de produção (é o que a Vercel roda)       |
| `npm run start`     | Roda a versão de produção depois do build               |
| `npm run check`     | Procura erros de código (lint) e de tipos (TypeScript)  |

> As alterações que você faz no site (concluir aula, criar projeto, editar currículo…) ficam só na memória da
> aba. Recarregou a página, volta tudo para a conta de demonstração. Isso é proposital nesta etapa.

---

## Onde fica cada coisa

```
src/
├─ app/                      ← as PÁGINAS (cada pasta = um endereço do site)
│  ├─ (auth)/entrar/         → /entrar  (entrar e criar conta)
│  ├─ (app)/                 ← área do aluno (tudo "depois do login")
│  │  ├─ layout.tsx          → carrega o catálogo e os dados do aluno
│  │  ├─ primeiro-acesso/    → /primeiro-acesso (escolher objetivo, 3 passos)
│  │  ├─ (main)/             ← páginas com menu lateral + barra do topo
│  │  │  ├─ inicio/          → /inicio
│  │  │  ├─ objetivos/       → /objetivos
│  │  │  ├─ cursos/          → /cursos  e  /cursos/[curso]
│  │  │  ├─ progresso/       → /progresso
│  │  │  ├─ projetos/        → /projetos, /projetos/novo, /projetos/[id], /projetos/[id]/editar
│  │  │  ├─ competencias/    → /competencias
│  │  │  ├─ curriculo/       → /curriculo
│  │  │  ├─ certificados/    → /certificados
│  │  │  ├─ perfil/          → /perfil
│  │  │  └─ configuracoes/   → /configuracoes
│  │  └─ (classroom)/aula/   → /aula/[curso]/[aula]  (sala de aula, menu compacto)
│  ├─ layout.tsx             → HTML base, fontes e estilos
│  └─ not-found.tsx          → página "não encontrada"
├─ components/               ← PEÇAS reutilizadas pelas páginas
│  ├─ ui/                    → botões, ícones, modais, abas, barras de progresso…
│  ├─ shell/                 → menu lateral, barra do topo, menu do celular
│  ├─ course/ project/       → cards de curso e de projeto
│  ├─ brand/                 → logotipo da Folyo
│  └─ providers/AppState.tsx → estado do aluno + todas as AÇÕES (concluir aula, salvar projeto…)
├─ lib/
│  ├─ data/                  → ★ ÚNICO lugar que "busca dados" (hoje: demonstração; amanhã: Supabase)
│  ├─ mock/                  → dados de demonstração (catálogo e conta da Ana)
│  ├─ domain/                → regras/cálculos (progresso, certificados, diagnóstico do currículo)
│  ├─ validation.ts          → regras de validação dos formulários (zod)
│  ├─ types.ts               → formato dos dados (guia para criar as tabelas no banco)
│  └─ format.ts              → datas, plural, minutos…
└─ styles/                   → visual (cores, fontes, componentes e uma folha por página)
```

**Padrão das páginas:** cada pasta tem um `page.tsx` (curtinho, roda no servidor) e um `…View.tsx`
(a tela de verdade, roda no navegador). Quer mudar a tela de Início? Abra `src/app/(app)/(main)/inicio/DashboardView.tsx`.

**Cores e fontes:** `src/styles/tokens.css`. Mudou ali, muda no site inteiro.

---

## Segurança — o que já está pronto nesta versão

- **Cabeçalhos de segurança** em todas as páginas (`next.config.ts`): Content-Security-Policy, proteção contra
  iframe (clickjacking), `nosniff`, Referrer-Policy, Permissions-Policy e HSTS. O site também não anuncia que usa Next.js.
- **Nada de segredo no código.** Diferente do protótipo, não há senhas de demonstração no código. Chaves futuras vão
  em `.env.local` (fora do GitHub) — veja `.env.example`.
- **Dados só passam por `src/lib/data/`**, e esses arquivos têm `import 'server-only'`: se alguém tentar usá-los no
  navegador, o build quebra. É ali que entram as consultas ao Supabase.
- **Validação de tudo que entra** (`src/lib/validation.ts`): formulários e endereços. Ids de curso/aula/projeto
  inválidos viram página 404. Textos têm limite de tamanho.
- **Links externos seguros:** só `http(s)` é aceito (bloqueia links do tipo `javascript:`) e eles abrem com
  `rel="noopener noreferrer"`.
- **React escapa todo texto** exibido (não usamos `dangerouslySetInnerHTML`), o que evita injeção de HTML.
- **Fontes servidas pelo próprio site** (sem Google Fonts no navegador do aluno): mais privacidade e uma CSP mais rígida.
- **Erros não vazam detalhes técnicos** para o usuário (`error.tsx`).
- **Robôs de busca bloqueados** (`noindex`) enquanto o site é uma demonstração.
- Dependências de produção sem vulnerabilidades conhecidas (`npm audit --omit=dev`). O aviso que aparece no
  `npm install` vem só de ferramentas de desenvolvimento (lint) e não vai para o site.

---

## O que ainda é demonstração (e entra depois)

| Item | Situação na v1 | Próxima etapa |
| --- | --- | --- |
| **Banco de dados** | Dados fixos em `src/lib/mock/` | Supabase (Postgres) com **RLS** em todas as tabelas |
| **Login / cadastro** | Tela pronta, sem autenticação | Supabase Auth + proteção das rotas no servidor (`proxy.ts`) |
| **Painel admin** | Fora da v1 | Cursos, aulas, usuários, mídia, categorias, relatórios e permissões, com papéis (aluno / editor / admin / proprietário) |
| **Player de aula** | Demonstrativo (sem vídeo) | Cloudflare Stream ou Bunny Stream |
| **Currículo em PDF e certificados** | Só visual | Geração real de PDF + código de verificação |
| **Perfil público** | Ainda a decidir (`/u/nome` ou subdomínio) | Rota pública + controle de privacidade |
| **Objetivos com recomendação** | Recomendação fixa | Lógica de recomendação com dados reais |
| **Pagamentos (Plano Pro)** | Só o selo "Pro" | Mercado Pago / Stripe / Pagar.me |

### Como os dados vão trocar de "demonstração" para "banco"

1. `src/lib/data/catalog.ts` e `src/lib/data/user.ts` passam a consultar o Supabase (as páginas não mudam).
2. Cada ação em `src/components/providers/AppState.tsx` (ex.: `toggleLesson`) passa a chamar uma *server action*
   que: confere quem é o usuário → valida os dados com as mesmas regras de `validation.ts` → grava no banco.
3. As regras do banco (RLS) garantem que cada aluno só lê e altera os próprios dados — mesmo que alguém tente burlar o site.

---

## Subir para o GitHub e a Vercel

A pasta já está ligada ao repositório `viniciusvalentedev/Folyo`. Para enviar:

```bash
git add .
git commit -m "Folyo: front-end v1"
git push
```

Na Vercel: **Add New → Project →** escolha o repositório **Folyo** → **Deploy** (não precisa configurar nada nesta etapa).

---

Feito com Next.js 16 (App Router, Cache Components), React 19, TypeScript, lucide (ícones) e zod (validação).
Design: protótipo da Gigi.
