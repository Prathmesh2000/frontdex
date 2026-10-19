import clsx from 'clsx';

const LABELS = ['Address', 'Payment', 'Review'];

/** "1 — 2 — 3" progress header for the checkout wizard. */
export function StepIndicator({ current, completed }: { current: number; completed: number[] }) {
  return (
    <ol className="steps flex gap-4">
      {LABELS.map((label, i) => <li key={label} className={clsx('step', { active: i === current, done: completed.includes(i) })}>{i + 1}. {label}</li>)}
    </ol>
  );
}
