import type { CareerGoal, Category, Course } from '@/lib/types'

/**
 * Catálogo de demonstração (copiado do protótipo da Gigi).
 *
 * Na próxima etapa estes dados saem daqui e passam a vir do banco (Supabase).
 * Quem lê o catálogo é sempre src/lib/data/catalog.ts — as páginas nunca importam
 * este arquivo diretamente, assim a troca para o banco mexe em um lugar só.
 */

/** Data de referência dos dados de demonstração. */
export const DEMO_REFERENCE_DATE = '2026-10-19'

export const categories: Category[] = [
  {
    id: "marketing",
    name: "Marketing e Comunicação",
    icon: "Megaphone"
  },
  {
    id: "vendas",
    name: "Vendas e Negociação",
    icon: "Handshake"
  },
  {
    id: "tech",
    name: "Programação e Tecnologia",
    icon: "Code"
  },
  {
    id: "arquitetura",
    name: "Arquitetura e Design",
    icon: "Building2"
  },
  {
    id: "idiomas",
    name: "Inglês e Idiomas",
    icon: "Languages"
  },
  {
    id: "negocios",
    name: "Negócios e Empreendedorismo",
    icon: "Rocket"
  },
  {
    id: "gestao",
    name: "Administração e Gestão",
    icon: "ClipboardList"
  },
  {
    id: "financas",
    name: "Finanças",
    icon: "Wallet"
  },
  {
    id: "rh",
    name: "Recursos Humanos",
    icon: "Users"
  },
  {
    id: "educacao",
    name: "Educação e Pedagogia",
    icon: "GraduationCap"
  },
  {
    id: "atendimento",
    name: "Atendimento e Experiência do Cliente",
    icon: "Headphones"
  },
  {
    id: "dados",
    name: "Dados e Inteligência Artificial",
    icon: "BrainCircuit"
  },
  {
    id: "audiovisual",
    name: "Design e Audiovisual",
    icon: "Clapperboard"
  },
  {
    id: "carreira",
    name: "Carreira e Processos Seletivos",
    icon: "Briefcase"
  }
]

