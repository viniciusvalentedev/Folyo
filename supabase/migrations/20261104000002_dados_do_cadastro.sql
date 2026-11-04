-- ============================================================================
-- Folyo · Dados do cadastro completo (celular, data de nascimento e gênero), protegidos fora da API
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode ANTES de publicar o código desta mudança (a área do aluno passa a chamar my_personal_data; sem ela, os
-- dados de todo mundo não carregam). O código antigo continua funcionando com este SQL rodado.
-- Tudo roda numa transação. Pode ser rodado de novo. NÃO apaga nem muda nenhum dado que já existe.
--
-- Por quê: o cadastro continua igual (nome, e-mail e senha). Depois de entrar, o aluno vê um aviso no sino para
-- concluir o cadastro, informando celular (Brasil, com DDD), data de nascimento e gênero. São dados pessoais: ficam
-- numa tabela própria, fora da API, e só a PRÓPRIA pessoa lê e grava, por funções que conferem tudo de novo.
--
-- O que muda:
--   1. private.personal_data: uma linha por conta (some junto com a conta: on delete cascade). Fica no schema
--      private, sem nenhum grant e com RLS ligada sem regras: nem a API, nem o painel, nem o token do aluno chegam
--      direto nela. Formato do celular, faixa de datas e opções de gênero são conferidos por CHECK.
--   2. my_personal_data(): devolve os dados da PRÓPRIA conta (ou nada, se ainda não concluiu).
--      save_my_personal_data(celular, nascimento, gênero, whatsapp?): grava os três juntos, conferindo login, conta
--      não suspensa, formato, idade entre 10 e 120 anos e o limite de gravações (private.count_write).
--      set_my_whatsapp_news(liga): liga ou desliga as novidades pelo WhatsApp (só com cadastro concluído).
--      A data do aceite do WhatsApp é sempre a do banco (LGPD: registro do consentimento).
--   3. "Baixar meus dados" (export_my_data) passa a incluir esses dados.
--
-- O que NÃO muda: o cadastro (signUp), o perfil (public.profiles), o perfil público e as funções do painel.
-- ============================================================================

begin;

-- 1. A tabela -------------------------------------------------------------------------------

