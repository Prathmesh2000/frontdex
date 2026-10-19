import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import useWindowSize from '../useWindowSize';
import Chart from '../Chart';

export default function Dashboard() {
  const { data } = useQuery({ queryKey: ['stats'], queryFn: () => fetch('/stats') });
  const size = useWindowSize();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    document.title = `Dashboard (${tick})`;
  });
  return <Chart data={data} width={size.width} onTick={() => setTick(tick + 1)} />;
}
