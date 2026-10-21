# Supabase — Etapa 1: login + perfil

Passo a passo para ligar a Folyo ao seu projeto Supabase. Faça na ordem. Leva uns 15 minutos.

> **Regra de ouro:** a Folyo usa só a **URL do projeto** e a **publishable key** (`sb_publishable_...`).
> A **secret key** (`sb_secret_...`) **não é usada** nesta etapa: não cole ela no `.env.local`, na Vercel,
> no GitHub nem em conversas. Ela passa por cima de todas as regras de segurança do banco. Guarde só no
> gerenciador de senhas.

---

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

### Aviso: limite de e-mails do Supabase

Enquanto não configurarmos um servidor de e-mail próprio, o Supabase:

- só envia e-mails para quem é **membro do time da organização** no Supabase;
- envia no máximo **2 e-mails por hora** (no projeto inteiro).

Então: teste com o seu e-mail do Supabase. Para a Gigi testar, convide ela em
**Organization → Team → Invite** (aí o e-mail dela também recebe). Se um e-mail não chegar, espere um pouco
e olhe o spam. Antes de abrir para alunos de verdade, vamos configurar um envio próprio (Resend ou Zoho
ZeptoMail) com o domínio usefolyo.com, tomando cuidado para **não mexer nos registros MX** do Zoho Mail.

---

## O que fica guardado no banco nesta etapa

| Guardado | Ainda não (volta ao zero ao recarregar) |
| --- | --- |
| Nome, objetivo principal e secundários, momento atual, meta semanal, primeiro acesso | Aulas concluídas, projetos, competências, currículo, certificados, bio e cidade do perfil |

Isso aparece para o aluno num aviso de "Fase de testes" no Início. As próximas tabelas entram na etapa 2.

## Segurança desta etapa (resumo)

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
- **CAPTCHA no cadastro** (Cloudflare Turnstile) antes de divulgar o site.
- **E-mail próprio** (SMTP) com o domínio usefolyo.com.
