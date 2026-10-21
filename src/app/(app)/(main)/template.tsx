/** O template é recriado a cada troca de página: assim a animação de entrada roda sempre. */
export default function RouteTemplate({ children }: { children: React.ReactNode }) {
  return <div className="route">{children}</div>
}
