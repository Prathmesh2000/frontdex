import { Outlet, NavLink } from 'react-router-dom';
export default function Shell() {
  return <div><NavLink to="/">Dashboard</NavLink><Outlet /></div>;
}
