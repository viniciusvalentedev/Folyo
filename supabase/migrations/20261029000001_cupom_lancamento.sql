-- ============================================================================
-- Folyo · Carrinho, cupom de lançamento (FOLYO100) e pré-acesso
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS de publicar o código novo (o código funciona com e sem este SQL).
-- Tudo roda numa transação: se algo der erro, nada fica pela metade. Pode ser rodado de novo.
--
-- NÃO apaga nem altera cursos, usuários ou progresso. Só ACRESCENTA:
--   1. courses.price_cents (preço em centavos; vazio ou 0 = gratuito) e
--      courses.promo_launch_eligible ("liberar com cupom de lançamento?", desligado por padrão);
--   2. private.coupons (as regras dos cupons; fora da API) com o FOLYO100 (100%, 30 dias);
--   3. public.course_access (liberações de curso: compra, manual ou cupom). O aluno só LÊ as
--      próprias linhas; ninguém grava direto: só as funções abaixo;
--   4. Funções: quote_cart (preço calculado no servidor), redeem_launch_coupon (libera o
--      pré-acesso), has_course_access, my_course_access, launch_promo_state, lesson_videos e as
--      do painel (admin_set_launch_promo, admin_set_course_sale, admin_user_course_access,
--      admin_grant_course_access, admin_revoke_course_access);
--   5. Curso pago (preço > 0) sem acesso: o banco deixa de entregar vídeo, materiais e PDFs
--      das aulas e recusa "aula concluída" e eventos do player. Cursos sem preço continuam
--      exatamente como hoje.
--
-- Nenhum pagamento existe: não há cobrança, gateway nem dado de cartão em lugar nenhum.
--
-- Como desfazer (só se precisar): veja "Cupom de lançamento" em supabase/README.md.
-- ============================================================================

begin;

-- 1. Cursos: preço e participação no cupom ------------------------------------------

alter table public.courses add column if not exists price_cents integer
  check (price_cents is null or price_cents between 0 and 10000000);
alter table public.courses add column if not exists promo_launch_eligible boolean not null default false;
comment on column public.courses.price_cents is 'Preço em centavos. Vazio ou 0 = curso gratuito (aberto a todos os alunos).';
comment on column public.courses.promo_launch_eligible is 'O cupom de lançamento (FOLYO100) vale para este curso?';
grant select (price_cents, promo_launch_eligible) on public.courses to authenticated;

-- 2. Cupons (fora da API: só as funções leem) ----------------------------------------

create table if not exists private.coupons (
  code            text primary key check (code ~ '^[A-Z0-9]{3,40}$'),
  percent_off     integer not null check (percent_off between 1 and 100),
  active          boolean not null default true,
  starts_at       timestamptz,
  ends_at         timestamptz,
  access_days     integer not null default 30 check (access_days between 1 and 365),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (starts_at is null or ends_at is null or starts_at < ends_at)
);
comment on table private.coupons is 'Cupons. O código fica em MAIÚSCULAS; a comparação ignora maiúsculas e espaços.';
alter table private.coupons enable row level security;
revoke all on table private.coupons from public, anon, authenticated, service_role;

insert into private.coupons (code, percent_off, access_days) values ('FOLYO100', 100, 30) on conflict (code) do nothing;

-- 3. Liberações de acesso a cursos ---------------------------------------------------

create table if not exists public.course_access (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  course_id   text not null references public.courses (id) on delete cascade,
  source      text not null check (source in ('compra', 'manual', 'cupom')),
  coupon_code text references private.coupons (code),
  granted_at  timestamptz not null default now(),
  -- null = sem fim (compra ou liberação manual).
  expires_at  timestamptz,
  granted_by  uuid,
  unique (user_id, course_id, source),
  check ((source = 'cupom') = (coupon_code is not null)),
  check (source <> 'cupom' or expires_at is not null)
);
comment on table public.course_access is 'Quem pode assistir a cada curso pago. Só as funções do banco gravam aqui.';
create index if not exists course_access_course on public.course_access (course_id);

alter table public.course_access enable row level security;
revoke all on table public.course_access from public, anon, authenticated, service_role;
grant select (id, user_id, course_id, source, coupon_code, granted_at, expires_at) on public.course_access to authenticated;

drop policy if exists "Aluno lê os próprios acessos" on public.course_access;
create policy "Aluno lê os próprios acessos" on public.course_access for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Conta suspensa não acessa" on public.course_access;
create policy "Conta suspensa não acessa" on public.course_access as restrictive for select to authenticated
  using ((select private.not_suspended()));
