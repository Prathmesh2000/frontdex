'use client';
import { useLayoutEffect, useRef, useState } from 'react';

export function Tooltip({ text, children }: { text: string; children: React.ReactElement }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);

  // Measure before paint so the tooltip never flashes at (0,0).
  useLayoutEffect(() => {
    if (!visible || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({ top: rect.top - 8, left: rect.left + rect.width / 2 });
  }, [visible]);

  return (
    <span ref={anchorRef} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && <span role="tooltip" style={position}>{text}</span>}
    </span>
  );
}
