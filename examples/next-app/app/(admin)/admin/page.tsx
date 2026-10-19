import { LiveVisitors } from '@/features/admin/LiveVisitors';
import { RecentOrders } from '@/features/admin/RecentOrders';
import { SalesPanel } from '@/features/admin/SalesPanel';
import { StatCard } from '@/features/admin/StatCard';

/** Admin dashboard: KPIs, revenue chart, live visitors and recent orders. */
export default function AdminDashboard() {
  return (
    <div className="grid gap-6">
      <StatCard title="Today" metrics={[{ label: 'Revenue', value: '$12,480', delta: 8 }, { label: 'Orders', value: '214', delta: -3 }, { label: 'AOV', value: '$58' }]} />
      <LiveVisitors channel="storefront" />
      <SalesPanel range="30d" />
      <RecentOrders limit={5} />
    </div>
  );
}
