import { ImageResponse } from 'next/og'

/**
 * Imagem que aparece quando o link da Folyo é compartilhado (WhatsApp, Instagram, LinkedIn, X...)
 * e que o Google pode usar nos resultados. Gerada aqui, sem arquivo de imagem para manter.
 */
export const alt = 'Folyo · Aprenda. Crie. Conquiste.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Símbolo da marca (o mesmo de src/styles/tokens.css).
const MARK =
  'M58.5 249.5L54.0 249.7L48.0 249.3L43.2 248.7L38.5 247.4L33.5 245.6L29.8 243.8L24.8 240.5L21.4 237.8L18.1 234.5L15.0 231.0L12.2 227.0L9.2 221.5L6.0 212.9L4.9 208.0L4.1 200.8L4.1 193.0L5.0 184.8L6.2 178.8L9.1 168.5L12.1 160.2L15.2 153.5L20.1 144.5L25.0 137.2L30.8 129.7L36.4 123.2L43.3 116.2L50.0 110.2L64.2 99.0L74.4 92.0L86.0 84.8L86.9 83.5L86.8 67.0L86.2 65.8L73.8 65.8L67.8 64.7L64.2 63.6L60.0 61.6L55.5 58.5L52.5 55.7L49.1 51.2L46.0 45.0L44.1 37.2L44.1 29.8L46.1 22.5L48.2 18.2L51.0 14.6L53.5 12.2L58.2 9.0L62.8 7.1L67.5 6.0L77.0 6.0L82.0 7.2L87.0 9.1L92.3 12.0L96.2 15.3L99.5 18.8L101.7 22.0L104.8 27.9L106.9 34.2L107.3 34.8L108.0 34.9L117.0 30.6L125.8 25.5L130.4 22.5L138.2 16.8L151.5 6.0L153.8 5.1L156.2 4.7L160.8 5.3L162.8 6.3L165.2 8.4L166.7 10.2L167.8 13.0L168.1 15.8L167.8 19.0L166.8 21.6L165.5 23.4L153.9 33.5L147.5 38.3L140.0 43.5L129.8 49.6L124.0 52.6L109.9 59.0L109.4 60.2L109.6 70.0L110.2 70.8L111.2 70.8L126.8 67.1L143.5 64.2L160.5 62.4L166.2 62.3L169.0 63.0L171.2 64.2L173.2 65.9L174.7 67.8L175.7 70.0L176.3 73.2L175.5 77.8L174.3 80.0L172.2 82.2L170.2 83.7L167.5 84.7L151.2 86.2L139.0 88.0L124.2 91.0L111.8 94.1L110.3 95.0L110.1 96.0L110.1 100.8L110.5 130.8L109.8 166.2L108.7 187.8L106.8 207.5L104.7 216.8L101.7 223.5L98.5 228.5L93.8 234.0L87.2 239.5L80.2 243.7L73.0 246.7L65.5 248.7L58.5 249.5ZM82.5 43.0L84.0 42.8L84.8 42.3L84.8 40.0L82.8 34.8L80.2 31.5L76.0 29.2L72.2 28.5L69.5 28.9L68.0 30.0L67.0 32.0L67.0 35.5L67.9 38.2L69.6 40.5L71.2 41.7L74.0 42.8L79.0 43.2L82.5 43.0ZM58.0 226.8L60.0 226.5L66.8 224.7L69.5 223.5L74.5 220.6L78.0 217.5L80.5 214.5L82.6 210.8L83.7 207.2L85.6 189.2L87.3 156.2L87.8 121.8L87.7 112.2L87.5 111.5L87.0 111.3L86.0 111.6L76.8 118.0L65.4 127.0L55.8 136.0L48.1 144.5L41.0 154.2L36.2 162.5L33.1 169.2L31.1 174.5L28.1 184.8L26.9 192.5L27.0 201.2L28.2 207.5L30.0 212.2L31.8 215.2L34.2 218.5L36.5 220.7L40.2 223.5L42.5 224.7L49.5 226.6L58.0 226.8Z'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          color: '#F3F2F8',
          backgroundColor: '#0B0B12',
          backgroundImage:
            'radial-gradient(circle at 88% 8%, rgba(221,51,207,0.35) 0%, rgba(221,51,207,0) 45%), radial-gradient(circle at 8% 100%, rgba(45,36,200,0.55) 0%, rgba(45,36,200,0) 55%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <svg width="88" height="123" viewBox="0 0 181 254">
            <path fillRule="evenodd" fill="#ABA6FF" d={MARK} />
          </svg>
          <div style={{ display: 'flex', fontSize: 132, fontWeight: 700, letterSpacing: -4, marginLeft: 36 }}>Folyo</div>
        </div>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, marginTop: 44 }}>
          <span>Aprenda.&nbsp;</span>
          <span style={{ color: '#ABA6FF' }}>Crie.&nbsp;</span>
          <span style={{ color: '#C9E23F' }}>Conquiste.</span>
        </div>
        <div style={{ display: 'flex', fontSize: 32, color: '#9E9CB2', marginTop: 28 }}>
          Cursos práticos com projeto real e certificado para o seu currículo.
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#9E9CB2', marginTop: 64 }}>usefolyo.com</div>
      </div>
    ),
    size,
  )
}
