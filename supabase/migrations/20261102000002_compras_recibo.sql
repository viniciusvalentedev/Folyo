-- Minhas compras e e-mail de recibo
--
-- Roda DEPOIS de 20261102000001_pagamentos.sql. Pode rodar de novo sem problema. Não apaga nada.
--
--   1. my_orders(): o aluno lê as PRÓPRIAS compras (pagas, estornadas e o pagamento ainda aberto).
--   2. Controle do e-mail de recibo: o recibo sai UMA vez por pedido pago, mesmo que o Mercado Pago avise várias vezes
--      ou que dois avisos cheguem ao mesmo tempo. Quem usa é o webhook (só o service_role).

begin;

-- ---------------------------------------------------------------------------
-- 1. Controle do recibo
-- ---------------------------------------------------------------------------
-- claimed = alguém está mandando agora (ou tentou); sent = o provedor de e-mail aceitou a mensagem.
alter table private.orders add column if not exists receipt_claimed_at timestamptz;
alter table private.orders add column if not exists receipt_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. my_orders: as compras da pessoa logada
-- ---------------------------------------------------------------------------
-- Mostra: pagas, estornadas e o pagamento ainda em aberto (com o link para continuar). Pedido cancelado ou vencido não
-- aparece: o aluno nunca pagou por ele. O link de pagamento só vai para quem está com o pedido em aberto e dentro do prazo.
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
               'checkoutUrl', case when o.status = 'pendente' then o.checkout_url end,
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
revoke execute on function public.my_orders() from public, anon;
grant execute on function public.my_orders() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Recibo por e-mail (só o service_role, chamado pelo webhook)
-- ---------------------------------------------------------------------------
-- Reserva o envio do recibo de um pedido PAGO e devolve o que o e-mail precisa. Devolve nulo quando não há o que
-- enviar: pedido que não está pago, sem dono, recibo já enviado ou outro aviso enviando agora (a reserva vale 10 minutos,
-- para um envio que travou poder ser refeito).
create or replace function public.claim_order_receipt(p_order uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o private.orders%rowtype;
begin
  update private.orders
     set receipt_claimed_at = now()
   where id = p_order
     and status = 'pago'
     and user_id is not null
     and receipt_sent_at is null
     and (receipt_claimed_at is null or receipt_claimed_at < now() - interval '10 minutes')
  returning * into o;
  if not found then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'orderId', o.id,
      'email', u.email,
      'name', (select pr.name from public.profiles pr where pr.id = o.user_id),
      'totalCents', o.total_cents,
      'paidAt', o.paid_at,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('courseId', i.course_id, 'title', i.title, 'priceCents', i.price_cents)
                                           order by i.position), '[]'::jsonb)
                  from private.order_items i where i.order_id = o.id))
      from auth.users u
     where u.id = o.user_id
  );
end;
$$;
revoke execute on function public.claim_order_receipt(uuid) from public, anon, authenticated;
grant execute on function public.claim_order_receipt(uuid) to service_role;

-- Fecha a reserva: enviado = o recibo está feito; não enviado = libera para uma nova tentativa (no próximo aviso).
create or replace function public.finish_order_receipt(p_order uuid, p_sent boolean)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update private.orders
     set receipt_sent_at = case when p_sent then now() else receipt_sent_at end,
         receipt_claimed_at = case when p_sent then receipt_claimed_at else null end
   where id = p_order and status in ('pago', 'reembolsado') and receipt_sent_at is null
$$;
revoke execute on function public.finish_order_receipt(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_order_receipt(uuid, boolean) to service_role;

commit;
