import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Shell from './Shell';
import Users from './pages/Users';
import * as Pages from './pages/misc';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/misc').then((m) => ({ default: m.Settings })));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<p>Loading</p>}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="users">
              <Route index element={<Users />} />
              <Route path=":userId" element={<Pages.UserDetail />} />
            </Route>
          </Route>
          <Route path="*" element={<Pages.NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
