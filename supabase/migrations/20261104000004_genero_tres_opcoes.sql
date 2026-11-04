-- ============================================================================
-- Folyo · Gênero no cadastro: só Feminino, Masculino e Prefiro não informar
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode ANTES de publicar o código (a tela nova só oferece as 3 opções; o código antigo ainda mostraria
-- "Não binário" e "Outro", que o banco passa a recusar com uma mensagem amigável).
-- Tudo roda numa transação. Pode ser rodado de novo.
--
-- O que muda:
--   1. As opções aceitas passam a ser feminino, masculino e nao_informar (saem nao_binario e outro).
--   2. Quem tinha escolhido uma das opções que saíram passa para "Prefiro não informar" (a escolha mais próxima de
--      não dizer nada). Em 04/11/2026 não havia ninguém nessa situação.
--   3. save_my_personal_data confere a lista nova (o resto da função é igual ao de 20261104000002).
-- ============================================================================

begin;

-- 1 e 2. A regra da tabela ----------------------------------------------------------------------

update private.personal_data
   set gender = 'nao_informar', updated_at = now()
 where gender not in ('feminino', 'masculino', 'nao_informar');

alter table private.personal_data drop constraint if exists personal_data_gender;
alter table private.personal_data add constraint personal_data_gender
  check (gender in ('feminino', 'masculino', 'nao_informar'));

-- 3. A função que grava --------------------------------------------------------------------------

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
  if p_gender is null or p_gender not in ('feminino', 'masculino', 'nao_informar') then
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

revoke execute on function public.save_my_personal_data(text, date, text, boolean) from public, anon, service_role;
grant execute on function public.save_my_personal_data(text, date, text, boolean) to authenticated;

commit;

-- ---------- Como desfazer (rode só se precisar) ----------
-- Rode de novo a parte 2 de 20261104000002_dados_do_cadastro.sql (a função com as 5 opções) e:
-- alter table private.personal_data drop constraint if exists personal_data_gender;
-- alter table private.personal_data add constraint personal_data_gender
--   check (gender in ('feminino', 'masculino', 'nao_binario', 'outro', 'nao_informar'));
