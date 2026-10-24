# Supabase — passo a passo

- **Limite de pedidos (rate limit):** logo abaixo. Opcional, sem SQL.
- **LGPD (baixar dados e excluir conta):** logo abaixo. Faça agora (depois de publicar o código novo).
- **Verificação em duas etapas (MFA) do painel:** logo abaixo. Faça na ordem descrita lá.
- **Folyo 2.0 · Fase 3 (mídia, vídeo, audiência, relatórios e configurações):** já feita; fica como referência.
- **Folyo 2.0 · Fase 2 (cursos, categorias e aulas no banco):** já feita; fica como referência.
- **Folyo 2.0 · Fase 1 (área do aluno):** já feita; fica como referência.
- **Etapa 4 (painel admin):** já feita; fica como referência.
- **Etapa 3 (proteção contra robôs):** já feita; fica como referência.
- **Etapa 2 (dados do aluno):** já feita; fica como referência.
- **Etapa 1 (login + perfil):** mais para baixo. Já está feita; fica como referência.

> **Regra de ouro:** a Folyo usa só a **URL do projeto** e a **publishable key** (`sb_publishable_...`).
> A **secret key** (`sb_secret_...`) **não é usada** nesta etapa: não cole ela no `.env.local`, na Vercel,
> no GitHub nem em conversas. Ela passa por cima de todas as regras de segurança do banco. Guarde só no
> gerenciador de senhas.

---

# Limite de pedidos (rate limit)

Sem SQL. O código já limita tudo; esta seção explica onde e como deixar o limite mais firme.

## O que já está limitado

| Onde | Limite | Chave |
| --- | --- | --- |
| **Qualquer página ou ação** (proxy) | leitura 2400/min, envio 600/min | IP |
| **Enviar formulário de entrada** (`/entrar`, `/esqueci-senha`, `/redefinir-senha`, `/seguranca/mfa`, `/auth/confirmar`) | 40/min | IP |
| **Entrar** | 30 tentativas/5 min; 10 senhas erradas/15 min por e-mail; 25 senhas erradas/15 min por IP | IP e e-mail |
| **Criar conta** | 20/15 min por IP; 5/15 min por e-mail | IP e e-mail |
| **Reenviar confirmação / esqueci a senha** | 10/15 min por IP; 3/15 min por e-mail | IP e e-mail |
| **Link do e-mail** | 20/15 min | IP |
| **Trocar senha** | 10/15 min | conta |
| **Código do autenticador (MFA)** | 8 erros/10 min; cadastro 10/15 min | conta |
| **Baixar dados / excluir conta** | 5/15 min cada | conta |
| **Abrir/baixar PDF** (`/api/...`) | 120/min | conta |
| **Painel** (ações e Audiência ao vivo) | já tinham limite próprio | conta |
| **Dados do aluno** (banco) | 120 alterações/min e 3000/hora | conta (no banco) |
| **CAPTCHA e Supabase Auth** | camadas de baixo, independentes do site | |

Os números ficam em `src/lib/security/rate-limit.ts` (`AUTH_LIMITS`, `API_LIMITS`) e em `src/proxy.ts` (`LIMITS`).
São folgados de propósito: uma sala de aula inteira pode sair pelo mesmo IP.

## Por que ligar a Upstash (recomendado antes de abrir ao público)

Na Vercel, cada servidor que está de pé tem a **própria contagem em memória**. Quem espalha os pedidos passa do
limite. Com a Upstash (Redis), a contagem das telas de entrada vale **para todos os servidores**. Ela é só um
reforço: se a Upstash cair, os pedidos **não** são barrados (o limite em memória e o CAPTCHA continuam).
As chaves vão para o Redis como hash (nunca o e-mail ou o IP em texto).

1. **upstash.com → Create database** (Redis, plano grátis basta, região perto da Vercel).
2. Aba **REST API**: copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.
3. **Vercel → Settings → Environment Variables:** crie as duas (Production e Preview) e faça um **Redeploy**.
   (A integração "Upstash Redis" do Marketplace da Vercel cria `KV_REST_API_URL` e `KV_REST_API_TOKEN`, que também valem.)
4. Conferir: errar a senha mais de 10 vezes para o mesmo e-mail bloqueia o login em qualquer aparelho.

## Reforço fora do código (opcional)

**Vercel → Firewall → Rules:** uma regra de *rate limit* para `POST` em `/entrar` (por exemplo, 20 por minuto por IP,
ação "Deny") barra o excesso antes de chegar no site. Depende do plano da Vercel.

## Limitações conhecidas

- Atrás de uma rede compartilhada (faculdade), muita gente no mesmo IP divide o limite. Se isso virar problema, suba
  `signIn` e `signUp` em `AUTH_LIMITS`.
