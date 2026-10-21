import type { UserState } from '@/lib/types'

/**
 * Conta de demonstração: Ana Souza, com cerca de 3 meses de uso.
 * Serve só para o front ter o que mostrar enquanto não existe login nem banco.
 *
 * Importante: diferente do protótipo, aqui NÃO existe nenhuma senha guardada no código.
 * Quando o login real chegar (Supabase Auth), este arquivo deixa de ser usado.
 */
export const demoUserState: UserState = {
  onboarded: true,
  user: {
    name: "Ana Souza",
    first: "Ana",
    headline: "Estudante de Administração · vendas e marketing",
    city: "Belo Horizonte, MG",
    email: "ana.souza@exemplo.demo",
    phone: "(31) 90000-0000",
    link: "",
    bio: "Estudo Administração e ajudo no atendimento da padaria da minha família desde 2023. Gosto de entender por que as pessoas compram e de transformar isso em ações simples no balcão e nas redes.",
    objective: "Busco uma oportunidade para aprender e crescer profissionalmente.",
    interests: ["Marketing", "Vendas", "Negócios familiares", "Inglês"],
    joined: "2026-07-27",
    education: [
      {
        id: "e1",
        course: "Bacharelado em Administração",
        inst: "Centro Universitário Horizonte",
        period: "2025 – 2028 (em andamento)"
      },
      {
        id: "e2",
        course: "Ensino Médio",
        inst: "Colégio Estadual Monte Verde",
        period: "Concluído em 2024"
      }
    ],
    experiences: [
      {
        id: "x1",
        kind: "profissional",
        role: "Atendimento e vendas (empresa familiar)",
        org: "Padaria Souza",
        period: "2023 – atual",
        desc: "Atendimento no balcão e pelo WhatsApp, controle de encomendas e organização do caderno de pedidos.",
        skills: ["Atendimento ao cliente", "Vendas consultivas"]
      },
      {
        id: "x2",
        kind: "extracurricular",
        role: "Diretora de comunicação",
        org: "Grêmio estudantil · Colégio Monte Verde",
        period: "2023 – 2024",
        desc: "Coordenei as redes do grêmio e a divulgação da feira cultural, com equipe de 5 pessoas.",
        skills: ["Trabalho em equipe", "Canva"]
      }
    ],
    languages: [
      {
        id: "g1",
        name: "Português",
        level: "Nativo"
      }
    ],
    achievements: [
      {
        id: "a1",
        text: "2º lugar na feira de empreendedorismo do colégio (2024)"
      }
    ]
  },
  completed: {
    "vendas-1": "2026-07-28",
    "vendas-2": "2026-08-04",
    "vendas-3": "2026-08-06",
    "vendas-4": "2026-08-11",
    "vendas-5": "2026-08-13",
    "vendas-6": "2026-08-15",
    "vendas-7": "2026-08-18",
    "vendas-8": "2026-08-20",
    "vendas-9": "2026-08-22",
    "comun-1": "2026-08-19",
    "comun-2": "2026-08-25",
    "comun-3": "2026-08-27",
    "comun-4": "2026-09-01",
    "comun-5": "2026-09-03",
    "comun-6": "2026-09-05",
    "comun-7": "2026-09-08",
    "comun-8": "2026-09-15",
    "comun-9": "2026-09-17",
    "mkt-1": "2026-09-22",
    "mkt-2": "2026-09-24",
    "ingles-1": "2026-09-26",
    "mkt-3": "2026-09-29",
    "mkt-4": "2026-10-01",
    "mkt-5": "2026-10-03",
    "ingles-2": "2026-09-30",
    "mkt-6": "2026-10-06",
    "mkt-7": "2026-10-08",
    "ingles-3": "2026-10-13",
    "mkt-8": "2026-10-15"
  },
  lastLesson: {
    mkt: "mkt-9",
    ingles: "ingles-4"
  },
  started: {
    mkt: true,
    ingles: true,
    vendas: true,
    comun: true
  },
  favorites: ["prog", "excel"],
  notes: {
    "mkt-8": "Persona principal do Café Lumen: estudantes que trabalham perto e querem um lugar silencioso para ler. Confirmar com mais 3 entrevistas."
  },
  projects: [
    {
      id: "p-cafe",
      courseId: "mkt",
      origin: "curso",
      status: "andamento",
      tone: "blue",
      title: "Diagnóstico de marca · Café Lumen",
      desc: "Diagnóstico de marca e proposta de posicionamento para o Café Lumen, cafeteria fictícia perto de uma universidade.",
      problem: "O Café Lumen tem movimento bom pela manhã, mas a tarde fica vazia. A comunicação fala de \"café especial\" igual às três concorrentes da rua.",
      skills: ["Posicionamento de marca", "Pesquisa de mercado", "Análise de concorrência"],
      tools: ["Google Forms", "Miro", "Canva"],
      steps: [
        {
          id: "s1",
          title: "Pesquisa com público",
          done: true,
          note: "12 entrevistas de 10 minutos com clientes da manhã e da tarde. Principal achado: quem vem à tarde procura silêncio e tomada, não café especial."
        },
        {
          id: "s2",
          title: "Mapa de concorrentes",
          done: true,
          note: "Mapa com eixos preço × ambiente para estudar. As 3 concorrentes se posicionam como \"café especial\"; ninguém ocupa \"lugar para estudar\"."
        },
        {
          id: "s3",
          title: "Proposta de posicionamento",
          done: false,
          note: ""
        },
        {
          id: "s4",
          title: "Apresentação final",
          done: false,
          note: ""
        }
      ],
      result: "",
      links: [
        {
          id: "l1",
          label: "Mapa de concorrentes (Miro)",
          url: "https://miro.com"
        }
      ],
      completedAt: null,
      startedAt: "2026-10-05"
    },
    {
      id: "p-padaria",
      courseId: "vendas",
      origin: "curso",
      status: "concluido",
      tone: "magenta",
      title: "Roteiro de atendimento · Padaria Souza",
      desc: "Roteiro de conversa para o balcão e o WhatsApp da padaria da família, testado durante três semanas.",
      problem: "Os clientes pediam sempre os mesmos itens e quase ninguém sabia que a padaria fazia encomendas para eventos, que têm margem maior.",
      skills: ["Vendas consultivas", "Atendimento ao cliente", "Escuta ativa"],
      tools: ["Google Docs", "WhatsApp Business", "Canva"],
      steps: [
        {
          id: "s1",
          title: "Observação do atendimento atual",
          done: true,
          note: "Acompanhei 40 atendimentos e anotei as perguntas que os clientes faziam."
        },
        {
          id: "s2",
          title: "Roteiro de conversa",
          done: true,
          note: "Roteiro com 4 momentos e 6 perguntas abertas, incluindo uma sobre datas especiais."
        },
        {
          id: "s3",
          title: "Teste com clientes",
          done: true,
          note: "Teste no balcão e no WhatsApp por 3 semanas, com registro no caderno de pedidos."
        },
        {
          id: "s4",
          title: "Ajustes e resultado",
          done: true,
          note: "Duas perguntas foram simplificadas depois do feedback da equipe."
        }
      ],
      result: "Em 3 semanas de teste foram registradas 11 encomendas para eventos. Antes eram cerca de 4 por mês, segundo o caderno de pedidos.",
      links: [
        {
          id: "l1",
          label: "Roteiro final (documento)",
          url: "https://docs.google.com"
        }
      ],
      completedAt: "2026-08-22",
      startedAt: "2026-08-04"
    },
    {
      id: "p-pitch",
      courseId: "comun",
      origin: "curso",
      status: "concluido",
      tone: "ink",
      title: "Pitch: delivery próprio para a Padaria Souza",
      desc: "Apresentação de 5 minutos para a família comparando aplicativos de entrega com uma entrega própria aos sábados.",
      problem: "A padaria pagava 27% de comissão em aplicativos de entrega e a família não sabia se valia a pena ter entrega própria.",
      skills: ["Comunicação oral", "Storytelling", "Apresentações"],
      tools: ["Google Slides", "Google Planilhas"],
      steps: [
        {
          id: "s1",
          title: "Mensagem central",
          done: true,
          note: "\"Entregar nós mesmos aos sábados custa menos que a comissão e aproxima os clientes.\""
        },
        {
          id: "s2",
          title: "Roteiro e slides",
          done: true,
          note: "8 slides, com um comparativo de custos mês a mês."
        },
        {
          id: "s3",
          title: "Ensaio gravado",
          done: true,
          note: "Dois ensaios gravados; cortei 1 minuto de introdução."
        },
        {
          id: "s4",
          title: "Apresentação e feedback",
          done: true,
          note: "Apresentado para 4 pessoas da família."
        }
      ],
      result: "A família decidiu testar a entrega própria aos sábados por dois meses, começando em outubro.",
      links: [
        {
          id: "l1",
          label: "Slides do pitch",
          url: "https://slides.google.com"
        }
      ],
      completedAt: "2026-09-30",
      startedAt: "2026-09-08"
    },
    {
      id: "p-gremio",
      courseId: null,
      origin: "externo",
      status: "revisao",
      tone: "lime",
      title: "Identidade visual do grêmio estudantil",
      desc: "Logo, paleta e modelos de post para o grêmio do Colégio Monte Verde.",
      problem: "Cada membro do grêmio fazia posts com um visual diferente e a página não era reconhecida pelos alunos.",
      skills: ["Design gráfico", "Canva", "Trabalho em equipe"],
      tools: ["Canva"],
      steps: [
        {
          id: "s1",
          title: "Referências e rascunhos",
          done: true,
          note: ""
        },
        {
          id: "s2",
          title: "Logo e paleta",
          done: true,
          note: ""
        },
        {
          id: "s3",
          title: "Modelos de post",
          done: true,
          note: ""
        }
      ],
      result: "",
      links: [],
      completedAt: "2024-05-10",
      startedAt: "2024-03-01"
    }
  ],
  skills: [
    {
      id: "k1",
      name: "Vendas consultivas",
      type: "tecnica",
      inCV: true,
      note: "",
      createdAt: "2026-08-24"
    },
    {
      id: "k2",
      name: "Atendimento ao cliente",
      type: "tecnica",
      inCV: true,
      note: "Atendo no balcão e no WhatsApp da padaria desde 2023.",
      createdAt: "2026-07-27"
    },
    {
      id: "k3",
      name: "Comunicação oral",
      type: "comportamental",
      inCV: true,
      note: "",
      createdAt: "2026-09-20"
    },
    {
      id: "k4",
      name: "Storytelling",
      type: "tecnica",
      inCV: false,
      note: "",
      createdAt: "2026-09-20"
    },
    {
      id: "k5",
      name: "Pesquisa de mercado",
      type: "tecnica",
      inCV: false,
      note: "",
      createdAt: "2026-10-08"
    },
    {
      id: "k6",
      name: "Canva",
      type: "ferramenta",
      inCV: true,
      note: "",
      createdAt: "2026-07-27"
    },
    {
      id: "k7",
      name: "Google Planilhas",
      type: "ferramenta",
      inCV: true,
      note: "Uso para controlar encomendas da padaria.",
      createdAt: "2026-07-27"
    },
    {
      id: "k8",
      name: "Trabalho em equipe",
      type: "comportamental",
      inCV: true,
      note: "",
      createdAt: "2026-07-27"
    },
    {
      id: "k9",
      name: "Liderança",
      type: "comportamental",
      inCV: true,
      note: "",
      createdAt: "2026-07-27"
    },
    {
      id: "k10",
      name: "Português",
      type: "idioma",
      inCV: false,
      note: "Nativo",
      createdAt: "2026-07-27"
    }
  ],
  resume: {
    template: "classico",
    order: ["objetivo", "formacao", "experiencia", "projetos", "cursos", "competencias", "idiomas", "conquistas"],
    hidden: [],
    projects: ["p-padaria"],
    certs: ["vendas"],
    savedAt: "2026-10-12T21:40:00",
    dirty: false
  },
  goals: {
    primary: "marketing",
    secondary: ["familia"]
  },
  settings: {
    publicProfile: true,
    showEmail: false,
    publicPortfolio: true,
    notifyLessons: true,
    notifyWeekly: true,
    notifyNews: false,
    weeklyGoal: 5,
    studyTime: "noite",
    captions: true,
    autoplay: false,
    reduceMotion: false
  },
  notifications: [
    {
      id: "n1",
      text: "Seu projeto \"Identidade visual do grêmio\" precisa de um resultado descrito.",
      to: "/projetos/p-gremio",
      read: false,
      date: "2026-10-18"
    },
    {
      id: "n2",
      text: "Faltam 4 aulas para concluir Marketing Estratégico na Prática.",
      to: "/cursos/mkt",
      read: false,
      date: "2026-10-17"
    },
    {
      id: "n3",
      text: "Certificado de Comunicação e Apresentações disponível (demonstração).",
      to: "/certificados",
      read: true,
      date: "2026-09-30"
    }
  ]
}
