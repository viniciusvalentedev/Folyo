-- ============================================================================
-- Folyo · Trilhas de carreira no painel (Objetivos > "Escolher objetivos")
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode ANTES ou DEPOIS de publicar o código: o código funciona com e sem este SQL
-- (sem ele, as 7 trilhas de sempre continuam valendo, só que não dá para editá-las).
-- Tudo roda numa transação: se algo der erro, nada fica pela metade. Pode ser rodado de novo.
--
-- NÃO apaga nem altera cursos, alunos ou progresso. Só ACRESCENTA:
--   1. public.trails: as trilhas (título, descrição, ícone, skills, palavras-chave, cursos
--      escolhidos à mão, ordem e "ativa");
--   2. as 7 trilhas que o site já mostrava (marketing, vendas, familia, programacao, estagio,
--      ingles, criativo), com os mesmos ids: quem já escolheu uma delas continua com ela;
--   3. regras de leitura: aluno logado lê (conta suspensa não); ninguém grava direto;
--   4. funções do painel (editor ou acima): admin_save_trail, admin_delete_trail e
--      admin_reorder_trails, todas com registro no histórico (que passa a listar as trilhas
--      no filtro "Conteúdo").
--
-- Como desfazer (só se precisar): veja "Trilhas no painel" em supabase/README.md.
-- ============================================================================

begin;

-- 1. Tabela -----------------------------------------------------------------------

