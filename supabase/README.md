# Supabase — passo a passo

- **Etapa 3 (proteção contra robôs):** logo abaixo. Faça agora.
- **Etapa 2 (dados do aluno):** já feita; fica como referência.
- **Etapa 1 (login + perfil):** mais para baixo. Já está feita; fica como referência.

> **Regra de ouro:** a Folyo usa só a **URL do projeto** e a **publishable key** (`sb_publishable_...`).
> A **secret key** (`sb_secret_...`) **não é usada** nesta etapa: não cole ela no `.env.local`, na Vercel,
> no GitHub nem em conversas. Ela passa por cima de todas as regras de segurança do banco. Guarde só no
> gerenciador de senhas.

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
