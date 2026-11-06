import { useNavigate } from 'react-router';
import { paths } from '../../paths.js';

/**
 * Wraps a mutation that resolves with a repository, so that a dialog can run it
 * and open the result. Resolves true on success, as ActionDialog expects.
 */
export function useOpenAfter(mutation) {
  const navigate = useNavigate();

  return async (variables) => {
    try {
      const repository = await mutation.mutateAsync(variables);
      navigate(paths.repository(repository.id));
      return true;
    } catch {
      return false;
    }
  };
}
