import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <span data-testid="counter-value">{count}</span>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
