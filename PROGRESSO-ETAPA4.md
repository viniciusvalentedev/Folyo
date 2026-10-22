# Etapa 4: painel admin (PRONTO PARA PUBLICAR)

Situação em 22/10/2026. Revisão de segurança completa feita (com 3 agentes atacando banco, site e código).
Falta só você rodar os DOIS SQLs no Supabase, virar proprietário e fazer o push.

## O que está pronto
- `supabase/migrations/20261022000002_etapa4_painel_admin.sql`: papéis, suspensão, auditoria e funções `admin_*`.
- `supabase/migrations/20261022000003_etapa4b_seguranca_painel.sql` (reforço, NOVO):
  - proprietário só pelo SQL Editor (o painel não cria, não rebaixa e não suspende proprietário);
  - nunca fica sem proprietário ativo (nem pelo SQL Editor, nem excluindo a conta);
  - pedidos simultâneos numa fila única, com o papel conferido de novo depois da fila;
  - histórico não pode ser editado nem apagado e registra também mudanças feitas fora do painel;
  - nomes sem caracteres invisíveis ou "·" (ninguém se passa por outra pessoa no histórico);
  - limite de alterações por minuto também no painel;
  - funções novas não ficam abertas para a internet por padrão.
- Site:
  - proxy com limite de pedidos por IP em todas as rotas, recusa de Server Action sem Origin e regra de
    rotas corrigida (endereços com ".png"/".svg" também passam pelo proxy);
  - login com limite de senhas erradas por e-mail (além do limite por IP e do CAPTCHA);
  - conta suspensa não troca a senha;
  - cookie corrompido ou forjado vale como "não logado" (antes dava erro 500);
  - tentativas barradas no painel ficam no log da Vercel ("Painel: ação negada");
  - histórico mostra nome e e-mail de quem fez.

## Testes (22/10/2026) — todos passando
- Banco: 105 + 27 + 141, mais 3 de concorrência num Postgres 16 de verdade.
- Site: 75 + 43 + 61 (meus), 47 (extras: cookies forjados, redirecionamento, proxy, limites),
  219 + 151 (agente: páginas, cache, pré-carregamento, Server Actions).
- `npm run check` e `next build` passando.

## Passo a passo para publicar
1. Supabase → SQL Editor → rodar `20261022000002_etapa4_painel_admin.sql`.
2. Nova query → rodar `20261022000003_etapa4b_seguranca_painel.sql`.
3. Virar proprietário (troque pelo seu e-mail de login, que precisa estar confirmado):
   `insert into private.staff_roles (user_id, role) select id, 'proprietario' from auth.users where email = lower('SEU_EMAIL') and email_confirmed_at is not null on conflict (user_id) do update set role = excluded.role;`
4. `git add .`, `git commit -m "Etapa 4: painel admin"`, `git push`, e testar `/admin`.
5. Supabase → Authentication: confirmar que o CAPTCHA está ligado, ligar "Secure password change" e,
   se o plano permitir, a proteção contra senhas vazadas.

## Depois
- Verificação em duas etapas (MFA) obrigatória para entrar no painel (recomendado como próximo passo).
- Conectar o domínio usefolyo.com (trocar Site URL e Redirect URLs no Supabase).
- LGPD: excluir/exportar conta, privacidade e termos.
- Áreas "em breve" do painel: cursos, categorias, aulas, audiência, relatórios, mídia, configurações.
- Limites hoje são por servidor da Vercel; depois dá para centralizar (Redis) ou usar o Firewall da Vercel.
