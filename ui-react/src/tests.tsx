import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { api, appUrl, type TestCase, type TestSuite, type Tests as TestsData } from './api';
import { Card, CompLink, FileRef, Header, Loading, useApi } from './lib';

// The tests section mapped onto the catalogue (see src/scanner/analyzers/testmap.js), and running suites through
// POST /api/tests/run with the output streamed back over Server-Sent Events.

const caseName = (c: TestCase) => [...(c.describe ?? []), c.title].join(' ');
const UNCOVERED_SHOWN = 300;

/** Runs one file or case and shows its output live. E2E runs ask for confirmation first: they hit a real app. */
function useRun(file: string, suite: TestSuite) {
  const [state, setState] = useState<{ title?: string; command?: string; text: string; code?: number | null; error?: string; running: boolean }>();
  const source = useRef<EventSource | null>(null);
  useEffect(() => () => source.current?.close(), []);
  const run = async (title?: string) => {
    let confirm = false;
    if (suite.kind === 'e2e') {
      confirm = window.confirm(`E2E specs drive a real running app and may create or delete real data.\n\nRun ${title ? `"${title}" in ` : ''}${file}?`);
      if (!confirm) return;
    }
    source.current?.close();
    setState({ title, text: '', running: true });
    try {
      const { id, command } = await api.runTest({ file, title, kind: suite.kind, confirm });
      setState((s) => s && { ...s, command });
      const es = new EventSource(appUrl(`api/tests/runs/${id}`));
      source.current = es;
      es.onmessage = (e) => setState((s) => s && { ...s, text: s.text + (JSON.parse(e.data) as string) });
      // Closed on "done": otherwise EventSource reconnects when the server ends the stream and replays the output.
      es.addEventListener('done', (e) => {
        es.close();
        const { code } = JSON.parse((e as MessageEvent).data) as { code: number | null };
        setState((s) => s && { ...s, code, running: false });
      });
      es.onerror = () => {
        es.close();
        setState((s) => s && { ...s, running: false, error: s.running ? 'connection lost' : s.error });
      };
    } catch (err) {
      setState({ title, text: '', running: false, error: (err as Error).message });
    }
  };
  return { state, run };
}

function RunOutput({ state }: { state: NonNullable<ReturnType<typeof useRun>['state']> }) {
  const status = state.error ? `failed: ${state.error}` : state.running ? 'running…' : state.code === 0 ? 'passed' : `exit code ${state.code}`;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="small">
        <span className={`badge${!state.running && (state.error || state.code !== 0) ? ' danger' : ''}`}>{status}</span> {state.command && <code>{state.command}</code>}
      </div>
      {state.text && (
        <pre className="source" style={{ maxHeight: 360, overflow: 'auto', padding: '8px 12px', whiteSpace: 'pre-wrap', minHeight: 0 }}>
          {state.text}
        </pre>
      )}
    </div>
  );
}

