import { isExternalVideo, isHttpsUrl } from '@/lib/admin/catalog'
import type { LessonVideo } from '@/lib/types'

/**
 * "Chegar ao fim para concluir": a pessoa pode pular trechos e arrastar a barra à vontade, mas só
 * conclui a aula (e vai para a próxima) quando o vídeo chega ao final. Funções puras (sem React),
 * para poderem ser testadas. A conferência é feita na tela: o banco não sabe em que ponto do vídeo
 * a pessoa está.
 */

/** Folga, em segundos, para considerar que o vídeo chegou ao fim (o player avisa o tempo a cada ~0,25 a 1 s). */
export const END_SLACK = 1

/** A Folyo consegue saber quando o vídeo acaba? (Bunny, ou link direto de .mp4/.webm.) */
export function isTrackedVideo(video: LessonVideo | null | undefined): boolean {
  if (!video) return false
  if (video.kind === 'bunny') return true
  return isHttpsUrl(video.url) && !isExternalVideo(video.url)
}

/** O vídeo chegou ao final? Sem a duração do player (ainda não carregou), nunca. */
export function reachedEnd(current: number, duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && current >= duration - END_SLACK
}

/** Abaixo disto (segundos) a pessoa praticamente não saiu do começo: a aula recomeça do início. */
export const RESUME_MIN = 5
/** O ponto salvo só é regravado quando muda pelo menos isto (segundos), para não gravar a cada instante. */
export const POSITION_STEP = 5

/** Ponto de onde a aula continua: o segundo salvo, ou 0 (início) se for inválido ou muito perto do começo. */
export function resumePoint(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < RESUME_MIN) return 0
  return Math.min(86400, Math.floor(seconds))
}

/** Vale gravar o novo ponto? Sim se andou `POSITION_STEP` s ou mais, ou se voltou ao início (0). */
export function shouldSavePosition(saved: number, next: number): boolean {
  if (next === saved) return false
  return next === 0 || Math.abs(next - saved) >= POSITION_STEP
}
