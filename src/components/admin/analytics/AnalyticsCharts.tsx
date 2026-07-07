'use client'

import type { CSSProperties } from 'react'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import type { DayPoint, ModelCostPoint } from '@/lib/admin/business-analytics'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend)

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 11 } } },
    y: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 } } },
  },
}

const cardStyle: CSSProperties = {
  backgroundColor: 'white',
  padding: 20,
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  minHeight: 280,
}

export function LineChartCard({
  title,
  points,
  valuePrefix = '',
}: {
  title: string
  points: DayPoint[]
  valuePrefix?: string
}) {
  const labels = points.map((p) => p.date)
  const data = {
    labels,
    datasets: [
      {
        data: points.map((p) => p.value),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>{title}</h3>
      <div style={{ height: 220 }}>
        {points.length === 0 ? (
          <p style={{ color: '#888', fontSize: 14 }}>No data yet.</p>
        ) : (
          <Line
            data={data}
            options={{
              ...chartOptions,
              plugins: {
                ...chartOptions.plugins,
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${valuePrefix}${ctx.parsed.y}`,
                  },
                },
              },
            }}
          />
        )}
      </div>
    </div>
  )
}

export function BarChartCard({
  title,
  points,
  valuePrefix = '',
}: {
  title: string
  points: ModelCostPoint[] | DayPoint[]
  valuePrefix?: string
}) {
  const labels = points.map((p) => ('model' in p ? p.model : p.date))
  const values = points.map((p) => ('costUsd' in p ? p.costUsd : p.value))

  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: '#0d9488',
        borderRadius: 6,
      },
    ],
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>{title}</h3>
      <div style={{ height: 220 }}>
        {points.length === 0 ? (
          <p style={{ color: '#888', fontSize: 14 }}>No data yet.</p>
        ) : (
          <Bar
            data={data}
            options={{
              ...chartOptions,
              plugins: {
                ...chartOptions.plugins,
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${valuePrefix}${ctx.parsed.y}`,
                  },
                },
              },
            }}
          />
        )}
      </div>
    </div>
  )
}