function SuiteRow({ file, suite, focus }: { file: string; suite: TestSuite; focus?: string }) {
  const [open, setOpen] = useState(false);
  const { state, run } = useRun(file, suite);
  const runnable = !!suite.runner && !suite.error;
  const evidence = (suite.matches ?? []).filter((m) => !focus || m.target === focus);
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
      <div className="btn-row">
        <button className="btn btn-sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Hide cases' : 'Show cases'}>
          {open ? '▾' : '▸'}
        </button>
        <FileRef at={file} />
        <span className="badge">{suite.runner ?? 'no runner'}</span>
        <span className="muted small">{suite.cases.length} case(s)</span>
        {suite.error && <span className="badge danger">parse error</span>}
        <button className="btn btn-sm btn-primary" style={{ marginLeft: 'auto' }} disabled={!runnable || state?.running} onClick={() => run()} title={runnable ? `Run with ${suite.runner}` : 'No test runner detected for this file'}>
          Run file
        </button>
      </div>
      {(suite.components?.length || suite.pages?.length || suite.hooks?.length) && !focus ? (
        <div className="chips" style={{ marginTop: 6 }}>
          {suite.pages?.map((r) => (
            <Link key={r} className="chip mono" to="/page" search={{ route: r }}>
              {r}
            </Link>
          ))}
          {suite.components?.map((id) => <CompLink key={id} id={id} />)}
          {suite.hooks?.map((h) => (
            <span key={h} className="chip mono">
              {h.split('@')[0]}()
            </span>
          ))}
        </div>
      ) : null}
      {focus && evidence.length > 0 && (
        <ul className="small muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {evidence.slice(0, 5).map((m, i) => (
            <li key={i}>
              {m.confidence}: {m.reason}
              {m.line ? ` (line ${m.line})` : ''}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div style={{ marginTop: 8 }}>
          {suite.error && <p className="none">Could not parse: {suite.error}</p>}
          <table>
            <tbody>
              {suite.cases.map((c, i) => (
                <tr key={i}>
                  <td className="small">
                    {c.describe?.length ? <span className="muted">{c.describe.join(' › ')} › </span> : null}
                    {c.title}
                  </td>
                  <td className="small mono">{c.line ?? ''}</td>
                  <td style={{ textAlign: 'right' }}>
                    {/* Cypress has no test-name filter: a case would run its whole spec, so only the file is offered. */}
                    {runnable && suite.runner !== 'cypress' && (
                      <button className="btn btn-sm" disabled={state?.running} onClick={() => run(caseName(c))}>
                        Run
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!!suite.matches?.length && !focus && (
            <details style={{ marginTop: 6 }}>
              <summary className="small">How this spec was mapped ({suite.matches.length} match(es), {suite.unmatched?.length ?? 0} unmatched)</summary>
              <ul className="small" style={{ paddingLeft: 18 }}>
                {suite.matches.map((m, i) => (
                  <li key={i}>
                    <span className="badge">{m.confidence}</span> {m.reason} <span className="muted">{m.via}</span>
                  </li>
                ))}
                {suite.unmatched?.map((u, i) => (
                  <li key={`u${i}`} className="muted">
                    unmatched {u.what}
                    {u.line ? ` (line ${u.line})` : ''}: {u.why}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {state && <RunOutput state={state} />}
    </div>
  );
}

function SuiteList({ suites, focus, empty }: { suites: [string, TestSuite][]; focus?: string; empty: string }) {
  if (!suites.length) return <p className="none">{empty}</p>;
  return (
    <>
      {suites.map(([file, s]) => (
        <SuiteRow key={file} file={file} suite={s} focus={focus} />
      ))}
    </>
  );
}

/** The Tests view: unit and E2E suites, what each covers, run buttons, and the components no test touches. */
export function Tests() {
  const { data, error } = useApi(api.tests, []);
  if (!data) return <Loading error={error} />;
  const all = Object.entries(data.suites);
  const unit = all.filter(([, s]) => s.kind === 'unit');
  const e2e = all.filter(([, s]) => s.kind === 'e2e');
  const runners = Object.entries(data.runners);
  return (
    <>
      <Header
        title="Tests"
        sub={runners.length ? `Runners: ${runners.map(([k, r]) => `${k} (in ${r.cwd}${r.config ? `, ${r.config}` : ''})`).join(' · ')}` : 'No test runner detected (jest, vitest, @playwright/test or cypress in package.json or a config file).'}
      />
      <Card title="Unit tests" count={unit.length} sub="Mapped to the components each file imports and renders (render, renderHook).">
        <SuiteList suites={unit} empty="No unit test files found." />
      </Card>
      <Card title="E2E specs" count={e2e.length} sub="Mapped to pages by the URLs they visit, and to components whose literal text, labels or test ids their locators use. Running one drives a real app.">
        <SuiteList suites={e2e} empty="No E2E specs found. Specs outside the scan root are picked up from e2e/ or tests/ next to it, or from config tests.dirs." />
      </Card>
      <Uncovered data={data} />
    </>
  );
}

function Uncovered({ data }: { data: TestsData }) {
  return (
    <Card title="Components not covered by any test" count={data.uncovered.length}>
      <div className="chips">
        {data.uncovered.slice(0, UNCOVERED_SHOWN).map((id) => (
          <CompLink key={id} id={id} />
        ))}
        {data.uncovered.length > UNCOVERED_SHOWN && <span className="muted small">… and {data.uncovered.length - UNCOVERED_SHOWN} more</span>}
      </div>
    </Card>
  );
}

/** Tests covering one component (`component`) or one page (`route`), for the component and page views. */
export function TestsCard({ component, route }: { component?: string; route?: string }) {
  const { data } = useApi(api.tests, []);
  if (!data) return null;
  const suites = Object.entries(data.suites).filter(([, s]) => (component ? s.components?.includes(component) || s.hooks?.includes(component) : route ? s.pages?.includes(route) : false));
  return (
    <Card title="Tests" count={suites.length}>
      <SuiteList suites={suites} focus={component ?? route} empty={component ? 'No test renders this component or touches its text.' : 'No E2E spec visits this page.'} />
    </Card>
  );
}