-- De propósito: nenhuma regra de INSERT, UPDATE ou DELETE. O aluno não grava nesta tabela.

-- 4. Quem pode assistir --------------------------------------------------------------

-- A pessoa pode assistir ao curso? Gratuito (sem preço): sim. Pago: só com compra, liberação
-- manual ou pré-acesso de cupom ainda no prazo E com o cupom ainda ligado (desligar a promoção
-- no painel encerra todos os pré-acessos dela).
create or replace function private.user_has_access(p_user uuid, p_course text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.price_cents from public.courses c where c.id = p_course), 0) <= 0
      or exists (
        select 1
          from public.course_access a
          left join private.coupons k on k.code = a.coupon_code
         where a.user_id = p_user
           and a.course_id = p_course
           and ((a.source in ('compra', 'manual') and (a.expires_at is null or a.expires_at > now()))
             or (a.source = 'cupom' and a.expires_at > now() and coalesce(k.active, false))))
$$;

-- Para as regras (RLS): equipe vê tudo; aluno, o que pode assistir.
create or replace function private.course_access_ok(p_course text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.catalog_staff() or (auth.uid() is not null and private.user_has_access(auth.uid(), p_course))
$$;

revoke execute on function private.user_has_access(uuid, text), private.course_access_ok(text) from public, anon, authenticated, service_role;
grant execute on function private.course_access_ok(text) to authenticated;

-- A aula é visível para os alunos? Agora também exige poder assistir ao curso. Esta função já é
-- usada pelas regras dos materiais (e, por tabela, dos PDFs no Storage) e pelo player_event.
create or replace function private.lesson_visible(p_lesson text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lessons l
     where l.id = p_lesson and l.published and private.module_visible(l.module_id) and private.course_access_ok(l.course_id))
$$;

-- O vídeo deixa de sair direto da tabela de aulas (título, duração e ordem continuam abertos,
-- para a página do curso mostrar o conteúdo). Quem entrega o vídeo é lesson_videos().
revoke select (video_kind, video_url, bunny_video_id) on public.lessons from authenticated;

create or replace function public.lesson_videos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'video_kind', l.video_kind, 'video_url', l.video_url,
           'bunny_video_id', l.bunny_video_id) order by l.id), '[]'::jsonb)
    from public.lessons l
   where l.video_kind is not null
     and auth.uid() is not null
     and private.not_suspended()
     and (private.catalog_staff() or private.lesson_visible(l.id))
$$;

-- "Aula concluída" de curso pago só para quem pode assistir (o certificado depende disso).
drop policy if exists "Aula de curso pago só com acesso" on public.lesson_completions;
create policy "Aula de curso pago só com acesso" on public.lesson_completions as restrictive for insert to authenticated
  with check (private.course_access_ok(course_id));

-- Pode assistir? (para a página da aula e para a tela)
create or replace function public.has_course_access(p_course_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and private.not_suspended() and private.course_access_ok(p_course_id)
$$;

-- Liberações da própria conta (com "ainda vale?" já calculado) e se a pessoa é da equipe.
create or replace function public.my_course_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'staff', private.catalog_staff(),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'courseId', a.course_id,
               'source', a.source,
               'grantedAt', a.granted_at,
               'expiresAt', a.expires_at,
               'active', (a.source in ('compra', 'manual') and (a.expires_at is null or a.expires_at > now()))
                      or (a.source = 'cupom' and a.expires_at > now() and coalesce(k.active, false)))
             order by a.granted_at)
        from public.course_access a
        left join private.coupons k on k.code = a.coupon_code
       where a.user_id = auth.uid()), '[]'::jsonb))
  where auth.uid() is not null and private.not_suspended()
$$;

-- A promoção de lançamento está valendo? (só o que a tela precisa para os textos)
create or replace function public.launch_promo_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', k.code,
    'active', k.active and (k.starts_at is null or k.starts_at <= now()) and (k.ends_at is null or k.ends_at > now()),
    'percentOff', k.percent_off,
    'accessDays', k.access_days)
    from private.coupons k
   where k.code = 'FOLYO100' and auth.uid() is not null
$$;

-- 5. Carrinho: preço calculado no servidor -----------------------------------------------

-- Quantas contas já usaram o cupom.
create or replace function private.coupon_redemptions(p_code text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct a.user_id)::int from public.course_access a where a.coupon_code = p_code
$$;

