import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

// Watch-owned wrapper around Recharts so feature screens never touch the library
// directly (docs/milestone-6/frontend-architecture.md §9). Default export so it
// can be lazy-imported at the route level, keeping Recharts out of auth bundles.
// Height is fixed; width follows the container so data shape can't collapse layout.
export type Series = { key: string; label: string; color: string }

// Intentionally non-generic (object[] + string keys): a generic would be erased
// by React.lazy() at the call site. Callers pass typed rollup arrays; key safety
// lives in those call sites.
export default function TimeSeriesChart({
  data,
  xKey,
  series,
  height = 240,
  formatX = String,
  formatY = String,
}: {
  data: object[]
  xKey: string
  series: Series[]
  height?: number
  formatX?: (value: string) => string
  formatY?: (value: number) => string
}) {
  const cell = (row: object, key: string): number | string =>
    (row as Record<string, number | string>)[key]
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`fill-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey={(row: object) => cell(row, xKey)}
          tickFormatter={(value) => formatX(String(value))}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted-foreground)"
          minTickGap={32}
        />
        <YAxis
          tickFormatter={(value) => formatY(Number(value))}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted-foreground)"
          width={44}
        />
        <Tooltip
          labelFormatter={(label) => formatX(String(label))}
          formatter={(value, name) => [formatY(Number(value)), name]}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            color: "var(--popover-foreground)",
            fontSize: 12,
          }}
        />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={(row: object) => cell(row, s.key)}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#fill-${s.key})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
