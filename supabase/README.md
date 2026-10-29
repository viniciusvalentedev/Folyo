# Supabase — passo a passo

- **Aulas em sequência e continuar de onde parou:** logo abaixo. Rode o SQL **antes** de publicar o código.
- **Concluir a aula só no final do vídeo:** logo abaixo. Sem SQL.
- **Trilhas no painel (Objetivos > Escolher objetivos):** logo abaixo. O código funciona com e sem o SQL.
- **Troca do código do cupom (FOLYO100 → LANCAMENTO):** logo abaixo. Rode o SQL junto com a publicação do código.
- **Carrinho e cupom de lançamento (LANCAMENTO):** logo abaixo. Publique o código **antes** do SQL.
- **Limite de pedidos (rate limit):** logo abaixo. Opcional, sem SQL.
- **LGPD (baixar dados e excluir conta):** logo abaixo. Faça agora (depois de publicar o código novo).
- **Verificação em duas etapas (MFA) do painel:** logo abaixo. Faça na ordem descrita lá.
- **Perfil público (`/u/nome`):** logo abaixo. Rode o SQL **antes** de publicar o código.
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

# Trilhas no painel

As trilhas de **Objetivos > Escolher objetivos** (Marketing, Vendas, Empreender, Tecnologia...) agora são cadastradas no
painel, em **Trilhas** (menu à esquerda; editores e acima). Dá para **criar, editar, ordenar, ativar/desativar e excluir**
trilhas, e escolher **à mão os cursos** de cada uma (na ordem que você quiser). Se uma trilha ficar **sem cursos
escolhidos**, ela continua automática: mostra os cursos que ensinam as skills dela, como antes.

## 1. Rodar o SQL
No Supabase → **SQL Editor**, rode `supabase/migrations/20261030000004_trilhas.sql` (pode rodar de novo sem problema).
Ele cria a tabela `trails`, cadastra as **7 trilhas de sempre com os mesmos ids** (quem já escolheu uma continua com ela)
e cria as funções do painel (`admin_save_trail`, `admin_delete_trail`, `admin_reorder_trails`), com histórico.
Pode rodar **antes ou depois** de publicar o código: sem o SQL, o site mostra as 7 trilhas de sempre e a tela do painel
avisa que falta rodar o arquivo.

## 2. Como funciona
- **Ativa/inativa:** trilha inativa some de Objetivos e do primeiro acesso, mas continua valendo para quem já a escolheu.
- **Excluir:** o banco recusa se algum aluno escolheu a trilha (use "desativar"). Aparece no histórico do painel.
- **Cursos escolhidos à mão:** só os que estão no ar aparecem para o aluno; curso despublicado some do pacote sozinho.
- **Skills da trilha:** são somadas aos objetivos do aluno ao aplicar a trilha. Use os mesmos nomes das skills dos cursos.
- **Primeiro acesso:** a trilha sugerida pelas respostas só vale se existir e estiver ativa.

## 3. Testar
1. Painel › Trilhas: devem aparecer as 7 de sempre. Crie uma trilha nova, escolha 2 cursos e salve.
2. Como aluno, em Objetivos > Escolher objetivos: a trilha nova aparece com os 2 cursos, na ordem escolhida.
3. Desative a trilha: ela some para o aluno. Tente excluir uma trilha que um aluno escolheu: o painel explica.

## Como desfazer
Só se precisar: `drop table public.trails cascade;` e apague as três funções `admin_*_trail` (e `admin_reorder_trails`).
O site volta sozinho para as 7 trilhas de `src/lib/trails.ts` (`DEFAULT_TRAILS`).

---

# Aulas em sequência e continuar de onde parou

**Aulas em sequência.** O aluno só abre uma aula se **todas as anteriores do curso estiverem concluídas** (para abrir a
aula 4, as aulas 1, 2 e 3). Na lista de aulas as bloqueadas aparecem com cadeado, e abrir uma delas só mostra um aviso.
Quem tentar abrir pelo endereço volta para a primeira aula que falta. Isso é conferido **no servidor**, antes de gerar
o endereço do vídeo. Uma aula que a pessoa já concluiu continua aberta, mesmo que ela desmarque uma anterior depois.
A equipe (editor, admin e proprietário) abre qualquer aula. **Não precisa de SQL.**

