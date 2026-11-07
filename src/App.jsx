import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { RouterProvider } from 'react-router/dom';
import { router } from './router.jsx';
import { createAntdTheme } from './styles/antdTheme.js';
import { TabsProvider } from './tabs/TabsContext.jsx';

const antdTheme = createAntdTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      // Kept a while after its tab is left, so switching back shows it straight away
      // while it refreshes, rather than loading from scratch.
      gcTime: 30 * 60_000,
      // Only server hiccups are worth retrying. A 4xx will fail the same way again.
      retry: (failureCount, error) => failureCount < 1 && error.status >= 500,
    },
  },
});

export function App() {
  return (
    <ConfigProvider theme={antdTheme} modal={{ mask: { blur: false } }}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <TabsProvider>
            <RouterProvider router={router} />
          </TabsProvider>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
