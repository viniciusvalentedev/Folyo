# Folyo

**Aprenda. Pratique. Demonstre.** Plataforma de cursos práticos que terminam em projetos reais e viram um currículo.

Onde estamos:

- **Front-end v1** ✅ todas as telas da área do aluno, fiéis ao protótipo da Gigi.
- **Etapa 1 — login + perfil** ✅ contas de verdade com Supabase (criar conta, confirmar e-mail, entrar, sair,
  esqueci a senha). Contas novas começam vazias.
- **Etapa 2 — dados do aluno** ✅ aulas concluídas, anotações, favoritos, competências, currículo e
  configurações ficam salvos no banco (salvam sozinhos enquanto o aluno usa o site).
- **Etapa 3 — proteção contra robôs** ✅ CAPTCHA (Cloudflare Turnstile) e limites de tentativas e de alterações.
- **Etapa 4 — painel admin (fundação)** ✅ papéis (aluno / editor / administrador / proprietário), visão geral com
  números reais, lista e ficha dos usuários, suspender e reativar contas, permissões e histórico de auditoria.
  As demais áreas (cursos, categorias, aulas, mídia...) aparecem como "em breve".
- **Folyo 2.0 — Fase 1 (área do aluno)** ✅ novo primeiro acesso (3 passos), Objetivos, Início, Cursos, sala de aula,
  Progresso, **Projetos e portfólio** (trabalhos em PDF ou link), Currículo, Certificados, Perfil, Configurações e
  **perfil público** (`/publico`), seguindo o protótipo Folyo 2.0. Exige rodar um SQL novo (veja
  [`supabase/README.md`](supabase/README.md)).
- **Próximas fases do 2.0:** Fase 2 — painel com banco (cursos, categorias, aulas, vídeo e materiais);
  Fase 3 — mídia, audiência, relatórios e configurações do painel. Depois: certificados e PDF de verdade; pagamentos.

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

> Tudo o que o aluno faz fica salvo na conta dele. Os vídeos das aulas e os certificados ainda são demonstrações
> (o Início avisa isso ao aluno).

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
│  │  ├─ primeiro-acesso/    → /primeiro-acesso (primeiro acesso em 3 passos)
│  │  ├─ publico/            → /publico  (pré-visualização do perfil público)
│  │  ├─ (main)/             ← páginas com menu lateral + barra do topo
│  │  │  ├─ inicio/          → /inicio
│  │  │  ├─ objetivos/       → /objetivos
│  │  │  ├─ cursos/          → /cursos  e  /cursos/[curso]
│  │  │  ├─ progresso/       → /progresso
│  │  │  ├─ projetos/        → /projetos  (Projetos e portfólio: trabalhos em PDF ou link, em modal)
│  │  │  ├─ competencias/    → /competencias  (só redireciona para /objetivos)
│  │  │  ├─ curriculo/       → /curriculo
│  │  │  ├─ certificados/    → /certificados
│  │  │  ├─ perfil/          → /perfil
│  │  │  └─ configuracoes/   → /configuracoes
│  │  └─ (classroom)/aula/   → /aula/[curso]/[aula]  (sala de aula, menu compacto)
│  ├─ api/trabalhos/[id]/arquivo/ → ★ entrega o PDF de um trabalho (só para o dono, conferindo o login)
│  ├─ layout.tsx             → HTML base, fontes e estilos
│  └─ not-found.tsx          → página "não encontrada"
├─ components/               ← PEÇAS reutilizadas pelas páginas
│  ├─ ui/                    → botões, ícones, modais, abas, barras de progresso…
│  ├─ shell/                 → menu lateral, barra do topo, menu do celular
│  ├─ course/                → cards de curso
│  ├─ dashboard/             → blocos do Início e do Progresso (números, bolhas de skills, gráficos)
│  ├─ works/                 → trabalhos: cartões, formulário (PDF/link) e visualizador de PDF
│  ├─ brand/                 → logotipo da Folyo
│  └─ providers/AppState.tsx → estado do aluno + todas as AÇÕES (concluir aula, salvar projeto…)
├─ proxy.ts                 → roda antes de cada página: renova a sessão e manda quem não entrou para /entrar
├─ lib/
│  ├─ supabase/              → cliente do Supabase (só servidor) e opções do cookie de sessão
│  ├─ auth/redirects.ts      → páginas públicas e proteção do ?next= do login
│  ├─ data/                  → ★ ÚNICO lugar que "busca dados" (catálogo fixo + dados do aluno no Supabase)
│  ├─ actions/               → ações que salvam no banco: student.ts (aulas, currículo…), profile.ts (primeiro acesso e
│  │                           objetivos), works.ts (trabalhos e PDFs), shared.ts (peças comuns das ações)
│  ├─ trails.ts              → trilhas, etapas de vida e metas do primeiro acesso (uma lista só, usada por tela e servidor)
│  ├─ pdf-file.ts            → limites e conferência de PDF (tamanho e assinatura %PDF-)
│  ├─ mock/                  → catálogo de cursos (ainda fixo no código)
│  ├─ domain/                → regras/cálculos (progresso, tempo estudado, certificados, objetivos)
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

