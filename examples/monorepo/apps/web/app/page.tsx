import { Button } from '@acme/ui';
import { Card } from '@acme/ui/card';
import { Hero } from '@/components/Hero';

export default function HomePage() {
  return (
    <main>
      <Hero title="Acme" />
      <Card title="Get started">
        <Button variant="primary">Sign up</Button>
      </Card>
    </main>
  );
}