- Sem a Upstash, o limite é por servidor (não é exato).
- Fora da Vercel (no seu computador) o limite por IP do proxy fica desligado de propósito (não há IP confiável) e as telas de entrada usam um único “IP” local.

---

# LGPD — baixar os meus dados e excluir a minha conta

Direitos do titular (Lei 13.709/2018, art. 18). Um SQL novo, **independente do MFA** (pode rodar antes ou depois).
Ele **não apaga nada**: cria duas funções e ajusta o limite de pedidos para não atrapalhar a exclusão.

- `public.export_my_data()` devolve em JSON tudo o que a Folyo guarda sobre a conta de quem chama.
- `public.delete_my_account()` apaga a conta de login; o banco apaga o resto em cascata (perfil, progresso, anotações,
  competências, trabalhos, tempo assistido, visualizações, papel na equipe, suspensão).
- As duas só valem para a **própria** conta (o id vem do token) e não existem para visitantes sem login.

## 1. Publicar e rodar o SQL

1. Publique o código novo (`git push`): a tela **Configurações → Conta** passa a chamar as funções.
2. **Supabase → SQL Editor:** cole e rode `supabase/migrations/20261027000001_lgpd_conta.sql`.

## 2. Testar (com uma conta de teste, nunca a sua)

1. Crie uma conta, preencha algo (uma anotação, uma competência) e envie um PDF em Trabalhos.
2. **Configurações → Conta → Baixar meus dados:** o arquivo `folyo-meus-dados-AAAA-MM-DD.json` deve trazer o que você preencheu.
3. **Excluir minha conta:** digite `EXCLUIR`. Você volta para a tela de entrada com o aviso de conta excluída.
4. Conferir: **Authentication → Users** (a conta sumiu) e **Storage → student-works** (a pasta dela sumiu).
5. Entrar com o mesmo e-mail e senha deve falhar.

## O que não é apagado (e está dito na Política de Privacidade)

- **Histórico do painel** (`private.admin_audit`): registro de segurança que só cresce de propósito. Pode guardar nome e
  e-mail de quem foi alvo de uma ação da equipe (ex.: suspensão). Se um dia precisar apagar por pedido judicial, só pelo
  SQL Editor, desligando o gatilho de propósito.
- **Cópias de segurança do Supabase:** o plano deles define por quanto tempo duram.
- Os e-mails já enviados pelo Zoho e logs da Vercel/Supabase seguem o prazo desses serviços.

## Regras importantes

- **Proprietário** não exclui a própria conta pelo site: outro proprietário precisa tirar a função dele no painel
  antes (e o banco ainda recusa a saída do último proprietário ativo).
- A exclusão pede a palavra `EXCLUIR`, mas **não pede a senha de novo**: o CAPTCHA do Supabase impede conferir a senha
  no servidor sem o widget. Se quiser reforçar, o caminho é um link de confirmação por e-mail (futuro).
- Conta **suspensa** não chega às Configurações (vai para /conta-suspensa): quem for suspenso pede por e-mail.

## Como desfazer o SQL

```sql
drop function if exists public.export_my_data();
drop function if exists public.delete_my_account();
```

(O ajuste do limite de pedidos pode ficar: só deixa de contar alterações de contas que já não existem.)

---

# Verificação em duas etapas (MFA) do painel

A equipe (editor, administrador, proprietário) passa a precisar de um segundo passo além da senha: o código de 6
números de um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password, Authy…). Alunos não
são afetados.

**Como funciona:** o Supabase marca cada sessão com um nível (`aal1` = só a senha, `aal2` = senha + código). O SQL
abaixo faz `private.actor_rank()` tratar sessão `aal1` como aluno. Como todas as funções `admin_*`, a leitura de
rascunhos pela equipe e o Storage da equipe perguntam o papel por essa função, o banco recusa o painel inteiro sem o
código, inclusive para quem falar direto com a API. O site só mostra a tela certa (`/seguranca/mfa`).

## 1. Conferir no Supabase (uma vez)

**Authentication → Sign In / Providers → Multi-Factor Authentication**: **TOTP** com *Enroll* e *Verify* ligados
(costuma vir ligado).

## 2. Publicar o código e cadastrar o autenticador (ANTES do SQL)

1. `git add -A`, `git commit -m "Segurança: MFA obrigatório no painel"` e `git push`. Espere a Vercel terminar.
2. Entre na Folyo com a conta de proprietário e abra `/admin`. Você será levado para **Verificação em duas etapas**.
3. Clique em **Configurar aplicativo autenticador**, leia o QR code com o aplicativo e digite o código de 6 números.
   Você entra no painel. (Guarde também a chave em texto que aparece em "Não consegue ler o QR code?" num gerenciador
   de senhas: é o seu plano B se perder o celular.)
