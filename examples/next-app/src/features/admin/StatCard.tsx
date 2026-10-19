import { Card } from '@/components/ui';
import { Card as MetricCard } from './Card';

/** Dashboard KPI tile: design-system Card shell around the admin metric card. */
export function StatCard({ title, metrics }: { title: string; metrics: { label: string; value: string; delta?: number }[] }) {
  return (
    <Card elevated>
      <Card.Header title={title} />
      <Card.Body>
        <div className="grid grid-cols-3 gap-2">{metrics.map((m) => <MetricCard key={m.label} {...m} />)}</div>
      </Card.Body>
    </Card>
  );
}
