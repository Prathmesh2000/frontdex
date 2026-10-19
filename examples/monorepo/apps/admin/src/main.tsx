import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Users } from './pages/Users';

const router = createBrowserRouter([
  { path: '/', element: <Dashboard /> },
  { path: '/users', element: <Users /> },
]);

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
