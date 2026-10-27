# PROMPT PARA O CLAUDE OPUS 5.5 — Copiar a tela inicial pública (landing) da Folyo, IGUAL ao artefato

Cole tudo abaixo da linha no Claude Code aberto na pasta do projeto Folyo (a pasta que tem `package.json`).

---

## Missão

Reproduzir, **exatamente igual**, no projeto Folyo (Next.js) a **tela que aparece quando alguém abre o site da Folyo antes de fazer login**. Hoje a rota `/` do projeto só redireciona para `/entrar`. A tela que você vai criar mora em `/` e existe pronta, em HTML/CSS/JS compilado, no artefato de referência (descrito abaixo).

**Regra de ouro: cópia fiel e MAIS NADA.** Não é "inspirada em", não é "melhorada", não é "modernizada". Mesmos textos, mesma ordem das seções, mesmos nomes de classe, mesmas cores, medidas, fontes, animações e comportamento. Você não deve mexer em nenhuma outra tela, estilo, regra, banco ou configuração do projeto, além da lista fechada de arquivos permitidos mais abaixo.

## Fonte da verdade (já está dentro do projeto, na pasta `_referencia-landing/`)

Leia estes arquivos por inteiro antes de qualquer coisa. Eles são **somente leitura**:

| Arquivo | O que é |
|---|---|
| `_referencia-landing/artefato-folyo.html` | O artefato completo, exatamente como foi publicado. Abra no navegador (arquivo local) para ver a tela viva. Link original: https://claude.ai/artifact/UHsQ67nBpUNtWZT2V6muYu (pede login no Claude; use o arquivo local). |
| `_referencia-landing/captura-desktop-1440.png` | Captura da página inteira em 1440 px de largura. |
| `_referencia-landing/captura-mobile-390.png` | Captura da página inteira em 390 px de largura (celular). |
| `_referencia-landing/landing.referencia.css` | **Todo o CSS da landing** (classes `lp-*`), extraído sem alteração. É a fonte do CSS. |
| `_referencia-landing/landing-componente.referencia.txt` | O código dos componentes da landing, legível (nomes abreviados pelo compilador, explicados no cabeçalho do arquivo), mais os dados usados (faixa de skills, cores, lista "Para quem é", link do Instagram). É a fonte do HTML, dos textos e do comportamento. |

Se algo no arquivo `.txt` parecer divergir de uma captura, **vale o que a página renderizada mostra** (abra o `artefato-folyo.html`).

## Etapa 0 — Ler e conferir ANTES de alterar qualquer arquivo

1. Leia o `AGENTS.md` do projeto. Este Next.js (16.x) tem mudanças em relação ao que você conhece: **leia o guia relevante em `node_modules/next/dist/docs/` antes de escrever código**. Atenção especial a `cacheComponents: true` (está ligado no `next.config.ts`): por isso, por exemplo, **não use `new Date()`/`Date.now()` em Server Component fora de limite dinâmico** (o ano do rodapé deve ser calculado dentro de um Client Component, ou de outra forma que o Next aceite).
2. Leia, no projeto: `src/app/page.tsx`, `src/app/layout.tsx`, `src/proxy.ts`, `src/lib/auth/redirects.ts`, `src/app/(auth)/AuthShell.tsx`, `src/app/(auth)/entrar/LoginView.tsx`, `src/components/brand/Logo.tsx`, `src/components/ui/Icon.tsx`, `src/styles/tokens.css`, `base.css`, `components.css`, `motion.css`, `responsive.css`, `src/styles/pages/entrada.css`, `src/lib/app-config.ts`, `src/lib/data/config.ts`, a pasta `tests/` (procure o que testa o `proxy`/redirecionamento da `/`).
3. Abra o `artefato-folyo.html` no navegador (por exemplo com o Playwright, se existir no ambiente, ou um servidor estático local) e confira visualmente as seções, em 1440 px e 390 px. As capturas já estão na pasta como apoio.
4. **Verifique o que o projeto já tem** do que a landing usa e liste o que falta. Itens a conferir:
   - Variáveis em `tokens.css`: `--ink`, `--paper`, `--paper-3`, `--blue`, `--magenta`, `--magenta-deep`, `--lime`, `--lime-2`, `--lime-ink`, `--lime-soft`, `--blue-soft`, `--blue-on-dark`, `--magenta-soft`, `--ink-2`, `--ink-3`, `--ease`, `--t`, `--f-display`, `--f-ui`, `--f-mono`, `--mark-mask`.
   - Classes: `.btn`, `.btn-sm`, `.btn-lg`, `.btn-primary`, `.btn-go`, `.btn-quiet-dark`, `.btn-ghost-on-dark`, `.eyebrow`, `.skip`, `.ico`, `.plan` e `.plan.free`, `.skel`, `.surface-paper`.
   - Animações em `motion.css`: `fadeIn`, `fadeUp`, `checkPop`, `shimmer`, `cvFlash`, `wordIn` (as animações `lp*` já vêm dentro do `landing.referencia.css`).
   - Ícones em `Icon.tsx` usados pela landing: `Play`, `Paperclip`, `Award`, `Sparkles`, `ArrowDown`, `ArrowRight`, `CircleCheck`, `FileUp`, `Check`, `Puzzle`, `History`, `Plus`, `BookOpen`, `Flag`, `GraduationCap`, `Briefcase` (já existem na lista ou devem existir) e `FileUser`, `Route`, `ArrowUpRight`, `Instagram` (**provavelmente não existem** na lista do `Icon.tsx`).
