# Folyo

**Aprenda. Pratique. Demonstre.** Plataforma de cursos práticos que terminam em projetos reais e viram um currículo.

Onde estamos:

- **Front-end v1** ✅ todas as telas da área do aluno, fiéis ao protótipo da Gigi.
- **Etapa 1 — login + perfil** ✅ contas de verdade com Supabase (criar conta, confirmar e-mail, entrar, sair,
  esqueci a senha). O nome, o objetivo e a meta semanal ficam salvos no banco. Contas novas começam vazias.
- **Próximas etapas** (uma de cada vez): salvar aulas, projetos e currículo no banco; painel admin; vídeo; pagamentos.

**Configurar o Supabase pela primeira vez:** siga o passo a passo em [`supabase/README.md`](supabase/README.md).

---

## Como rodar no seu computador

Precisa do **Node.js 20.9 ou mais novo** (recomendado: versão 22 LTS). Confira com `node -v`.

1. Crie o arquivo `.env.local` com a URL e a publishable key do Supabase (modelo em `.env.example`;
   passo a passo em [`supabase/README.md`](supabase/README.md)).
2. Rode:

```bash
npm install      # instala as dependências (na primeira vez e quando o package.json mudar)
npm run dev      # abre em http://localhost:3000
```

Ao abrir, você cai na tela **Entrar**. Crie uma conta, confirme pelo e-mail e entre.

Outros comandos úteis:

| Comando             | Para que serve                                          |
| ------------------- | ------------------------------------------------------- |
| `npm run build`     | Gera a versão de produção (é o que a Vercel roda)       |
| `npm run start`     | Roda a versão de produção depois do build               |
| `npm run check`     | Procura erros de código (lint) e de tipos (TypeScript)  |

> Nesta etapa o banco guarda só o perfil (nome, objetivo, momento e meta semanal). Aulas concluídas, projetos e
> currículo ainda ficam só na memória da aba e voltam ao zero ao recarregar. O Início avisa isso ao aluno.

---

## Onde fica cada coisa

```
src/
├─ app/                      ← as PÁGINAS (cada pasta = um endereço do site)
│  ├─ (auth)/                ← telas de login (sem menu)
│  │  ├─ actions.ts          → ★ ações de login no servidor (entrar, criar conta, sair, nova senha)
│  │  ├─ entrar/             → /entrar  (entrar e criar conta)
│  │  ├─ esqueci-senha/      → /esqueci-senha
│  │  ├─ auth/confirmar/     → /auth/confirmar  (página aberta pelo link do e-mail)
│  │  └─ redefinir-senha/    → /redefinir-senha  (escolher senha nova)
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
├─ proxy.ts                 → roda antes de cada página: renova a sessão e manda quem não entrou para /entrar
├─ lib/
│  ├─ supabase/              → cliente do Supabase (só servidor) e opções do cookie de sessão
│  ├─ auth/redirects.ts      → páginas públicas e proteção do ?next= do login
│  ├─ data/                  → ★ ÚNICO lugar que "busca dados" (catálogo fixo + perfil do aluno no Supabase)
│  ├─ actions/profile.ts     → ações que salvam o perfil no banco (nome, objetivo, meta)
│  ├─ mock/                  → catálogo de cursos (ainda fixo no código)
│  ├─ domain/                → regras/cálculos (progresso, certificados, diagnóstico do currículo)
│  ├─ validation.ts          → regras de validação dos formulários (zod)
│  ├─ types.ts               → formato dos dados (guia para criar as tabelas no banco)
│  └─ format.ts              → datas, plural, minutos…
└─ styles/                   → visual (cores, fontes, componentes e uma folha por página)
supabase/
├─ README.md                 → ★ passo a passo para configurar o Supabase
├─ migrations/               → SQL do banco (tabelas + regras RLS)
└─ templates/                → modelos dos e-mails (confirmar conta, senha nova)
```

**Padrão das páginas:** cada pasta tem um `page.tsx` (curtinho, roda no servidor) e um `…View.tsx`
(a tela de verdade, roda no navegador). Quer mudar a tela de Início? Abra `src/app/(app)/(main)/inicio/DashboardView.tsx`.

