'use client';
import { useParams } from 'next/navigation';
import { ProductCard } from '@/components';

export default function ({ params }: { params: { id: string } }) {
  const p = useParams();
  return <ProductCard product={{ id: params.id, name: String(p.id), price: 0 }} />;
}