5. Escreva para o usuário um **plano curto** (até ~15 linhas): arquivos que vai criar, arquivos existentes que vai tocar (só os permitidos), e o que faltou na conferência acima. Depois siga para a implementação sem esperar resposta, **a não ser que caia em alguma "condição de parada"** (seção final).

## O que construir: a landing, seção por seção (ordem exata)

Tudo dentro de `<div className="lp">`, com o link "Pular para o conteúdo" (`.skip`) no começo, depois o cabeçalho fixo, o `<main id="lp-main" tabIndex={-1}>`, o rodapé e a barra fixa do celular. Use o `.txt` para os textos e a estrutura exata de cada trecho. Resumo do que existe:

1. **Cabeçalho fixo** (`.lp-head`, vira `.solid` quando `scrollY > 12`): logo `Wordmark` altura 30 `tone="violet"` (clicar rola suave ao topo); links de âncora "O que é", "Curso grátis", "Por que a Folyo?", "Dúvidas" (rolagem suave até `#o-que-e`, `#curso-gratis`, `#por-que`, `#duvidas`); à direita, botão "Entrar" (`btn btn-sm btn-ghost-on-dark lp-btn`) e "Criar conta grátis" (`btn btn-sm btn-primary lp-btn lp-btn-glow`, com a palavra "grátis" em `.lp-wide`, que some no celular). O ícone de carrinho do artefato **não** entra (para quem não está logado ele não aparece).
2. **Hero** (`.lp-hero`, fundo `--ink` com brilho radial e pontinhos): selo "Aprenda. Crie. Conquiste." com pontinho pulsando; título "Seu próximo **projeto** começa aqui." com animação palavra por palavra, a palavra "projeto" em degradê roxo→rosa com o traço verde-limão desenhado embaixo (swoosh em SVG); parágrafo de apoio com "cursos online curtos e práticos" e "certificado e currículo" em negrito; dois botões ("Acessar curso grátis" com ícone Sparkles, e "O que é a Folyo?" com seta para baixo, que rola até `#o-que-e`); três itens com check ("Criar conta é grátis", "Curso gratuito para começar", "Estude pelo celular ou computador"); bloco **"Como funciona, em 3 passos"** com os três cartões (Assista às aulas / Faça um projeto real / Ganhe certificado e currículo), cada um com a mini-ilustração, o número em degradê e as setinhas verdes entre eles; e, no fim do hero, a **faixa de skills que corre na horizontal** (`.lp-ticker`, duas cópias lado a lado, pausa no hover).
3. **"O que é a Folyo?"** (`#o-que-e`, fundo claro, `.lp-paper`, cantos de cima arredondados): eyebrow, título, parágrafo grande, comparação **antes/depois** ("Só estudar" × "Com a Folyo", com a seta redonda no meio) e o bloco "Para quem é." com os quatro chips (Estou no ensino médio / Terminei a escola / Estou na faculdade / Já me formei na faculdade).
4. **Curso gratuito** (`#curso-gratis`, faixa azul com o "f" gigante translúcido ao fundo): selo "Curso gratuito", título **Descomplicando Processos Seletivos**, frase de apoio, descrição, botão "Quero acessar o curso grátis" e o aviso "Sem custo. Você só precisa de uma conta na Folyo."; à direita o cartão escuro inclinado **"O que você vai aprender"** com as 3 linhas de check. **Use exatamente a versão "sem catálogo carregado"** que aparece nas capturas: título e descrição padrão, **sem** lista de aulas e **sem** os "fatos" (nº de aulas, duração, certificado, projeto final). Isso é o que o artefato mostra para quem não está logado.
5. **"Por que a Folyo?"** (`#por-que`, fundo escuro): título "O que você aprende fica registrado a seu favor." e o mosaico (bento) com 4 cartões: "Um currículo que se monta enquanto você estuda", "Suas skills ganham forma" (bolhas coloridas animadas: Comunicação, Carreira, Vendas, Marketing), "Um objetivo, um caminho" (trilha com 3 pontos) e "Retome de onde parou" (mini player com barra).
6. **Perguntas frequentes** (`#duvidas`, fundo claro): coluna esquerda com título; coluna direita com as 6 perguntas em `<details>`, **a primeira aberta**.
7. **Chamada final** (`.lp-final`): "O próximo passo **começa com você.**" (a segunda parte em verde-limão), frase, botão "Criar minha conta grátis" e o link "Já tenho conta"; o "f" gigante em degradê roxo, à direita.
8. **Rodapé** (`.lp-foot`, fundo `#08080D`): logo (altura 34), slogan "Aprenda. Crie. Conquiste." em rosa, frase de apresentação, colunas "Plataforma" (Criar conta, Entrar, Curso gratuito) e "Acompanhe" (Instagram `@use.folyo`, link externo em nova aba com `rel="noopener noreferrer"`), e "© {ano} Folyo".
9. **Barra fixa do celular** (`.lp-sticky`, só até 700 px): aparece depois que o hero sai da tela e some quando a chamada final entra; botões "Curso grátis" e "Criar conta grátis".

