import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import AppShell from './components/AppShell';
import ErrorScreen from './components/ErrorScreen';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/users/UsersPage';
import UserDetail from './pages/users/UserDetail';
import SettingsLayout from './pages/settings/SettingsLayout';
import ProfileSettings from './pages/settings/ProfileSettings';

const UserEdit = lazy(() => import('./pages/users/UserEdit'));
const BillingSettings = lazy(() => import('./pages/settings/BillingSettings'));
const SecuritySettings = lazy(() => import('./pages/settings/SecuritySettings'));

const withSuspense = (node) => <Suspense fallback={<p>Loading…</p>}>{node}</Suspense>;

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <ErrorScreen />,
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: 'users',
        children: [
          { index: true, element: <UsersPage /> },
          { path: ':userId', element: <UserDetail /> },
          { path: ':userId/edit', element: withSuspense(<UserEdit />) },
        ],
      },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <ProfileSettings /> },
          { path: 'profile', element: <ProfileSettings /> },
          { path: 'billing', element: withSuspense(<BillingSettings />) },
          { path: 'security', element: withSuspense(<SecuritySettings />) },
        ],
      },
    ],
  },
]);
