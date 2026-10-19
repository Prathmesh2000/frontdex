import { OrderTimeline } from '@/features/account/OrderTimeline';

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <OrderTimeline orderId={orderId} />;
}
