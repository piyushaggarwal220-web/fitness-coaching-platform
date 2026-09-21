'use client'

import type { ReactNode } from 'react'

import { colors } from '@/lib/design-tokens'
import { DOMAIN_COMMANDS, formatInr } from '@/lib/jarvis/operator-present'
import type { CommandView } from './types'
import type { JarvisCommandState } from './use-jarvis-command'
import { Sparkline } from './Sparkline'
import * as s from './styles'

function Panel({
  title,
  kicker,
  children,
}: {
  title: string
  kicker: string
  children: ReactNode
}) {
  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>{kicker}</div>
      <h2 style={{ margin: '6px 0 16px', fontSize: 22, letterSpacing: '-0.03em' }}>{title}</h2>
      {children}
    </div>
  )
}

function HonestEmpty({ domain, reason }: { domain: string; reason: string }) {
  return (
    <div style={s.card}>
      <div style={{ fontWeight: 650 }}>{domain}</div>
      <p style={{ ...s.muted, marginBottom: 0 }}>{reason}</p>
    </div>
  )
}

export function RevenueView({ jarvis, onAsk }: { jarvis: JarvisCommandState; onAsk: (q: string) => void }) {
  const cockpit = jarvis.dashboard?.cockpit
  const shopify = jarvis.dashboard?.pulse?.shopify
  return (
    <Panel kicker="Business" title="Revenue">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {(cockpit?.metrics ?? []).filter((m) => m.source === 'LURVOX').map((m) => (
          <div key={m.id} style={s.card}>
            <div style={s.eyebrow}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{m.display}</div>
            <div style={s.muted}>{m.change_label || m.period}</div>
          </div>
        ))}
      </div>
      {cockpit?.charts.revenue_7d.length ? (
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={s.eyebrow}>7-day LURVOX revenue</div>
          <Sparkline points={cockpit.charts.revenue_7d} width={420} height={64} label="₹" />
        </div>
      ) : null}
      <div style={{ ...s.sectionLabel, marginLeft: 0 }}>By plan today</div>
      {cockpit?.by_plan.length ? (
        cockpit.by_plan.map((p) => (
          <div key={p.plan_slug} style={{ ...s.card, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>{p.label}</span>
            <span>
              {formatInr(p.gross_inr)} · {p.paid_count} sales
            </span>
          </div>
        ))
      ) : (
        <div style={s.muted}>No paid plan mix for today.</div>
      )}
      <div style={{ ...s.sectionLabel, marginLeft: 0 }}>Shopify store (not LURVOX checkout)</div>
      <div style={s.card}>
        {shopify?.connected ? (
          <div style={s.muted}>
            {shopify.orders != null ? `${shopify.orders} store orders` : 'Order count unavailable'}
            {shopify.revenue != null ? ` · ${formatInr(shopify.revenue)}` : ''}
          </div>
        ) : (
          <div style={s.muted}>{shopify?.unavailable_reason || 'Shopify store not connected.'}</div>
        )}
      </div>
      <button type="button" style={{ ...s.primaryBtn, marginTop: 16 }} onClick={() => onAsk('Analyze my revenue today.')}>
        Ask Jarvis to analyze revenue
      </button>
    </Panel>
  )
}

export function FunnelsView({ jarvis, onAsk }: { jarvis: JarvisCommandState; onAsk: (q: string) => void }) {
  const funnels = jarvis.dashboard?.pulse?.funnel_health ?? []
  return (
    <Panel kicker="Business" title="Funnels">
      {funnels.length ? (
        funnels.map((f) => (
          <div key={String(f.funnel_id)} style={{ ...s.card, marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>
              {f.funnel_name}
              {f.price_inr != null ? ` · ₹${f.price_inr.toLocaleString('en-IN')}` : ''}
            </div>
            {f.available ? (
              <div style={{ ...s.muted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>Spend {f.spend.display}</span>
                <span>Purchases {f.purchases.display}</span>
                <span>CPA {f.cpa.display}</span>
                <span>ROAS {f.roas.display}</span>
              </div>
            ) : (
              <div style={s.muted}>{f.spend.hint}</div>
            )}
          </div>
        ))
      ) : (
        <div style={s.muted}>No funnel records loaded.</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {DOMAIN_COMMANDS.filter((c) => c.id.startsWith('funnel')).map((c) => (
          <button key={c.id} type="button" style={s.ghostBtn} onClick={() => onAsk(c.prompt)}>
            {c.label}
          </button>
        ))}
      </div>
    </Panel>
  )
}

export function MarketingView({ jarvis, onAsk }: { jarvis: JarvisCommandState; onAsk: (q: string) => void }) {
  const metrics = (jarvis.dashboard?.cockpit?.metrics ?? []).filter((m) => m.source === 'META')
  const ads = jarvis.dashboard?.cockpit?.charts.ads_7d
  return (
    <Panel kicker="Marketing" title="Meta Ads">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {metrics.map((m) => (
          <div key={m.id} style={s.card}>
            <div style={s.eyebrow}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{m.display}</div>
            <div style={s.muted}>{m.hint}</div>
          </div>
        ))}
      </div>
      {ads && ads.length > 1 ? (
        <div style={{ ...s.card, marginTop: 12 }}>
          <div style={s.eyebrow}>Ad spend · 7D</div>
          <Sparkline points={ads} width={420} height={64} label="₹" />
        </div>
      ) : (
        <div style={{ ...s.muted, marginTop: 12 }}>No Meta spend series for the last 7 days.</div>
      )}
      <p style={{ ...s.muted, maxWidth: 640 }}>
        Meta ad spend is never treated as revenue. Live Meta execution stays off unless separately enabled.
      </p>
      <button type="button" style={s.primaryBtn} onClick={() => onAsk('How much did I spend on Meta ads today?')}>
        Check ads
      </button>
    </Panel>
  )
}

export function PlaceholderDomain({
  kicker,
  title,
  reason,
  ask,
  onAsk,
}: {
  kicker: string
  title: string
  reason: string
  ask: string
  onAsk: (q: string) => void
}) {
  return (
    <Panel kicker={kicker} title={title}>
      <HonestEmpty domain={title} reason={reason} />
      <button type="button" style={{ ...s.primaryBtn, marginTop: 12 }} onClick={() => onAsk(ask)}>
        Ask Jarvis
      </button>
    </Panel>
  )
}

export function DomainView({
  view,
  jarvis,
  onAsk,
}: {
  view: CommandView
  jarvis: JarvisCommandState
  onAsk: (q: string) => void
}) {
  if (view === 'revenue') return <RevenueView jarvis={jarvis} onAsk={onAsk} />
  if (view === 'funnels') return <FunnelsView jarvis={jarvis} onAsk={onAsk} />
  if (view === 'marketing') return <MarketingView jarvis={jarvis} onAsk={onAsk} />
  if (view === 'customers') {
    return (
      <PlaceholderDomain
        kicker="Business"
        title="Customers"
        reason="Jarvis does not have a verified customer source of truth yet. No numbers are shown."
        ask="What do we know about customers today?"
        onAsk={onAsk}
      />
    )
  }
  if (view === 'growth') {
    return (
      <PlaceholderDomain
        kicker="Business"
        title="Growth"
        reason="There is no verified growth metric catalogued for Jarvis. Ask for a qualitative read instead of invented KPIs."
        ask="What should I focus on for growth?"
        onAsk={onAsk}
      />
    )
  }
  if (view === 'creatives') {
    return (
      <PlaceholderDomain
        kicker="Marketing"
        title="Creatives"
        reason="Creative generation is available as a Jarvis capability. This page does not invent performance numbers."
        ask="Which creatives should I test?"
        onAsk={onAsk}
      />
    )
  }
  if (view === 'instagram') {
    return (
      <PlaceholderDomain
        kicker="Marketing"
        title="Instagram"
        reason="Instagram idea generation is available when connected. No reach or follower metrics are catalogued as source of truth."
        ask="Generate Instagram ideas for this week."
        onAsk={onAsk}
      />
    )
  }
  if (view === 'experiments') {
    return (
      <PlaceholderDomain
        kicker="Marketing"
        title="Experiments"
        reason="No experiment results are loaded on this screen unless Jarvis has recorded them in memory or activity."
        ask="What experiments are running?"
        onAsk={onAsk}
      />
    )
  }
  return <div style={{ padding: 20, color: colors.textMuted }}>Unknown view.</div>
}
