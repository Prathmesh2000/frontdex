import { NavLink, Outlet } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import SelectionBar from './SelectionBar';

/** Layout route: sidebar navigation + routed content. */
export default function AppShell() {
  return (
    <div className="shell">
      <nav className="nav">
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/users">Users</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      <main>
        <SelectionBar />
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
