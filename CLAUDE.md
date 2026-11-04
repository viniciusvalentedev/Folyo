# Folyo

Plataforma de cursos práticos ("Aprenda. Pratique. Demonstre.") que terminam em projetos reais e viram currículo/portfólio.
Feita pelo Vini (programador) e pela Gigi (marketing, ideias e design). No ar em https://www.usefolyo.com, vendendo cursos
avulsos (cartão e Pix, Mercado Pago dentro do site). O design segue fielmente o protótipo da Gigi: não invente redesign
nem estilo novo sem o Vini pedir.

@AGENTS.md

**Leia este arquivo primeiro e abra só o necessário.** `README.md` (378 linhas: mapa de pastas comentado e segurança) e
`supabase/README.md` (1.150 linhas: passo a passo de cada SQL) são longos: procure a seção com `grep -n "^#"` em vez de
ler inteiro. Use o "Mapa por tarefa" abaixo para ir direto ao arquivo certo.

## Como trabalhar comigo (Vini)
- Mudanças pequenas e focadas; uma coisa de cada vez. Explique o que mudou e por quê, em português simples
- Push na `main` publica em produção na hora: só faça commit/push quando eu pedir, e antes rode `npm run check`
- Mudou o banco? Diga a ordem (SQL **antes** ou **depois** de publicar o código) antes do push. Eu rodo o SQL à mão

## Stack e serviços
- Next.js 16.4 (App Router, `cacheComponents` e `partialPrefetching` ligados), React 19, TypeScript estrito, zod 4
- Supabase (Auth, Postgres com RLS, Storage) via `@supabase/ssr`. CSS puro em `src/styles/` (sem Tailwind); ícones `lucide-react`
- Vercel (deploy a cada push na `main`), Bunny Stream (vídeo), Cloudflare Turnstile (CAPTCHA), Mercado Pago Checkout
  Transparente (cartão até 12x com 3DS + Pix), Zoho SMTP via nodemailer (recibo), Upstash Redis (limite de pedidos entre servidores)
- Vitest + PGlite (Postgres em memória para testar o SQL). CI: `.github/workflows/ci.yml` (Node 22: lint, tipos, testes, build)
- Repo **público** no GitHub (`viniciusvalentedev/Folyo`): nunca comite segredo, `.env.local` ou dado de aluno

## IDs para as ferramentas (não são segredos)
- Supabase: projeto `Folyo`, `project_id` = `zueeeeqjarbhjvxikvft` (sa-east-1)
- Vercel: projeto `folyo` = `prj_D3MwrbfMlKNr19UEbMeADC8iJXiG`, `teamId` = `team_Wbvj1iPAGNx41PHUQYEzHYd5` (conta pessoal, plano Hobby)
- Logs de runtime da Vercel no Hobby só guardam 1 hora: para erros antigos use `get_runtime_errors` (até 7 dias)

