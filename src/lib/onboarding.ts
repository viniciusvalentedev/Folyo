import type { IconName } from '@/components/ui/Icon'

/** Opções do primeiro acesso (usadas na tela e validadas de novo no servidor). */
export const STAGES: { value: string; label: string; icon: IconName }[] = [
  { value: 'Estudante do ensino médio', label: 'Estou no ensino médio', icon: 'BookOpen' },
  { value: 'Estudante de graduação ou curso técnico', label: 'Estou na faculdade ou em curso técnico', icon: 'GraduationCap' },
  { value: 'Em busca da primeira oportunidade', label: 'Já me formei e busco a primeira oportunidade', icon: 'Rocket' },
  { value: 'Profissional em desenvolvimento', label: 'Já trabalho e quero crescer ou mudar de área', icon: 'Briefcase' },
]

export const PACES = [
  { value: 2, label: 'Pouco', detail: 'cerca de 30 min por semana' },
  { value: 4, label: 'Moderado', detail: 'cerca de 1 hora por semana' },
  { value: 8, label: 'Intenso', detail: '2 horas ou mais por semana' },
]

export const isKnownStage = (v: string) => STAGES.some((s) => s.value === v)