**Dados do aluno (etapa 2)**

- **O banco é a última barreira.** Qualquer aluno logado consegue falar direto com a API do Supabase (com a
  publishable key e o próprio login), então o banco confere tudo sozinho: RLS em todas as tabelas, permissão
  por coluna (o aluno não escolhe o dono da linha nem as datas), limites de tamanho e de quantidade de itens.
- **Datas são do servidor:** "aula concluída em", "começou em" e "trabalho enviado em" são marcadas pelo banco.
- **Cada Server Action** confere o login, valida tudo de novo (zod) e confere no catálogo se o curso/aula existe.
  Nada é exportado de arquivo `'use server'` sem ser uma ação de verdade (cada exportação vira um endereço público).
- **Leitura desconfiada:** o que vem do banco é conferido de novo antes de ir para a tela (itens estranhos são
  descartados), então um dado "envenenado" gravado direto na API não quebra a página nem vira link perigoso.
- **Apagar a conta apaga tudo** (todas as tabelas dependem do perfil, que depende da conta).
- **Só o que mudou é enviado** (perfil, currículo e configurações): uma aba antiga aberta não desfaz o que você
  mudou em outra aba ou no celular.
- Testado com Postgres de verdade: regras do banco (105 casos) e ponta a ponta com o site rodando (75 casos,
  incluindo tentativas de mexer nos dados de outro aluno, sem login, de outro site e com dados inválidos).

**Trabalhos em PDF e tempo assistido (Folyo 2.0)**

- **PDF num bucket privado** do Supabase Storage (`student-works`, até 20 MB, só `application/pdf`). O caminho é
  sempre `<id do aluno>/<arquivo>.pdf`: as regras do Storage só deixam cada aluno ler, enviar e apagar dentro da
  própria pasta, e conta suspensa não acessa nada.
- **Quem lê o PDF é só o dono:** o arquivo é aberto por `/api/trabalhos/<id>/arquivo`, que confere o login e a
  linha do trabalho (RLS) antes de entregar. Não existe link público do arquivo. A resposta leva
  `Content-Disposition`, `nosniff`, `no-store` e só pode ser exibida dentro do próprio site (`frame-ancestors 'self'`).
- **Exceção documentada à regra "o navegador não fala com o Supabase":** o envio do PDF. O servidor valida o
  pedido e gera um endereço de envio de uso único (*signed upload URL*); o navegador faz o `PUT` direto no
  Storage (para não passar 20 MB pela Vercel). Por isso a CSP (`connect-src`) inclui a origem do Supabase.
  Depois do envio, o servidor **confere o arquivo de verdade** (começa com `%PDF-`, tamanho real) antes de
  confirmar; se não passar, o arquivo é apagado.
- **Limites no banco:** quantidade de trabalhos e espaço total por aluno, link só `http(s)`, título e descrição
  com tamanho máximo, e o gatilho de alterações por minuto da etapa 3.
- **Tempo assistido** (`lesson_watch`) só cresce e, no máximo, na velocidade do relógio: o banco recusa tempo
  "inventado".

**Proteção contra robôs (etapa 3)**

- **CAPTCHA da Cloudflare (Turnstile)** em entrar, criar conta, reenviar confirmação e "esqueci a senha". O
  comprovante vale uma vez só e é conferido pelo **Supabase** (a chave secreta do Turnstile fica só no painel dele).
- **Limite de alterações no banco** (120 por minuto e 3000 por hora por aluno), aplicado por um gatilho no banco:
  vale também para quem tenta usar a API direto, pulando o site.
- **Limite de tentativas nas telas de entrada** por IP, e no máximo 3 e-mails por 15 minutos para o mesmo endereço
  (sem revelar nada: a resposta é sempre igual). O IP só é lido do cabeçalho da Vercel (não dá para forjar).
- O IP real do aluno é repassado ao Supabase, para o CAPTCHA e os limites dele olharem para o aluno.
- Testado: regras do limite no banco (27 casos) e ponta a ponta (43 casos: CSP, widget, comprovante
  repetido/ausente/gigante, limites e mensagens), além dos testes das etapas anteriores.

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

## Painel admin (`/admin`)

- **Quem entra:** só quem tem papel na equipe (`private.staff_roles`). Aluno que abrir o endereço vê "sem acesso"
  e nenhum dado do painel chega ao navegador dele.
