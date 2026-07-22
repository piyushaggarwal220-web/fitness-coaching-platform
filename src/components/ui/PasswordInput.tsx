'use client'

import { useEffect, useState, type CSSProperties, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { colors } from '@/lib/design-tokens'

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  inputStyle?: CSSProperties
}

/**
 * Prefer type="text" + CSS disc masking so Chrome/Edge do not treat this as a
 * password field (which triggers the "found in a data breach" warning).
 * Falls back to type="password" when -webkit-text-security is unsupported (Firefox).
 * Includes a show/hide control on every instance.
 */
export function PasswordInput({
  inputStyle,
  style,
  className,
  autoComplete = 'off',
  name = 'access_key',
  disabled,
  ...props
}: PasswordInputProps) {
  const [maskSupported, setMaskSupported] = useState(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const probe = document.createElement('input')
    probe.style.setProperty('-webkit-text-security', 'disc')
    document.body.appendChild(probe)
    const supported = getComputedStyle(probe).getPropertyValue('-webkit-text-security').trim() === 'disc'
    document.body.removeChild(probe)
    setMaskSupported(supported)
  }, [])

  const showPlain = visible
  const useCssMask = maskSupported && !showPlain

  const mergedStyle = {
    ...inputStyle,
    ...style,
    paddingRight: 48,
    width: '100%',
    boxSizing: 'border-box',
    ...(useCssMask ? { WebkitTextSecurity: 'disc' } : { WebkitTextSecurity: 'none' }),
  } as CSSProperties

  return (
    <div style={wrapStyle}>
      <input
        {...props}
        disabled={disabled}
        type={showPlain || maskSupported ? 'text' : 'password'}
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
        className={['lurvox-password-input', showPlain ? 'lurvox-password-visible' : '', className]
          .filter(Boolean)
          .join(' ')}
        style={mergedStyle}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        style={toggleStyle}
      >
        {visible ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
      </button>
    </div>
  )
}

const wrapStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
}

const toggleStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  right: 10,
  transform: 'translateY(-50%)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  padding: 0,
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  color: colors.textMuted,
  cursor: 'pointer',
  touchAction: 'manipulation',
}
