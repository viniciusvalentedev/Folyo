-- Continuar de onde parou -------------------------------------------------------------------
-- Guarda, por aluno e aula, o segundo do vídeo em que a pessoa parou (lesson_watch.position).
-- Quando ela volta à aula, o vídeo abre nesse ponto.
--
-- Pode ser rodado de novo sem problema. NÃO apaga nem altera nada que já existe: só acrescenta uma
-- coluna (começa em 0 = início) e libera o aluno para gravar essa coluna na própria linha.
-- RLS e os gatilhos de lesson_watch continuam valendo: o aluno só mexe na própria linha, e o tempo
-- assistido (seconds) continua só crescendo na velocidade do relógio.
-- ---------------------------------------------------------------------------------------------

begin;

alter table public.lesson_watch
  add column if not exists position integer not null default 0 check (position between 0 and 86400);

comment on column public.lesson_watch.position is 'Segundo do vídeo em que o aluno parou (0 = começo). A aula abre nesse ponto.';

-- Permissões por coluna (as de antes continuam; só entra a coluna nova).
grant insert (course_id, lesson_id, seconds, position) on table public.lesson_watch to authenticated;
grant update (seconds, position) on table public.lesson_watch to authenticated;

commit;
