import { Select } from 'antd';
import { useBranches } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';

const toOption = ({ name }) => ({ label: name, value: name });

/** A searchable picker over local and remote branches, and `commit` too if given. */
export function BranchSelect({ value, onChange, excludeCurrent = false, commit, ...selectProps }) {
  const { repository, status } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);

  const local = (branches?.local ?? []).filter(
    (branch) => !(excludeCurrent && branch.name === status.branch),
  );
  const options = [
    ...(commit
      ? [
          {
            label: 'Commit',
            options: [
              {
                label: `${commit.shortHash} ${commit.subject}`,
                value: commit.hash,
              },
            ],
          },
        ]
      : []),
    { label: 'Local', options: local.map(toOption) },
    { label: 'Remote', options: (branches?.remote ?? []).map(toOption) },
  ];

  return (
    <Select
      showSearch
      style={{ width: '100%' }}
      placeholder="Choose a branch"
      aria-label="Branch"
      options={options}
      value={value}
      onChange={onChange}
      {...selectProps}
    />
  );
}
