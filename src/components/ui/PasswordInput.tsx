'use client'

import { useState, type ComponentProps } from 'react'
import { Icon } from './Icon'

/**
 * Campo de senha com um olho para mostrar ou esconder o que foi digitado.
 * O campo continua o mesmo (só muda o `type`), então o que a pessoa digitou não se perde
 * e o gerenciador de senhas segue funcionando.
 */
export function PasswordInput({ className = '', ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="pw-wrap">
      <input {...props} type={shown ? 'text' : 'password'} className={'inp ' + className} />
      <button
        type="button"
        className="pw-eye"
        aria-label={shown ? 'Esconder a senha' : 'Mostrar a senha'}
        aria-pressed={shown}
        title={shown ? 'Esconder a senha' : 'Mostrar a senha'}
        // Não tira o foco do campo ao clicar (o cursor continua onde estava).
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShown((v) => !v)}
      >
        <Icon name={shown ? 'EyeOff' : 'Eye'} size={18} />
      </button>
    </div>
  )
}