4. Cada pessoa nova da equipe faz o mesmo no primeiro acesso ao painel. Faça logo depois de receber o papel: até
   cadastrar o autenticador, qualquer pessoa que tivesse a senha da conta poderia cadastrar o dela.

## 3. Rodar o SQL (SÓ DEPOIS do passo 2)

1. **SQL Editor** → **New query**.
2. Cole `supabase/migrations/20261026000001_mfa_painel.sql` inteiro e **Run**. Deve aparecer *Success*.
   Não apaga nem altera dados. Se rodar de novo, não muda nada.

## 4. Testar

1. Saia e entre de novo. Abra `/admin`: pede o código; digite o do aplicativo; entra.
2. Com uma conta de aluno, `/admin` continua mostrando "sem acesso".
3. Com a conta da equipe **sem** digitar o código, tente abrir `/admin/cursos`: é levado para a tela do código.
4. Segurança extra: com a sessão ainda sem o código, tente cadastrar um segundo autenticador. O site recusa e o
   Supabase também deve recusar. Se o Supabase deixar, me avise.

## Perdi o celular / quero trocar de aparelho

Quem tem acesso ao Supabase remove o autenticador da conta: **Authentication → Users →** (a conta) **→ Delete
factor** (ou, no SQL Editor, `delete from auth.mfa_factors where user_id = (select id from auth.users where email = lower('EMAIL'));`).
Depois a pessoa entra, abre `/admin` e cadastra o aplicativo de novo. Para trocar de aparelho com o celular antigo
em mãos, o caminho é o mesmo.

## Como desfazer (se ficar sem acesso)

No SQL Editor, volte a regra anterior (sem a linha do `aal`):

```sql
create or replace function private.actor_rank()
returns int language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then 0
    when exists (select 1 from private.suspensions s where s.user_id = auth.uid()) then 0
    else coalesce((select private.role_rank(r.role) from private.staff_roles r where r.user_id = auth.uid()), 0)
  end
$$;
```

Para ligar de novo, rode outra vez `20261026000001_mfa_painel.sql`.

## Limitações conhecidas

- O cadastro, a troca e a remoção do autenticador **não aparecem** no histórico do painel (o Supabase não deixa
  criar gatilhos nas tabelas dele). Quem consulta isso é o painel do Supabase (Authentication → Users).
- Os limites de tentativas de código são por servidor da Vercel, como os de login; o Supabase tem o dele também.
- Sem códigos de recuperação: o plano B é a remoção do autenticador pelo proprietário, descrita acima.

---

# Folyo 2.0 · Fase 3 — biblioteca de mídia, vídeo (Bunny), audiência, relatórios e configurações

Um SQL novo. **Rode depois do SQL da Fase 2** e uma vez só. Ele **não apaga nada**: cria tabelas, funções e
buckets novos e acrescenta colunas (vídeo hospedado, imagem dos cursos, arquivo nos materiais).

> Antes de rodar, por segurança: **Supabase → Database → Backups**.

## 1. Rodar o SQL

1. Supabase → **SQL Editor** → **New query**.
2. Abra `supabase/migrations/20261025000001_folyo2_midia_video_audiencia.sql`, copie tudo, cole e **Run**.
   Deve aparecer *Success. No rows returned*.
3. Se aparecer um erro dizendo que algo "already exists", o arquivo já foi rodado.

O que ele cria:

- **Storage:** bucket `catalog-images` (público, só PNG/JPG/WebP até 5 MB: capas, miniaturas, banners e imagens de
  categoria) e `catalog-files` (privado, só PDF até 20 MB: materiais das aulas). Só a equipe grava; o PDF só abre
  pela Folyo (`/api/materiais/...`), depois de conferir o login e se o aluno pode ver a aula.
- **Tabelas/funções:** biblioteca (`media_files`), configurações da plataforma (`app_config`), sessões do player e
  visualizações por dia (audiência), e as funções `admin_*` de mídia, configurações, audiência ao vivo e relatórios.

## 2. Conferir

1. **Storage**: os dois buckets existem; `catalog-images` aparece como *Public* e `catalog-files` como *Private*.
2. **Table Editor**: `media_files`, `app_config` e `lesson_sessions` existem com RLS ligado.

## 3. Bunny Stream (só para enviar vídeo; o resto funciona sem)

1. Crie uma conta em bunny.net → **Stream** → **Add Video Library** (região a gosto).
2. Na biblioteca: **Security** → ligue **Token Authentication** e **Block direct URL access**.
   Sem isso, quem souber o endereço do vídeo assiste sem login.
3. Anote três valores: o **número da biblioteca** (Library ID), a **API Key** (Library → API) e a
   **Token Authentication Key** (Security).
