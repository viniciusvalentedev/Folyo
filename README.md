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
- **Folyo 2.0 — Fase 1 (área do aluno)** ✅ novo primeiro acesso (3 passos), Objetivos, Início, Cursos, sala de aula,
  Progresso, **Projetos e portfólio** (trabalhos em PDF ou link), Currículo, Certificados, Perfil, Configurações e
  **perfil público** (`/publico`), seguindo o protótipo Folyo 2.0. Exige rodar um SQL novo (veja
  [`supabase/README.md`](supabase/README.md)).
- **Perfil público de verdade** ✅ `usefolyo.com/u/<endereço>`: página aberta sem login com nome, objetivo, projetos
  públicos (PDF e link), cursos concluídos e experiência. A pessoa escolhe o endereço e liga ou desliga o perfil,
  o portfólio e o e-mail em Configurações › Privacidade. Fora do Google (`noindex`) por padrão. Exige rodar um SQL
  **antes** de publicar (veja [`supabase/README.md`](supabase/README.md)).
- **Folyo 2.0 — Fase 2 (painel com banco)** ✅ **Cursos, Categorias e Módulos e aulas** no painel, gravados no banco
  (a equipe cadastra, agenda, publica e despublica; o aluno só vê o que está publicado). Editor de curso com 5 abas
  (informações, capa e visual, módulos e aulas, publicação e acesso, prévia), vídeo por link e materiais por link,
  tags, destaques e ordem do catálogo. Exige rodar um SQL novo (veja [`supabase/README.md`](supabase/README.md)).
- **Folyo 2.0 — Fase 3 (mídia, vídeo e métricas)** ✅ **Biblioteca de mídia** (imagens e PDFs no Supabase Storage),
  capa/miniatura/banner com ponto de foco, imagem nas categorias, PDFs nos materiais das aulas, **vídeo no Bunny
  Stream** (envio direto do navegador, player com token), **Audiência** (ao vivo e histórico), **Relatórios**
  (5 relatórios + CSV) e **Configurações** (6 abas). Exige um SQL novo e, para o vídeo, as variáveis `BUNNY_STREAM_*`
  (veja [`supabase/README.md`](supabase/README.md)).
- **Segurança do painel — verificação em duas etapas (MFA)** ✅ a equipe (editor, administrador, proprietário) só usa o
  painel depois de digitar o código de um aplicativo autenticador. Quem decide é o banco: sem o código, a sessão vale
  como aluno. Exige um SQL novo, **rodado por último** (veja [`supabase/README.md`](supabase/README.md)).