create table if not exists private.personal_data (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  -- +55, DDD (dois dígitos de 1 a 9) e celular (9 + 8 dígitos) ou fixo (começa com 2 a 5, 8 dígitos).
  phone            text not null constraint personal_data_phone_br
                     check (phone ~ '^\+55[1-9]{2}(9[0-9]{8}|[2-5][0-9]{7})$'),
  birth_date       date not null constraint personal_data_birth_range check (birth_date >= date '1900-01-01'),
  gender           text not null constraint personal_data_gender
                     check (gender in ('feminino', 'masculino', 'nao_binario', 'outro', 'nao_informar')),
  whatsapp_news    boolean not null default false,
  whatsapp_news_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table private.personal_data is 'Dados do cadastro completo (celular, nascimento, gênero). Só pelas funções *_my_personal_data.';

alter table private.personal_data enable row level security;
revoke all on table private.personal_data from public, anon, authenticated, service_role;

-- 2. Funções (sempre da própria conta) ------------------------------------------------------------

create or replace function public.my_personal_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = 'FA403';
  end if;
  return (
    select jsonb_build_object('phone', d.phone, 'birthDate', d.birth_date, 'gender', d.gender,
             'whatsappNews', d.whatsapp_news)
      from private.personal_data d
     where d.user_id = uid
  );
end;
$$;

create or replace function public.save_my_personal_data(
  p_phone text,
  p_birth_date date,
  p_gender text,
  p_whatsapp_news boolean default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if uid is null or not private.not_suspended() then
    raise exception 'Entre na sua conta para continuar.' using errcode = 'FA403';
  end if;
  -- Conferido de novo aqui: qualquer pessoa logada pode chamar esta função direto, sem passar pelo site.
  if p_phone is null or p_phone !~ '^\+55[1-9]{2}(9[0-9]{8}|[2-5][0-9]{7})$' then
    raise exception 'Digite um celular do Brasil com DDD.' using errcode = 'FA400';
  end if;
  if p_birth_date is null
     or p_birth_date > (v_today - interval '10 years')::date
     or p_birth_date < (v_today - interval '121 years')::date + 1
     or p_birth_date < date '1900-01-01' then
    raise exception 'Confira a data de nascimento.' using errcode = 'FA400';
  end if;
  if p_gender is null or p_gender not in ('feminino', 'masculino', 'nao_binario', 'outro', 'nao_informar') then
    raise exception 'Escolha uma das opções de gênero.' using errcode = 'FA400';
  end if;

  perform private.count_write();

  insert into private.personal_data as d (user_id, phone, birth_date, gender, whatsapp_news, whatsapp_news_at)
  values (uid, p_phone, p_birth_date, p_gender, coalesce(p_whatsapp_news, false),
          case when coalesce(p_whatsapp_news, false) then now() end)
  on conflict (user_id) do update set
    phone            = excluded.phone,
    birth_date       = excluded.birth_date,
    gender           = excluded.gender,
    -- Sem p_whatsapp_news (null), o aceite fica como estava.
    whatsapp_news    = coalesce(p_whatsapp_news, d.whatsapp_news),
    whatsapp_news_at = case when p_whatsapp_news is not null and p_whatsapp_news is distinct from d.whatsapp_news
                            then now() else d.whatsapp_news_at end,
    updated_at       = now();
end;
$$;

create or replace function public.set_my_whatsapp_news(p_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not private.not_suspended() then
    raise exception 'Entre na sua conta para continuar.' using errcode = 'FA403';
  end if;
  if p_on is null then
    raise exception 'Escolha ligar ou desligar.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  update private.personal_data d
     set whatsapp_news = p_on,
         whatsapp_news_at = case when d.whatsapp_news is distinct from p_on then now() else d.whatsapp_news_at end,
         updated_at = now()
   where d.user_id = uid;
  -- Ligar exige o celular (cadastro concluído). Desligar sem cadastro não tem o que desligar: segue sem erro.
  if not found and p_on then
    raise exception 'Conclua seu cadastro antes de ligar as novidades pelo WhatsApp.' using errcode = 'FA409';
  end if;
end;
$$;

revoke execute on function public.my_personal_data() from public, anon, service_role;
revoke execute on function public.save_my_personal_data(text, date, text, boolean) from public, anon, service_role;
revoke execute on function public.set_my_whatsapp_news(boolean) from public, anon, service_role;
grant execute on function public.my_personal_data() to authenticated;
grant execute on function public.save_my_personal_data(text, date, text, boolean) to authenticated;
grant execute on function public.set_my_whatsapp_news(boolean) to authenticated;

comment on function public.my_personal_data() is 'Dados do cadastro completo da PRÓPRIA conta (ou null).';
comment on function public.save_my_personal_data(text, date, text, boolean) is 'Grava celular, nascimento e gênero da PRÓPRIA conta.';
comment on function public.set_my_whatsapp_news(boolean) is 'Liga/desliga as novidades pelo WhatsApp da PRÓPRIA conta.';

-- 3. LGPD: "Baixar meus dados" inclui os dados do cadastro (igual ao da migration de pagamentos + "dados_do_cadastro")

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = 'FA403';
  end if;

  return jsonb_build_object(
    'exportado_em', now(),
    'aviso', 'Estes são os dados que a Folyo guarda sobre a sua conta. Os arquivos PDF enviados por você '
             || 'ficam à parte: baixe cada um em Trabalhos.',
    'conta', (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'criada_em', u.created_at,
        'ultimo_acesso', u.last_sign_in_at
      )
      from auth.users u where u.id = uid
    ),
    'perfil', (select to_jsonb(p) from public.profiles p where p.id = uid),
    -- Dados do cadastro completo (celular, nascimento, gênero e aceite do WhatsApp). Novo nesta migration.
    'dados_do_cadastro', (
      select jsonb_build_object('celular', d.phone, 'data_de_nascimento', d.birth_date, 'genero', d.gender,
               'novidades_whatsapp', d.whatsapp_news, 'novidades_whatsapp_mudou_em', d.whatsapp_news_at,
               'criado_em', d.created_at, 'atualizado_em', d.updated_at)
      from private.personal_data d where d.user_id = uid
    ),
    'papel_na_equipe', (
      select jsonb_build_object('papel', r.role, 'desde', r.granted_at)
      from private.staff_roles r where r.user_id = uid
    ),
    'suspensao', (
      select jsonb_build_object('motivo', s.reason, 'desde', s.suspended_at)
      from private.suspensions s where s.user_id = uid
    ),
    'progresso_nos_cursos', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.course_id) from public.course_progress t where t.user_id = uid
    ), '[]'::jsonb),
    'aulas_concluidas', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.completed_at) from public.lesson_completions t where t.user_id = uid
    ), '[]'::jsonb),
    'anotacoes', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at) from public.lesson_notes t where t.user_id = uid
    ), '[]'::jsonb),
    'competencias', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at) from public.skills t where t.user_id = uid
    ), '[]'::jsonb),
    'trabalhos', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at) from public.works t where t.user_id = uid
    ), '[]'::jsonb),
    'tempo_assistido', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.lesson_id) from public.lesson_watch t where t.user_id = uid
    ), '[]'::jsonb),
    'visualizacoes_de_aulas', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.view_date, t.lesson_id) from public.lesson_views t where t.user_id = uid
    ), '[]'::jsonb),
    'acessos_a_cursos', coalesce((
      select jsonb_agg(jsonb_build_object('curso', a.course_id, 'origem', a.source, 'cupom', a.coupon_code,
               'liberado_em', a.granted_at, 'expira_em', a.expires_at) order by a.granted_at)
      from public.course_access a where a.user_id = uid
    ), '[]'::jsonb),
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'total_centavos', o.total_cents,
               'criado_em', o.created_at, 'pago_em', o.paid_at, 'reembolsado_em', o.refunded_at,
               'codigo_do_pagamento', o.provider_payment_id,
               'cursos', (select jsonb_agg(jsonb_build_object('curso', i.course_id, 'titulo', i.title, 'preco_centavos', i.price_cents) order by i.position)
                            from private.order_items i where i.order_id = o.id)) order by o.created_at)
      from private.orders o where o.user_id = uid
    ), '[]'::jsonb),
    'registros_do_painel_sobre_a_conta', coalesce((
      select jsonb_agg(jsonb_build_object('em', a.at, 'acao', a.action, 'detalhe', a.detail) order by a.at)
      from private.admin_audit a where a.target_id = uid
    ), '[]'::jsonb)
  );
end;
$$;


commit;

-- ---------- Como desfazer (rode só se precisar; APAGA os dados do cadastro completo de todo mundo) ----------
-- 1. Publique o código anterior (sem a tela "Concluir cadastro").
-- 2. Rode de novo a parte 5 de 20261102000001_pagamentos.sql (export_my_data sem "dados_do_cadastro"); sem isso,
--    o "Baixar meus dados" quebra quando a tabela sumir.
-- 3. Depois:
-- begin;
-- drop function if exists public.set_my_whatsapp_news(boolean);
-- drop function if exists public.save_my_personal_data(text, date, text, boolean);
-- drop function if exists public.my_personal_data();
-- drop table if exists private.personal_data;
-- commit;
