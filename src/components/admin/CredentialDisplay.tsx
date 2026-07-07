'use client'

import { useState, type CSSProperties } from 'react'
import type { CreatedAccountCredentials } from '@/lib/admin/testing-accounts'

type CredentialDisplayProps = {
  account: CreatedAccountCredentials
  onDismiss?: () => void
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button type="button" onClick={() => void handleCopy()} style={styles.copyBtn} title={`Copy ${label}`}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.credentialRow}>
      <div style={styles.credentialLabel}>{label}</div>
      <div style={styles.credentialValueRow}>
        <code style={styles.credentialValue}>{value}</code>
        <CopyButton value={value} label={label} />
      </div>
    </div>
  )
}

export function CredentialDisplay({ account, onDismiss }: CredentialDisplayProps) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>Account Created</h3>
        {onDismiss && (
          <button type="button" onClick={onDismiss} style={styles.dismissBtn}>
            Dismiss
          </button>
        )}
      </div>
      <p style={styles.message}>{account.message}</p>
      <CredentialRow label="Email" value={account.email} />
      <CredentialRow label="Password" value={account.password} />
      <CredentialRow label="Role" value={account.role} />
      <CredentialRow label="Login URL" value={account.loginUrl} />
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: {
    marginTop: 20,
    padding: 20,
    borderRadius: 10,
    border: '1px solid #86efac',
    backgroundColor: '#f0fdf4',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  panelTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#166534',
  },
  dismissBtn: {
    border: 'none',
    background: 'transparent',
    color: '#166534',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  message: {
    margin: '0 0 12px',
    color: '#15803d',
    fontSize: 14,
  },
  credentialRow: {
    marginBottom: 10,
  },
  credentialLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  credentialValueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  credentialValue: {
    flex: 1,
    minWidth: 200,
    padding: '8px 10px',
    borderRadius: 6,
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    fontSize: 14,
    wordBreak: 'break-all',
  },
  copyBtn: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #16a34a',
    backgroundColor: '#fff',
    color: '#166534',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
}
