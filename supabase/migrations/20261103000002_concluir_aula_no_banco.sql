-- ============================================================================
-- Folyo · Concluir aula só pelo banco (sequência + acesso ao curso)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS de publicar o código desta mudança (o código novo funciona com e sem este SQL; o código ANTIGO
-- para de conseguir concluir aulas assim que este SQL roda, porque ele gravava direto na tabela).
-- Tudo roda numa transação. Pode ser rodado de novo. NÃO apaga nenhuma aula concluída.
--
-- Por quê: até aqui o aluno gravava direto em lesson_completions. Com o próprio token (pegando o cookie no
-- navegador), dava para marcar todas as aulas de um curso de uma vez, fora de ordem, e o perfil público passava a
-- mostrar o curso como "concluído" e "certificado".
--
-- O que muda:
--   1. complete_lesson(curso, aula): o ÚNICO jeito de o aluno concluir uma aula. Confere:
--        - login e conta não suspensa;
--        - a aula existe, está publicada, num módulo não arquivado, e pertence a ESTE curso (no ar);
--        - a pessoa pode assistir ao curso (gratuito, compra, liberação manual ou pré-acesso em dia);
--        - a ordem: todas as aulas anteriores do curso (mesma ordem da tela: módulo por posição, aula por posição)
--          já estão concluídas. A equipe (editor ou acima, com a verificação em duas etapas) não segue a ordem.
--      Aula já concluída: responde "ok" sem mudar nada (a data da conclusão fica a original).
--   2. O aluno perde o INSERT direto em lesson_completions (grant e regras). Desmarcar (DELETE da própria linha)
--      continua como era: só diminui o que a pessoa declara.
--
-- O que NÃO muda: tempo assistido não é exigido. lesson_watch é gravado pelo próprio aluno, então não serve de prova,
-- e a trava antiga por tempo (20261030000001) foi retirada para não travar quem pula trechos ou assiste fora da Folyo.
-- ============================================================================

begin;

-- 1. Concluir uma aula -------------------------------------------------------------------

create or replace function public.complete_lesson(p_course text, p_lesson text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_staff boolean;
  v_missing text;
begin
  if uid is null or not private.not_suspended() then
    raise exception 'Faça login para continuar.' using errcode = 'FA403';
  end if;
  if p_course is null or p_course !~ '^[a-z0-9-]{1,40}$' or p_lesson is null or p_lesson !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Aula inválida.' using errcode = 'FA400';
  end if;

  -- Uma conclusão por vez para a mesma pessoa (dois cliques ao mesmo tempo não furam a ordem).
  perform pg_advisory_xact_lock(hashtextextended('lesson-done:' || uid::text, 0));

  -- Já concluída: nada a fazer (vale mesmo que a pessoa tenha desmarcado uma anterior depois).
  if exists (select 1 from public.lesson_completions c where c.user_id = uid and c.lesson_id = p_lesson) then
    return jsonb_build_object('done', true, 'already', true);
  end if;

  v_staff := private.catalog_staff();

  if v_staff then
    -- Equipe: qualquer aula que exista neste curso (inclusive em rascunho, para testar).
    if not exists (select 1 from public.lessons l where l.id = p_lesson and l.course_id = p_course) then
      raise exception 'Aula não encontrada.' using errcode = 'FA404';
    end if;
  else
    -- Aluno: a aula precisa estar no ar, neste curso.
    if not exists (
      select 1 from public.lessons l join public.course_modules m on m.id = l.module_id
       where l.id = p_lesson and l.course_id = p_course and m.course_id = p_course
         and l.published and private.module_visible(l.module_id)
    ) then
      raise exception 'Aula não encontrada.' using errcode = 'FA404';
    end if;
    -- E a pessoa precisa poder assistir ao curso (curso pago: compra, liberação manual ou pré-acesso em dia).
    if not private.course_access_ok(p_course) then
      raise exception 'Este curso ainda não foi liberado para você.' using errcode = 'FA403';
    end if;
    -- Ordem: a primeira aula anterior ainda não concluída (mesma ordem e mesmo filtro do catálogo da tela).
    with ordered as (
      select l.id, row_number() over (order by m.position, m.id, l.position, l.id) as n
        from public.lessons l join public.course_modules m on m.id = l.module_id
       where l.course_id = p_course and m.course_id = p_course and l.published and not m.archived
    )
    select o.id into v_missing
      from ordered o
     where o.n < (select t.n from ordered t where t.id = p_lesson)
       and not exists (select 1 from public.lesson_completions c where c.user_id = uid and c.lesson_id = o.id)
     order by o.n
     limit 1;
    if v_missing is not null then
      raise exception 'Conclua as aulas anteriores antes desta.' using errcode = 'FC422';
    end if;
  end if;

  -- A data é sempre a do servidor. Os gatilhos de limite (500 aulas, gravações por minuto) continuam valendo.
  insert into public.lesson_completions (user_id, course_id, lesson_id)
  values (uid, p_course, p_lesson)
  on conflict (user_id, lesson_id) do nothing;

  return jsonb_build_object('done', true, 'already', false);
end;
$$;

revoke execute on function public.complete_lesson(text, text) from public, anon, service_role;
grant execute on function public.complete_lesson(text, text) to authenticated;

-- 2. O aluno não grava mais direto na tabela ------------------------------------------------

-- O grant era por coluna: revogar só o da tabela não tiraria o das colunas.
revoke insert (course_id, lesson_id) on table public.lesson_completions from authenticated;
revoke insert, update on table public.lesson_completions from public, anon, authenticated;
-- Sem regra de INSERT, mesmo que um grant volte por engano, o RLS continua recusando.
drop policy if exists "Aluno conclui aula para si" on public.lesson_completions;
drop policy if exists "Aula de curso pago só com acesso" on public.lesson_completions;

commit;

-- ---------- Como desfazer (rode só se precisar; o código novo volta a gravar direto sozinho) ----------
-- begin;
-- grant insert (course_id, lesson_id) on table public.lesson_completions to authenticated;
-- create policy "Aluno conclui aula para si" on public.lesson_completions for insert to authenticated
--   with check ((select auth.uid()) = user_id);
-- create policy "Aula de curso pago só com acesso" on public.lesson_completions as restrictive for insert to authenticated
--   with check (private.course_access_ok(course_id));
-- drop function if exists public.complete_lesson(text, text);
-- commit;
