-- ============================================================================
-- Folyo · Checkout Transparente (pagamento DENTRO do site: cartão e Pix)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS de 20261102000001_pagamentos.sql e 20261102000002_compras_recibo.sql, e depois de publicar o código
-- novo. Tudo roda numa transação. Pode ser rodado de novo. NÃO apaga cursos, usuários, pedidos nem acessos.
--
-- O que muda:
--   1. private.payment_attempts: cada tentativa de pagar um pedido (cartão ou Pix) fica registrada, com o estado dela.
--      Fora da API: ninguém lê nem grava direto.
--   2. begin_payment_attempt: ANTES de falar com o Mercado Pago, o banco confere que o pedido é da pessoa logada, está em
--      aberto e não venceu, e aplica os limites contra "teste de cartões roubados" (por pedido e por pessoa/hora). Também
--      impede um segundo pagamento enquanto há um em andamento (evita cobrança dupla). O VALOR vem do pedido no banco,
--      nunca do navegador.
--   3. record_payment_attempt / settle_payment_attempt: gravam o que o Mercado Pago respondeu e o que ele avisou depois.
--      SÓ o service_role executa (a chave secreta do Supabase, usada só no servidor).
--   4. payment_attempt_ref: o servidor descobre o pedido do Mercado Pago da tentativa para reconsultar o pagamento.
--      order_status e my_orders: mostram o estado do pagamento (e o Pix em aberto) só para o dono do pedido.
--   5. attach_order_checkout (link do Checkout Pro) é removida: o pagamento não sai mais do site.
--
-- Nenhum dado de cartão e nenhum CPF existe aqui. O cartão vai do navegador direto para o Mercado Pago (campos
-- seguros deles) e vira um token de uso único; o CPF só passa pelo servidor, a caminho do Mercado Pago.
-- ============================================================================

begin;

-- 1. Tentativas de pagamento ----------------------------------------------------------