**Continuar de onde parou.** O ponto em que a pessoa parou o vídeo é salvo (a cada ~5 s de vídeo, ao pausar e ao
sair da aula) e vale em qualquer aparelho. Ao voltar, o vídeo abre nesse ponto. Se ela chegou ao final, a aula
recomeça do início.

## 1. Rodar o SQL (ANTES de publicar o código)
No Supabase → **SQL Editor**, rode `supabase/migrations/20261030000002_retomar_aula.sql`. Ele só **acrescenta**
a coluna `position` em `lesson_watch` (começa em 0) e libera o aluno para gravá-la; não apaga nem altera nada
(pode rodar de novo sem problema). **Depois** publique o código (commit + push).

> **Ordem importante:** o código novo lê essa coluna. Publicar antes do SQL faz a área do aluno falhar ao carregar
> até o SQL ser rodado. (Código antigo + SQL novo funciona normalmente.)

## 2. Testar (com uma conta de aluno de teste)
1. Em um curso novo, só a aula 1 abre; as outras têm cadeado. Tentar abrir a aula 3 pelo endereço volta para a aula 1.
2. Assista a aula 1 até o fim, conclua e vá para a próxima: a aula 2 abre, a 3 continua trancada.
3. Abra uma aula, assista 3 min, saia (ou feche a aba) e volte: o vídeo continua dos 3 min.

## Limitações conhecidas
- A sequência vale para quem abre as aulas pelo site. Quem for técnico e conseguir gravar uma conclusão direto no
  banco pode marcar aulas sem assistir (a conclusão "só no final do vídeo" é conferida na tela, ver a seção abaixo).
- Se a pessoa desmarcar uma aula anterior, as seguintes que ela **ainda não** concluiu voltam a ficar trancadas.
- O ponto salvo pode atrasar até uns 10 s do momento em que a pessoa fechou o vídeo.

## Como desfazer
Basta reverter o código. A coluna `position` pode ficar (é inofensiva); para removê-la:
`alter table public.lesson_watch drop column if exists position;` (só depois de reverter o código).

---

# Concluir a aula só no final do vídeo (sem SQL)

A pessoa pode **pular trechos** do vídeo (botão de 10 s ou barra de progresso). Mas só consegue **marcar a aula como
concluída** e **ir para a próxima aula** (botão "Próxima aula") quando o vídeo **chega ao final**. Como o certificado
depende das aulas concluídas, não dá para pegar o certificado sem ter chegado ao final de cada vídeo.

**Não precisa rodar SQL.** A conferência é feita na tela (o banco não sabe em que ponto do vídeo a pessoa está).
Se você chegou a rodar a versão anterior deste arquivo (`20261030000001_assistir_para_concluir.sql`, que exigia tempo
assistido), rode o arquivo atual: ele só remove o gatilho antigo. Para remover à mão:

```sql
drop trigger if exists lesson_completion_guard on public.lesson_completions;
drop function if exists private.lesson_completion_guard();
```

## Regras que valem
- Vale para vídeo do **Bunny** e para link direto de arquivo (`.mp4`/`.webm`). Aula sem vídeo, YouTube/Vimeo e vídeo
  que não carregou **não travam** (a Folyo não consegue saber quando o vídeo de fora termina).
- Aula já concluída não trava: dá para desmarcar, marcar de novo e navegar.
- A lista de aulas ao lado continua livre: só o botão "Próxima aula" espera o fim do vídeo.
- Vale o fim do vídeo **nesta visita**: se a pessoa sair e voltar antes de concluir, precisa chegar ao final de novo.

## Limitação conhecida
- Quem for técnico consegue pedir a conclusão direto ao servidor sem passar pela tela. Para blindar isso seria preciso
  um servidor que registre os eventos do player; não foi feito porque o pedido foi não travar o aluno.

