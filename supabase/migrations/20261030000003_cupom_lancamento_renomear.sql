-- Cupom de lançamento: FOLYO100 → LANCAMENTO --------------------------------------------------
-- Troca o código do cupom de lançamento. Pode ser rodado de novo sem problema.
--
--  * O cupom novo nasce com as MESMAS regras do antigo (desconto, dias de pré-acesso, ligado ou
--    desligado, datas e limite de usos). Se o antigo não existir, vale o padrão: 100%, 30 dias.
--  * Quem já resgatou o FOLYO100 NÃO perde nada: os pré-acessos já liberados passam para o código novo
--    (mesmos cursos e mesma data de validade) e continuam contando no limite de usos.
--  * O código antigo deixa de existir: digitar FOLYO100 no carrinho passa a dar "cupom não existe".
--  * As funções que ligam/desligam a promoção e mostram o estado dela passam a olhar o código novo.
-- Os registros do painel (histórico) que citam FOLYO100 continuam como foram escritos.
-- ------------------------------------------------------------------------------------------------

begin;

insert into private.coupons (code, percent_off, active, starts_at, ends_at, access_days, max_redemptions)
select 'LANCAMENTO', percent_off, active, starts_at, ends_at, access_days, max_redemptions
  from private.coupons
 where code = 'FOLYO100'
on conflict (code) do nothing;

-- Instalação que nunca teve o código antigo: cria o cupom com o padrão.
insert into private.coupons (code, percent_off, access_days) values ('LANCAMENTO', 100, 30) on conflict (code) do nothing;

update public.course_access set coupon_code = 'LANCAMENTO' where coupon_code = 'FOLYO100';

delete from private.coupons where code = 'FOLYO100';

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
   where k.code = 'LANCAMENTO' and auth.uid() is not null
$$;

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
  select active into was from private.coupons where code = 'LANCAMENTO' for update;
  if was is null then
    raise exception 'Cupom não encontrado.' using errcode = 'FA404';
  end if;
  actor := private.require_rank(2);
  if was is distinct from p_active then
    update private.coupons set active = p_active, updated_at = now() where code = 'LANCAMENTO';
    perform private.audit_content('cupom.alterado', 'LANCAMENTO',
      case when p_active then 'Promoção de lançamento ligada' else 'Promoção de lançamento desligada (pré-acessos por cupom encerrados)' end);
  end if;
  return jsonb_build_object('active', p_active);
end;
$$;

commit;
