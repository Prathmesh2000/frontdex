import { Link } from '@tanstack/react-router';
import { type DependencyList, type ReactNode, useEffect, useState } from 'react';
import type { Issue } from './api';

/** Runs an API call when `deps` change; returns { data, error, loading }. Stale responses are dropped. */
export function useApi<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (err: Error) => live && setState({ error: err.message, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the inputs of `fn` as deps
  }, deps);
  return state;
}

export function Loading({ error }: { error?: string }) {
  return <p className="none">{error ? `Could not load: ${error}` : 'Loading…'}</p>;
}

export function Card({ title, count, sub, children, wide = true }: { title: ReactNode; count?: ReactNode; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`card${wide ? ' wide' : ''}`}>
      <div className="card-h">
        <h3>{title}</h3>
        {count != null && <span className="count">{count}</span>}
      </div>
      {sub && <p className="card-sub">{sub}</p>}
      {children}
    </section>
  );
}

export function Header({ title, sub, badges }: { title: ReactNode; sub?: ReactNode; badges?: ReactNode }) {
  return (
    <div className="vh">
      <div className="vh-title">
        <div>
          <h1>
            {title}
            {badges}
          </h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export const CompLink = ({ id }: { id: string }) => (
  <Link className="chip" to="/c/$id" params={{ id }}>
    {id.split('@')[0]}
  </Link>
);

export const FileRef = ({ at }: { at?: string }) => (at ? <code className="small">{at}</code> : null);

export function Issues({ items }: { items: Issue[] }) {
  if (!items.length) return <div className="all-good">No issues found.</div>;
  return (
    <>
      {items.map((i, n) => (
        <div key={n} className={`issue ${i.severity}`}>
          <div>
            <div className="issue-h">
              <span className={`badge sev-${i.severity}`}>{i.severity}</span>
              <span className="type">{i.type.replace(/-/g, ' ')}</span>
              {i.component && <CompLink id={i.component} />}
              {i.file && <FileRef at={`${i.file}${i.line ? `:${i.line}` : ''}`} />}
            </div>
            <p className="msg">{i.message}</p>
            {i.fix && <div className="fix">Fix: {i.fix}</div>}
          </div>
        </div>
      ))}
    </>
  );
}

// Only plain color literals become swatches; values come from source and are never trusted as CSS.
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,/%]+\)|hsla?\([\d\s.,/%deg]+\))$/i;
export const Swatch = ({ value }: { value: string }) => (COLOR.test(value.trim()) ? <span className="swatch" style={{ background: value }} /> : null);
