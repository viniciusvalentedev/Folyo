-- ============================================================================
-- Folyo · Cota de PDFs do aluno pelo tamanho REAL do arquivo
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Pode rodar ANTES ou DEPOIS de publicar o código (o site não muda: ele já grava o tamanho real).
-- Tudo roda numa transação. Pode ser rodado de novo. NÃO apaga nenhum trabalho nem arquivo.
--
-- Por quê: o limite de 300 MB (e de 20 MB por PDF) somava a coluna works.file_size, que o PRÓPRIO aluno grava.
-- O site grava o tamanho que o Storage informa, mas, com o próprio token (pegando o cookie no navegador), dava para
-- criar o trabalho direto na API dizendo que um PDF de 20 MB tinha 5 bytes, e assim passar muito dos 300 MB.
-- Também dava para trocar o arquivo de um trabalho (file_path) sem mudar o tamanho, e a conta nem era refeita.
--
-- O que muda:
--   1. private.works_quota() lê o tamanho e o tipo do arquivo no Storage (private.stored_object) e GRAVA esse tamanho
--      em file_size, ignorando o que veio no pedido. Arquivo que não existe no Storage, ou que não é PDF, é recusado.
--      A função passa a ser security definer (precisa ler o Storage e somar os trabalhos do aluno sem depender do RLS).
--   2. O gatilho roda também quando file_path muda (antes só quando file_size mudava).
--   3. Os trabalhos que já existem têm o file_size corrigido para o tamanho real (só onde estiver diferente).
--
-- O que NÃO muda: limites (40 PDFs, 300 MB, 20 MB cada), mensagens e o fluxo de envio do site.
-- ============================================================================

begin;

-- 1. A conta da cota, com o tamanho que o Storage guardou ------------------------------------

create or replace function private.works_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pdfs int;
  bytes bigint;
  st record;
begin
  if new.kind = 'pdf' then
    -- O tamanho que vale é o do Storage, não o que veio no pedido.
    select * into st from private.stored_object('student-works', new.file_path);
    if not found or st.size is null then
      raise exception 'Não encontramos o arquivo enviado.' using errcode = 'check_violation';
    end if;
    if st.mime is distinct from 'application/pdf' then
      raise exception 'Este arquivo não parece ser um PDF válido.' using errcode = 'check_violation';
    end if;
    new.file_size := st.size;

    perform pg_advisory_xact_lock(hashtextextended('works-quota:' || new.user_id::text, 0));
    select count(*), coalesce(sum(w.file_size), 0) into pdfs, bytes
      from public.works w
     where w.user_id = new.user_id and w.kind = 'pdf' and w.id <> new.id;
    if pdfs >= 40 then
      raise exception 'Limite de 40 PDFs atingido.' using errcode = 'check_violation';
    end if;
    if bytes + new.file_size > 314572800 then
      raise exception 'Limite de espaço de arquivos atingido (300 MB).' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.works_quota() from public, anon, authenticated, service_role;

-- 2. Refaz a conta também quando o arquivo do trabalho é trocado ------------------------------

drop trigger if exists works_quota on public.works;
create trigger works_quota before insert or update of file_size, file_path on public.works
  for each row execute function private.works_quota();

-- 3. Corrige o tamanho dos trabalhos que já existem ------------------------------------------

update public.works w
   set file_size = (o.metadata ->> 'size')::bigint
  from storage.objects o
 where w.kind = 'pdf'
   and o.bucket_id = 'student-works'
   and o.name = w.file_path
   and (o.metadata ->> 'size') is not null
   and w.file_size is distinct from (o.metadata ->> 'size')::bigint;

commit;

-- ---------- Como desfazer (rode só se precisar; o site continua funcionando igual) ----------
-- begin;
-- create or replace function private.works_quota()
-- returns trigger language plpgsql set search_path = '' as $$
-- declare pdfs int; bytes bigint;
-- begin
--   if new.kind = 'pdf' then
--     perform pg_advisory_xact_lock(hashtextextended('works-quota:' || new.user_id::text, 0));
--     select count(*), coalesce(sum(w.file_size), 0) into pdfs, bytes
--       from public.works w where w.user_id = new.user_id and w.kind = 'pdf' and w.id <> new.id;
--     if pdfs >= 40 then raise exception 'Limite de 40 PDFs atingido.' using errcode = 'check_violation'; end if;
--     if bytes + new.file_size > 314572800 then
--       raise exception 'Limite de espaço de arquivos atingido (300 MB).' using errcode = 'check_violation';
--     end if;
--   end if;
--   return new;
-- end; $$;
-- revoke execute on function private.works_quota() from public;
-- drop trigger if exists works_quota on public.works;
-- create trigger works_quota before insert or update of file_size on public.works
--   for each row execute function private.works_quota();
-- commit;