export const courses: Course[] = [
  {
    id: "mkt",
    title: "Marketing Estratégico na Prática",
    cat: "marketing",
    level: "Intermediário",
    hours: 9,
    tone: "blue",
    glyph: "m",
    plan: "pro",
    featured: false,
    summary: "Do diagnóstico ao posicionamento: aprenda a entender um público, ler a concorrência e propor um lugar claro para uma marca.",
    outcomes: [
      "Conduzir entrevistas curtas com clientes e tirar conclusões úteis",
      "Mapear concorrentes e encontrar espaços livres no mercado",
      "Escrever uma declaração de posicionamento defensável",
      "Apresentar uma estratégia de marca para quem decide"
    ],
    skills: ["Posicionamento de marca", "Pesquisa de mercado", "Análise de concorrência", "Storytelling"],
    project: {
      title: "Diagnóstico de marca e proposta de posicionamento",
      brief: "Escolha uma empresa real ou fictícia e entregue um diagnóstico de marca com uma proposta de posicionamento.",
      expected: "Um documento de 6 a 10 páginas com pesquisa de público, mapa de concorrentes, declaração de posicionamento e mensagens-chave, pronto para apresentar.",
      steps: ["Pesquisa com público", "Mapa de concorrentes", "Proposta de posicionamento", "Apresentação final"]
    },
    modules: [
      {
        id: "mkt-m1",
        title: "Fundamentos de posicionamento",
        lessons: [
          {
            id: "mkt-1",
            title: "O que é estratégia de marketing",
            min: 12,
            desc: "A diferença entre fazer ações de marketing e ter uma estratégia. Você sai com um checklist de três perguntas para avaliar qualquer plano."
          },
          {
            id: "mkt-2",
            title: "Público, problema e promessa",
            min: 14,
            desc: "Como definir para quem a marca existe, que problema resolve e o que promete. Exercício guiado com uma loja de bairro."
          },
          {
            id: "mkt-3",
            title: "Como as marcas ocupam um lugar na mente",
            min: 11,
            desc: "Por que as pessoas lembram de poucas marcas por categoria e como isso muda o que você comunica."
          },
          {
            id: "mkt-4",
            title: "Estudo de caso: duas cafeterias",
            min: 16,
            desc: "Duas cafeterias na mesma rua, com estratégias opostas. Analisamos o que cada uma escolheu abrir mão."
          }
        ]
      },
      {
        id: "mkt-m2",
        title: "Pesquisa e diagnóstico",
        lessons: [
          {
            id: "mkt-5",
            title: "Entrevistando clientes sem viés",
            min: 15,
            desc: "Roteiro de entrevista de 10 minutos, perguntas que evitam respostas educadas e como registrar o que ouviu."
          },
          {
            id: "mkt-6",
            title: "Mapa de concorrentes",
            min: 13,
            desc: "Monte um mapa de dois eixos e descubra onde há espaço livre. Inclui modelo editável."
          },
          {
            id: "mkt-7",
            title: "Matriz SWOT que gera decisão",
            min: 12,
            desc: "Como sair de uma lista de tópicos e chegar a três decisões concretas."
          },
          {
            id: "mkt-8",
            title: "Personas a partir de dados reais",
            min: 14,
            desc: "Personas baseadas nas entrevistas, sem inventar detalhes. Quando usar e quando dispensar."
          }
        ]
      },
      {
        id: "mkt-m3",
        title: "Proposta de posicionamento",
        lessons: [
          {
            id: "mkt-9",
            title: "Declaração de posicionamento",
            min: 10,
            desc: "A estrutura em uma frase: para quem, qual categoria, qual diferença e por que acreditar. Você escreve três versões e escolhe uma."
          },
          {
            id: "mkt-10",
            title: "Tom de voz e mensagens-chave",
            min: 13,
            desc: "Transforme o posicionamento em tom de voz e em três mensagens que a equipe consegue repetir."
          },
          {
            id: "mkt-11",
            title: "Canais e primeiros testes",
            min: 15,
            desc: "Escolha dois canais e desenhe testes baratos para validar as mensagens."
          },
          {
            id: "mkt-12",
            title: "Apresentando a estratégia",
            min: 12,
            desc: "Como organizar a apresentação final do projeto em 8 slides e antecipar as perguntas."
          }
        ]
      }
    ]
  },
  {
    id: "vendas",
    title: "Vendas Consultivas",
    cat: "vendas",
    level: "Iniciante",
    hours: 6,
    tone: "magenta",
    glyph: "v",
    plan: "pro",
    summary: "Venda como conversa: escute, entenda a necessidade e proponha uma solução que faça sentido para o cliente.",
    outcomes: [
      "Conduzir uma conversa de venda com perguntas abertas",
      "Tratar objeções sem pressionar",
      "Fazer follow-up e gerar indicações"
    ],
    skills: ["Vendas consultivas", "Escuta ativa", "Negociação", "Atendimento ao cliente"],
    project: {
      title: "Roteiro de atendimento comercial",
      brief: "Crie um roteiro de atendimento para um negócio real e teste com clientes.",
      expected: "Roteiro com momentos da conversa, perguntas abertas, respostas a objeções e registro do teste.",
      steps: ["Observação do atendimento atual", "Roteiro de conversa", "Teste com clientes", "Ajustes e resultado"]
    },
    modules: [
      {
        id: "vendas-m1",
        title: "A venda como conversa",
        lessons: [
          {
            id: "vendas-1",
            title: "Vender é ajudar a decidir",
            min: 10
          },
          {
            id: "vendas-2",
            title: "Escuta ativa e perguntas abertas",
            min: 14
          },
          {
            id: "vendas-3",
            title: "Mapeando a necessidade real",
            min: 12
          }
        ]
      },
      {
        id: "vendas-m2",
        title: "Do diagnóstico à proposta",
        lessons: [
          {
            id: "vendas-4",
            title: "Apresentando valor, não preço",
            min: 13
          },
          {
            id: "vendas-5",
            title: "Tratando objeções",
            min: 15
          },
          {
            id: "vendas-6",
            title: "Fechamento sem pressão",
            min: 11
          }
        ]
      },
      {
        id: "vendas-m3",
        title: "Pós-venda",
        lessons: [
          {
            id: "vendas-7",
            title: "Follow-up que não incomoda",
            min: 9
          },
          {
            id: "vendas-8",
            title: "Indicação e recompra",
            min: 10
          },
          {
            id: "vendas-9",
            title: "Simulação: atendimento completo",
            min: 18
          }
        ]
      }
    ],
    featured: false
  },
  {
    id: "prog",
    title: "Fundamentos de Programação",
    cat: "tech",
    level: "Iniciante",
    hours: 14,
    tone: "ink",
    glyph: "{",
    plan: "pro",
    featured: true,
    summary: "Lógica, JavaScript e o primeiro app publicado. Pensado para quem nunca escreveu uma linha de código.",
    outcomes: [
      "Quebrar um problema em passos que um computador executa",
      "Escrever funções, laços e condições em JavaScript",
      "Publicar um app simples na internet"
    ],
    skills: ["Lógica de programação", "JavaScript", "Resolução de problemas"],
    project: {
      title: "App de lista de tarefas em JavaScript",
      brief: "Construa e publique um app de tarefas com adicionar, concluir e filtrar.",
      expected: "Um link público do app funcionando e o código organizado em um repositório.",
      steps: ["Planejamento das funções", "Lógica principal", "Interface", "Publicação"]
    },
    modules: [
      {
        id: "prog-m1",
        title: "Pensamento computacional",
        lessons: [
          {
            id: "prog-1",
            title: "Algoritmos no dia a dia",
            min: 12
          },
          {
            id: "prog-2",
            title: "Variáveis e tipos",
            min: 16
          },
          {
            id: "prog-3",
            title: "Condições",
            min: 18
          }
        ]
      },
      {
        id: "prog-m2",
        title: "Repetição e funções",
        lessons: [
          {
            id: "prog-4",
            title: "Laços de repetição",
            min: 20
          },
          {
            id: "prog-5",
            title: "Funções",
            min: 22
          },
          {
            id: "prog-6",
            title: "Listas e objetos",
            min: 24
          }
        ]
      },
      {
        id: "prog-m3",
        title: "Primeiro projeto",
        lessons: [
          {
            id: "prog-7",
            title: "Planejando um app de tarefas",
            min: 15
          },
          {
            id: "prog-8",
            title: "Construindo a lógica",
            min: 28
          },
          {
            id: "prog-9",
            title: "Testando e publicando",
            min: 20
          }
        ]
      }
    ]
  },
  {
    id: "ingles",
    title: "Inglês para o Ambiente Profissional",
    cat: "idiomas",
    level: "Intermediário",
    hours: 12,
    tone: "lime",
    glyph: "en",
    plan: "pro",
    summary: "Apresente-se, participe de reuniões e responda entrevistas em inglês com segurança.",
    outcomes: [
      "Apresentar sua trajetória em inglês em até 90 segundos",
      "Escrever e-mails claros e objetivos",
      "Responder perguntas comuns de entrevista"
    ],
    skills: ["Inglês", "Comunicação escrita", "Comunicação oral"],
    project: {
      title: "Pitch pessoal em inglês",
      brief: "Grave um vídeo de 90 segundos apresentando sua trajetória e um projeto seu.",
      expected: "Vídeo de até 90 segundos com roteiro revisado e transcrição.",
      steps: ["Roteiro em inglês", "Revisão de pronúncia", "Gravação", "Transcrição e revisão"]
    },
    modules: [
      {
        id: "ingles-m1",
        title: "First impressions",
        lessons: [
          {
            id: "ingles-1",
            title: "Introducing yourself at work",
            min: 14
          },
          {
            id: "ingles-2",
            title: "Small talk sem travar",
            min: 12
          },
          {
            id: "ingles-3",
            title: "Talking about your experience",
            min: 15
          }
        ]
      },
      {
        id: "ingles-m2",
        title: "Meetings and email",
        lessons: [
          {
            id: "ingles-4",
            title: "Writing clear emails",
            min: 16
          },
          {
            id: "ingles-5",
            title: "Joining a meeting",
            min: 13
          },
          {
            id: "ingles-6",
            title: "Giving updates",
            min: 12
          }
        ]
      },
      {
        id: "ingles-m3",
        title: "Interviews",
        lessons: [
          {
            id: "ingles-7",
            title: "Common interview questions",
            min: 18
          },
          {
            id: "ingles-8",
            title: "Talking about your projects",
            min: 15
          },
          {
            id: "ingles-9",
            title: "Mock interview",
            min: 22
          }
        ]
      }
    ],
    featured: false
  },
  {
    id: "arq",
    title: "Introdução à Arquitetura",
    cat: "arquitetura",
    level: "Iniciante",
    hours: 10,
    tone: "paper",
    glyph: "a",
    plan: "pro",
    summary: "Escala, planta baixa, luz e materiais. Aprenda a ler e propor um espaço com desenho à mão e em planta.",
    outcomes: [
      "Ler e interpretar uma planta baixa",
      "Propor um layout funcional para um espaço pequeno",
      "Montar uma prancha de apresentação"
    ],
    skills: ["Leitura de planta", "Croqui", "Design de interiores"],
    project: {
      title: "Estudo de layout para um café de 40 m²",
      brief: "Proponha o layout de um café pequeno considerando fluxos, luz e mobiliário.",
      expected: "Uma prancha com planta de layout, dois croquis e memorial curto.",
      steps: ["Programa de necessidades", "Estudo de fluxos", "Planta de layout", "Prancha final"]
    },
    modules: [
      {
        id: "arq-m1",
        title: "Ver o espaço",
        lessons: [
          {
            id: "arq-1",
            title: "Escala e proporção",
            min: 14
          },
          {
            id: "arq-2",
            title: "Leitura de planta baixa",
            min: 18
          },
          {
            id: "arq-3",
            title: "Fluxos e circulação",
            min: 15
          }
        ]
      },
      {
        id: "arq-m2",
        title: "Conforto e materiais",
        lessons: [
          {
            id: "arq-4",
            title: "Luz natural e conforto",
            min: 16
          },
          {
            id: "arq-5",
            title: "Materiais e acabamentos",
            min: 14
          },
          {
            id: "arq-6",
            title: "Croqui à mão livre",
            min: 20
          }
        ]
      },
      {
        id: "arq-m3",
        title: "Projeto",
        lessons: [
          {
            id: "arq-7",
            title: "Programa de necessidades",
            min: 12
          },
          {
            id: "arq-8",
            title: "Layout em planta",
            min: 22
          },
          {
            id: "arq-9",
            title: "Prancha de apresentação",
            min: 18
          }
        ]
      }
    ],
    featured: false
  },
  {
    id: "excel",
    title: "Excel para Negócios",
    cat: "financas",
    level: "Iniciante",
    hours: 5,
    tone: "blue",
    glyph: "x",
    plan: "pro",
    summary: "Fórmulas, tabelas dinâmicas e um fluxo de caixa que um pequeno negócio usa de verdade.",
    outcomes: [
      "Organizar dados em tabelas que não quebram",
      "Usar PROCX, SOMASES e tabelas dinâmicas",
      "Montar um fluxo de caixa mensal com projeção"
    ],
    skills: ["Excel", "Fluxo de caixa", "Análise de dados"],
    project: {
      title: "Fluxo de caixa para um pequeno negócio",
      brief: "Monte o fluxo de caixa de três meses de um negócio real ou fictício.",
      expected: "Planilha com entradas, saídas, saldo projetado e um painel com 3 indicadores.",
      steps: ["Levantamento de entradas e saídas", "Estrutura da planilha", "Projeção", "Painel de indicadores"]
    },
    modules: [
      {
        id: "excel-m1",
        title: "Base sólida",
        lessons: [
          {
            id: "excel-1",
            title: "Organizando dados em tabelas",
            min: 10
          },
          {
            id: "excel-2",
            title: "Fórmulas essenciais",
            min: 14
          },
          {
            id: "excel-3",
            title: "PROCX e PROCV",
            min: 12
          }
        ]
      },
      {
        id: "excel-m2",
        title: "Análise",
        lessons: [
          {
            id: "excel-4",
            title: "Tabelas dinâmicas",
            min: 15
          },
          {
            id: "excel-5",
            title: "Gráficos que explicam",
            min: 11
          },
          {
            id: "excel-6",
            title: "Formatação condicional",
            min: 8
          }
        ]
      },
      {
        id: "excel-m3",
        title: "Fluxo de caixa",
        lessons: [
          {
            id: "excel-7",
            title: "Montando o fluxo de caixa",
            min: 16
          },
          {
            id: "excel-8",
            title: "Projeção simples",
            min: 12
          },
          {
            id: "excel-9",
            title: "Painel de indicadores",
            min: 14
          }
        ]
      }
    ],
    featured: false
  },
  {
    id: "comun",
    title: "Comunicação e Apresentações",
    cat: "marketing",
    level: "Iniciante",
    hours: 6,
    tone: "ink",
    glyph: "c",
    plan: "pro",
    summary: "Organize ideias, construa slides que ajudam e fale com clareza mesmo nervoso.",
    outcomes: [
      "Estruturar uma mensagem em três partes",
      "Montar slides que apoiam a fala",
      "Apresentar um pitch de 5 minutos"
    ],
    skills: ["Comunicação oral", "Storytelling", "Apresentações"],
    project: {
      title: "Pitch de 5 minutos",
      brief: "Prepare e apresente um pitch de 5 minutos sobre uma proposta real.",
      expected: "Slides, roteiro de fala e registro de feedback de quem assistiu.",
      steps: ["Mensagem central", "Roteiro e slides", "Ensaio gravado", "Apresentação e feedback"]
    },
    modules: [
      {
        id: "comun-m1",
        title: "Mensagem",
        lessons: [
          {
            id: "comun-1",
            title: "Estruturando uma mensagem",
            min: 11
          },
          {
            id: "comun-2",
            title: "Abertura que prende atenção",
            min: 10
          },
          {
            id: "comun-3",
            title: "Storytelling com dados",
            min: 14
          }
        ]
      },
      {
        id: "comun-m2",
        title: "Apresentação",
        lessons: [
          {
            id: "comun-4",
            title: "Slides que ajudam",
            min: 13
          },
          {
            id: "comun-5",
            title: "Voz, ritmo e pausa",
            min: 12
          },
          {
            id: "comun-6",
            title: "Lidando com nervosismo",
            min: 9
          }
        ]
      },
      {
        id: "comun-m3",
        title: "Na prática",
        lessons: [
          {
            id: "comun-7",
            title: "Perguntas difíceis",
            min: 11
          },
          {
            id: "comun-8",
            title: "Pitch de 5 minutos",
            min: 15
          },
          {
            id: "comun-9",
            title: "Feedback e revisão",
            min: 10
          }
        ]
      }
    ],
    featured: false
  },
  {
    id: "atend",
    title: "Atendimento e Experiência do Cliente",
    cat: "atendimento",
    level: "Iniciante",
    hours: 4,
    tone: "lime",
    glyph: "cx",
    plan: "free",
    summary: "Jornada do cliente, atendimento por WhatsApp e reclamações que viram fidelidade.",
    outcomes: [
      "Desenhar a jornada do cliente de um negócio",
      "Responder reclamações com método",
      "Acompanhar NPS e tempo de resposta"
    ],
    skills: ["Atendimento ao cliente", "Jornada do cliente", "Empatia"],
    project: {
      title: "Mapa da jornada do cliente",
      brief: "Mapeie a jornada de um cliente em um negócio real e proponha três melhorias.",
      expected: "Mapa com etapas, pontos de atrito e três melhorias priorizadas.",
      steps: ["Entrevistas rápidas", "Mapa da jornada", "Pontos de atrito", "Melhorias priorizadas"]
    },
    modules: [
      {
        id: "atend-m1",
        title: "Entendendo a experiência",
        lessons: [
          {
            id: "atend-1",
            title: "O que é experiência do cliente",
            min: 9
          },
          {
            id: "atend-2",
            title: "Jornada do cliente",
            min: 12
          },
          {
            id: "atend-3",
            title: "Pontos de atrito",
            min: 10
          }
        ]
      },
      {
        id: "atend-m2",
        title: "Atendimento no dia a dia",
        lessons: [
          {
            id: "atend-4",
            title: "Atendimento por WhatsApp",
            min: 11
          },
          {
            id: "atend-5",
            title: "Reclamações que viram fidelidade",
            min: 13
          },
          {
            id: "atend-6",
            title: "Scripts flexíveis",
            min: 9
          }
        ]
      },
      {
        id: "atend-m3",
        title: "Melhoria contínua",
        lessons: [
          {
            id: "atend-7",
            title: "NPS e tempo de resposta",
            min: 10
          },
          {
            id: "atend-8",
            title: "Rituais de melhoria",
            min: 8
          }
        ]
      }
    ],
    featured: false
  },
  {
    id: "dados",
    title: "IA e Dados no Trabalho",
    cat: "dados",
    level: "Iniciante",
    hours: 6,
    tone: "magenta",
    glyph: "ia",
    plan: "pro",
    summary: "Use planilhas e assistentes de IA para analisar dados de negócio com critério e checar resultados.",
    outcomes: [
      "Formular boas perguntas para dados",
      "Usar assistentes de IA e conferir o que eles respondem",
      "Montar um relatório curto com recomendações"
    ],
    skills: ["Análise de dados", "Uso responsável de IA", "Pensamento crítico"],
    project: {
      title: "Relatório de vendas com análise assistida",
      brief: "Analise três meses de vendas de um negócio e escreva um relatório com recomendações.",
      expected: "Relatório de 2 páginas com gráficos, conclusões checadas e próximos passos.",
      steps: ["Pergunta de negócio", "Preparação dos dados", "Análise e checagem", "Relatório"]
    },
    modules: [
      {
        id: "dados-m1",
        title: "Perguntas e dados",
        lessons: [
          {
            id: "dados-1",
            title: "Do problema à pergunta",
            min: 10
          },
          {
            id: "dados-2",
            title: "Limpando dados",
            min: 14
          },
          {
            id: "dados-3",
            title: "Leitura de gráficos",
            min: 12
          }
        ]
      },
      {
        id: "dados-m2",
        title: "IA com critério",
        lessons: [
          {
            id: "dados-4",
            title: "Como assistentes de IA funcionam",
            min: 12
          },
          {
            id: "dados-5",
            title: "Checando respostas",
            min: 14
          },
          {
            id: "dados-6",
            title: "Relatórios com recomendações",
            min: 15
          }
        ]
      }
    ],
    featured: false
  },
  {
    id: "selecao",
    title: "Processos Seletivos sem Mistério",
    cat: "carreira",
    level: "Iniciante",
    hours: 3,
    tone: "paper",
    glyph: "cv",
    plan: "free",
    summary: "Do anúncio da vaga ao teste prático. Como mostrar o que você sabe mesmo sem experiência formal.",
    outcomes: [
      "Ler uma vaga e identificar o que realmente importa",
      "Responder entrevistas pelo método STAR",
      "Montar um kit de candidatura coerente"
    ],
    skills: ["Entrevista por competências", "Autoapresentação", "Planejamento de carreira"],
    project: {
      title: "Kit de candidatura",
      brief: "Prepare currículo, carta de apresentação e perfil profissional para uma vaga real.",
      expected: "Kit com currículo ajustado à vaga, carta de 200 palavras e três respostas STAR.",
      steps: ["Leitura da vaga", "Currículo ajustado", "Carta de apresentação", "Respostas STAR"]
    },
    modules: [
      {
        id: "selecao-m1",
        title: "Entendendo o processo",
        lessons: [
          {
            id: "selecao-1",
            title: "Como funciona um processo seletivo",
            min: 8
          },
          {
            id: "selecao-2",
            title: "Lendo uma vaga de verdade",
            min: 10
          },
          {
            id: "selecao-3",
            title: "Currículo sem experiência formal",
            min: 12
          }
        ]
      },
      {
        id: "selecao-m2",
        title: "Etapas",
        lessons: [
          {
            id: "selecao-4",
            title: "Dinâmicas de grupo",
            min: 9
          },
          {
            id: "selecao-5",
            title: "Entrevista por competências (STAR)",
            min: 14
          },
          {
            id: "selecao-6",
            title: "Teste prático",
            min: 10
          }
        ]
      },
      {
        id: "selecao-m3",
        title: "Depois da entrevista",
        lessons: [
          {
            id: "selecao-7",
            title: "Follow-up e retorno",
            min: 7
          },
          {
            id: "selecao-8",
            title: "Lidando com um não",
            min: 8
          }
        ]
      }
    ],
    featured: false
  }
]

