import { Alert } from 'antd';

/** Explains why a merge can't go ahead. `reasons` come from findBehindBranches. */
export function MergeBlockedAlert({ reasons }) {
  if (reasons.length === 0) return null;
  return (
    <Alert
      type="warning"
      showIcon
      title="This merge is cancelled until you pull"
      description={`${reasons.join(' ')} Merging now would leave those commits out.`}
    />
  );
}