**A seção "Escolha seu próximo curso" (grade de cursos, `lp-shop`) NÃO entra.** No artefato ela só aparece quando há catálogo carregado e, nas capturas, não aparece. No projeto o catálogo exige usuário logado (RLS). Não crie nada para ela, nem CSS `lp-shop*`.

### Comportamentos (todos devem funcionar igual ao artefato)
- Cabeçalho fixo que ganha fundo desfocado ao rolar (> 12 px).
- Rolagem suave nas âncoras e no clique do logo; sem animação de rolagem quando o usuário prefere movimento reduzido (`prefers-reduced-motion`) ou o `<html>` tem a classe `calm` (é o que a função `vc()` do artefato testa).
- Revelar ao rolar: elementos `.lp-reveal` que começam abaixo de 90% da altura da janela ganham `.is-armed` e, ao entrar na tela (IntersectionObserver, `rootMargin: "0px 0px -8% 0px"`, `threshold: 0.12`), ganham `.is-in`; há um reserva de 2,5 s que revela o que já estiver visível. Veja a função `a7` no `.txt`.
- Entrada do hero: classes `lp-in`, `lp-w`, `--d` (atrasos em ms) exatamente como no `.txt`.
- Barra fixa do celular: lógica da função `p7` no `.txt`.
- FAQ: `<details>` nativo, o primeiro com `open`.

## Mapeamento de links (o projeto não tem as rotas do artefato; NÃO crie rotas novas)

| No artefato | No projeto |
|---|---|
| `/entrar` | `/entrar` |
| `/criar-conta` | `/entrar?modo=criar` (o `LoginView` já abre a aba "Criar conta" com `modo=criar`) |
| `/curso-gratis` | `/entrar?modo=criar` (decisão: não existe rota própria do curso grátis no projeto; o aviso diz que basta ter conta) |
| Instagram | `https://www.instagram.com/use.folyo/` |

