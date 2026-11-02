-- ============================================================================
-- Folyo · Pagamentos (Mercado Pago): pedidos, confirmação de pagamento e acesso comprado
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS de publicar o código novo. Tudo roda numa transação: se algo der erro, nada fica
-- pela metade. Pode ser rodado de novo. NÃO apaga nem altera cursos, usuários ou progresso.
--
-- O que muda:
--   1. private.orders / private.order_items / private.payment_events (fora da API; ninguém lê nem
--      grava direto). O pedido guarda uma FOTO do preço de cada curso na hora da compra.
--   2. public.course_access ganha order_id (qual pedido liberou o acesso). O aluno continua sem
--      conseguir ler essa coluna nem gravar na tabela.
--   3. create_order: o BANCO recalcula o carrinho (com a conta de quem está logado) e cria o pedido.
--      O navegador manda só ids de cursos. Nunca manda preço.
--   4. attach_order_checkout: guarda o link do pagamento (só endereços do Mercado Pago).
--   5. order_status: o aluno vê o status do PRÓPRIO pedido (para a página de retorno).
--   6. apply_payment: confirma ou desfaz um pagamento. SÓ o papel service_role executa (a chave
--      secreta do Supabase, usada só na rota do webhook). Confere valor e moeda, é idempotente e
--      nunca libera nada por conta própria: quem chama já consultou o pagamento na API do Mercado Pago.
--   7. Quem tem pré-acesso do cupom PODE comprar o curso (antes caía em "já possui").
--   8. redeem_launch_coupon passa a recusar cupom com menos de 100% (pré-acesso é só para 100%).
--   9. LGPD: os pedidos entram no "baixar meus dados". Ao excluir a conta, o pedido fica sem dono
--      (user_id vira nulo): o registro financeiro não é apagado.
--
-- Nenhum dado de cartão existe aqui: o pagamento acontece na página do Mercado Pago.
-- ============================================================================

begin;

-- 1. Pedidos ------------------------------------------------------------------------

