-- ============================================================================
-- Folyo · Estorno pelo painel (botão "Estornar" na ficha do aluno)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS de 20261102000001_pagamentos.sql, 20261102000002_compras_recibo.sql e 20261102000003_pagamento_transparente.sql.
-- Pode rodar ANTES ou DEPOIS de publicar o código: sem este SQL o painel só não mostra as compras do aluno.
-- Tudo roda numa transação. Pode ser rodado de novo. NÃO apaga cursos, usuários, pedidos nem acessos.
--
-- O que muda:
--   1. admin_user_orders(aluno): as compras pagas e estornadas de um aluno, para a ficha dele no painel.
--      Só administrador ou proprietário (com a verificação em duas etapas), como o resto do painel.
--   2. admin_refund_begin(pedido, motivo): ANTES de o servidor pedir o estorno ao Mercado Pago, o banco confere o papel,
--      confere que o pedido está pago pelo site, descobre qual é a ordem dele no Mercado Pago e registra no histórico
--      do painel QUEM pediu o estorno e por quê. Não estorna nada sozinho: o dinheiro só volta pelo Mercado Pago.
--
-- Quem tira o acesso do aluno continua sendo apply_payment (SÓ service_role), chamado depois que o servidor lê o
-- estorno na API do Mercado Pago, exatamente como acontece quando o estorno é feito no painel deles.
-- ============================================================================

begin;

-- 1. Compras de um aluno (administrador ou acima) ----------------------------------------------

create or replace function public.admin_user_orders(p_user uuid)
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
             'id', o.id,
             'status', o.status,
             'totalCents', o.total_cents,
             'createdAt', o.created_at,
             'paidAt', o.paid_at,
             'refundedAt', o.refunded_at,
             -- Só dá para estornar pelo site o que foi pago por ele (tem o pagamento do Mercado Pago gravado).
             'refundable', (o.status = 'pago' and o.provider_payment_id is not null),
             'items', (select coalesce(jsonb_agg(jsonb_build_object('courseId', i.course_id, 'title', i.title, 'priceCents', i.price_cents)
                                                 order by i.position), '[]'::jsonb)
                         from private.order_items i where i.order_id = o.id))
           order by o.created_at desc)
      from (select * from private.orders x
             where x.user_id = p_user and x.status in ('pago', 'reembolsado')
             order by x.created_at desc
             limit 50) o), '[]'::jsonb);
end;
$$;

-- 2. Pedir o estorno de uma compra (administrador ou acima) --------------------------------------

-- Devolve o necessário para o servidor falar com o Mercado Pago. Erros FA... têm a mensagem pronta para a tela.
create or replace function public.admin_refund_begin(p_order uuid, p_reason text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  o private.orders%rowtype;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_provider_order text;
begin
  if p_order is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();

  select * into o from private.orders where id = p_order for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'FA404';
  end if;
  if o.status = 'reembolsado' then
    raise exception 'Este pedido já foi estornado.' using errcode = 'FA409';
  end if;
  if o.status <> 'pago' or o.provider_payment_id is null then
    raise exception 'Só dá para estornar aqui um pedido pago pelo site.' using errcode = 'FA400';
  end if;
  -- Conta já excluída: não há ficha nem histórico onde registrar. Esse caso é resolvido direto no Mercado Pago.
  if o.user_id is null then
    raise exception 'A conta deste pedido foi excluída. Estorne pelo painel do Mercado Pago.' using errcode = 'FA400';
  end if;

  -- A ordem do Mercado Pago deste pagamento: a tentativa que guardou o mesmo pagamento (ou a aprovada).
  select a.provider_order_id into v_provider_order
    from private.payment_attempts a
   where a.order_id = o.id
     and a.provider_order_id is not null
     and (a.provider_payment_id = o.provider_payment_id or a.status = 'aprovado')
   order by (a.provider_payment_id = o.provider_payment_id) desc nulls last, a.created_at desc
   limit 1;
  if v_provider_order is null then
    raise exception 'Não achamos este pagamento no Mercado Pago. Estorne pelo painel do Mercado Pago.' using errcode = 'FA404';
  end if;

  -- Registrado ANTES de falar com o Mercado Pago: se o estorno der certo e a tela falhar, o histórico já diz quem pediu.
  perform private.audit('pedido.estorno', o.user_id,
    'Estorno solicitado · pedido ' || upper(left(o.id::text, 8)) || ' · R$ ' || (o.total_cents / 100) || ',' || lpad((o.total_cents % 100)::text, 2, '0')
    || case when v_reason <> '' then ' · ' || v_reason else '' end);

  return jsonb_build_object(
    'orderId', o.id,
    'providerOrderId', v_provider_order,
    'totalCents', o.total_cents);
end;
$$;

-- 3. Permissões -------------------------------------------------------------------------

revoke execute on function public.admin_user_orders(uuid), public.admin_refund_begin(uuid, text) from public, anon, service_role;
grant execute on function public.admin_user_orders(uuid), public.admin_refund_begin(uuid, text) to authenticated;

commit;
