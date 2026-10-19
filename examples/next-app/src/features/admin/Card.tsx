/** Admin-only metric card (different from the design-system Card). */
export function Card({ label, value, delta }: { label: string; value: string; delta?: number }) {
  const trend = delta === undefined ? null : delta >= 0 ? 'up' : 'down';
  return (
    <div className="admin-card rounded-lg p-4 bg-slate-900 text-white">
      <span className="text-xs uppercase">{label}</span>
      <strong className="text-2xl">{value}</strong>
      {trend && <span className={`trend-${trend}`}>{delta}%</span>}
    </div>
  );
}