---

# Troca do código do cupom (FOLYO100 → LANCAMENTO)

O cupom de lançamento agora é **`LANCAMENTO`** (o `FOLYO100` deixa de existir). Os textos do site (aviso de lançamento,
carrinho, finalizar, editor de curso e configurações) já usam o código novo. O banco também precisa trocar.

## 1. Rodar o SQL
No Supabase → **SQL Editor**, rode `supabase/migrations/20261030000003_cupom_lancamento_renomear.sql`
(pode rodar de novo sem problema). Ele:
- cria o `LANCAMENTO` com as **mesmas regras** do `FOLYO100` (desconto, dias, ligado/desligado, datas e limite de usos);
- passa para o código novo **todos os pré-acessos já liberados** (ninguém perde acesso nem validade);
- apaga o `FOLYO100` (digitar o código antigo passa a dar "cupom não existe");
- troca as funções que ligam/desligam a promoção para olharem o código novo.

> **Ordem:** rode o SQL **junto** com a publicação do código. Com o código novo e o SQL antigo, o site mostra
> `LANCAMENTO`, mas o banco só aceita `FOLYO100`; com o SQL novo e o código antigo, o inverso. O aviso de lançamento
> aparece de novo uma vez para quem tinha fechado o antigo (o código mudou).

## 2. Testar (com uma conta de teste)
1. Carrinho: aplique `lancamento` (minúsculas e espaços valem): o total vira R$ 0,00. `FOLYO100` dá "cupom não existe".
2. Quem já tinha pré-acesso continua assistindo ao curso, com a mesma validade.
3. Painel › Configurações: "Promoção de lançamento ativa (cupom LANCAMENTO)" liga e desliga normalmente.

## Como desfazer
Para voltar ao código antigo, faça a mesma troca ao contrário: crie o `FOLYO100` com as regras do `LANCAMENTO`, mova
`course_access.coupon_code` para ele, apague o `LANCAMENTO`, refaça as duas funções do SQL de troca com o código antigo e
volte `PROMO.code` em `src/lib/cart.ts`.

---

# Carrinho e cupom de lançamento (LANCAMENTO)

O aluno põe cursos pagos no carrinho, aplica o cupom `LANCAMENTO` e ganha **30 dias de pré-acesso** aos cursos
marcados com "Liberar com cupom". **Não existe pagamento:** nenhuma cobrança, gateway ou dado de cartão.
Preço, desconto e liberação são calculados **no banco**; o navegador só manda ids de cursos e o código.

Um SQL novo, **uma vez só** (pode rodar de novo sem problema). Ele **não apaga nada** e **não cria cursos**.

> **Ordem importante:** publique o código **primeiro** e só depois rode o SQL. O código novo funciona com e sem
> o SQL (sem ele, todo curso continua gratuito). Já o código antigo **não** funciona depois do SQL: o SQL fecha a
> leitura direta das colunas de vídeo das aulas, que o código antigo ainda lia.

## 1. Publicar o código e rodar o SQL

1. Publique o código (git push) e espere a Vercel terminar.
2. Supabase → **SQL Editor** → **New query**.
3. Abra `supabase/migrations/20261029000001_cupom_lancamento.sql`, copie tudo, cole e **Run**.
   Deve aparecer *Success. No rows returned*.

O que ele cria:

- **`courses.price_cents`** (preço em centavos; vazio = gratuito) e **`courses.promo_launch_eligible`**
  ("Liberar com cupom de lançamento?", desligado por padrão). Todos os cursos que já existem continuam gratuitos.
- **`private.coupons`**, fora da API, com o `LANCAMENTO` (100%, 30 dias, ligado). Ninguém lê pelo site.
- **`course_access`**: quem pode assistir a cada curso pago (`cupom`, `manual` ou `compra`). O aluno só **lê** as
  próprias linhas; não existe regra de gravação para ele. Só as funções do banco gravam.
