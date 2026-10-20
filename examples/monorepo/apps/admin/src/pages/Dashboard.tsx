import { Button } from '@acme/ui';
import { Card } from '@acme/ui/card';

export function Dashboard() {
  return (
    <Card title="Dashboard">
      <Button onClick={() => window.location.reload()}>Refresh</Button>
    </Card>
  );
}