- **Quem decide é o banco:** as funções `admin_*` conferem o papel e a hierarquia (ninguém muda o próprio papel;
  administrador só mexe em quem está abaixo dele; só o proprietário cria administradores). As Server Actions só
  validam os dados e repassam. A tela (`src/lib/admin/roles.ts`) apenas esconde botões.
- **Privacidade do aluno:** a equipe vê só um resumo (cadastro, atividade, progresso e quantidade de trabalhos).
  Anotações, conteúdo e arquivos dos trabalhos e currículo nunca saem para o painel.
- **Conta suspensa:** não lê nem grava nada (regras restritivas no banco) e cai em `/conta-suspensa`. Os dados
  continuam guardados.
- **Proprietário só pelo SQL Editor:** o painel não cria, não rebaixa e não suspende proprietários, e o banco
  nunca deixa ficar sem um proprietário ativo.
- **Auditoria:** troca de papel, suspensão e reativação ficam registradas em `private.admin_audit`, inclusive
  as feitas direto no banco (SQL Editor). O histórico não pode ser editado nem apagado. Tentativas barradas
  aparecem no log do servidor (Vercel → Logs: "Painel: ação negada").
- **Limites:** todas as rotas têm limite de pedidos por IP (proxy). Login também tem limite de senhas erradas
  por e-mail, e as ações do painel têm limite por minuto no banco.
- **Virar proprietário (uma vez, no SQL Editor):** veja o passo a passo em [`supabase/README.md`](supabase/README.md).

---

## O que ainda é demonstração (e entra depois)

| Item | Situação hoje | Próxima etapa |
| --- | --- | --- |
| **Login / cadastro** | ✅ Supabase Auth, rotas protegidas, e-mail próprio (Zoho, usefolyo.com), CAPTCHA e limite de tentativas | Excluir/exportar conta (LGPD) |
| **Banco de dados** | ✅ Perfil, progresso, anotações, tempo assistido, trabalhos (PDF/link), competências e currículo, todos com RLS e limite de alterações por minuto | Certificado emitido pelo servidor |
| **Painel admin** | ✅ Fundação: papéis, visão geral, usuários (suspender/reativar), permissões e auditoria. Papel e regras ficam no banco; a tela só esconde o que não se pode usar | Cursos, categorias, módulos e aulas, audiência, relatórios, mídia e configurações (hoje "em breve") |
| **Player de aula** | Sem vídeo ainda: mostra um aviso. O tempo assistido já tem tabela pronta | Fase 2: vídeo (Cloudflare Stream ou Bunny Stream) e materiais da aula |
| **Currículo em PDF e certificados** | Só visual ("Certificados a caminho"). Hoje "aula concluída" é marcada pelo próprio aluno | Certificado emitido pelo servidor (conferindo aulas e trabalho) + código de verificação |
| **Perfil público** | `/publico` é só a pré-visualização para o próprio aluno (o que ele marcou como público) | Rota pública de verdade (`/u/nome` ou subdomínio) com controle de privacidade |
| **Objetivos com recomendação** | Trilhas e recomendações calculadas no código (`src/lib/trails.ts`) com o catálogo fixo | Recomendação com o catálogo do banco (Fase 2) |
| **Pagamentos (Plano Pro)** | Só o selo "Pro" | Mercado Pago / Stripe / Pagar.me |

### Como os dados vão para o banco

1. `src/lib/data/user.ts` lê tudo do Supabase quando a página abre e `src/lib/domain/student-state.ts` confere.
2. Cada ação em `src/components/providers/AppState.tsx` (ex.: `toggleLesson`) muda a tela na hora e coloca o
   pedido numa **fila de gravação**: cada coisa (uma aula, um trabalho...) tem no máximo um pedido por vez, sempre
   com o estado mais recente, e textos esperam a pessoa parar de digitar.
3. A fila chama as *server actions* de `src/lib/actions/student.ts`: confere quem é o usuário → valida com
   `validation.ts` → grava no banco. O banco confere de novo (RLS, permissões e limites).

---

## Subir para o GitHub e a Vercel

A pasta já está ligada ao repositório `viniciusvalentedev/Folyo`. Para enviar:

```bash
git add -A
git commit -m "Folyo 2.0 · Fase 1: área do aluno"
git push
```

A Vercel publica sozinha a cada `git push`. As variáveis do Supabase ficam em **Settings → Environment Variables**
(veja [`supabase/README.md`](supabase/README.md)). O `.env.local` nunca vai para o GitHub.

---

Feito com Next.js 16 (App Router, Cache Components), React 19, TypeScript, Supabase (`@supabase/ssr`), lucide (ícones) e zod (validação).
Design: protótipo da Gigi.