create table if not exists private.orders (
  id                     uuid primary key default gen_random_uuid(),
  -- Nulo depois que a conta é excluída (o registro financeiro fica).
  user_id                uuid references auth.users (id) on delete set null,
  status                 text not null default 'pendente'
                           check (status in ('pendente', 'pago', 'cancelado', 'expirado', 'reembolsado')),
  total_cents            integer not null check (total_cents between 1 and 100000000),
  currency               text not null default 'BRL' check (currency = 'BRL'),
  provider               text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_preference_id text check (provider_preference_id is null or provider_preference_id ~ '^[0-9A-Za-z_-]{1,100}$'),
  -- Só endereços do Mercado Pago (o Postgres limita repetições a 255 em regex, por isso o tamanho é conferido à parte).
  checkout_url           text check (checkout_url is null or (length(checkout_url) <= 600
                           and checkout_url ~ '^https://([a-z0-9-]+\.)*mercadopago\.com(\.br)?/[^[:space:]]*$')),
  provider_payment_id    text check (provider_payment_id is null or provider_payment_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  expires_at             timestamptz not null,
  paid_at                timestamptz,
  refunded_at            timestamptz
);
comment on table private.orders is 'Pedidos de compra de cursos. Só as funções do banco leem e gravam.';
create index if not exists orders_user on private.orders (user_id, created_at desc);
-- Um pagamento do Mercado Pago só pode "fechar" um pedido.
create unique index if not exists orders_payment_unique on private.orders (provider, provider_payment_id) where provider_payment_id is not null;
alter table private.orders enable row level security;
revoke all on table private.orders from public, anon, authenticated, service_role;

create table if not exists private.order_items (
  order_id    uuid not null references private.orders (id) on delete cascade,
  course_id   text not null,
  title       text not null,
  price_cents integer not null check (price_cents between 1 and 10000000),
  position    integer not null,
  primary key (order_id, course_id)
);
comment on table private.order_items is 'Foto dos cursos do pedido (título e preço na hora da compra).';
alter table private.order_items enable row level security;
revoke all on table private.order_items from public, anon, authenticated, service_role;

-- Registro de tudo o que o webhook aplicou (e do que foi recusado). É o histórico de auditoria dos pagamentos.
create table if not exists private.payment_events (
  id                  bigint generated always as identity primary key,
  provider            text not null default 'mercadopago',
  provider_payment_id text not null check (provider_payment_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  order_id            uuid,
  status              text not null,
  amount_cents        integer,
  currency            text,
  result              text not null,
  received_at         timestamptz not null default now()
);
create index if not exists payment_events_payment on private.payment_events (provider, provider_payment_id);
alter table private.payment_events enable row level security;
revoke all on table private.payment_events from public, anon, authenticated, service_role;

-- 2. Acesso comprado aponta para o pedido ------------------------------------------------

alter table public.course_access add column if not exists order_id uuid references private.orders (id) on delete set null;
create index if not exists course_access_order on public.course_access (order_id) where order_id is not null;

-- 3. Quem JÁ POSSUI o curso (compra ou liberação manual). Pré-acesso de cupom não conta. --------

create or replace function private.user_owns_course(p_user uuid, p_course text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.course_access a
     where a.user_id = p_user
       and a.course_id = p_course
       and a.source in ('compra', 'manual')
       and (a.expires_at is null or a.expires_at > now()))
$$;
revoke execute on function private.user_owns_course(uuid, text) from public, anon, authenticated, service_role;

-- 4. Carrinho: pré-acesso de cupom não impede a compra; cupom parcial não libera pré-acesso ---------------

-- (Igual ao da migration do cupom, trocando só "já possui": agora conta compra ou liberação manual.)
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
        when private.user_owns_course(p_user, cr.id) then 'ja_possui'
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

revoke execute on function private.cart_quote(uuid, text[], text) from public, anon, authenticated, service_role;

-- (Igual ao da migration do cupom, acrescentando só a trava dos 100%.)
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
  -- Pré-acesso gratuito é só para cupom de 100%. Cupom parcial (se um dia existir) dá desconto na compra,
  -- nunca o curso de graça. (A mensagem é uma das que a tela já aceita.)
  if (q ->> 'percentOff')::int < 100 then
    raise exception 'Este cupom não existe ou não é válido.' using errcode = 'FC422';
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

-- 5. LGPD: os pedidos entram no "baixar meus dados" (igual ao da migration do cupom + "pedidos") -------------

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

-- 6. Pedido: o banco recalcula tudo --------------------------------------------------------

-- Cria o pedido do carrinho da conta que está logada (ou devolve o pedido em aberto, se for o mesmo
-- carrinho com os mesmos preços). Sem cupom: o cupom de lançamento libera pré-acesso por outro caminho.
-- Erros com código FC422 têm a mensagem pronta para a tela.
create or replace function public.create_order(p_course_ids text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  q jsonb;
  v_total bigint;
  v_signature text[];
  o private.orders%rowtype;
begin
  if uid is null or not private.not_suspended() then
    raise exception 'Faça login para continuar.' using errcode = 'FA403';
  end if;
  if p_course_ids is null or cardinality(p_course_ids) = 0 then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('order:' || uid::text, 0));

  q := private.cart_quote(uid, p_course_ids, null);
  if jsonb_array_length(q -> 'items') = 0 then
    raise exception 'Nenhum curso do carrinho está à venda.' using errcode = 'FC422';
  end if;
  v_total := (q ->> 'totalCents')::bigint;
  if v_total < 1 or v_total > 100000000 then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;

  update private.orders set status = 'expirado', updated_at = now()
   where user_id = uid and status = 'pendente' and expires_at <= now();

  -- Mesmo carrinho, mesmos preços, ainda em aberto: reaproveita (não cria outro link de pagamento).
  select array_agg((x ->> 'courseId') || ':' || (x ->> 'priceCents') order by x ->> 'courseId') into v_signature
    from jsonb_array_elements(q -> 'items') x;
  select ord.* into o from private.orders ord
   where ord.user_id = uid and ord.status = 'pendente' and ord.total_cents = v_total
     and (select array_agg(i.course_id || ':' || i.price_cents order by i.course_id)
            from private.order_items i where i.order_id = ord.id) = v_signature
   order by ord.created_at desc limit 1;

  if not found then
    -- Carrinho diferente: o pedido aberto antigo sai de cena. Se ele ainda for pago no Mercado Pago, o
    -- pagamento continua valendo (apply_payment libera mesmo assim: o dinheiro entrou).
    update private.orders set status = 'cancelado', updated_at = now() where user_id = uid and status = 'pendente';
    insert into private.orders (user_id, total_cents, expires_at)
    values (uid, v_total, now() + interval '2 days')
    returning * into o;
    insert into private.order_items (order_id, course_id, title, price_cents, position)
    select o.id, x ->> 'courseId', x ->> 'title', (x ->> 'priceCents')::int, (n - 1)::int
      from jsonb_array_elements(q -> 'items') with ordinality as t(x, n);
    perform private.audit('pedido.criado', uid, 'Pedido ' || o.id || ' · ' || jsonb_array_length(q -> 'items') || ' curso(s)');
  end if;

  return jsonb_build_object(
    'orderId', o.id,
    'totalCents', o.total_cents,
    'checkoutUrl', o.checkout_url,
    'items', (select jsonb_agg(jsonb_build_object('courseId', i.course_id, 'title', i.title, 'priceCents', i.price_cents) order by i.position)
                from private.order_items i where i.order_id = o.id));
end;
$$;

-- Guarda o link de pagamento criado no Mercado Pago. O primeiro link gravado vale (duas abas ao mesmo tempo
-- não geram dois links). O endereço é conferido: só mercadopago.com / mercadopago.com.br (a regra também
-- está na tabela).
create or replace function public.attach_order_checkout(p_order uuid, p_preference_id text, p_url text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_url text;
begin
  if uid is null or not private.not_suspended() then
    raise exception 'Faça login para continuar.' using errcode = 'FA403';
  end if;
  if p_order is null or p_preference_id is null or p_url is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  update private.orders
     set provider_preference_id = p_preference_id, checkout_url = p_url, updated_at = now()
   where id = p_order and user_id = uid and status = 'pendente' and checkout_url is null
  returning checkout_url into v_url;
  if v_url is null then
    select o.checkout_url into v_url from private.orders o where o.id = p_order and o.user_id = uid and o.status = 'pendente';
  end if;
  if v_url is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  return jsonb_build_object('checkoutUrl', v_url);
end;
$$;

-- Status do PRÓPRIO pedido (página de retorno do pagamento).
create or replace function public.order_status(p_order uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', o.status,
    'totalCents', o.total_cents,
    'paidAt', o.paid_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('courseId', i.course_id, 'title', i.title) order by i.position), '[]'::jsonb)
                from private.order_items i where i.order_id = o.id))
    from private.orders o
   where o.id = p_order and o.user_id = auth.uid() and auth.uid() is not null and private.not_suspended()
