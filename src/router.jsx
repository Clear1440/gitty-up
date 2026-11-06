import { Navigate, createBrowserRouter } from 'react-router';
import { AppLayout } from './layouts/AppLayout.jsx';
import { RouteErrorPage } from './layouts/RouteErrorPage.jsx';
import { HomePage } from './pages/home/HomePage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { ChangesPage } from './pages/repository/ChangesPage.jsx';
import { HistoryPage } from './pages/repository/HistoryPage.jsx';
import { RepositoryLayout } from './pages/repository/RepositoryLayout.jsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'repositories/:repositoryId',
        element: <RepositoryLayout />,
        children: [
          { index: true, element: <Navigate to="history" replace /> },
          { path: 'history', element: <HistoryPage /> },
          { path: 'changes', element: <ChangesPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
