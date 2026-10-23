'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useApp } from '@/components/providers/AppState'
import { playerEventAction } from '@/lib/actions/audience'

type Device = 'computador' | 'celular' | 'tablet'

function deviceOf(): Device {
  const w = window.innerWidth
  return w < 700 ? 'celular' : w < 1100 ? 'tablet' : 'computador'
}

/**
 * Manda os sinais do player para a audiência: play, batimento a cada `heartbeatSec` enquanto toca,
 * pause, fim e saída. A sessão é um código novo por abertura da aula (some do "ao vivo" sozinha
 * se o sinal parar). Nada aqui é mostrado ao aluno e erro nenhum interrompe a aula.
 */
export function useAudience(courseId: string, lessonId: string) {
  const { config } = useApp()
  const session = useRef('')
  const clock = useRef({ pos: 0, dur: 0, playing: false, started: false })
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const emit = useCallback(
    (event: 'play' | 'beat' | 'pause' | 'end' | 'leave') => {
      if (!session.current) return
      const c = clock.current
      void playerEventAction({ session: session.current, course: courseId, lesson: lessonId, event, position: c.pos, duration: c.dur, device: deviceOf() }).catch(() => {})
    },
    [courseId, lessonId],
  )

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  useEffect(() => {
    session.current = crypto.randomUUID()
    const c = clock.current
    const leave = () => {
      if (!c.started) return
      c.started = false
      c.playing = false
      stopTimer()
      emit('leave')
    }
    return leave
  }, [emit])

  const every = Math.max(10, config.heartbeatSec) * 1000

  return {
    time: (pos: number, dur: number) => {
      const c = clock.current
      c.pos = Number.isFinite(pos) ? pos : 0
      if (Number.isFinite(dur) && dur > 0) c.dur = dur
    },
    play: () => {
      const c = clock.current
      if (c.playing) return
      c.playing = true
      c.started = true
      emit('play')
      stopTimer()
      timer.current = setInterval(() => emit('beat'), every)
    },
    pause: () => {
      const c = clock.current
      if (!c.playing) return
      c.playing = false
      stopTimer()
      emit('pause')
    },
    end: () => {
      const c = clock.current
      if (!c.started) return
      c.playing = false
      c.started = false
      stopTimer()
      emit('end')
    },
  }
}