- **`quote_cart`** (preço do carrinho), **`redeem_launch_coupon`** (libera o pré-acesso; não renova o mês),
  **`has_course_access`**, **`my_course_access`**, **`launch_promo_state`** e **`lesson_videos`**.
- Painel: **`admin_set_launch_promo`**, **`admin_set_course_sale`**, **`admin_user_course_access`**,
  **`admin_grant_course_access`** e **`admin_revoke_course_access`** (todas conferem o papel e vão para o histórico).
- **Curso pago sem acesso:** o banco não entrega o vídeo (`lesson_videos`), os materiais, os PDFs nem aceita
  "aula concluída" ou eventos do player. Título e duração das aulas continuam visíveis (a página do curso mostra
  o conteúdo). A equipe (com o 2º fator) vê tudo.
- "Baixar meus dados" (LGPD) passa a incluir as liberações de curso.

## 2. Configurar e testar (com uma conta de teste)

1. **Painel › Cursos ›** um curso publicado **› Publicação e acesso › Venda**: preço `32,99` e ligue
   **"Liberar com cupom de lançamento (LANCAMENTO)?"**. Salve.
2. **Painel › Configurações › Catálogo**: confira que **"Promoção de lançamento ativa"** está ligada.
3. Entre com um aluno de teste: aparece o **aviso de lançamento** (uma vez só). Em **Explorar cursos**, o curso
   mostra "Curso pago", o preço e **Adicionar**. Abrir uma aula dele leva para a página de compra.
4. **Carrinho**: aplique `lancamento` (minúsculas e espaços valem): o total vira **R$ 0,00**. Um código errado
   mostra "Este cupom não existe ou não é válido." e o total não muda.
5. **Prosseguir com a compra › Continuar para o pré-acesso**: aparece "Seu pré-acesso está liberado." com a data
   (hoje + 30 dias). O curso ganha o selo **Pré-acesso** e as aulas abrem.
6. **Painel › Alunos ›** o aluno: em **Cursos pagos** aparece "pré-acesso de lançamento até dd/mm/aaaa".
   Teste também **Liberar acesso** / **Remover acesso** em outro curso pago.
7. Desligue a promoção em Configurações: o cupom passa a responder "A promoção de lançamento foi encerrada." e o
   pré-acesso do aluno se encerra (as aulas voltam a pedir compra). Ligue de novo: o pré-acesso volta (no prazo).

Os testes automáticos (`npm test`) rodam este SQL de verdade, num Postgres em memória, junto com todas as
migrations anteriores (lidas do histórico do git).

## Regras que valem

- O desconto só vale para curso com preço, publicado e marcado com "Liberar com cupom".
- **Sem renovação:** quem já teve pré-acesso de um curso pelo cupom (mesmo vencido) não ganha outro mês.
- Desligar a promoção encerra **na hora** todos os pré-acessos por cupom; religar devolve os que ainda estão no prazo.
- Liberação manual (painel) não tem prazo e não depende da promoção.
- Para mudar o cupom (prazo, limite de usos, dias), use o SQL Editor, por exemplo:
  `update private.coupons set ends_at = '2026-12-31 23:59-03', max_redemptions = 500 where code = 'LANCAMENTO';`

## Como desfazer

Para fechar a promoção, basta desligá-la em Configurações. Para os cursos voltarem a ser gratuitos, apague o
preço no editor. Se precisar devolver as regras antigas das aulas (sem apagar nenhum dado), rode no SQL Editor:

```sql
begin;
create or replace function private.lesson_visible(p_lesson text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lessons l
                  where l.id = p_lesson and l.published and private.module_visible(l.module_id))
$$;
grant select (video_kind, video_url, bunny_video_id) on public.lessons to authenticated;
drop policy if exists "Aula de curso pago só com acesso" on public.lesson_completions;
commit;
```

Apagar as tabelas `course_access` e `private.coupons` e as colunas novas de `courses` apaga as liberações dos
alunos: só faça isso com backup e sabendo o que está fazendo.

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

# Perfil público (`/u/nome`)

