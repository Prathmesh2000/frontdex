'use client';
import { Tabs } from '@/components/ui';
import { ProductGrid } from './ProductGrid';

const COLLECTIONS = [
  { value: 'new', label: 'New in', category: 'new' },
  { value: 'bestsellers', label: 'Bestsellers', category: 'bestsellers' },
  { value: 'sale', label: 'On sale', category: 'sale' },
];

/** Tabbed product collections on the homepage (compound Tabs). */
export function FeaturedCollections({ defaultTab = 'new' }: { defaultTab?: string }) {
  return (
    <Tabs defaultValue={defaultTab}>
      <Tabs.List>
        {COLLECTIONS.map((c) => <Tabs.Trigger key={c.value} value={c.value}>{c.label}</Tabs.Trigger>)}
      </Tabs.List>
      {COLLECTIONS.map((c) => (
        <Tabs.Panel key={c.value} value={c.value}>
          <ProductGrid category={c.category} pageSize={8} />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