$$;

-- 7. Confirmação de pagamento (SÓ service_role) ----------------------------------------------

-- Quem chama (a rota do webhook) já validou a assinatura da notificação E consultou o pagamento na API do
-- Mercado Pago: os valores abaixo vêm de lá, nunca do corpo da notificação. Mesmo assim o banco confere tudo:
--   * valor e moeda iguais aos do pedido (senão não libera nada);
--   * idempotente: o mesmo pagamento de novo não muda nada; outro pagamento para um pedido já pago é registrado
--     como "pagamento_duplicado" (precisa de reembolso manual) e não libera de novo;
--   * estorno ou chargeback do pagamento que fechou o pedido tira o acesso comprado.
-- Devolve {result: ...}. Pedido inexistente NÃO é erro (a notificação não deve ficar sendo reenviada).
create or replace function public.apply_payment(p_order uuid, p_payment_id text, p_status text, p_amount_cents integer, p_currency text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o private.orders%rowtype;
  v_result text;
begin
  if p_order is null or p_payment_id is null or p_payment_id !~ '^[0-9A-Za-z_-]{1,64}$'
     or p_status is null or p_status !~ '^[a-z_]{1,40}$'
     or p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > 2000000000 then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;

  select * into o from private.orders where id = p_order for update;
  if not found then
    insert into private.payment_events (provider_payment_id, order_id, status, amount_cents, currency, result)
    values (p_payment_id, p_order, p_status, p_amount_cents, left(p_currency, 8), 'pedido_inexistente');
    return jsonb_build_object('result', 'pedido_inexistente');
  end if;

  if p_status = 'approved' then
    if p_currency is distinct from 'BRL' or p_amount_cents <> o.total_cents then
      v_result := 'valor_divergente';
    elsif o.status = 'pago' then
      v_result := case when o.provider_payment_id = p_payment_id then 'ja_processado' else 'pagamento_duplicado' end;
    elsif o.status in ('pendente', 'expirado', 'cancelado') then
      -- "expirado" e "cancelado" são só controle nosso: se o dinheiro entrou, o aluno recebe o curso.
      if o.user_id is null then
        v_result := 'sem_conta';
      else
        insert into public.course_access (user_id, course_id, source, order_id)
        select o.user_id, i.course_id, 'compra', o.id
          from private.order_items i join public.courses c on c.id = i.course_id
         where i.order_id = o.id
        on conflict (user_id, course_id, source) do nothing;
        update private.orders
           set status = 'pago', paid_at = now(), provider_payment_id = p_payment_id, updated_at = now()
         where id = o.id;
        v_result := 'liberado';
      end if;
    else
      v_result := 'ignorado_' || o.status;
    end if;
  elsif p_status in ('refunded', 'charged_back') then
    if o.status = 'pago' and o.provider_payment_id = p_payment_id then
      delete from public.course_access where order_id = o.id and source = 'compra';
      update private.orders set status = 'reembolsado', refunded_at = now(), updated_at = now() where id = o.id;
      v_result := 'revogado';
    else
      v_result := 'ignorado';
    end if;
  else
    -- pending, in_process, rejected, cancelled...: nada a fazer (o pedido segue como está).
    v_result := 'sem_efeito';
  end if;

  insert into private.payment_events (provider_payment_id, order_id, status, amount_cents, currency, result)
  values (p_payment_id, o.id, p_status, p_amount_cents, left(p_currency, 8), v_result);
  return jsonb_build_object('result', v_result, 'orderId', o.id);
end;
$$;

-- 8. Permissões ----------------------------------------------------------------------

revoke execute on function public.create_order(text[]), public.attach_order_checkout(uuid, text, text), public.order_status(uuid)
  from public, anon, service_role;
grant execute on function public.create_order(text[]), public.attach_order_checkout(uuid, text, text), public.order_status(uuid)
  to authenticated;

-- A confirmação de pagamento: NINGUÉM da API além do service_role (a chave secreta fica só na rota do webhook).
revoke execute on function public.apply_payment(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.apply_payment(uuid, text, text, integer, text) to service_role;

commit;