4. Coloque na **Vercel → Settings → Environment Variables** (e no `.env.local`, para testar no seu computador):
   `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY` e `BUNNY_STREAM_TOKEN_KEY`. **Nunca** com prefixo
   `NEXT_PUBLIC_`, e nunca no GitHub ou em conversas. Refaça o deploy depois de salvar.
5. Rode `npm install` (entra a biblioteca `tus-js-client`, usada no envio retomável do vídeo).

## 4. Publicar e testar

1. `git add -A`, `git commit -m "Folyo 2.0: Fase 3"` e `git push`.
2. **Biblioteca de mídia** (`/admin/midia`): envie uma imagem e um PDF; abra o arquivo, renomeie, troque, veja "onde é usado".
3. **Cursos → editar → Capa e visual**: escolha capa, miniatura e banner, e mova o ponto de foco.
4. **Módulos e aulas → editar aula**: envie um vídeo (Bunny) ou use link; anexe o PDF; salve o curso.
5. Entre como aluno, abra a aula: o vídeo toca, o PDF abre, e em **Audiência → Ao vivo** você aparece assistindo.
6. **Relatórios** (exportar CSV) e **Configurações** (nome, e-mail de suporte, regras de publicação, audiência).

## Limitações conhecidas

- Arquivo enviado e **não confirmado** (aba fechada no meio) fica órfão no Storage; vídeo trocado/removido de uma
  aula **já salva** continua no Bunny (apague no painel do Bunny quando quiser liberar espaço).
- YouTube/Vimeo continuam abrindo no site deles (a audiência só mede Bunny e links `.mp4`/`.webm`).

---

# Folyo 2.0 · Fase 2 — cursos, categorias, módulos e aulas no banco

Um SQL novo. **Rode depois do SQL da Fase 1** e uma vez só. Ele **não apaga nada** do que já existe; só cria
tabelas e funções novas (e troca a função do histórico para filtrar por "Conteúdo").

> **Importante:** os cursos de demonstração que estavam no código **saíram**. Depois deste passo o catálogo do
> aluno fica **vazio** até a equipe cadastrar o primeiro curso em `/admin/cursos`. As 14 categorias padrão já vêm
> prontas (Marketing, Vendas, Tecnologia, Arquitetura...). Antes de rodar, por segurança:
> **Supabase → Database → Backups**.

## 1. Rodar o SQL

1. Supabase → **SQL Editor** → **New query**.
2. Abra `supabase/migrations/20261024000001_folyo2_catalogo.sql`, copie tudo, cole e **Run**.
   Deve aparecer *Success. No rows returned*.
3. Se aparecer um erro dizendo que algo "already exists", o arquivo já foi rodado (e nada foi alterado).

O que ele cria: tabelas `categories`, `courses`, `course_modules`, `lessons`, `lesson_materials` e
`catalog_tags` (com as regras de leitura por papel: aluno só enxerga o que está publicado), as funções `admin_*`
do cadastro (salvar curso, publicar, despublicar, excluir, categorias, ordem, tags) e o histórico de conteúdo.

## 2. Conferir

1. **Table Editor**: `categories` deve ter 14 linhas; `courses` e `lessons` começam vazias.
2. **Database → Policies** (ou Table Editor → RLS): as tabelas novas têm RLS ligado (só `select` para usuários logados; nenhuma
   escrita direta: tudo passa pelas funções `admin_*`).

## 3. Publicar e testar

1. `git add -A`, `git commit -m "Folyo 2.0: Fase 2"` e `git push`. Nenhuma variável nova.
2. Entre com a conta de **editor, administrador ou proprietário** → **Cursos → Novo curso**.
3. Preencha título, descrição curta (20+ caracteres) e categoria; em **Módulos e aulas** crie um módulo e uma aula
   com um **link de vídeo** (`https://...mp4`, ou um link do YouTube) e salve.
4. Em **Publicação e acesso** confira "Falta para publicar": só libera quando o curso tem descrição completa (40+
   caracteres), uma skill e todas as aulas publicadas com vídeo. Depois escolha **Publicado** e salve.
5. Com uma conta de **aluno**: o curso aparece em Explorar cursos; abra a aula, o vídeo toca (YouTube/Vimeo mostram o
   botão "Assistir no site do vídeo") e a aba **Material** lista os links.
6. Teste: despublicar (o curso some do catálogo para quem não começou), agendar para daqui a alguns minutos,
   duplicar, reordenar em **Ordem do catálogo**, e abrir o mesmo curso em duas abas para ver o aviso de conflito.
7. Com uma conta de **editor**: o menu do curso **não** mostra "Excluir" (é só do administrador). Excluir um curso que
   um aluno já começou também é recusado pelo banco.

---

# Folyo 2.0 · Fase 1 — trabalhos em PDF, tempo assistido e novo primeiro acesso

Um SQL novo e um passo de verificação do Storage. **Rode depois da etapa 4b** e uma vez só.

