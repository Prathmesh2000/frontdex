import { useEffect, useState } from 'react';
import MetricTicker from '../components/MetricTicker';

/** Landing page with live metrics. */
export default function Dashboard() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    // demo: intentional leak for the catalogue — the resize listener is never removed.
    window.addEventListener('resize', () => setWidth(window.innerWidth));
  }, []);

  return (
    <div className={width < 900 ? 'dashboard stacked' : 'dashboard'}>
      <MetricTicker label="Active users" intervalMs={5000} />
      <MetricTicker label="Signups today" intervalMs={30000} />
    </div>
  );
}
