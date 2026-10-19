import { NavLink, Outlet } from 'react-router-dom';

/** Settings tabs (nested routes). */
export default function SettingsLayout() {
  return (
    <section>
      <nav className="tabs">
        <NavLink to="profile">Profile</NavLink>
        <NavLink to="billing">Billing</NavLink>
        <NavLink to="security">Security</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
