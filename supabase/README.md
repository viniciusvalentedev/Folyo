# Supabase — passo a passo

- **Folyo 2.0 · Fase 3 (mídia, vídeo, audiência, relatórios e configurações):** logo abaixo. Faça agora (depois da Fase 2).
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

- **Site URL:** `https://folyo-six.vercel.app`
- **Redirect URLs:** adicione `http://localhost:3000/**` e `https://folyo-six.vercel.app/**`

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

> **Testando no computador:** os links dos e-mails apontam para o site da Vercel (é o *Site URL*).
> Para abrir no seu computador, troque `https://folyo-six.vercel.app` por `http://localhost:3000` no
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
