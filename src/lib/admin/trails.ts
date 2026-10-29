/**
 * Trilhas de carreira no painel: limites (iguais aos do banco, 20261030000004_trilhas.sql).
 * O formato de uma trilha (Trail) fica em src/lib/trails.ts.
 */
export const TRAIL_LIMITS = {
  title: { min: 3, max: 80 },
  blurb: 200,
  skills: { items: 10, length: 40 },
  keywords: { items: 10, length: 40 },
  /** Cursos escolhidos à mão por trilha. */
  courses: 12,
  /** Trilhas no total. */
  total: 30,
} as const
