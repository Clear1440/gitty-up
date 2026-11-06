import { Button, Result } from 'antd';
import { useRouteError } from 'react-router';

/** Last resort for a crash while rendering a route. */
export function RouteErrorPage() {
  const error = useRouteError();
  return (
    <Result
      status="error"
      title="Something went wrong"
      subTitle={error?.message}
      extra={
        <Button type="primary" onClick={() => window.location.assign('/')}>
          Back to repositories
        </Button>
      }
    />
  );
}