> **Atenção, este SQL apaga coisas.** Ele remove a tabela `projects` e as colunas `weekly_goal` e
> `resume_projects` (recursos que saíram do Folyo 2.0). Os **links** dos projetos antigos viram "trabalhos".
> Antes de rodar: **Supabase → Database → Backups** (faça um backup) ou, no mínimo, confira que não há dados
> importantes em `projects`. Tudo roda numa transação: se algo der erro, nada fica pela metade.

## 1. Rodar o SQL

1. Supabase → **SQL Editor** → **New query**.
2. Abra `supabase/migrations/20261023000001_folyo2_area_do_aluno.sql`, copie tudo, cole e **Run**.
   Deve aparecer *Success. No rows returned*.
3. Se aparecer um erro dizendo que algo "already exists", o arquivo já foi rodado (e nada foi alterado).

O que ele cria/muda: colunas novas no perfil (etapa de vida, "ainda descobrindo", objetivo, skills e metas),
tabela `works` (trabalhos em PDF ou link), tabela `lesson_watch` (tempo assistido por aula), o bucket privado
`student-works` do Storage com as regras de acesso, e as funções `admin_*` passam a contar trabalhos.

## 2. Conferir o Storage

1. Supabase → **Storage**: deve existir o bucket **`student-works`**, marcado como **Private** (sem o selo
   "Public"), com limite de **20 MB** e tipo permitido `application/pdf`.
2. Não crie políticas à mão: elas já vieram no SQL (cada aluno só acessa a pasta com o próprio id).

## 3. Publicar e testar (teste o envio de PDF primeiro)

1. `git add .`, `git commit -m "Folyo 2.0: Fase 1"` e `git push`. A Vercel publica sozinha. Nenhuma variável nova.
2. Entre com uma conta de teste: **Projetos e portfólio → Adicionar trabalho → PDF**. Envie um PDF pequeno.
   Depois abra o trabalho (o PDF aparece no modal), baixe, troque o arquivo e apague.
3. Teste em mais de um navegador (Chrome e Safari): o visualizador de PDF muda de um para outro.
4. Com uma segunda conta, confirme que ela **não** abre o PDF da primeira (`/api/trabalhos/<id>/arquivo` dá 404).
5. Se o envio falhar com erro de rede, olhe o Console do navegador: normalmente é a CSP (`connect-src`) ou a
   URL do Supabase errada na Vercel (`NEXT_PUBLIC_SUPABASE_URL`).

> **Por que o navegador fala com o Supabase só aqui:** o PDF de até 20 MB é enviado direto ao Storage por um
> endereço de uso único gerado e conferido pelo servidor, sem passar pela Vercel. Antes de confirmar, o
> servidor confere que é um PDF de verdade. Todo o resto continua só por Server Actions.

---

# Etapa 4 — painel admin (papéis, suspensão e auditoria)

Cria as tabelas privadas de papéis, suspensões e histórico, e as funções `admin_*` que conferem **no banco**
quem pode fazer o quê. Sem este SQL o site continua funcionando como antes (todos como aluno), mas `/admin`
não abre.

## 1. Rodar os SQLs da etapa 4 (dois arquivos, nesta ordem)

1. Supabase → **SQL Editor** → **New query**.
2. Abra `supabase/migrations/20261022000002_etapa4_painel_admin.sql`, copie tudo, cole e clique em **Run**.
   Deve aparecer *Success. No rows returned*.
3. **New query** de novo, com `supabase/migrations/20261022000003_etapa4b_seguranca_painel.sql` (reforço de
   segurança do painel). **Run**.

Cada arquivo roda **uma vez só**. Se rodar de novo, aparece um erro dizendo que algo "already exists" e nada é
alterado (o arquivo inteiro é desfeito), então não tem perigo.

## 2. Virar proprietário (uma vez só)

No SQL Editor, troque pelo e-mail com que você faz login na Folyo e rode:

1. Confira antes em **Authentication → Users** que a sua conta aparece com o e-mail **confirmado**
   (coluna *Last sign in* preenchida). Assim ninguém que tenha cadastrado o seu e-mail antes de você vira dono.
2. Rode:

```sql
insert into private.staff_roles (user_id, role)
select id, 'proprietario' from auth.users
where email = lower('vinigvalente01@gmail.com') and email_confirmed_at is not null
on conflict (user_id) do update set role = excluded.role;
```

Aparece *Success. 1 row affected*. Se aparecer 0 linhas, o e-mail está errado, ainda não foi confirmado
ou a conta ainda não existe.

> **Proprietário só pelo SQL Editor.** O painel não cria, não rebaixa e não suspende nenhum proprietário
> (nem o próprio dono consegue). Assim, mesmo que alguém consiga entrar com uma conta da equipe, não toma o
> seu lugar. O banco também não deixa ficar sem nenhum proprietário ativo.

