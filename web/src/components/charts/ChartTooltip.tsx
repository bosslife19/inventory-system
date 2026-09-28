interface Row {
  label: string
  value: React.ReactNode
  color?: string
}

/** Tooltip body shared by every chart, so hover reads the same everywhere. */
export function ChartTooltip({ title, rows }: { title: React.ReactNode; rows: Row[] }) {
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="chart-tooltip-row">
          <span className="swatch" style={{ background: r.color ?? 'transparent' }} aria-hidden />
          <span>{r.label}</span>
          <strong>{r.value}</strong>
        </div>
      ))}
    </div>
  )
}