create table if not exists public.trails (
  id         text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  title      text not null check (char_length(btrim(title)) between 3 and 80),
  blurb      text not null default '' check (char_length(blurb) <= 200),
  icon       text not null default 'Rocket' check (icon ~ '^[A-Za-z0-9]{1,40}$'),
  -- Skills que a trilha desenvolve (comparadas com as skills dos cursos).
  skills     text[] not null default '{}' check (private.text_list_ok(skills, 10, 40)),
  -- Palavras que indicam a área no texto do objetivo do currículo.
  keywords   text[] not null default '{}' check (private.text_list_ok(keywords, 10, 40)),
  -- Cursos escolhidos à mão, na ordem em que aparecem. Vazio = a trilha usa as skills.
  course_ids text[] not null default '{}'
    check (private.text_list_ok(course_ids, 12, 40) and array_to_string(course_ids, ',') ~ '^[a-z0-9,-]*$'),
  position   integer not null default 0 check (position between 0 and 100000),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.trails is 'Trilhas de carreira (Objetivos). Só as funções admin_*_trail gravam aqui.';
create unique index if not exists trails_title_key on public.trails (lower(btrim(title)));

-- 2. As 7 trilhas de sempre ----------------------------------------------------------

insert into public.trails (id, title, blurb, icon, skills, keywords, position) values
  ('marketing', 'Construir carreira em Marketing', 'Entender públicos, posicionar marcas e comunicar ideias com clareza.', 'Megaphone',
    array['Marketing', 'Comunicação'], array['marketing', 'marca', 'posicionamento', 'comunicação'], 0),
  ('vendas', 'Desenvolver carreira em Vendas', 'Vender com escuta e método, atender bem e gerar indicações.', 'Handshake',
    array['Vendas', 'Comunicação'], array['vendas', 'comercial', 'negociação'], 1),
  ('familia', 'Empreender e construir um negócio', 'Organizar o caixa, vender, atender e posicionar o próprio negócio.', 'Rocket',
    array['Gestão', 'Vendas', 'Marketing'], array['empresa', 'negócio', 'gestão', 'empreender'], 2),
  ('programacao', 'Construir carreira em Tecnologia', 'Sair do zero em programação e trabalhar com dados e IA com critério.', 'Code',
    array['Tecnologia', 'Idiomas'], array['programação', 'desenvolvimento', 'tecnologia', 'software'], 3),
  ('estagio', 'Conseguir o primeiro estágio', 'Chegar preparado ao processo seletivo e mostrar o que você sabe fazer.', 'Briefcase',
    array['Carreira', 'Comunicação', 'Idiomas'], array['estágio', 'estagio', 'processo seletivo', 'trainee'], 4),
  ('ingles', 'Usar o inglês no trabalho', 'Participar de reuniões, escrever e-mails e responder entrevistas em inglês.', 'Languages',
    array['Idiomas', 'Comunicação'], array['inglês', 'ingles'], 5),
  ('criativo', 'Construir carreira em Arquitetura e Design', 'Ler e propor espaços e apresentar ideias visuais com processo.', 'Palette',
    array['Design', 'Comunicação'], array['design', 'criativo', 'arquitetura'], 6)
on conflict (id) do nothing;

-- 3. Quem lê e quem grava -------------------------------------------------------------

alter table public.trails enable row level security;
revoke all on table public.trails from public, anon, authenticated, service_role;
grant select (id, title, blurb, icon, skills, keywords, course_ids, position, active, created_at, updated_at)
  on public.trails to authenticated;

drop policy if exists "Trilhas: logados leem" on public.trails;
create policy "Trilhas: logados leem" on public.trails for select to authenticated using (true);
drop policy if exists "Conta suspensa não acessa" on public.trails;
create policy "Conta suspensa não acessa" on public.trails as restrictive for select to authenticated
  using ((select private.not_suspended()));
-- De propósito: nenhuma regra de INSERT, UPDATE ou DELETE. Só as funções abaixo gravam.

-- 4. Funções do painel ----------------------------------------------------------------
-- Todas: security definer + search_path vazio + papel conferido logo no começo (editor ou acima).

-- Cria ou edita uma trilha.
create or replace function public.admin_save_trail(p_trail jsonb, p_is_new boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  tid text;
  ttitle text;
  tblurb text;
  ticon text;
  tskills text[];
  tkeys text[];
  tcourses text[];
  tactive boolean;
  pos int;
begin
  if p_trail is null or jsonb_typeof(p_trail) <> 'object' or p_is_new is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  tid := private.j_text(p_trail, 'id', 1, 40);
  if tid !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Endereço da trilha inválido.' using errcode = 'FA400';
  end if;
  ttitle := private.j_text(p_trail, 'title', 3, 80);
  tblurb := private.j_text(p_trail, 'blurb', 0, 200);
  ticon := private.j_text(p_trail, 'icon', 1, 40);
  if ticon !~ '^[A-Za-z0-9]{1,40}$' then
    raise exception 'Ícone inválido.' using errcode = 'FA400';
  end if;
  tskills := private.j_texts(p_trail, 'skills', 10, 40);
  tkeys := private.j_texts(p_trail, 'keywords', 10, 40);
  tcourses := private.j_texts(p_trail, 'courseIds', 12, 40);
  tactive := private.j_bool(p_trail, 'active', true);

  if exists (select 1 from unnest(tcourses) c where c !~ '^[a-z0-9-]{1,40}$') then
    raise exception 'Curso inválido na lista da trilha.' using errcode = 'FA400';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog:trails', 0));
  actor := private.require_rank(1);

  if (select count(*) from public.courses where id = any (tcourses)) <> cardinality(tcourses) then
    raise exception 'Um dos cursos escolhidos não existe mais. Recarregue a página.' using errcode = 'FA404';
  end if;
  if exists (select 1 from public.trails t where lower(btrim(t.title)) = lower(ttitle) and t.id <> tid) then
    raise exception 'Já existe uma trilha com esse nome.' using errcode = 'FA400';
  end if;

  if p_is_new then
    if exists (select 1 from public.trails where id = tid) then
      raise exception 'Já existe uma trilha com este endereço.' using errcode = 'FA410';
    end if;
    if (select count(*) from public.trails) >= 30 then
      raise exception 'Limite de 30 trilhas atingido.' using errcode = 'FA400';
    end if;
    select coalesce(max(position) + 1, 0) into pos from public.trails;
    insert into public.trails (id, title, blurb, icon, skills, keywords, course_ids, position, active)
    values (tid, ttitle, tblurb, ticon, tskills, tkeys, tcourses, least(pos, 100000), tactive);
    perform private.audit_content('trilha.criada', ttitle, '');
  else
    update public.trails
       set title = ttitle, blurb = tblurb, icon = ticon, skills = tskills, keywords = tkeys,
           course_ids = tcourses, active = tactive, updated_at = now()
     where id = tid;
    if not found then
      raise exception 'Trilha não encontrada.' using errcode = 'FA404';
    end if;
    perform private.audit_content('trilha.atualizada', ttitle, '');
  end if;
  return jsonb_build_object('id', tid);
end;
$$;

-- Exclui uma trilha que nenhum aluno escolheu (se alguém usa, o caminho é desativar).
create or replace function public.admin_delete_trail(p_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  ttitle text;
  users int;
begin
  if p_id is null or p_id !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('catalog:trails', 0));
  actor := private.require_rank(1);
  select title into ttitle from public.trails where id = p_id;
  if ttitle is null then
    raise exception 'Trilha não encontrada.' using errcode = 'FA404';
  end if;
  select count(*) into users from public.profiles where goal_primary = p_id or p_id = any (goals_secondary);
  if users > 0 then
    raise exception '% Desative a trilha em vez de excluir.',
      case when users = 1 then '1 aluno escolheu esta trilha.' else users || ' alunos escolheram esta trilha.' end
      using errcode = 'FA400';
  end if;
  delete from public.trails where id = p_id;
  perform private.audit_content('trilha.excluida', ttitle, '');
  return jsonb_build_object('id', p_id);
end;
$$;

-- Define a ordem das trilhas (a lista vem na ordem desejada).
create or replace function public.admin_reorder_trails(p_ids text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  n int;
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  if (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'A lista tem itens repetidos.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('catalog:trails', 0));
  actor := private.require_rank(1);
  select count(*) into n from public.trails where id = any (p_ids);
  if n <> cardinality(p_ids) then
    raise exception 'A lista tem itens que não existem mais. Recarregue a página.' using errcode = 'FA404';
  end if;
  update public.trails t set position = o.i - 1, updated_at = now()
    from unnest(p_ids) with ordinality as o(id, i) where t.id = o.id and t.position <> o.i - 1;
  perform private.audit_content('trilhas.reordenadas', 'Ordem das trilhas', '');
  return jsonb_build_object('count', n);
end;
$$;

-- O histórico do painel (filtro "Conteúdo") passa a mostrar também as trilhas.
create or replace function public.admin_audit_log(p_kind text default 'all', p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  lim int := greatest(1, least(coalesce(p_limit, 100), 300));
begin
  if coalesce(p_kind, '') not in ('all', 'permissao', 'usuario', 'conteudo') then
    raise exception 'Filtro inválido.' using errcode = 'FA400';
  end if;
  return (
    select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
      select a.at, jsonb_build_object('id', a.id, 'at', a.at, 'action', a.action, 'actor', a.actor_label, 'actorId', a.actor_id,
        'actorRole', a.actor_role, 'target', a.target_label, 'targetId', a.target_id, 'detail', a.detail) as j
      from private.admin_audit a
      where p_kind = 'all'
         or (p_kind = 'conteudo' and a.action ~ '^(curso|categoria|categorias|catalogo|midia|config|relatorio|trilha|trilhas)\.')
         or (p_kind <> 'conteudo' and a.action like p_kind || '.%')
      order by a.at desc
      limit lim
    ) x
  );
end;
$$;

revoke execute on function public.admin_save_trail(jsonb, boolean), public.admin_delete_trail(text),
  public.admin_reorder_trails(text[]) from public, anon, service_role;
grant execute on function public.admin_save_trail(jsonb, boolean), public.admin_delete_trail(text),
  public.admin_reorder_trails(text[]) to authenticated;

commit;