-- O cálculo do carrinho (usado pela tela e de novo na hora de liberar). Tudo em centavos.
-- O navegador manda só os ids dos cursos e o código; preço e desconto saem daqui.
create or replace function private.cart_quote(p_user uuid, p_course_ids text[], p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wanted text[];
  v_code text := upper(btrim(coalesce(p_code, '')));
  k private.coupons%rowtype;
  coupon_ok boolean := false;
  coupon_error text;
  pct int := 0;
  v_items jsonb;
  v_dropped jsonb;
  v_sub bigint;
  v_disc bigint;
begin
  if p_course_ids is null or cardinality(p_course_ids) > 50 then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  if exists (select 1 from unnest(p_course_ids) x where x is null or x !~ '^[a-z0-9-]{1,40}$') then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  -- Sem repetidos, na ordem em que vieram.
  select coalesce(array_agg(d.x order by d.o), '{}') into wanted
    from (select u.x, min(u.o) as o from unnest(p_course_ids) with ordinality as u(x, o) group by u.x) d;

  -- p_code null = sem cupom; texto vazio = a pessoa clicou em aplicar sem digitar.
  if p_code is not null then
    if v_code = '' then
      coupon_error := 'Digite o código do cupom.';
    elsif v_code !~ '^[A-Z0-9]{3,40}$' then
      coupon_error := 'Este cupom não existe ou não é válido.';
    else
      select * into k from private.coupons c where c.code = v_code;
      if not found or (k.starts_at is not null and k.starts_at > now()) then
        coupon_error := 'Este cupom não existe ou não é válido.';
      elsif not k.active
         or (k.ends_at is not null and k.ends_at <= now())
         or (k.max_redemptions is not null
             and private.coupon_redemptions(k.code) >= k.max_redemptions
             and not exists (select 1 from public.course_access a where a.user_id = p_user and a.coupon_code = k.code)) then
        coupon_error := 'A promoção de lançamento foi encerrada.';
      else
        coupon_ok := true;
        pct := k.percent_off;
      end if;
    end if;
  end if;

  with w as (
    select u.x as id, u.o from unnest(wanted) with ordinality as u(x, o)
  ), c as (
    select w.id, w.o, cr.title, coalesce(cr.price_cents, 0) as price,
      case
        when cr.id is null or not private.course_is_live(cr.status, cr.publish_at) or cr.status = 'arquivado' then 'fora_de_venda'
        when coalesce(cr.price_cents, 0) <= 0 then 'gratuito'
        when private.user_has_access(p_user, cr.id) then 'ja_possui'
      end as drop_reason,
      -- Sem renovação: quem já teve pré-acesso deste curso por cupom (mesmo vencido) paga o preço.
      coupon_ok and coalesce(cr.promo_launch_eligible, false)
        and not exists (select 1 from public.course_access a where a.user_id = p_user and a.course_id = cr.id and a.source = 'cupom') as eligible
    from w left join public.courses cr on cr.id = w.id
  ), z as (
    select c.*, case when c.eligible and c.drop_reason is null then round(c.price * pct / 100.0)::int else 0 end as discount
    from c
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('courseId', z.id, 'title', z.title, 'priceCents', z.price, 'eligible', z.eligible,
      'discountCents', z.discount, 'finalCents', z.price - z.discount) order by z.o) filter (where z.drop_reason is null), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('courseId', z.id, 'reason', z.drop_reason) order by z.o) filter (where z.drop_reason is not null), '[]'::jsonb),
    coalesce(sum(z.price) filter (where z.drop_reason is null), 0),
    coalesce(sum(z.discount) filter (where z.drop_reason is null), 0)
  into v_items, v_dropped, v_sub, v_disc
  from z;

  return jsonb_build_object(
    'items', v_items,
    'dropped', v_dropped,
    'subtotalCents', v_sub,
    'discountCents', v_disc,
    'totalCents', greatest(v_sub - v_disc, 0),
    'coupon', case when coupon_ok then k.code end,
    'couponError', coupon_error,
    'percentOff', pct,
    'accessDays', case when coupon_ok then k.access_days end);
end;
$$;

revoke execute on function private.coupon_redemptions(text), private.cart_quote(uuid, text[], text) from public, anon, authenticated, service_role;

