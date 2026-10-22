# Etapa 4: painel admin (EM ANDAMENTO, ainda não publique)

Situação em 21/10/2026, 23:30. **Não faça `git push` destes arquivos ainda.**

## O que já está pronto
- `supabase/migrations/20261022000002_etapa4_painel_admin.sql`: papéis (editor, admin, proprietário),
  suspensão de contas (conta suspensa não lê nem grava nada), histórico de auditoria e as funções
  `admin_*` e `my_account`, que conferem o papel no banco. 111 testes de banco passando.
- Telas em `src/app/(app)/admin/`: visão geral, alunos e usuários (lista, busca, ficha, suspender,
  reativar e trocar papel), administração e permissões (equipe, tabela de papéis, histórico,
  "Dar acesso ao painel") e as áreas "em breve" (cursos, categorias, aulas, audiência, relatórios,
  mídia, configurações).
- Página `/conta-suspensa` e link "Painel administrativo" no menu (só para quem é da equipe).
- `npm run check` e `next build` passando. Os testes antigos continuam passando (75 + 43).
  Os testes novos do painel: 54 de 61 passando. As 7 falhas são de seletores do próprio teste.

## O que falta (próxima sessão)
1. Ajustar os seletores do teste do painel (títulos duplicados no topo e na página).
2. Investigar o aviso "Falha ao ler a conta { code: '' }" no log, que aparece durante a pré-renderização.
3. Revisão final de segurança.
4. Atualizar o README e o supabase/README com o passo a passo da etapa 4.

## Como vai ser o passo a passo (quando estiver pronto)
1. Rodar o SQL da etapa 4 no SQL Editor do Supabase.
2. Virar proprietário. No SQL Editor, troque pelo seu e-mail de login:
   `insert into private.staff_roles (user_id, role) select id, 'proprietario' from auth.users where email = lower('SEU_EMAIL');`
3. Fazer o push do código e testar `/admin`.

Observação: o Security Advisor vai listar as funções `admin_*` como "security definer que usuário
logado pode executar". Isso é esperado, porque cada uma confere o papel lá dentro.
