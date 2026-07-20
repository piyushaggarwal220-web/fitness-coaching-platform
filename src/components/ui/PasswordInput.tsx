'use client'

import type { CSSProperties, InputHTMLAttributes } from 'react'

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  inputStyle?: CSSProperties
}

/**
 * Uses type="text" + CSS disc masking so Chrome/Edge do not treat this as a
 * password field (which triggers the "found in a data breach" warning).
 */
export function PasswordInput({
  inputStyle,
  style,
  className,
  autoComplete = 'off',
  name = 'access_key',
  ...props
}: PasswordInputProps) {
  return (
    <input
      {...props}
      type="text"
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
      style={{
        ...inputStyle,
        ...style,
        WebkitTextSecurity: 'disc',
      }}
    />
  )
}