create or replace function public.quote_cart(p_course_ids text[], p_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.not_suspended() then
    raise exception 'Faça login para continuar.' using errcode = 'FA403';
  end if;
  return private.cart_quote(auth.uid(), p_course_ids, p_code);
end;
$$;

-- Libera o pré-acesso. Recalcula TUDO aqui (não confia no que a tela mostrou), uma liberação por
-- vez para cada conta, e não renova: quem já tem pré-acesso de um curso por cupom mantém a data.
-- Erros com código FC422 têm a mensagem pronta para a tela.
create or replace function public.redeem_launch_coupon(p_course_ids text[], p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  q jsonb;
  v_code text;
  v_days int;
  v_ids text[];
  v_courses jsonb;
  v_titles text;
begin
  if uid is null or not private.not_suspended() then
    raise exception 'Faça login para continuar.' using errcode = 'FA403';
  end if;
  if p_code is null then
    raise exception 'Digite o código do cupom.' using errcode = 'FC422';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('coupon:' || uid::text, 0));
  -- Trava o cupom: desligar a promoção ou bater o limite de usos vale até o último instante.
  perform 1 from private.coupons c where c.code = upper(btrim(p_code)) for update;

  q := private.cart_quote(uid, p_course_ids, p_code);
  if q ->> 'couponError' is not null then
    raise exception '%', q ->> 'couponError' using errcode = 'FC422';
  end if;
  select coalesce(array_agg(i ->> 'courseId'), '{}') into v_ids
    from jsonb_array_elements(q -> 'items') i where (i ->> 'eligible')::boolean;
  if cardinality(v_ids) = 0 then
    raise exception 'Nenhum curso do carrinho participa da promoção de lançamento.' using errcode = 'FC422';
  end if;
  v_code := q ->> 'coupon';
  v_days := (q ->> 'accessDays')::int;

  insert into public.course_access (user_id, course_id, source, coupon_code, expires_at)
  select uid, x, 'cupom', v_code, now() + make_interval(days => v_days) from unnest(v_ids) x
  on conflict (user_id, course_id, source) do nothing;

  select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'expiresAt', a.expires_at) order by array_position(v_ids, c.id)),
         string_agg(c.title, ', ' order by array_position(v_ids, c.id))
    into v_courses, v_titles
    from public.course_access a join public.courses c on c.id = a.course_id
   where a.user_id = uid and a.source = 'cupom' and a.course_id = any (v_ids);

  perform private.audit('cupom.resgatado', uid, v_code || ' · ' || cardinality(v_ids) || ' curso(s): ' || coalesce(v_titles, ''));

  return jsonb_build_object(
    'courses', coalesce(v_courses, '[]'::jsonb),
    'leftoverIds', coalesce((select jsonb_agg(i -> 'courseId') from jsonb_array_elements(q -> 'items') i
                              where not (i ->> 'eligible')::boolean), '[]'::jsonb),
    'droppedIds', coalesce((select jsonb_agg(d -> 'courseId') from jsonb_array_elements(q -> 'dropped') d), '[]'::jsonb));
end;
$$;

-- 6. Painel --------------------------------------------------------------------------

-- Liga ou desliga a promoção de lançamento (administrador ou acima).
create or replace function public.admin_set_launch_promo(p_active boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  was boolean;
begin
  if p_active is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  select active into was from private.coupons where code = 'FOLYO100' for update;
  if was is null then
    raise exception 'Cupom não encontrado.' using errcode = 'FA404';
  end if;
  actor := private.require_rank(2);
  if was is distinct from p_active then
    update private.coupons set active = p_active, updated_at = now() where code = 'FOLYO100';
    perform private.audit_content('cupom.alterado', 'FOLYO100',
      case when p_active then 'Promoção de lançamento ligada' else 'Promoção de lançamento desligada (pré-acessos por cupom encerrados)' end);
  end if;
  return jsonb_build_object('active', p_active);
end;
$$;

-- Preço e "liberar com cupom" de um curso (editor ou acima). Não mexe no updated_at do curso
-- (assim o editor aberto não acusa "alterado por outra pessoa" logo depois de salvar).
create or replace function public.admin_set_course_sale(p_id text, p_price_cents integer, p_promo boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  c public.courses%rowtype;
  price int := nullif(p_price_cents, 0);
  fmt text;
begin
  if p_id is null or p_id !~ '^[a-z0-9-]{1,40}$' or p_promo is null
     or (p_price_cents is not null and (p_price_cents < 0 or p_price_cents > 10000000)) then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('course:' || p_id, 0));
  actor := private.require_rank(1);
  select * into c from public.courses where id = p_id for update;
  if not found then
    raise exception 'Curso não encontrado. Ele pode ter sido excluído.' using errcode = 'FA404';
  end if;
  if c.price_cents is not distinct from price and c.promo_launch_eligible = p_promo then
    return jsonb_build_object('id', p_id);
  end if;
  update public.courses set price_cents = price, promo_launch_eligible = p_promo where id = p_id;
  fmt := case when price is null then 'gratuito' else 'R$ ' || (price / 100) || ',' || lpad((price % 100)::text, 2, '0') end;
  perform private.audit_content('curso.atualizado', c.title,
    'Venda: ' || fmt || ' · cupom de lançamento: ' || case when p_promo then 'sim' else 'não' end);
  return jsonb_build_object('id', p_id);
end;
$$;

-- Liberações de curso de um aluno (administrador ou acima).
create or replace function public.admin_user_course_access(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
begin
  if p_user is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'courseId', a.course_id,
             'source', a.source,
             'grantedAt', a.granted_at,
             'expiresAt', a.expires_at,
             'active', (a.source in ('compra', 'manual') and (a.expires_at is null or a.expires_at > now()))
                    or (a.source = 'cupom' and a.expires_at > now() and coalesce(k.active, false)))
           order by a.granted_at)
      from public.course_access a
      left join private.coupons k on k.code = a.coupon_code
     where a.user_id = p_user), '[]'::jsonb);
