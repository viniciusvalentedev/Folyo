-- ============================================================================
--  LGPD: exportar os meus dados e excluir a minha conta
--
--  Direitos do titular (Lei 13.709/2018, art. 18): acesso aos dados (II),
--  portabilidade (V) e eliminação (VI). Duas funções, as duas só para quem está
--  logado e só sobre a PRÓPRIA conta (o id vem do token: auth.uid()).
--
--  1. public.export_my_data()   devolve tudo o que a Folyo guarda sobre a conta (JSON).
--  2. public.delete_my_account() apaga a conta; o resto some junto (on delete cascade).
--
--  O que NÃO apaga sozinho:
--    - Os PDFs do Storage: o Supabase não deixa apagar arquivo por SQL. Quem faz é o
--      servidor do site (src/lib/actions/account.ts), ANTES de chamar esta função.
--    - O histórico do painel (private.admin_audit): registro de segurança da equipe,
--      que só cresce de propósito. Guarda nomes/e-mails em texto (veja /privacidade).
--
--  Quando rodar: depois de publicar o código novo (a tela de Configurações chama
--  estas funções). Pode rodar a qualquer momento, em qualquer ordem em relação ao
--  SQL do MFA (20261026000001).
-- ============================================================================

begin;

-- 0. Ajuste no limite de pedidos (etapa 3) ----------------------------------------
-- O limite por minuto também dispara nas alterações em cascata que o banco faz ao excluir uma
-- conta (apagar o perfil, zerar "granted_by" em quem ela promoveu...) e tenta gravar o contador
-- de uma conta que já foi excluída: a chave estrangeira recusa e a exclusão toda falha.
-- Regra nova: alteração em nome de quem JÁ NÃO EXISTE em auth.users não conta (não há mais
-- ninguém para limitar). Para quem existe, nada muda. O resto do corpo é o da etapa 3.
create or replace function private.enforce_write_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  this_minute timestamptz := date_trunc('minute', now());
  this_hour timestamptz := date_trunc('hour', now());
  per_minute constant int := 120;
  per_hour constant int := 3000;
  counter private.write_rate%rowtype;
begin
  if uid is null then
    return null;
  end if;

  if not exists (select 1 from auth.users u where u.id = uid) then
    return null;
  end if;

  insert into private.write_rate as w (user_id, minute_start, minute_count, hour_start, hour_count)
  values (uid, this_minute, 1, this_hour, 1)
  on conflict (user_id) do update set
    minute_count = case when w.minute_start = this_minute then w.minute_count + 1 else 1 end,
    minute_start = this_minute,
    hour_count = case when w.hour_start = this_hour then w.hour_count + 1 else 1 end,
    hour_start = this_hour
  returning * into counter;

  if counter.minute_count > per_minute or counter.hour_count > per_hour then
    raise exception 'Muitas alterações seguidas. Espere um pouco e tente de novo.'
      using errcode = 'FY429';
  end if;
  return null;
end;
$$;

-- 1. Exportar ------------------------------------------------------------------
create function public.export_my_data()
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
    'registros_do_painel_sobre_a_conta', coalesce((
      select jsonb_agg(jsonb_build_object('em', a.at, 'acao', a.action, 'detalhe', a.detail) order by a.at)
      from private.admin_audit a where a.target_id = uid
    ), '[]'::jsonb)
  );
end;
$$;

-- 2. Excluir -------------------------------------------------------------------
-- Apagar a conta de login leva junto, por cascata: perfil, progresso, anotações, competências,
-- trabalhos, tempo assistido, visualizações, sessões, papel na equipe, suspensão e contador
-- de pedidos. Se for o ÚLTIMO proprietário ativo, o gatilho guard_last_owner recusa (FA409).
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = 'FA403';
  end if;
  delete from auth.users where id = uid;
end;
$$;

-- 3. Permissões ----------------------------------------------------------------
revoke execute on function public.export_my_data(), public.delete_my_account() from public, anon, service_role;
grant execute on function public.export_my_data(), public.delete_my_account() to authenticated;

comment on function public.export_my_data() is 'LGPD: tudo o que a Folyo guarda sobre a conta de quem chama (JSON).';
comment on function public.delete_my_account() is 'LGPD: apaga a conta de quem chama e, por cascata, os dados dela.';

commit;