## 3. Publicar e testar

1. `git add .`, `git commit -m "Etapa 4: painel admin"` e `git push`. A Vercel publica sozinha.
2. Entre na Folyo: no menu lateral aparece **Painel administrativo**. Abra `/admin`.
3. Teste: veja a visão geral, abra um usuário, e em **Administração e permissões** use **Dar acesso ao painel**.
4. Com uma segunda conta (aluno), confirme que `/admin` mostra "sem acesso".

> **Security Advisor:** vai listar as funções `admin_*` como "security definer que o usuário logado pode
> executar". É esperado: cada uma confere o papel lá dentro, e `anon` não consegue chamar nenhuma.
> Aproveite e ligue a **proteção contra senhas vazadas** (Authentication → Attack Protection), se o plano permitir.

---

# Etapa 3 — proteção contra robôs (CAPTCHA + limites)

O que entra:

- **CAPTCHA da Cloudflare (Turnstile)** em entrar, criar conta, reenviar confirmação e "esqueci a senha".
  Quase sempre o aluno não precisa clicar em nada. Quem confere o comprovante é o **Supabase** (com a chave
  secreta do Turnstile, que fica só no painel dele).
- **Limite de alterações no banco:** cada aluno pode fazer até 120 alterações por minuto e 3000 por hora.
  Vale para o site **e** para quem tentar usar a API direto. Uso normal fica muito abaixo disso.
- **Limite de tentativas nas telas de entrada** (por IP e por e-mail de destino), no servidor da Folyo.
- O servidor repassa o **IP real** do aluno ao Supabase, para o CAPTCHA e os limites do Supabase olharem para o
  aluno (e não para o servidor da Vercel, que é o mesmo para todo mundo).

> **A ordem importa.** Se você ligar o CAPTCHA no Supabase antes do código novo estar no ar, ninguém consegue
> entrar nem criar conta (o site antigo não manda o comprovante).

## 1. Criar o widget no Cloudflare

