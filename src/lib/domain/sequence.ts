import type { UserState } from '@/lib/types'

/**
 * Aulas em sequência: o aluno só abre uma aula se todas as anteriores do curso estiverem concluídas
 * (ex.: para a aula 4, as aulas 1, 2 e 3). Uma aula que ele já concluiu continua aberta, mesmo que
 * ele desmarque uma anterior depois. A equipe (editor, admin, proprietário) abre qualquer aula.
 *
 * Funções puras: a tela e o servidor usam as mesmas, e por isso podem ser testadas.
 */

/** A regra de sequência vale para esse papel? (Só para aluno.) */
export const followsSequence = (role: UserState['role']) => role === 'aluno'

/**
 * Posição, na lista do curso, da primeira aula anterior que ainda não foi concluída,
 * ou -1 se a aula `index` está liberada.
 */
export function blockingIndex(lessons: { id: string }[], index: number, isDone: (lessonId: string) => boolean): number {
  if (index < 0 || index >= lessons.length) return -1
  if (isDone(lessons[index].id)) return -1
  for (let i = 0; i < index; i++) {
    if (!isDone(lessons[i].id)) return i
  }
  return -1
}
