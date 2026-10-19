type Tone = 'neutral' | 'success' | 'warning' | 'danger';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