## Comandos
- `npm run dev` (http://localhost:3000; precisa de `.env.local`, modelo em `.env.example`)
- `npm run check` = lint + tipos + testes. **Rode ao terminar qualquer tarefa e antes de push**
- Um teste só: `npx vitest run tests/sql/cota-pdf.test.ts`. `npm run typecheck` já faz `next typegen`
- Testes de SQL leem as migrations antigas do histórico do git (commit `4d16785`): em clone raso eles são **pulados**
  sem avisar. Para rodar, use clone completo (`git fetch --unshallow`)

## Next.js 16 não é o que você conhece
Leia o guia em `node_modules/next/dist/docs/` antes de mexer em rotas, cache ou middleware. O middleware se chama
`src/proxy.ts` (roda antes de TODAS as rotas: limite por IP, renovação de sessão, redireciona para `/entrar`).

## Mapa por tarefa (vá direto ao arquivo)
| Tarefa | Onde |
|---|---|
| Mudar uma tela | `src/app/<grupo>/<rota>/…View.tsx` (o `page.tsx` só carrega dados no servidor) |
| Estado do aluno / ações da tela | `src/components/providers/AppState.tsx` (fila de gravação) e `Shop.tsx` (carrinho) |
| Ler dados | `src/lib/data/*` (**único** lugar que lê; todos `server-only`) |
| Gravar dados | `src/lib/actions/*` (Server Actions); peças comuns em `shared.ts` e `admin-shared.ts` |
| Login, cadastro, senha | `src/app/(auth)/actions.ts`, `src/lib/auth/`, `src/proxy.ts` |
| Concluir cadastro (celular, nascimento, gênero) | `src/app/(app)/concluir-cadastro/`, `src/lib/actions/personal.ts`, `src/lib/personal-data.ts`, `src/lib/phone.ts`; aviso do sino em `src/lib/domain/student-state.ts` |
| Pagamento | `src/lib/actions/checkout.ts`, `src/lib/payments/*` (`reconcile.ts` libera/tira acesso), `src/app/api/webhooks/mercadopago/route.ts` |
| Estorno (painel) | `src/lib/actions/refund.ts` · Recibo por e-mail: `src/lib/email/*` |
| PDFs do aluno | `src/lib/actions/works.ts` (envio em 3 passos), `src/lib/pdf-file.ts`, rotas em `src/app/api/trabalhos` e `api/u` |
| Vídeo | `src/lib/bunny.ts`, `src/lib/actions/video.ts` · Mídia do painel: `src/lib/media*.ts`, `actions/media.ts` |
| Painel admin | `src/app/(app)/admin/*`, `src/components/admin/*`, `src/lib/admin/*` |
| Regras e cálculos puros | `src/lib/domain/*` (progresso, sequência das aulas, certificados) |
| Validação / tipos | `src/lib/validation.ts` (zod) · `src/lib/types.ts` |
| Limites (rate limit) | `src/lib/security/*` · CSP e cabeçalhos: `next.config.ts` |
| SEO / textos legais | `src/lib/seo.ts` · `src/lib/legal.ts` |
| Banco | `supabase/migrations/` (só as recentes; as antigas estão no git) · teste em `tests/sql/` |

Rotas: `(auth)` login e MFA · `(legal)` termos/privacidade · `(public)/u/[slug]` perfil público · `(app)` área logada (`primeiro-acesso`, `concluir-cadastro`):
`(main)` (inicio, cursos, objetivos, progresso, projetos, curriculo, certificados, perfil, configuracoes, compras),
`(checkout)` (carrinho, comprar, finalizar, finalizar/pagamento), `(classroom)/aula/[curso]/[aula]`, `admin/*`.

## Padrões de código
- Sem ponto e vírgula, aspas simples, 2 espaços; imports com `@/` (nunca caminhos relativos longos)
- Código em inglês (`lesson`, `course`, `order`); **telas, erros, comentários e commits em português do Brasil**; rotas em português
- Comentários explicam o "porquê" e a regra de segurança (siga o estilo dos arquivos vizinhos)
- Estilo: tokens em `src/styles/tokens.css`, uma folha por página em `src/styles/pages/`. Três temas (`padrao`, `claro`,
  `escuro` em `themes.css`): todo visual novo funciona nos três (a folha do currículo continua branca)
- Menus, abas e gavetas novos usam `src/lib/a11y.tsx` (`useMenuFocus`, `handleGroupKeys`, `useFocusTrap`)

## Segurança (vem em primeiro lugar)
- **O banco é a última barreira.** Qualquer aluno pode chamar a API do Supabase com o próprio token. Preço, desconto,
  acesso a curso, papéis, cotas e limites são decididos por RLS, grants por coluna, gatilhos e funções SQL. A Server
  Action valida e repassa; o front só esconde botões
- O navegador **não fala direto com o Supabase** (login e gravações são Server Actions, cookie httpOnly). Exceções:
  envio de PDF (signed upload URL), vídeo (TUS para o Bunny) e campos de cartão do MercadoPago.js. Origem nova no
  navegador exige ajustar a CSP em `next.config.ts`
- Servidor: usuário via `getSessionUser()`/`requireUser()` (`getClaims()`). **Nunca `getSession()`**
- `createSupabaseServerClient()` cria um cliente novo a cada uso; não guarde em variável de módulo
- Server Action: `actionContext()` → zod (`validation.ts`) → gravar → `dbFailure()`. Arquivo `'use server'` só exporta
  ações de verdade (cada export vira endereço público); helpers em `shared.ts`. Dado do banco é revalidado (zod) antes da tela
- `SUPABASE_SECRET_KEY` (`src/lib/supabase/service.ts`) só no caminho de pagamento: webhook, `checkout.ts` e `refund.ts`
- Sem `dangerouslySetInnerHTML` (só `THEME_INIT_SCRIPT`). Links externos só `http(s)` com `rel="noopener noreferrer"`
- Segredos: nunca leia, imprima, comite nem cole `.env.local` ou chaves. `NEXT_PUBLIC_*` só para o que é público. Não logue token nem dado pessoal

## Banco (Supabase)
- Schema `public` = exposto na API (RLS + grants por coluna). Schema `private` = fora da API (pedidos, pagamentos,
  cupons, papéis, suspensões, auditoria, dados do cadastro `personal_data`); só funções `security definer` com
  `set search_path = ''` mexem lá. Dado pessoal novo (celular, nascimento, gênero…) vai para `private`, nunca para `profiles`
- Papéis: `private.staff_roles` (sem linha = aluno). `private.require_rank(n)`: 1 editor, 2 admin, 3 proprietário;
  exige MFA (aal2) na sessão. Proprietário só pelo SQL Editor. Auditoria em `private.admin_audit` (`private.audit()`)
- Toda função `admin_*` começa com `require_rank`. Escritas do aluno passam por `private.count_write()` / gatilho `write_rate`
- Códigos de erro próprios: `FA400` inválido, `FA403` sem permissão, `FA404` não existe, `FA409` conflito de regra, `FA410` id/endereço já usado (a ação tenta outro),
  `FC422` regra (ex.: ordem das aulas), `FY429` limite de gravações. `23514` com "Limite de" vira mensagem de limite no `dbFailure`
- Buckets: `student-works` (privado, PDF ≤ 20 MB), `catalog-files` (privado), `catalog-images` (público).
  Tamanho/tipo reais de um arquivo: `private.stored_object(bucket, path)`
- No Supabase Advisor, os alertas "SECURITY DEFINER executável" e "RLS sem política" são esperados (todas as funções
  checam login/papel por dentro; tabelas sem política só são acessadas por funções). Os de índice são irrelevantes no tamanho atual

## Migrations
- `supabase/migrations/AAAAMMDDNNNNNN_nome.sql`, **idempotentes**, dentro de `begin; … commit;`, com cabeçalho
  (como usar, ANTES/DEPOIS do código, por quê, o que muda) e bloco "Como desfazer" no fim. Siga a última migration como modelo
- Documente em `supabase/README.md`: item na lista do topo + seção (problema, o que muda, rodar, testar, desfazer)
- Teste em `tests/sql/` com `createDb`, `createUser`, `setRole`, `as(db, {uid}, tx => …)` e `rpc` de `tests/sql/db.ts`.
  Confira que o teste falha sem a migration
- Tabela nova: RLS ligada, `revoke` do que não é público, limites de tamanho/quantidade e teste

## Pagamentos (Mercado Pago, Checkout Transparente)
- O aluno envia só ids de curso; o banco cria o pedido e calcula o preço (`create_order`) e limita tentativas
  (`begin_payment_attempt`). Cartão vira token no MercadoPago.js; a Folyo nunca vê os dados do cartão
- **Só `reconcile.ts`** libera ou tira acesso: lê a ordem na API do Mercado Pago com o NOSSO token e chama
  `apply_payment` (só `service_role`, confere valor e moeda, idempotente). Chamado pelo webhook (assinatura conferida),
  logo após um pagamento aprovado e pelo botão "conferir pagamento"
- Recibo: `claim_order_receipt` / `finish_order_receipt` (um por pedido; se o envio falha, só o próximo aviso tenta de novo)
- `PAYMENTS_ENABLED` liga/desliga a venda. Credenciais de produção só em Production. Cupom `LANCAMENTO`: 30 dias de
  pré-acesso nos cursos marcados "Liberar com cupom"

## Conteúdo e SEO
- Só a landing, `/termos` e `/privacidade` aparecem no Google (só em produção). Página nova nasce `noindex`; mudar é decisão do Vini (`src/lib/seo.ts`)
- `src/lib/legal.ts`: não mude `reviewed` para `true` nem preencha CNPJ/endereço sem o Vini confirmar (aguarda advogado)

## Ainda NÃO feito (não implemente sem o Vini pedir)
Assinatura mensal (cobrança recorrente), certificados e currículo em PDF de verdade (hoje são demonstração), nota fiscal
(ainda sem CNPJ), legendas/capítulos no player, reenvio automático de recibo que falhou.

## Pendências conhecidas (revisão de 04/11/2026)
- Vercel no plano Hobby, que não permite uso comercial: migrar para o Pro
- Supabase Auth: proteção contra senhas vazadas desligada
- `engines: ">=20.9"` faz a Vercel usar Node 24 (CI usa 22)
- `folyo-six.vercel.app` também serve a produção (o ideal é redirecionar para o www)
- As migrations `20261022000003_etapa4b_seguranca_painel.sql` e `20261027000001_lgpd_conta.sql` (no git) **nunca
  rodaram em produção**. A parte da exclusão de conta foi refeita em `20261104000003_excluir_conta.sql`. Ainda faltam
  da 4b: histórico do painel só de inclusão (hoje dá para alterar/apagar), gatilho do último proprietário em
  `staff_roles`/`suspensions`, registro de mudanças feitas fora do painel e o CHECK de nome sem caracteres invisíveis.
  Antes de reaplicar, compare com as funções `admin_*` atuais (migrations seguintes as recriaram)
