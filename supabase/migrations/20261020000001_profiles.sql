-- ============================================================================
-- Folyo · Etapa 1 · Perfil de cada aluno
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Pode rodar uma vez só. (Se precisar rodar de novo, apague a tabela antes.)
--
-- O que ele faz:
--  1. Cria a tabela public.profiles (uma linha por aluno).
--  2. Liga o RLS: cada pessoa só enxerga e altera a PRÓPRIA linha.
--  3. Limita o que dá para alterar (por coluna) e o tamanho de cada campo.
--  4. Cria o perfil automaticamente quando alguém cria uma conta.
-- ============================================================================

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  name            text not null default '' check (char_length(name) <= 80),
  stage           text check (stage is null or char_length(stage) <= 120),
  goal_primary    text check (goal_primary is null or goal_primary ~ '^[a-z0-9-]{1,40}$'),
  goals_secondary text[] not null default '{}' check (cardinality(goals_secondary) <= 2),
  weekly_goal     smallint not null default 4 check (weekly_goal between 1 and 20),
  onboarded       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de cada aluno da Folyo (1 linha por conta).';

-- 2. RLS ---------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Por padrão o Supabase dá acesso total às tabelas novas para os papéis da API.
-- Tiramos tudo e devolvemos só o necessário:
--  - visitantes sem login (anon): nada;
--  - alunos logados (authenticated): ler o próprio perfil e alterar só estas colunas.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (name, stage, goal_primary, goals_secondary, weekly_goal, onboarded)
  on table public.profiles to authenticated;

create policy "Aluno vê o próprio perfil"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Aluno edita o próprio perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Não existe regra de INSERT nem de DELETE para os alunos:
--  - quem cria o perfil é o gatilho abaixo;
--  - o perfil some sozinho se a conta for apagada (on delete cascade).

-- 3. Atualiza "updated_at" sempre que o perfil muda ------------------------
create function public.profiles_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.profiles_set_updated_at();

-- 4. Cria o perfil quando uma conta nova nasce em auth.users -----------------
-- "security definer" = roda com permissão do dono da função (só para este insert).
-- "search_path = ''" evita que alguém troque tabelas por outras com o mesmo nome.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ninguém de fora pode chamar essas funções pela API (o gatilho continua funcionando).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.profiles_set_updated_at() from public, anon, authenticated;

-- Contas que já existiam antes deste SQL também ganham um perfil.
insert into public.profiles (id, name)
select u.id, left(btrim(coalesce(u.raw_user_meta_data ->> 'name', '')), 80)
from auth.users u
on conflict (id) do nothing;