Cada aluno pode ter uma página aberta a qualquer pessoa, **sem login**, em `usefolyo.com/u/<endereço>`: nome,
objetivo, projetos marcados como "Público", cursos concluídos e experiência. É o mesmo desenho da
pré-visualização (`/publico`), mas lida do banco por uma função própria.

Um SQL novo, **uma vez só**. Ele **não apaga nada**: acrescenta duas colunas em `profiles`, funções e uma regra
de leitura no Storage. Dá para rodar **antes** de publicar o código sem quebrar a versão que está no ar.

> **Ordem importante:** rode o SQL **antes** de publicar o código. O código novo lê a coluna `slug`; sem o SQL,
> a área do aluno não carrega. (Pré-requisitos: os SQLs das Fases 1 e 2, que criam `student_works` e os cursos.)

## 1. Rodar o SQL

1. Supabase → **SQL Editor** → **New query**.
2. Abra `supabase/migrations/20261028000001_perfil_publico.sql`, copie tudo, cole e **Run**.
   Deve aparecer *Success. No rows returned*.
3. Se aparecer um erro dizendo que algo "already exists", o arquivo já foi rodado.

O que ele cria:

- **`profiles.slug` e `slug_changed_at`:** o endereço (3 a 30 letras minúsculas, números e hífen; único) e a data
  da última troca. Só a função `set_my_slug()` grava essas colunas: um gatilho recusa qualquer outro caminho.
  Nomes reservados (`admin`, `api`, `cursos`, `folyo`...) não podem ser escolhidos, e dá para trocar a cada 7 dias.
- **`get_public_profile(slug)`:** o que a página mostra. Responde **sem login**, só se a pessoa ligou
  "Perfil público" e tem endereço. Nunca devolve e-mail de login, telefone, anotações, progresso aula a aula nem
  trabalhos privados; o e-mail só aparece se "Mostrar e-mail no perfil público" estiver ligado, e os projetos só se "Mostrar
  projetos no portfólio público" estiver ligado. Perfil privado, endereço que não existe e conta suspensa dão
  a **mesma resposta**: ninguém descobre quem tem conta.
- **`get_public_work_file(slug, id)` e uma regra de leitura no Storage:** visitantes só conseguem o PDF de
  trabalhos que estão públicos **neste momento**. O servidor gera um link assinado de 60 segundos; o endereço
  do Storage nunca vai para o navegador. Desligou o perfil, o portfólio ou o "Público" do trabalho: o PDF fecha na hora.

## 2. Testar (com uma conta de teste)

1. **Configurações › Privacidade:** escolha o endereço (ex.: `maria-teste`) e **Salvar**. Ligue "Perfil público".
2. Abra `usefolyo.com/u/maria-teste` numa **janela anônima** (sem login): deve aparecer o portfólio.
3. Em **Projetos**, marque um PDF como "Público" e confirme que ele abre e baixa pela página pública.
4. Desligue "Perfil público": a janela anônima deve passar a mostrar **"Perfil não encontrado"** (igual a um
   endereço que nunca existiu) e o PDF deve dar 404.
5. Tente um nome reservado (`admin`) e um endereço já usado: a tela deve recusar com uma mensagem clara.

## O que é de propósito

- **Não aparece no Google.** A página leva `noindex` (no HTML e no cabeçalho `X-Robots-Tag`), e a resposta não
  fica em cache, então desligar o perfil vale na hora. Só quem tem o link chega nela. O `/u` **não** está
  bloqueado no `robots.txt` de propósito: bloquear impediria o Google de ler o `noindex`.
- Ainda não existe perfil por subdomínio (`maria.usefolyo.com`); o caminho `/u/nome` é o único.
- Limites: 10 trocas de endereço por 15 minutos por conta, e 60 PDFs por minuto por IP.

## Como desfazer

Os comandos estão comentados no fim do arquivo SQL (apagam a regra do Storage, as funções, o gatilho e as duas
colunas). Depois, publique o código anterior: o `/u/nome` deixa de existir e os endereços escolhidos se perdem.

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
