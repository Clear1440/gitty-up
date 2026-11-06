import { Navigate, createBrowserRouter } from 'react-router';
import { AppLayout } from './layouts/AppLayout.jsx';
import { RouteErrorPage } from './layouts/RouteErrorPage.jsx';
import { HomePage } from './pages/home/HomePage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { HistoryPage } from './pages/repository/HistoryPage.jsx';
import { RepositoryLayout } from './pages/repository/RepositoryLayout.jsx';
import { UNCOMMITTED } from './paths.js';

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
          // Tabs saved before this page was folded into history still point here.
          {
            path: 'changes',
            element: <Navigate to={`../history?commit=${UNCOMMITTED}`} replace />,
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