**Cores e fontes:** `src/styles/tokens.css`. Mudou ali, muda no site inteiro.

---

## Segurança — o que já está pronto

**Login (etapa 1)**

- O navegador **nunca fala direto com o Supabase**: entrar, criar conta e salvar perfil são *Server Actions*.
  Por isso o cookie de sessão pode ser **httpOnly** (um script malicioso na página não consegue roubar a sessão).
- **Duas checagens + banco:** o `proxy.ts` barra quem não entrou; cada página confere de novo a sessão no servidor
  (`getClaims()`, que verifica a assinatura do token); e o banco aplica **RLS** (cada aluno só vê a própria linha).
- Só a **publishable key** é usada. A secret key não está no projeto.
- Mensagens de erro **não revelam** se um e-mail tem conta. Senhas nunca são guardadas nem registradas em log.
- O `?next=` do login só aceita endereços do próprio site (sem *open redirect*).
- O link do e-mail só é usado quando a pessoa clica no botão (antivírus que "abrem" links não gastam o código).

**Site**

- **Cabeçalhos de segurança** em todas as páginas (`next.config.ts`): Content-Security-Policy, proteção contra
  iframe (clickjacking), `nosniff`, Referrer-Policy, Permissions-Policy e HSTS. O site também não anuncia que usa Next.js.
- **Nada de segredo no código.** As chaves ficam em `.env.local` (fora do GitHub) e nas variáveis da Vercel — veja `.env.example`.
- **Dados só passam por `src/lib/data/`**, e esses arquivos têm `import 'server-only'`: se alguém tentar usá-los no
  navegador, o build quebra.
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

| Item | Situação hoje | Próxima etapa |
| --- | --- | --- |
| **Login / cadastro** | ✅ Supabase Auth, rotas protegidas | CAPTCHA no cadastro e e-mail próprio (SMTP) antes de divulgar |
| **Banco de dados** | ✅ Perfil (`profiles`) com RLS. Aulas, projetos e currículo ainda só na memória | Etapa 2: tabelas de progresso, projetos, competências e currículo, todas com RLS |
| **Painel admin** | Fora da v1 | Cursos, aulas, usuários, mídia, categorias, relatórios e permissões, com papéis (aluno / editor / admin / proprietário) |
| **Player de aula** | Demonstrativo (sem vídeo) | Cloudflare Stream ou Bunny Stream |
| **Currículo em PDF e certificados** | Só visual | Geração real de PDF + código de verificação |
| **Perfil público** | Ainda a decidir (`/u/nome` ou subdomínio) | Rota pública + controle de privacidade |
| **Objetivos com recomendação** | Recomendação fixa | Lógica de recomendação com dados reais |
| **Pagamentos (Plano Pro)** | Só o selo "Pro" | Mercado Pago / Stripe / Pagar.me |

### Como o resto dos dados vai para o banco (etapa 2)

O caminho já está pronto e é o mesmo usado no perfil:

1. `src/lib/data/user.ts` lê do Supabase (as páginas não mudam).
2. Cada ação em `src/components/providers/AppState.tsx` (ex.: `toggleLesson`) chama uma *server action*
   (como as de `src/lib/actions/profile.ts`) que: confere quem é o usuário → valida com `validation.ts` → grava no banco.
3. As regras do banco (RLS) garantem que cada aluno só lê e altera os próprios dados — mesmo que alguém tente burlar o site.

---

## Subir para o GitHub e a Vercel

A pasta já está ligada ao repositório `viniciusvalentedev/Folyo`. Para enviar:

```bash
git add -A
git commit -m "Etapa 1: login e perfil com Supabase"
git push
```

A Vercel publica sozinha a cada `git push`. As variáveis do Supabase ficam em **Settings → Environment Variables**
(veja [`supabase/README.md`](supabase/README.md)). O `.env.local` nunca vai para o GitHub.

---

Feito com Next.js 16 (App Router, Cache Components), React 19, TypeScript, Supabase (`@supabase/ssr`), lucide (ícones) e zod (validação).
Design: protótipo da Gigi.