Use `next/link` (`Link`) nos links internos, mantendo as mesmas classes do artefato.

## Como fazer a parte técnica (sem sair do que o projeto já usa)

- **Nada de Tailwind, CSS-in-JS, biblioteca nova ou `npm install`.** Só React + CSS global, como o resto do projeto.
- **CSS:** crie `src/styles/pages/landing.css` com o conteúdo de `_referencia-landing/landing.referencia.css` **sem mudar regra nenhuma** (pode tirar só o comentário de aviso do topo). Importe no `src/app/layout.tsx` com **uma única linha** nova, seguindo o padrão dos outros imports (`import '@/styles/pages/landing.css'`, logo depois do de `entrada.css`). Se o `tokens.css`/`components.css` do projeto não tiver algum item da lista da Etapa 0, **não edite esses arquivos**: coloque a regra/variável que falta no próprio `landing.css`, copiada do artefato (`artefato-folyo.html`), e avise no relatório final.
- **Componentes:** crie em `src/components/landing/` (ou `src/app/(landing)/` se o Next pedir), em TypeScript, escrevendo o mesmo HTML do `.txt` em JSX. Sugestão de divisão: Server Component para a página e as seções estáticas; Client Components (`'use client'`) apenas para o que precisa de navegador: cabeçalho (rolagem), observador de "revelar ao rolar", barra fixa do celular, rolagem suave das âncoras e o ano do rodapé.
- **Logo e arte:** use `Wordmark` e `MarkPath` de `src/components/brand/Logo.tsx` (já aceitam `tone="violet"`, `height`, `x/y/r/fill/rotate`). O "f" gigante da chamada final é o `e7` do `.txt`: um `<svg className="lp-f lp-final-f">` com gradiente `violet` e `MarkPath r=96`.
- **Ícones:** use o `Icon` do projeto para os que já existem. Para os que **não** existem na lista do `Icon.tsx` (`FileUser`, `Route`, `ArrowUpRight`, `Instagram`), **não edite `Icon.tsx`**: importe direto de `lucide-react` dentro do componente da landing, com os mesmos tamanhos do artefato. Se a versão instalada do `lucide-react` não tiver `Instagram`, desenhe o ícone com um `<svg>` inline (contorno de câmera: quadrado arredondado, círculo e ponto), 16 px, `stroke="currentColor"`.
- **Frase do rodapé:** vem de `getPublicConfig().tagline` (`src/lib/data/config.ts`; o texto padrão do projeto é igual ao do artefato). Busque no Server Component da página e passe como propriedade, do mesmo jeito que `src/app/(auth)/layout.tsx` já faz.
- **Metadados da página `/`:** título `Folyo · Aprenda. Crie. Conquiste.` (use `title: { absolute: ... }` para o template do layout não acrescentar nada), descrição: `Cursos práticos para desenvolver habilidades, criar um projeto real em cada curso e conquistar certificados que vão para o seu currículo. Comece pelo curso gratuito Descomplicando Processos Seletivos.`, e `openGraph` com `type: website`, `siteName: Folyo`, `locale: pt_BR`, o mesmo título e descrição. **Não mude `robots`** (o layout atual manda `noindex`; deixe como está).
- **Acesso à `/` (único ponto em que o proxy muda):** em `src/proxy.ts` existe `if (pathname === '/') return redirectKeepingCookies(request, signedIn ? HOME_PATH : '/entrar', response)`. Mude **somente** isto: quem **está logado** continua indo para `HOME_PATH` (`/inicio`) exatamente como hoje; quem **não está logado** passa a ver a landing (sem redirecionar). `isPublicPath('/')` já devolve `true`, então não precisa mexer em `redirects.ts`. Substitua `src/app/page.tsx` (hoje só faz `redirect('/entrar')`) pela landing. Se algum teste em `tests/` afirmar o redirecionamento antigo de `/` para visitante, ajuste **apenas** essa expectativa e diga isso no relatório.
- **Fontes:** o projeto já serve Inter, Poppins (500/600/700) e JetBrains Mono localmente pelas variáveis `--f-display`, `--f-ui`, `--f-mono`. **Não** adicione Google Fonts nem `<link>` externo (a CSP bloquearia). O artefato usa as mesmas famílias e pesos.
- **CSP:** `style-src 'unsafe-inline'` e `img-src data:` já são permitidos; as imagens `data:` do CSS (máscara do "f" e a seta verde entre os passos) funcionam. Não altere `next.config.ts`.

