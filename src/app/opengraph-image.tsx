import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { MARK, WORDMARK } from '@/components/brand/logo-paths'

/**
 * Imagem que aparece quando o link da Folyo é compartilhado (WhatsApp, Instagram, LinkedIn, X...)
 * e que o Google pode usar nos resultados. Gerada aqui (no build), sem arquivo de imagem para manter.
 *
 * Segue a identidade da marca, igual à arte da tela de entrada: fundo azul da Folyo, logotipo "folyo"
 * de verdade (os vetores de src/components/brand), "Aprenda. Crie. Conquiste." em Poppins com o
 * "Conquiste." em lima, e o "f" gigante com o degradê violeta → rosa.
 *
 * O gerador de imagem (next/og) não lê .woff2: as fontes vão em .ttf em src/app/fonts/og
 * (as mesmas Poppins e Inter do site, só convertidas; licença SIL OFL).
 */
export const alt = 'Folyo · Aprenda. Crie. Conquiste. Cursos práticos com projeto real e certificado para o seu currículo.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Cores da marca (as mesmas de src/styles/tokens.css e da arte da tela de entrada).
const BLUE = '#2D24C8'
const LIME = '#C9E23F'

const font = (file: string) => readFile(join(process.cwd(), 'src/app/fonts/og', file))
const fontsReady = Promise.all([font('poppins-600.ttf'), font('inter-400.ttf'), font('inter-500.ttf')])

export default async function OpengraphImage() {
  const [poppins600, inter400, inter500] = await fontsReady
  const wordmarkHeight = 62
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: BLUE,
          color: '#fff',
          fontFamily: 'Inter',
        }}
      >
        {/* O "f" gigante da arte da entrada, saindo pela borda direita. */}
        <svg
          width={560}
          height={786}
          viewBox={`0 0 ${MARK.w} ${MARK.h}`}
          style={{ position: 'absolute', right: -36, top: -96, transform: 'rotate(-6deg)' }}
        >
          <defs>
            <linearGradient id="mark" x1="0" y1="0" x2="0" y2={MARK.h} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#6A4DFF" />
              <stop offset="1" stopColor="#E234CF" />
            </linearGradient>
          </defs>
          <path d={MARK.d} fill="url(#mark)" fillRule="evenodd" />
        </svg>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '54px 72px 54px',
          }}
        >
          {/* Logotipo "folyo": "f" em degradê lima e o resto em branco. */}
          <svg width={(wordmarkHeight * WORDMARK.w) / WORDMARK.h} height={wordmarkHeight} viewBox={`0 0 ${WORDMARK.w} ${WORDMARK.h}`}>
            <defs>
              <linearGradient id="wf" x1="0" y1={WORDMARK.fTop} x2="0" y2={WORDMARK.fBottom} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#9DB61E" />
                <stop offset="1" stopColor="#ECFF8E" />
              </linearGradient>
            </defs>
            <path d={WORDMARK.f} fill="url(#wf)" fillRule="evenodd" />
            <path d={WORDMARK.rest} fill="#fff" fillRule="evenodd" />
          </svg>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Poppins',
              fontWeight: 600,
              fontSize: 96,
              lineHeight: 0.96,
              letterSpacing: -4.8,
            }}
          >
            <span>Aprenda.</span>
            <span>Crie.</span>
            <span style={{ color: LIME }}>Conquiste.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', fontSize: 27, lineHeight: 1.3, color: 'rgba(255,255,255,0.86)', maxWidth: 600 }}>
              Cursos práticos com projeto real e certificado para o seu currículo.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 24, fontWeight: 500, color: LIME }}>
              <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 10, backgroundColor: LIME }} />
              usefolyo.com
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Poppins', data: poppins600, weight: 600, style: 'normal' },
        { name: 'Inter', data: inter400, weight: 400, style: 'normal' },
        { name: 'Inter', data: inter500, weight: 500, style: 'normal' },
      ],
    },
  )
}