- **Navegação por teclado** ✅ o site todo funciona só com o teclado: Tab/Shift+Tab percorrem, Enter e Espaço ativam,
  **Esc** fecha menus, janelas e a gaveta do celular (e devolve o foco), **setas** movem entre abas e opções e dentro
  dos menus (Home/End vão ao primeiro/último). Atalhos: **/** ou **Ctrl K** (⌘K) abrem a busca; o primeiro Tab de cada
  página oferece "Pular para o conteúdo"; ao trocar de página o foco vai para o conteúdo. Os ajudantes ficam em
  `src/lib/a11y.tsx`. Ao criar um menu, aba ou gaveta novos, use-os (`useMenuFocus`, `handleGroupKeys`, `useFocusTrap`).
- **Limite de pedidos (rate limit)** ✅ todas as rotas passam pelo `src/proxy.ts` (limite por IP); entrar, cadastro,
  senha, MFA, link do e-mail, exportar/excluir conta e downloads de PDF têm limites próprios. Opcional: Redis da
  Upstash para a contagem valer entre todos os servidores da Vercel (veja [`supabase/README.md`](supabase/README.md)).
- **LGPD — direitos do titular, privacidade e termos** ✅ em **Configurações → Conta** o aluno **baixa todos os seus
  dados** (arquivo JSON) e **exclui a própria conta** (digitando EXCLUIR; apaga os dados e os PDFs). Páginas públicas
  `/privacidade` e `/termos`, com links no login. Exige um SQL novo (veja [`supabase/README.md`](supabase/README.md)).
  **Antes de abrir ao público:** preencha `src/lib/legal.ts` (CNPJ/CPF, endereço, encarregado, foro) e mande os dois
  textos para um advogado; só então troque `reviewed` para `true` (some o aviso "versão em revisão").
- **Carrinho e cupom de lançamento (LANCAMENTO)** ✅ cursos com preço (definido no editor), carrinho (`/carrinho`),
  página de compra (`/comprar/<curso>`) e `/finalizar`. O cupom dá **30 dias de pré-acesso** aos cursos marcados com
  "Liberar com cupom"; preço, desconto e liberação são calculados **no banco**. **Não existe pagamento**: sem cupom,
  `/finalizar` avisa que o pagamento online ainda não está disponível. Curso pago sem acesso não entrega vídeo nem
  materiais. Exige um SQL novo, rodado **depois** de publicar o código (veja [`supabase/README.md`](supabase/README.md)).
- **Próxima fase do 2.0:** certificados e PDF de verdade; pagamentos.

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

> Tudo o que o aluno faz fica salvo na conta dele. Os cursos agora vêm do banco: o catálogo começa **vazio** (só com as
> categorias padrão) até a equipe cadastrar o primeiro curso em `/admin/cursos`. Os certificados ainda são demonstração.

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
│  │  ├─ redefinir-senha/    → /redefinir-senha  (escolher senha nova)
│  │  └─ seguranca/mfa/      → /seguranca/mfa  (verificação em duas etapas da equipe: cadastrar o autenticador e digitar o código)
│  ├─ (legal)/               ← páginas abertas a todos (sem login)
│  │  ├─ privacidade/        → /privacidade  (Política de Privacidade, LGPD)
│  │  └─ termos/             → /termos  (Termos de Uso)
│  ├─ (public)/u/[slug]/     → /u/<endereço>  (perfil público: aberto a qualquer pessoa, noindex)
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
│  ├─ api/u/[slug]/trabalhos/[id]/ → ★ entrega o PDF de um trabalho PÚBLICO (sem login; o banco confere tudo)
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
│  ├─ data/                  → ★ ÚNICO lugar que "busca dados" (catálogo e dados do aluno no Supabase)
│  ├─ actions/               → ações que salvam no banco: student.ts (aulas, currículo…), profile.ts (primeiro acesso e
│  │                           objetivos), works.ts (trabalhos e PDFs), admin.ts (usuários), catalog.ts (cursos,
│  │                           categorias, tags), shared.ts e admin-shared.ts (peças comuns das ações)
│  ├─ trails.ts              → trilhas, etapas de vida e metas do primeiro acesso (uma lista só, usada por tela e servidor)
│  ├─ pdf-file.ts            → limites e conferência de PDF (tamanho e assinatura %PDF-)
│  ├─ admin/catalog*.ts      → cadastro de cursos do painel: formato, limites e regras de publicação (navegador e servidor)
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
  linha do trabalho (RLS) antes de entregar. Não existe link permanente do arquivo (o PDF de um trabalho
  marcado como "Público" abre pela rota `/api/u/<endereço>/trabalhos/<id>`, que o banco libera só enquanto
  perfil, portfólio e trabalho estiverem públicos). A resposta leva
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

- **Cursos, categorias e aulas (Fase 2):** ficam nas tabelas `categories`, `courses`, `course_modules`, `lessons` e
  `lesson_materials`. Salvar um curso grava curso + módulos + aulas + materiais **numa operação só**
  (`admin_save_course`), com uma fila por curso. Se outra pessoa editou o mesmo curso enquanto você editava, o banco
  recusa e o painel avisa ("Carregar a versão nova" ou "Salvar e substituir").
  - **Regras de publicação** (conferidas na tela e de novo no banco): título, descrições, ao menos uma skill, pelo menos
    uma aula publicada e **todas as aulas publicadas com vídeo**.
  - **Quem vê o quê:** aluno lê só cursos publicados (ou agendados cuja data já passou), módulos ativos e aulas
    publicadas; rascunhos nunca saem do banco para ele. A equipe vê tudo, mas no site do aluno vê o mesmo que o aluno.
  - **Quem pode:** editor cria, edita, publica, despublica e organiza; **excluir curso é só do administrador** e o banco
    recusa se algum aluno já começou o curso (despublique em vez de excluir).
  - **Histórico:** criar, editar, publicar, agendar, despublicar, excluir e reordenar ficam em
    Administração e permissões › Histórico (filtro "Conteúdo").
  - **Links:** vídeos e materiais são links `https://`. YouTube e Vimeo abrem no site deles (a Folyo não carrega
    iframes de terceiros); links diretos `.mp4`/`.webm` tocam na própria aula e contam o tempo assistido.

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
| **Login / cadastro** | ✅ Supabase Auth, rotas protegidas, e-mail próprio (Zoho, usefolyo.com), CAPTCHA e limite de tentativas | Revisão jurídica dos textos de Privacidade e Termos |
| **Banco de dados** | ✅ Perfil, progresso, anotações, tempo assistido, trabalhos (PDF/link), competências e currículo, todos com RLS e limite de alterações por minuto | Certificado emitido pelo servidor |
| **Painel admin** | ✅ Papéis, visão geral, usuários, permissões, auditoria e (Fase 2) **cursos, categorias, módulos e aulas** no banco. Papel e regras ficam no banco; a tela só esconde o que não se pode usar | Certificado emitido pelo servidor |
| **Player de aula** | ✅ Vídeo hospedado no Bunny Stream (player com token) ou link `.mp4`/`.webm`, ambos medidos na audiência; YouTube/Vimeo abrem no site deles. Sem vídeo: aviso | Legendas e capítulos |
| **Capas e imagens dos cursos** | ✅ Capa, miniatura e banner enviados pela biblioteca de mídia, com ponto de foco; sem imagem, arte padrão | Recorte automático por IA |
| **Currículo em PDF e certificados** | Só visual ("Certificados a caminho"). Hoje "aula concluída" é marcada pelo próprio aluno | Certificado emitido pelo servidor (conferindo aulas e trabalho) + código de verificação |
| **Perfil público** | ✅ `/u/<endereço>` aberto sem login, com controle de privacidade; `/publico` é a pré-visualização. Não é indexado pelo Google (`noindex`) | Opção "aparecer no Google" e subdomínio (`nome.usefolyo.com`) |
| **Objetivos com recomendação** | ✅ Trilhas em `src/lib/trails.ts`; as recomendações usam os cursos do banco (publicados e visíveis) | Refinar com os dados de audiência |
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
git commit -m "Folyo 2.0 · Fase 2: cursos, categorias e aulas no painel"
git push
```

A Vercel publica sozinha a cada `git push`. As variáveis do Supabase ficam em **Settings → Environment Variables**
(veja [`supabase/README.md`](supabase/README.md)). O `.env.local` nunca vai para o GitHub.

---

Feito com Next.js 16 (App Router, Cache Components), React 19, TypeScript, Supabase (`@supabase/ssr`), lucide (ícones) e zod (validação).
Design: protótipo da Gigi.
