# Folyo

Plataforma de cursos práticos ("Aprenda. Pratique. Demonstre.") que terminam em projetos reais e viram currículo/portfólio.
Feita pelo Vini (programador) e pela Gigi (marketing, ideias e design). Está no ar em https://www.usefolyo.com e já vende cursos avulsos pelo Mercado Pago.
O design segue fielmente o protótipo da Gigi: não invente redesign nem estilo novo sem o Vini pedir.

@AGENTS.md

Detalhes que não cabem aqui: `README.md` (mapa completo de pastas, segurança, painel) e `supabase/README.md` (SQL e configuração de cada serviço). Leia só quando a tarefa pedir.

## Stack
- Next.js 16 (App Router, `cacheComponents` e `partialPrefetching` ligados), React 19, TypeScript estrito
- Supabase (Auth, Postgres com RLS, Storage) via `@supabase/ssr`; validação com zod
- CSS puro em `src/styles/` (sem Tailwind); ícones `lucide-react`
- Vitest (+ PGlite para testar o SQL); deploy na Vercel; vídeo no Bunny Stream; CAPTCHA Cloudflare Turnstile; pagamento Mercado Pago (Checkout Pro)
- Node >= 20.9 (CI usa 22). Repo: `viniciusvalentedev/Folyo`; a Vercel publica a cada push na `main`

## Comandos
- `npm run dev`: site em http://localhost:3000 (precisa de `.env.local`; modelo em `.env.example`)
- `npm run check`: lint + tipos + testes. **Rode antes de qualquer push e ao terminar uma tarefa.**
- `npm run lint` · `npm run typecheck` (faz `next typegen` antes do `tsc`) · `npm run test` · `npm run build`
- Um teste só: `npx vitest run tests/cart.test.ts`
- O CI (`.github/workflows/ci.yml`) repete lint, tipos, testes e build em cada push/PR

## Next.js 16 não é o que você conhece
Leia o guia certo em `node_modules/next/dist/docs/` antes de mexer em rotas, cache ou middleware. Aqui o `middleware` se chama `src/proxy.ts`
(roda antes de TODAS as rotas: limite de pedidos por IP, renovação de sessão, redirecionamento para `/entrar`).

## Onde fica cada coisa
- `src/app/`: páginas. Grupos: `(auth)` login, `(legal)` termos/privacidade, `(public)/u/[slug]` perfil público, `(app)` área logada (`(main)`, `(checkout)`, `(classroom)`, `admin`), `api/` rotas
- `src/components/`: peças por área (`ui`, `shell`, `admin`, `cart`, `landing`...). `providers/AppState.tsx` guarda o estado do aluno e as ações com fila de gravação
- `src/lib/data/`: **único** lugar que LÊ dados (todos com `import 'server-only'`)
- `src/lib/actions/`: Server Actions que GRAVAM; helpers comuns em `shared.ts` e `admin-shared.ts`
- `src/lib/domain/`: regras e cálculos puros · `validation.ts`: schemas zod · `types.ts`: formato dos dados
- `src/lib/payments/`, `security/`, `supabase/`, `admin/`: pagamento, limites, clientes Supabase, papéis e catálogo
- `supabase/migrations/`: SQL (rodado à mão no SQL Editor) · `supabase/README.md`: passo a passo e **ordem** de cada SQL
- `tests/`: Vitest; `tests/sql/` roda as migrations num Postgres de verdade em memória

## Padrões de código
- Sem ponto e vírgula, aspas simples, 2 espaços; imports com o alias `@/` (nunca caminhos relativos longos)
- Código em inglês (`lesson`, `course`, `order`); **textos da tela, mensagens de erro, comentários e commits em português do Brasil**; rotas em português (`/cursos`, `/aula`, `/carrinho`)
- Cada pasta de página tem um `page.tsx` curtinho (servidor) e um `...View.tsx` (a tela, no navegador)
- Comentários explicam o "porquê" e a regra de segurança (siga o estilo dos arquivos existentes)
- Estilo: tokens de cor/fonte em `src/styles/tokens.css`; uma folha por página em `src/styles/pages/`. São três temas (`padrao`, `claro`, `escuro` em `themes.css`): todo visual novo precisa funcionar nos três (a folha do currículo continua branca)
- Menus, abas e gavetas novos usam os ajudantes de teclado de `src/lib/a11y.tsx` (`useMenuFocus`, `handleGroupKeys`, `useFocusTrap`)

