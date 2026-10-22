-- ============================================================================
-- Folyo · Etapa 3 · Limite de alterações por minuto (por aluno)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS da etapa 2 (20261021000001_etapa2_dados_do_aluno.sql). Rode uma vez só.
-- Pode rodar antes ou depois de publicar o código novo (não quebra o site antigo).
--
-- Por que no banco: qualquer aluno logado consegue falar direto com a API do
-- Supabase, pulando o site. Um limite só no código do site seria ignorado. Aqui,
-- TODA alteração (pelo site ou direto pela API) conta para o limite do aluno.
--
-- Regra: cada aluno pode fazer até 120 alterações por minuto e 3000 por hora
-- (uso normal fica bem abaixo disso: anotações salvam no máximo ~1 vez por segundo).
-- Passou disso, o banco recusa até a janela virar. Pedidos sem login (anon) já
-- não conseguem gravar nada; o servidor/admin (sem aluno no token) não é limitado.
-- ============================================================================

begin;

-- Contador por aluno. Fica no schema "private" (fora da API) e com RLS ligado
-- sem nenhuma regra: ninguém lê nem mexe pela internet, só a função abaixo.
create table private.write_rate (
  user_id uuid primary key references auth.users (id) on delete cascade,
  minute_start timestamptz not null,
  minute_count int not null,
  hour_start timestamptz not null,
  hour_count int not null
);
alter table private.write_rate enable row level security;
revoke all on table private.write_rate from public, anon, authenticated, service_role;

-- Conta uma alteração do aluno logado e recusa se passou do limite.
-- "security definer": roda com a permissão do dono (para gravar no contador, que
-- o aluno não acessa). Usa só auth.uid(), então ninguém consegue gastar o limite
-- de OUTRO aluno.
create function private.enforce_write_rate()
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

revoke execute on function private.enforce_write_rate() from public, anon, authenticated, service_role;

-- Um gatilho por comando (não por linha) em cada tabela do aluno.
create trigger write_rate before insert or update or delete on public.profiles
  for each statement execute function private.enforce_write_rate();
create trigger write_rate before insert or update or delete on public.course_progress
  for each statement execute function private.enforce_write_rate();
create trigger write_rate before insert or update or delete on public.lesson_completions
  for each statement execute function private.enforce_write_rate();
create trigger write_rate before insert or update or delete on public.lesson_notes
  for each statement execute function private.enforce_write_rate();
create trigger write_rate before insert or update or delete on public.projects
  for each statement execute function private.enforce_write_rate();
create trigger write_rate before insert or update or delete on public.skills
  for each statement execute function private.enforce_write_rate();

commit;