export const careerGoals: CareerGoal[] = [
  {
    id: "marketing",
    title: "Construir carreira em marketing",
    blurb: "Entender públicos, posicionar marcas e mostrar isso com projetos.",
    skills: ["Posicionamento de marca", "Pesquisa de mercado", "Storytelling", "Canva", "Análise de dados", "Inglês"],
    courses: ["mkt", "comun", "dados", "ingles"],
    projects: [
      "Diagnóstico de marca para um negócio do seu bairro",
      "Calendário de conteúdo de 30 dias com metas",
      "Análise de concorrentes de uma categoria que você conhece"
    ],
    keywords: ["marketing", "marca", "posicionamento", "comunicação"]
  },
  {
    id: "estagio",
    title: "Conseguir o primeiro estágio",
    blurb: "Montar um currículo com evidências e chegar preparado às entrevistas.",
    skills: [
      "Autoapresentação",
      "Entrevista por competências",
      "Comunicação oral",
      "Excel",
      "Inglês",
      "Trabalho em equipe"
    ],
    courses: ["selecao", "comun", "excel", "ingles"],
    projects: ["Kit de candidatura para uma vaga real", "Pitch pessoal de 90 segundos"],
    keywords: ["estágio", "estagio"]
  },
  {
    id: "programacao",
    title: "Aprender programação",
    blurb: "Sair do zero e publicar o primeiro app.",
    skills: ["Lógica de programação", "JavaScript", "Resolução de problemas", "Inglês"],
    courses: ["prog", "dados", "ingles"],
    projects: ["App de lista de tarefas", "Página pessoal publicada"],
    keywords: ["programação", "desenvolvimento", "tecnologia"]
  },
  {
    id: "vendas",
    title: "Desenvolver habilidades de vendas",
    blurb: "Vender com escuta, método e sem pressão.",
    skills: ["Vendas consultivas", "Negociação", "Escuta ativa", "Atendimento ao cliente"],
    courses: ["vendas", "atend", "comun"],
    projects: ["Roteiro de atendimento comercial", "Simulação de negociação gravada"],
    keywords: ["vendas", "comercial"]
  },
  {
    id: "processo",
    title: "Preparar-me para um processo seletivo",
    blurb: "Treinar as etapas mais comuns com antecedência.",
    skills: ["Entrevista por competências", "Autoapresentação", "Comunicação oral", "Inglês"],
    courses: ["selecao", "comun", "ingles"],
    projects: ["Três respostas STAR revisadas", "Simulação de entrevista em vídeo"],
    keywords: ["processo seletivo", "trainee"]
  },
  {
    id: "ingles",
    title: "Melhorar o inglês",
    blurb: "Usar o inglês em reuniões, e-mails e entrevistas.",
    skills: ["Inglês", "Comunicação escrita", "Comunicação oral"],
    courses: ["ingles"],
    projects: ["Pitch pessoal em inglês", "Três e-mails profissionais revisados"],
    keywords: ["inglês", "ingles"]
  },
  {
    id: "familia",
    title: "Ajudar a administrar a empresa da família",
    blurb: "Organizar caixa, atendimento e vendas do negócio familiar.",
    skills: ["Fluxo de caixa", "Excel", "Atendimento ao cliente", "Vendas consultivas", "Análise de dados"],
    courses: ["excel", "atend", "vendas", "dados"],
    projects: ["Fluxo de caixa de três meses", "Mapa da jornada do cliente do negócio"],
    keywords: ["empresa", "negócio", "gestão"]
  },
  {
    id: "criativo",
    title: "Construir um portfólio criativo",
    blurb: "Mostrar processo e resultado em projetos visuais.",
    skills: ["Design gráfico", "Canva", "Croqui", "Storytelling"],
    courses: ["arq", "comun"],
    projects: ["Estudo de layout de um espaço pequeno", "Identidade visual para um projeto escolar"],
    keywords: ["design", "criativo", "arquitetura"]
  }
]