## Regras de segurança (segurança vem em primeiro lugar no Folyo)
- **O banco é a última barreira.** Preço, desconto, acesso a curso, papéis e limites são decididos por RLS e funções SQL; a Server Action só valida e repassa. O front só esconde botões
- O navegador **não fala direto com o Supabase** (login e gravações são Server Actions, cookie httpOnly). Únicas exceções: envio de PDF (signed upload URL) e de vídeo (TUS para o Bunny). Origem nova no navegador exige ajustar a CSP em `next.config.ts`
- No servidor, identifique o usuário com `getSessionUser()`/`requireUser()` (usa `getClaims()`). **Nunca `getSession()`**
- `createSupabaseServerClient()` cria um cliente novo a cada uso (já chama `connection()` por causa do Cache Components); não compartilhe nem guarde em variável de módulo
- Toda Server Action: `actionContext()` → validar com zod (`validation.ts`) → gravar → `dbFailure()` para erros. Arquivos `'use server'` só exportam ações de verdade (cada export vira um endereço público); helpers vão em `shared.ts`
- Dados vindos do banco são conferidos de novo (zod) antes de ir para a tela
- Sem `dangerouslySetInnerHTML` (única exceção: `THEME_INIT_SCRIPT`, constante). Links externos só `http(s)` com `rel="noopener noreferrer"`
- Segredos: nunca leia, imprima, comite nem cole `.env.local` ou chaves em conversa. Variáveis `NEXT_PUBLIC_*` só para o que pode ser público. Não logue token, chave nem dado pessoal
- Papéis: aluno / editor / administrador / proprietário. Proprietário só se cria pelo SQL Editor. Painel exige MFA da equipe. Auditoria em `private.admin_audit`

## Pagamentos (Mercado Pago)
- O aluno envia só ids de curso; o banco cria o pedido e calcula o preço (`create_order`). **Só o webhook** (`/api/webhooks/mercadopago`) libera ou tira acesso: confere assinatura → consulta o pagamento na API → chama `apply_payment`
- `SUPABASE_SECRET_KEY` só existe para esse webhook (`src/lib/supabase/service.ts`); não importe esse cliente em outro lugar
- `PAYMENTS_ENABLED` liga/desliga a venda. Credenciais de teste só em Preview/Development; de produção só em Production
- Cupom `LANCAMENTO`: 30 dias de pré-acesso nos cursos marcados "Liberar com cupom"

## Banco de dados e migrations
- Arquivos `supabase/migrations/AAAAMMDDNNNNNN_nome.sql`, **idempotentes** (podem rodar de novo). O Vini roda no SQL Editor do Supabase
- Cada mudança de banco documenta em `supabase/README.md`: o que o SQL faz, **se roda ANTES ou DEPOIS de publicar o código**, como testar e como desfazer. Avise o Vini da ordem antes do push
- As migrations antigas foram removidas da pasta (commit `4d16785`); `tests/sql/db.ts` as lê do histórico do git. Em clone raso os testes de SQL são pulados
- Para tabela nova: RLS ligada, `revoke` do que não deve ser público, limites de tamanho/quantidade e teste em `tests/sql/`

## Conteúdo e SEO
- Só a landing, `/termos` e `/privacidade` podem aparecer no Google (e só em produção). Toda página nova nasce `noindex`; mudar isso é decisão do Vini (`src/lib/seo.ts`)
- `src/lib/legal.ts`: não mude `reviewed` para `true` nem preencha CNPJ/endereço sem o Vini confirmar (aguardam revisão de advogado)

## Ainda NÃO feito (não implemente sem o Vini pedir)
Assinatura mensal (cobrança recorrente), certificados e currículo em PDF de verdade, e-mail de recibo, tela "meus pedidos", nota fiscal (ainda sem CNPJ), legendas/capítulos no player.

## Como trabalhar comigo (Vini)
- Mudanças pequenas e focadas; uma coisa de cada vez.
- Explique o que mudou e por quê, em português, de forma simples
- Push na `main` publica em produção na hora: só faça commit/push quando eu pedir, e antes rode `npm run check`