## Lista FECHADA de arquivos que você pode tocar

**Criar:** `src/styles/pages/landing.css`; arquivos novos dentro de `src/components/landing/` (ou da pasta de rota que o Next exigir para a landing).
**Alterar (somente o descrito):** `src/app/page.tsx` (virar a landing); `src/app/layout.tsx` (1 linha de import do `landing.css`); `src/proxy.ts` (só a condição da `/` descrita acima); e **somente se** um teste afirmar o redirecionamento antigo, esse teste.

**Proibido mexer em qualquer outra coisa.** Em especial: telas e estilos de `/entrar`, cadastro, `AuthShell`, `entrada.css`, `tokens.css`, `base.css`, `components.css`, `layout.css`, `responsive.css`, `motion.css`, `Icon.tsx`, `Logo.tsx`, `next.config.ts`, `package.json`/`package-lock.json`, `.env*`, pasta `supabase/`, banco, `README.md`, `AGENTS.md`, área do aluno, painel admin. Não renomeie, não reformate arquivos existentes, não "aproveite para corrigir" nada. **Não faça commit, push nem instale pacotes.** Não edite, apague nem commite a pasta `_referencia-landing/` (o usuário a apaga depois).

## Conferência de fidelidade (obrigatória antes de dizer que terminou)

1. Rode `npm run check` (lint + typecheck + testes). Tem que passar sem erro novo. Se já havia erro antes das suas mudanças, diga quais eram.
2. Suba o site (`npm run dev`) e abra `/` **sem estar logado**. Compare com as capturas e com o `artefato-folyo.html` aberto ao lado, em **1440 px** e **390 px**, seção por seção. Se o Playwright estiver disponível, tire capturas de página inteira das duas larguras e compare com as de referência (mesma altura aproximada: ~6000 px no desktop, ~7600 px no celular; diferença grande de altura indica seção faltando ou espaçamento errado).
3. Confirme: textos idênticos (acentos incluídos), animações do hero, faixa de skills correndo, cabeçalho que fica sólido, âncoras rolando, FAQ com a primeira aberta, barra fixa aparecendo no celular depois do hero, botões levando a `/entrar` e `/entrar?modo=criar`, e a tela `/entrar` **idêntica** à de antes.
4. Logado, abrir `/` continua indo para `/inicio`.
5. Corrija qualquer diferença e repita até ficar igual. Só aceite diferença quando for inevitável, e liste cada uma.
6. Rode `git status` e confirme que só aparecem os arquivos da lista fechada (mais a pasta `_referencia-landing/`, que já estava lá).

## Condições de parada (pare e pergunte, sem inventar)

- Se para a landing funcionar for **preciso** mexer em algo fora da lista fechada (por exemplo, o Next recusar o import do CSS no `layout.tsx`, ou o `cacheComponents` exigir mudança de configuração).
- Se um teste existente quebrar por causa da landing e a correção não for a simples troca da expectativa do redirecionamento da `/`.
- Se o artefato e o projeto divergirem de um jeito que exija decisão do usuário (por exemplo, texto que só faria sentido com uma rota que o projeto não tem).

## Relatório final (curto, em português)

1. O que foi criado e o que foi alterado (lista de arquivos).
2. Resultado do `npm run check` e da comparação visual (1440 px e 390 px).
3. Qualquer diferença que sobrou em relação ao artefato e o motivo.
4. Qualquer item que faltava no projeto e que você teve que acrescentar dentro do `landing.css`.
5. Lembrete: a pasta `_referencia-landing/` pode ser apagada depois de aprovado.