1. [dash.cloudflare.com](https://dash.cloudflare.com) → menu **Turnstile** → **Add widget**.
2. **Nome:** `Folyo`. **Hostnames:** `folyo-six.vercel.app`, `usefolyo.com`, `www.usefolyo.com` e `localhost`.
3. **Widget mode:** `Managed`. *Pre-clearance:* `No`.
4. Salve. Aparecem a **Site key** (pública) e a **Secret key** (segredo: só vai no painel do Supabase).

## 2. Rodar o SQL da etapa 3

Supabase → **SQL Editor** → **New query** → cole o arquivo inteiro
`supabase/migrations/20261022000001_etapa3_limite_de_pedidos.sql` → **Run**.
Pode rodar antes ou depois de publicar: não quebra o site antigo.

## 3. Colocar a Site key na Vercel e publicar

1. Vercel → **Settings** → **Environment Variables** → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = a **Site key**
   (Production e Preview).
2. No seu computador: `git status` (o `.env.local` não pode aparecer), depois `git add -A`,
   `git commit -m "Etapa 3: CAPTCHA e limites"` e `git push`.
3. Quando o deploy terminar, abra o site: na tela de entrar deve aparecer a caixinha da Cloudflare. **Entre na sua
   conta** para confirmar que tudo funciona (o Supabase ainda não está exigindo o CAPTCHA).

## 4. Ligar o CAPTCHA no Supabase (só agora)

1. Supabase → **Authentication** → **Attack Protection** (ou *Bot and Abuse Protection*) → **Enable Captcha protection**.
2. **Provider:** Turnstile. **Secret key:** a do Cloudflare. **Save**.
3. Teste de novo: sair, entrar, criar uma conta nova, "esqueci a senha". Tudo deve funcionar.
4. Se der problema, **desligue o CAPTCHA no Supabase** (o site volta a funcionar na hora) e me mande a mensagem.

## 5. No seu computador (opcional)

Para ver a caixinha rodando `npm run dev`, coloque no `.env.local`: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<a site key>`.
Sem essa linha, o formulário funciona sem CAPTCHA (útil para testar com o CAPTCHA desligado no Supabase).

---

# Etapa 2 — dados do aluno

Leva uns 5 minutos. Não precisa mexer na Vercel nem no `.env.local` (nenhuma chave nova).

## 1. Rodar o SQL da etapa 2

1. No Supabase, abra **SQL Editor → New query**.
2. Copie **todo** o conteúdo de [`migrations/20261021000001_etapa2_dados_do_aluno.sql`](migrations/20261021000001_etapa2_dados_do_aluno.sql),
   cole e clique em **Run**. Deve aparecer *Success. No rows returned*.
   - Se aparecer o aviso de "operação destrutiva", pode confirmar: o SQL só **cria** coisas e acrescenta colunas
     (o `revoke` do aviso é a retirada de permissões que o Supabase dá por padrão).
   - Rode **uma vez só**. Se der erro no meio, nada fica pela metade (está tudo numa transação): me mande a mensagem.
3. Abra **Advisors → Security Advisor → Refresh**. Não deve aparecer nada sobre `profiles`, `course_progress`,
   `lesson_completions`, `lesson_notes`, `projects` ou `skills`.
4. Confira em **Project Settings → Data API → Exposed schemas** que aparecem só `public` e `graphql_public`.
   O schema `private` (criado por este SQL) **não** pode estar na lista: ele guarda as funções das regras.

O que esse SQL faz:

| Tabela | Guarda | Quem marca as datas |
| --- | --- | --- |
| `profiles` (colunas novas) | Contato e textos do currículo, formação, experiências, idiomas, conquistas, organização do currículo, configurações e "avisos lidos" | — |
| `course_progress` | Começou o curso, última aula aberta, favorito | "começou em": o banco |
| `lesson_completions` | Aulas concluídas | "concluída em": o banco |
| `lesson_notes` | Anotações das aulas | o banco |
| `projects` | Projetos do portfólio (passos e links juntos) | "começou" e "concluído em": o banco |
| `skills` | Competências | o banco |

Regras de segurança (iguais em todas as tabelas):

- **RLS:** cada aluno só lê, cria, altera e apaga as **próprias** linhas. Visitante sem login não acessa nada.
- **Permissão por coluna:** o aluno não consegue escolher o dono da linha (`user_id`), trocar ids nem mudar datas.
- **Limites:** todo texto, lista e JSON tem tamanho máximo, e cada aluno tem um máximo de itens
  (50 projetos, 200 competências, 200 anotações, 500 aulas concluídas, 50 cursos).
- **Apagar a conta apaga tudo** do aluno, em todas as tabelas.
- As funções das regras ficam no schema `private`, que não aparece na API.
- Projeto só fica "concluído" com o resultado descrito (30+ letras); senão vira "precisa de revisão".
- Também corrige um ponto da etapa 1: cada objetivo acompanhado (`goals_secondary`) agora tem tamanho máximo.

## 2. Publicar e testar

1. No terminal, na pasta do projeto: `git status` (o `.env.local` **não** pode aparecer na lista), depois
   `git add -A`, `git commit -m "Etapa 2: dados do aluno no Supabase"` e `git push`.
2. Depois que a Vercel publicar, entre no site e teste:
   - conclua uma aula, escreva uma anotação, favorite um curso;
   - crie um projeto, adicione uma competência, mude a cidade no currículo, mude uma configuração;
   - **recarregue a página** (F5): tudo tem que continuar lá;
   - no Supabase, em **Table Editor**, as linhas aparecem nas tabelas novas.
3. Se quiser, faça o teste com uma segunda conta: ela não pode ver nada da primeira.

> **Ordem importa:** rode o SQL **antes** de publicar o código novo. Se o site novo subir antes do SQL, a área do
> aluno mostra erro até o SQL ser rodado (os dados não se perdem).

---

# Etapa 1 — login + perfil (já feita)

## 1. Criar a tabela de perfis (SQL Editor)

1. No Supabase, abra **SQL Editor → New query**.
2. Copie **todo** o conteúdo de [`migrations/20261020000001_profiles.sql`](migrations/20261020000001_profiles.sql), cole e clique em **Run**.
3. Deve aparecer *Success. No rows returned*.
4. Abra **Advisors → Security Advisor** e clique em **Refresh**. Não deve aparecer nada sobre a tabela `profiles`.

O que esse SQL faz:

- Cria a tabela `profiles` (nome, objetivo, momento, meta semanal e se já fez o primeiro acesso).
- Liga o **RLS**: cada aluno só lê e só altera a **própria** linha. Ninguém sem login lê nada.
- O aluno só consegue mudar 6 colunas (nome, objetivo, objetivos secundários, momento, meta e primeiro acesso).
  Não consegue trocar o próprio `id`, apagar o perfil nem criar perfil para outra pessoa.
- Cria o perfil sozinho quando alguém cria conta (com o nome digitado no cadastro).
- Se a conta for apagada, o perfil é apagado junto.

## 2. Configurar o login (Authentication)

**Authentication → URL Configuration**

- **Site URL:** `https://usefolyo.com` (o domínio próprio). Os e-mails de confirmar conta e criar senha nova usam
  o Site URL para montar o link (`{{ .SiteURL }}` nos modelos em `supabase/templates/`); se ele ficar com o
  endereço da Vercel, o link do e-mail leva para `folyo-six.vercel.app`.
- **Redirect URLs:** adicione `http://localhost:3000/**`, `https://usefolyo.com/**`, `https://www.usefolyo.com/**`
  e `https://folyo-six.vercel.app/**`

**Authentication → Sign In / Providers → Email**

- **Enable Email provider:** ligado
- **Confirm email:** ligado (a pessoa precisa clicar no link do e-mail antes de entrar)
- **Secure email change:** ligado
- **Minimum password length:** `8`
- Salve.

**Authentication → Emails → Templates** (troque o assunto e o corpo dos dois modelos abaixo)

| Modelo | Assunto | Corpo (copie o arquivo inteiro) |
| --- | --- | --- |
| **Confirm signup** | `Confirme seu e-mail na Folyo` | [`templates/confirmar-email.html`](templates/confirmar-email.html) |
| **Reset password** | `Crie uma senha nova na Folyo` | [`templates/nova-senha.html`](templates/nova-senha.html) |

> Por que trocar o modelo? O link padrão do Supabase é "gasto" no momento em que alguém abre o link. Muitos
> e-mails de empresa e antivírus abrem os links sozinhos para checar, e aí o aluno recebe "link expirado".
> No nosso modelo o link abre uma página da Folyo com um botão, e o código só é usado quando a pessoa clica.

## 3. Pegar a URL e a publishable key

**Project Settings → API Keys** (aba *Publishable and secret API keys*): copie a **publishable key**.
**Project Settings → Data API**: copie a **Project URL** (`https://xxxx.supabase.co`).

## 4. Rodar no seu computador

Na pasta do projeto, crie um arquivo chamado `.env.local` (ele **nunca** vai para o GitHub) com:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Depois:

```bash
npm install
npm run dev
```

## 5. Colocar na Vercel

**Vercel → projeto Folyo → Settings → Environment Variables**: adicione as **mesmas duas** variáveis
(marque *Production*, *Preview* e *Development*). Depois vá em **Deployments → ⋯ → Redeploy**
(as variáveis só entram num deploy novo).

## 6. Testar

1. Abra o site e clique em **Criar conta**. Use o **mesmo e-mail da sua conta do Supabase** (veja o aviso abaixo).
2. Abra o e-mail **Confirme seu e-mail na Folyo** e clique no botão. Na página que abrir, clique em **Confirmar meu e-mail**.
3. Responda o primeiro acesso. Você cai no Início com o seu nome.
4. Em **Table Editor → profiles** aparece a sua linha com o objetivo e a meta que você escolheu.
5. Teste também: **Sair**, entrar de novo, **Esqueci minha senha**.

> **Testando no computador:** os links dos e-mails apontam para o site publicado (é o *Site URL*).
> Para abrir no seu computador, troque `https://usefolyo.com` por `http://localhost:3000` no
> endereço do link antes de abrir. O resto do link fica igual.

### E-mails

O envio de e-mails já usa o SMTP próprio (Zoho, `contato@usefolyo.com`), então não vale mais o limite de
2 e-mails por hora do Supabase. Se um e-mail não chegar, olhe o spam e o painel do Zoho.

---

## Segurança do login (resumo)

- O navegador **nunca** fala direto com o Supabase: login, cadastro e perfil passam por *Server Actions* no servidor da Folyo.
- O cookie de sessão é **httpOnly** (o JavaScript da página não consegue ler), `Secure` em produção e `SameSite=Lax`.
- Toda página do aluno confere a sessão no servidor com `getClaims()` (assinatura do token). Cookie falsificado não entra.
- RLS no banco: mesmo se o código tiver um bug, um aluno não lê nem altera dados de outro.
- Mensagens de erro não revelam se um e-mail tem conta.
- O `?next=` do login só aceita endereços do próprio site (sem redirecionar para sites de fora).

## Recomendado depois (não precisa agora)

- **Desligar as chaves antigas** (Project Settings → API Keys → *Legacy API keys* → *Disable*), já que a Folyo usa
  as novas. Diminui o risco se alguma chave antiga vazar.
- **JWT Signing Keys** (Project Settings → JWT Keys): se aparecer *Legacy JWT secret*, migrar para as chaves novas
  (ECC). Deixa a checagem de login mais rápida.
- **Senhas vazadas** (se ainda não ligou): Authentication → Attack Protection → *Prevent use of leaked passwords* (se o plano permitir).
- **Limite global de tentativas de login:** hoje o limite por IP do servidor é contado em cada servidor da Vercel
  separadamente. Com muito tráfego, vale trocar por um contador compartilhado (ex.: Upstash Redis).
- **Certificados de verdade** (com código de verificação): hoje "aula concluída" é marcada pelo próprio aluno.
  Antes de emitir certificado que vale como credencial, ele precisa ser gerado pelo servidor, conferindo as aulas
  (de preferência com registro de que o vídeo foi assistido) e o projeto.
