'use client'

import { useEffect, useState, type CSSProperties, type InputHTMLAttributes } from 'react'

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  inputStyle?: CSSProperties
}

/**
 * Prefer type="text" + CSS disc masking so Chrome/Edge do not treat this as a
 * password field (which triggers the "found in a data breach" warning).
 * Falls back to type="password" when -webkit-text-security is unsupported (Firefox).
 */
export function PasswordInput({
  inputStyle,
  style,
  className,
  autoComplete = 'off',
  name = 'access_key',
  ...props
}: PasswordInputProps) {
  const [maskSupported, setMaskSupported] = useState(true)

  useEffect(() => {
    const probe = document.createElement('input')
    probe.style.setProperty('-webkit-text-security', 'disc')
    document.body.appendChild(probe)
    const supported = getComputedStyle(probe).getPropertyValue('-webkit-text-security').trim() === 'disc'
    document.body.removeChild(probe)
    setMaskSupported(supported)
  }, [])

  const mergedStyle = {
    ...inputStyle,
    ...style,
    ...(maskSupported ? { WebkitTextSecurity: 'disc' } : null),
  } as CSSProperties

  return (
    <input
      {...props}
      type={maskSupported ? 'text' : 'password'}
      name={name}
      autoComplete={autoComplete}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      inputMode="text"
      data-1p-ignore="true"
      data-lpignore="true"
      data-form-type="other"
      data-bwignore="true"
      className={['lurvox-password-input', className].filter(Boolean).join(' ')}
      style={mergedStyle}
    />
  )
}
