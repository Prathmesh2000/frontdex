/**
 * Old dashboard widget.
 * @deprecated replaced by MetricTicker; not rendered anywhere.
 */
export default function LegacyStats({ stats = [] }) {
  return <ul className="legacy-stats">{stats.map((s) => <li key={s.label}>{s.label}: {s.value}</li>)}</ul>;
}
