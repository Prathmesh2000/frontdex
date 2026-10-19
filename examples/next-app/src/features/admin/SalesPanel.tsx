'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { SalesChart } from './SalesChart';

/** Sizes the chart to the window and loads the revenue series. */
export function SalesPanel({ range = '30d' }: { range?: '7d' | '30d' | '90d' }) {
  const { data = [] } = useSWR(`/api/admin/sales?range=${range}`, fetcher);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    // demo: intentional leak for the catalogue — the resize listener is never removed.
    window.addEventListener('resize', () => setWidth(Math.min(window.innerWidth - 320, 1200)));
  }, []);

  return <SalesChart data={data} width={width} />;
}
