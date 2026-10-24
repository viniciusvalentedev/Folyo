-- Folyo · Verificação em duas etapas (MFA) obrigatória para a equipe do painel.
--
-- O QUE FAZ
--   Toda a equipe (editor, administrador, proprietário) passa a valer como "aluno" no banco enquanto a
--   sessão não tiver passado pelo segundo fator (aplicativo autenticador). Como TODAS as funções admin_*,
--   as regras de leitura do catálogo para a equipe e as regras do Storage da equipe perguntam o papel
--   por private.actor_rank() / private.require_rank(), trocar esta única função basta: sem o segundo
--   fator, o banco recusa tudo o que é do painel, mesmo que alguém fale direto com a API.
--
-- QUANDO RODAR (a ordem importa!)
--   1. Publique o código novo (git push) e espere a Vercel terminar.
--   2. Entre no site com a sua conta, abra /admin e cadastre o aplicativo autenticador.
--   3. SÓ DEPOIS rode este arquivo no SQL Editor.
--   Se rodar antes do passo 2, o proprietário fica sem acesso ao painel até cadastrar o autenticador
--   (nada se perde; veja "Como desfazer" em supabase/README.md).
--
-- Não apaga nem altera dados. Pode ser rodado de novo sem problema (create or replace).

begin;

create or replace function private.actor_rank()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 0
    when exists (select 1 from private.suspensions s where s.user_id = auth.uid()) then 0
    -- 'aal' vem dentro do token de login: aal2 = a pessoa digitou o código do autenticador nesta sessão.
    -- Sessão só com senha (aal1) não vale como equipe.
    when coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then 0
    else coalesce((select private.role_rank(r.role) from private.staff_roles r where r.user_id = auth.uid()), 0)
  end
$$;

comment on function private.actor_rank() is
  'Papel de quem está logado, em número. Conta suspensa ou sessão sem o 2º fator (aal2) vale 0.';

commit;