end;
$$;

-- Liberação manual de um curso pago (administrador ou acima). Sem prazo.
create or replace function public.admin_grant_course_access(p_user uuid, p_course text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  c public.courses%rowtype;
begin
  if p_user is null or p_course is null or p_course !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'Usuário não encontrado.' using errcode = 'FA404';
  end if;
  select * into c from public.courses where id = p_course;
  if not found then
    raise exception 'Curso não encontrado.' using errcode = 'FA404';
  end if;
  if coalesce(c.price_cents, 0) <= 0 then
    raise exception 'Este curso é gratuito: todos os alunos já têm acesso.' using errcode = 'FA400';
  end if;
  insert into public.course_access (user_id, course_id, source, granted_by)
  values (p_user, p_course, 'manual', auth.uid())
  on conflict (user_id, course_id, source) do nothing;
  if found then
    perform private.audit('acesso.liberado', p_user, c.title);
  end if;
  return jsonb_build_object('courseId', p_course);
end;
$$;

-- Remove a liberação MANUAL (compra e pré-acesso de cupom ficam como estão).
create or replace function public.admin_revoke_course_access(p_user uuid, p_course text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  t text;
begin
  if p_user is null or p_course is null or p_course !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  delete from public.course_access a where a.user_id = p_user and a.course_id = p_course and a.source = 'manual';
  if found then
    select title into t from public.courses where id = p_course;
    perform private.audit('acesso.removido', p_user, coalesce(t, p_course));
  end if;
  return jsonb_build_object('courseId', p_course);
end;
$$;

-- 7. LGPD: as liberações entram no "baixar meus dados" ---------------------------------

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
    'registros_do_painel_sobre_a_conta', coalesce((
      select jsonb_agg(jsonb_build_object('em', a.at, 'acao', a.action, 'detalhe', a.detail) order by a.at)
      from private.admin_audit a where a.target_id = uid
    ), '[]'::jsonb)
  );
end;
$$;

-- 8. Permissões ----------------------------------------------------------------------

revoke execute on function public.lesson_videos(), public.has_course_access(text), public.my_course_access(),
  public.launch_promo_state(), public.quote_cart(text[], text), public.redeem_launch_coupon(text[], text),
  public.admin_set_launch_promo(boolean), public.admin_set_course_sale(text, integer, boolean),
  public.admin_user_course_access(uuid), public.admin_grant_course_access(uuid, text),
  public.admin_revoke_course_access(uuid, text), public.export_my_data()
  from public, anon, service_role;
grant execute on function public.lesson_videos(), public.has_course_access(text), public.my_course_access(),
  public.launch_promo_state(), public.quote_cart(text[], text), public.redeem_launch_coupon(text[], text),
  public.admin_set_launch_promo(boolean), public.admin_set_course_sale(text, integer, boolean),
  public.admin_user_course_access(uuid), public.admin_grant_course_access(uuid, text),
  public.admin_revoke_course_access(uuid, text), public.export_my_data()
  to authenticated;

commit;
