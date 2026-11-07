import { Navigate, createBrowserRouter, redirect } from 'react-router';
import { AppLayout } from './layouts/AppLayout.jsx';
import { RouteErrorPage } from './layouts/RouteErrorPage.jsx';
import { HomePage } from './pages/home/HomePage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { ConflictPage } from './pages/repository/conflict/ConflictPage.jsx';
import { HistoryPage } from './pages/repository/HistoryPage.jsx';
import { RepositoryLayout } from './pages/repository/RepositoryLayout.jsx';
import { UNCOMMITTED, paths } from './paths.js';

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
          // Redirecting before rendering, unlike <Navigate>, never shows an empty page.
          { index: true, loader: ({ params }) => redirect(paths.history(params.repositoryId)) },
          { path: 'history', element: <HistoryPage /> },
          { path: 'resolve', element: <ConflictPage /> },
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