create table if not exists private.payment_attempts (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references private.orders (id) on delete cascade,
  -- Nulo depois que a conta é excluída (o registro fica, como o pedido).
  user_id             uuid references auth.users (id) on delete set null,
  method              text not null check (method in ('cartao', 'pix')),
  installments        smallint not null default 1 check (installments between 1 and 12),
  -- criando = o servidor está falando com o Mercado Pago agora; processando = em análise; aguardando_acao = o banco
  -- pede a confirmação do cartão (3D Secure); aguardando_pix = QR code gerado; o resto são estados finais.
  -- erro = nem chegamos a ter resposta (Mercado Pago fora do ar); não conta nos limites.
  status              text not null default 'criando'
                        check (status in ('criando', 'processando', 'aguardando_acao', 'aguardando_pix',
                                          'aprovado', 'recusado', 'cancelado', 'expirado', 'reembolsado', 'erro')),
  -- Código do Mercado Pago (ex.: rejected_by_issuer). A tela traduz para uma frase.
  status_detail       text check (status_detail is null or status_detail ~ '^[0-9A-Za-z_]{1,80}$'),
  provider_order_id   text check (provider_order_id is null or provider_order_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  provider_payment_id text check (provider_payment_id is null or provider_payment_id ~ '^[0-9A-Za-z_-]{1,64}$'),
  -- Enquanto isto estiver no futuro e o estado for "em aberto", NÃO se começa outro pagamento do mesmo pedido.
  open_until          timestamptz not null,
  pix_code            text check (pix_code is null or (length(pix_code) between 20 and 1024 and pix_code !~ '[[:cntrl:]]')),
  pix_qr_base64       text check (pix_qr_base64 is null or (length(pix_qr_base64) between 20 and 30000 and pix_qr_base64 ~ '^[A-Za-z0-9+/]+=*$')),
  pix_ticket_url      text check (pix_ticket_url is null or (length(pix_ticket_url) <= 600
                        and pix_ticket_url ~ '^https://([a-z0-9-]+\.)*mercadopago\.com(\.br)?/[^[:space:]]*$')),
  pix_expires_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table private.payment_attempts is 'Tentativas de pagamento (cartão ou Pix) dos pedidos. Só as funções do banco leem e gravam.';
create unique index if not exists payment_attempts_provider_order on private.payment_attempts (provider_order_id) where provider_order_id is not null;
create index if not exists payment_attempts_order on private.payment_attempts (order_id, created_at desc);
create index if not exists payment_attempts_user on private.payment_attempts (user_id, created_at desc);
alter table private.payment_attempts enable row level security;
revoke all on table private.payment_attempts from public, anon, authenticated, service_role;

-- 2. Começar uma tentativa (a pessoa logada) --------------------------------------------

-- Devolve o que o servidor precisa para falar com o Mercado Pago: valor e itens DO PEDIDO (do banco), e o e-mail da conta.
-- Se já existe um Pix em aberto deste pedido, e a pessoa pediu Pix de novo, devolve o mesmo Pix (reused = true) em vez de
-- criar outro. Qualquer outro pagamento em andamento barra a tentativa. Erros FC422 têm a mensagem pronta para a tela.
create or replace function public.begin_payment_attempt(p_order uuid, p_method text, p_installments integer default 1)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  o private.orders%rowtype;
  open_a private.payment_attempts%rowtype;
  v_installments int := coalesce(p_installments, 1);
  v_id uuid;
  v_email text;
  v_items jsonb;
begin
  if uid is null or not private.not_suspended() then
    raise exception 'Faça login para continuar.' using errcode = 'FA403';
  end if;
  if p_order is null or p_method is null or p_method not in ('cartao', 'pix') then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  if p_method = 'pix' then
    v_installments := 1;
  elsif v_installments < 1 or v_installments > 12 then
    raise exception 'Escolha um parcelamento válido.' using errcode = 'FC422';
  end if;
  perform private.count_write();
  -- Mesma trava do create_order: dois cliques ou duas abas não passam ao mesmo tempo.
  perform pg_advisory_xact_lock(hashtextextended('order:' || uid::text, 0));

  select * into o from private.orders where id = p_order and user_id = uid for update;
  if not found then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  if o.status = 'pago' then
    raise exception 'Este pedido já foi pago.' using errcode = 'FC422';
  end if;
  -- (Pedido vencido: quem marca como expirado é o create_order; aqui só se recusa.)
  if o.status <> 'pendente' or o.expires_at <= now() then
    raise exception 'Este pedido não está mais disponível. Volte ao carrinho e tente de novo.' using errcode = 'FC422';
  end if;
  -- Acesso concedido depois que o pedido foi criado (outra compra, liberação manual): não cobra duas vezes.
  if exists (select 1 from private.order_items i where i.order_id = o.id and private.user_owns_course(uid, i.course_id)) then
    raise exception 'Você já possui um dos cursos deste pedido.' using errcode = 'FC422';
  end if;

  select * into open_a from private.payment_attempts a
   where a.order_id = o.id
     and a.status in ('criando', 'processando', 'aguardando_acao', 'aguardando_pix')
     and a.open_until > now()
   order by a.created_at desc limit 1;
  if found then
    if p_method = 'pix' and open_a.method = 'pix' and open_a.status = 'aguardando_pix' and open_a.pix_code is not null then
      return jsonb_build_object(
        'reused', true,
        'attemptId', open_a.id,
        'orderId', o.id,
        'totalCents', o.total_cents,
        'pix', jsonb_build_object('code', open_a.pix_code, 'qrBase64', open_a.pix_qr_base64,
                                  'ticketUrl', open_a.pix_ticket_url, 'expiresAt', open_a.pix_expires_at));
    end if;
    raise exception 'Já existe um pagamento em andamento para este pedido. Aguarde a confirmação.' using errcode = 'FC422';
  end if;

  -- Limites contra teste de cartões (o golpe mais comum em checkout próprio). "erro" (Mercado Pago fora do ar) não conta.
  if p_method = 'cartao' then
    if (select count(*) from private.payment_attempts a where a.order_id = o.id and a.method = 'cartao' and a.status <> 'erro') >= 5 then
      raise exception 'Você atingiu o limite de tentativas com cartão neste pedido. Tente pagar com Pix ou fale com o suporte.' using errcode = 'FC422';
    end if;
    if (select count(*) from private.payment_attempts a
         where a.user_id = uid and a.method = 'cartao' and a.status <> 'erro' and a.created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Muitas tentativas de pagamento em pouco tempo. Aguarde um pouco e tente de novo.' using errcode = 'FC422';
    end if;
  end if;
  if (select count(*) from private.payment_attempts a
       where a.user_id = uid and a.status <> 'erro' and a.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Muitas tentativas de pagamento em pouco tempo. Aguarde um pouco e tente de novo.' using errcode = 'FC422';
  end if;

  insert into private.payment_attempts (order_id, user_id, method, installments, open_until)
  values (o.id, uid, p_method, v_installments, now() + interval '2 minutes')
  returning id into v_id;

  select u.email into v_email from auth.users u where u.id = uid;
  select coalesce(jsonb_agg(jsonb_build_object('courseId', i.course_id, 'title', i.title, 'priceCents', i.price_cents) order by i.position), '[]'::jsonb)
    into v_items from private.order_items i where i.order_id = o.id;

  return jsonb_build_object(
    'reused', false,
    'attemptId', v_id,
    'orderId', o.id,
    'totalCents', o.total_cents,
    'installments', v_installments,
    'email', v_email,
    'items', v_items);
end;
$$;

-- 3. Gravar o que o Mercado Pago respondeu (SÓ service_role) --------------------------------

-- Chamada logo depois de criar o pagamento no Mercado Pago. Grava só uma vez por tentativa (a tentativa precisa estar em
-- "criando"). p_open_minutes = por quanto tempo este estado barra um novo pagamento (estados finais ignoram).
create or replace function public.record_payment_attempt(
  p_attempt uuid,
  p_status text,
  p_status_detail text,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_open_minutes integer,
  p_pix_code text default null,
  p_pix_qr_base64 text default null,
  p_pix_ticket_url text default null,
  p_pix_expires_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_open boolean;
  a private.payment_attempts%rowtype;
begin
  if p_attempt is null or p_status is null
     or p_status not in ('processando', 'aguardando_acao', 'aguardando_pix', 'aprovado', 'recusado', 'cancelado', 'expirado', 'erro') then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  v_open := p_status in ('processando', 'aguardando_acao', 'aguardando_pix');

  update private.payment_attempts
     set status = p_status,
         status_detail = p_status_detail,
         provider_order_id = p_provider_order_id,
         provider_payment_id = p_provider_payment_id,
         open_until = case when v_open then now() + make_interval(mins => least(greatest(coalesce(p_open_minutes, 5), 1), 2880)) else now() end,
         pix_code = p_pix_code,
         pix_qr_base64 = p_pix_qr_base64,
         pix_ticket_url = p_pix_ticket_url,
         pix_expires_at = p_pix_expires_at,
         updated_at = now()
   where id = p_attempt and status = 'criando'
  returning * into a;
  if not found then
    return jsonb_build_object('result', 'ignorado');
  end if;
  return jsonb_build_object('result', 'gravado', 'orderId', a.order_id, 'status', a.status);
end;
$$;

-- O Mercado Pago avisou (webhook) ou nós consultamos de novo: atualiza o estado da tentativa que tem aquele pedido do
-- Mercado Pago. Um pagamento aprovado nunca "volta atrás" (só pode virar reembolsado) e reembolso é final.
-- Devolve o pedido da tentativa (ou nulo se não conhecemos aquele pedido do Mercado Pago).
create or replace function public.settle_payment_attempt(p_provider_order_id text, p_status text, p_status_detail text, p_provider_payment_id text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a private.payment_attempts%rowtype;
  v_open boolean;
begin
  if p_provider_order_id is null or p_provider_order_id !~ '^[0-9A-Za-z_-]{1,64}$' or p_status is null
     or p_status not in ('processando', 'aguardando_acao', 'aguardando_pix', 'aprovado', 'recusado', 'cancelado', 'expirado', 'reembolsado') then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  v_open := p_status in ('processando', 'aguardando_acao', 'aguardando_pix');

  select * into a from private.payment_attempts where provider_order_id = p_provider_order_id for update;
  if not found then
    return jsonb_build_object('orderId', null);
  end if;
  if a.status = 'reembolsado' or (a.status = 'aprovado' and p_status not in ('aprovado', 'reembolsado')) then
    return jsonb_build_object('orderId', a.order_id, 'status', a.status);
  end if;

  update private.payment_attempts
     set status = p_status,
         status_detail = p_status_detail,
         provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
         -- Estado em aberto mantém o prazo que já tinha; estado final libera na hora.
         open_until = case when v_open then greatest(open_until, now() + interval '5 minutes') else now() end,
         updated_at = now()
   where id = a.id;
  return jsonb_build_object('orderId', a.order_id, 'status', p_status);
end;
$$;

-- Qual é o pedido do Mercado Pago da última tentativa deste pedido (o servidor reconsulta o pagamento nele quando a pessoa
-- pede para conferir). Só devolve se o pedido for MESMO da pessoa informada, que o servidor já autenticou. SÓ service_role.
create or replace function public.payment_attempt_ref(p_order uuid, p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('providerOrderId', a.provider_order_id, 'status', a.status)
    from private.payment_attempts a
    join private.orders o on o.id = a.order_id
   where a.order_id = p_order and o.user_id = p_user and p_user is not null and a.provider_order_id is not null
   order by a.created_at desc
   limit 1
$$;

-- 4. O que a pessoa vê do PRÓPRIO pedido ---------------------------------------------------

-- Igual ao da migration de pagamentos, acrescentando o prazo do pedido e a última tentativa de pagamento.
-- O Pix só aparece enquanto está em aberto.
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
    'expiresAt', o.expires_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('courseId', i.course_id, 'title', i.title, 'priceCents', i.price_cents) order by i.position), '[]'::jsonb)
                from private.order_items i where i.order_id = o.id),
    'attempt', (
      select jsonb_build_object(
        'method', a.method,
        'status', a.status,
        'statusDetail', a.status_detail,
        'open', (a.status in ('criando', 'processando', 'aguardando_acao', 'aguardando_pix') and a.open_until > now()),
        'pix', case when a.status = 'aguardando_pix' and a.open_until > now() and a.pix_code is not null
                    then jsonb_build_object('code', a.pix_code, 'qrBase64', a.pix_qr_base64, 'ticketUrl', a.pix_ticket_url, 'expiresAt', a.pix_expires_at) end)
        from private.payment_attempts a
       where a.order_id = o.id
       order by a.created_at desc limit 1))
    from private.orders o
   where o.id = p_order and o.user_id = auth.uid() and auth.uid() is not null and private.not_suspended()
$$;

-- Minhas compras: igual ao da migration do recibo, trocando o link do Checkout Pro pelo estado do pagamento em aberto.
create or replace function public.my_orders()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(payload order by sort_at desc), '[]'::jsonb)
    from (
      select o.created_at as sort_at,
             jsonb_build_object(
               'id', o.id,
               'status', o.status,
               'totalCents', o.total_cents,
               'createdAt', o.created_at,
               'paidAt', o.paid_at,
               'refundedAt', o.refunded_at,
               'payment', case when o.status = 'pendente' then (
                   select jsonb_build_object('method', a.method, 'status', a.status, 'until', a.open_until)
                     from private.payment_attempts a
                    where a.order_id = o.id
                      and a.status in ('criando', 'processando', 'aguardando_acao', 'aguardando_pix')
                      and a.open_until > now()
                    order by a.created_at desc limit 1) end,
               'items', (select coalesce(jsonb_agg(jsonb_build_object('courseId', i.course_id, 'title', i.title, 'priceCents', i.price_cents)
                                                   order by i.position), '[]'::jsonb)
                           from private.order_items i where i.order_id = o.id)
             ) as payload
        from private.orders o
       where o.user_id = auth.uid()
         and auth.uid() is not null
         and private.not_suspended()
         and (o.status in ('pago', 'reembolsado') or (o.status = 'pendente' and o.expires_at > now()))
       order by o.created_at desc
       limit 100
    ) t
$$;

-- 5. O link do Checkout Pro não existe mais ------------------------------------------------

drop function if exists public.attach_order_checkout(uuid, text, text);

-- 6. Permissões -------------------------------------------------------------------------

revoke execute on function public.begin_payment_attempt(uuid, text, integer) from public, anon, service_role;
grant execute on function public.begin_payment_attempt(uuid, text, integer) to authenticated;

revoke execute on function public.record_payment_attempt(uuid, text, text, text, text, integer, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_payment_attempt(uuid, text, text, text, text, integer, text, text, text, timestamptz) to service_role;

revoke execute on function public.settle_payment_attempt(text, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_payment_attempt(text, text, text, text) to service_role;

revoke execute on function public.payment_attempt_ref(uuid, uuid) from public, anon, authenticated;
grant execute on function public.payment_attempt_ref(uuid, uuid) to service_role;

revoke execute on function public.order_status(uuid), public.my_orders() from public, anon, service_role;
grant execute on function public.order_status(uuid), public.my_orders() to authenticated;

commit;
