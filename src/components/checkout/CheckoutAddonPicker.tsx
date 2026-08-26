'use client'

import {
  CHECKOUT_ADDONS,
  CHECKOUT_ADDON_UNIT_PAISE,
  CHECKOUT_ADDON_BUNDLE_PAISE,
  CHECKOUT_ADDON_BUNDLE_LIST_PAISE,
  EXERCISE_LIBRARY_ADDON_PAISE,
  checkoutAddonPaise,
  formatInrFromPaise,
  isCheckoutAddonBundle,
  type CheckoutAddonId,
} from '@/lib/payments/checkout-discounts'
import { colors, spacing, radius } from '@/lib/design-tokens'

type Props = {
  selectedIds: CheckoutAddonId[]
  onToggle: (id: CheckoutAddonId) => void
  onToggleBundle: () => void
}

export function CheckoutAddonPicker({ selectedIds, onToggle, onToggleBundle }: Props) {
  const bundleOn = isCheckoutAddonBundle(selectedIds)
  const bundleSave = CHECKOUT_ADDON_BUNDLE_LIST_PAISE - CHECKOUT_ADDON_BUNDLE_PAISE

  return (
    <section
      aria-label="Optional add-ons"
      style={{
        margin: '18px 0 8px',
        padding: 14,
        borderRadius: radius.md,
        border: `1px solid ${colors.borderSubtle}`,
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <p
        style={{
          margin: '0 0 4px',
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: colors.accent,
        }}
      >
        Optional add-ons
      </p>
      <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.45, color: colors.textMuted }}>
        Not included in coaching. Protocols are {formatInrFromPaise(CHECKOUT_ADDON_UNIT_PAISE)} each.
        Exercise library is {formatInrFromPaise(EXERCISE_LIBRARY_ADDON_PAISE)}. Take all four for{' '}
        {formatInrFromPaise(CHECKOUT_ADDON_BUNDLE_PAISE)}.
      </p>

      <label
        htmlFor="checkout-addon-bundle"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: spacing[3],
          margin: '0 0 12px',
          padding: '12px 12px',
          borderRadius: 12,
          cursor: 'pointer',
          border: bundleOn ? `1.5px solid ${colors.accent}` : `1.5px solid rgba(255,98,0,0.55)`,
          background: bundleOn ? 'rgba(255,98,0,0.16)' : 'rgba(255,98,0,0.08)',
        }}
      >
        <input
          id="checkout-addon-bundle"
          type="checkbox"
          checked={bundleOn}
          onChange={onToggleBundle}
          style={{
            width: 20,
            height: 20,
            marginTop: 2,
            flexShrink: 0,
            accentColor: colors.accent,
            cursor: 'pointer',
          }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'baseline',
            }}
          >
            <strong style={{ fontSize: 15, fontWeight: 800, color: colors.textPrimary }}>
              All add-ons
            </strong>
            <span style={{ fontSize: 14, fontWeight: 800, color: colors.accent, whiteSpace: 'nowrap' }}>
              <s style={{ marginRight: 6, color: colors.textMuted, fontWeight: 600 }}>
                {formatInrFromPaise(CHECKOUT_ADDON_BUNDLE_LIST_PAISE)}
              </s>
              {formatInrFromPaise(CHECKOUT_ADDON_BUNDLE_PAISE)}
            </span>
          </span>
          <span style={{ fontSize: 12, lineHeight: 1.45, color: colors.textMuted }}>
            Testo boost, anxiety removal, face maxxing, and the exercise library — save{' '}
            {formatInrFromPaise(bundleSave)}.
          </span>
        </span>
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CHECKOUT_ADDONS.map((addon) => {
          const on = selectedIds.includes(addon.id)
          return (
            <label
              key={addon.id}
              htmlFor={`checkout-addon-${addon.id}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing[3],
                margin: 0,
                padding: '12px 12px',
                borderRadius: 12,
                cursor: 'pointer',
                border: on ? `1.5px solid ${colors.accent}` : `1px solid ${colors.borderSubtle}`,
                background: on ? 'rgba(255,98,0,0.12)' : 'rgba(0,0,0,0.25)',
              }}
            >
              <input
                id={`checkout-addon-${addon.id}`}
                type="checkbox"
                checked={on}
                onChange={() => onToggle(addon.id)}
                style={{
                  width: 20,
                  height: 20,
                  marginTop: 2,
                  flexShrink: 0,
                  accentColor: colors.accent,
                  cursor: 'pointer',
                }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    alignItems: 'baseline',
                  }}
                >
                  <strong style={{ fontSize: 15, fontWeight: 800, color: colors.textPrimary }}>
                    {addon.name}
                  </strong>
                  <span style={{ fontSize: 14, fontWeight: 800, color: colors.accent, whiteSpace: 'nowrap' }}>
                    {bundleOn ? 'Included' : `+ ${formatInrFromPaise(checkoutAddonPaise(addon.id))}`}
                  </span>
                </span>
                <span style={{ fontSize: 12, lineHeight: 1.45, color: colors.textMuted }}>
                  {addon.copy}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
