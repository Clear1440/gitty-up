import { ClusterOutlined } from '@ant-design/icons';
import { App, Button, Radio, Tooltip } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ActionDialog } from '../../components/ActionDialog.jsx';
import { monoRepositoryId, paths } from '../../paths.js';
import { useOpenMono, useRepositories } from '../../queries/repositories.js';
import { describeLeftOut, findMonoBranches } from './monoBranches.js';
import styles from './OpenMonoButton.module.css';

const describeCount = (count) => (count === 1 ? '1 repository' : `${count} repositories`);

function ChooseBranchDialog({ group, repositories, choices, onOpen, onClose }) {
  const [branch, setBranch] = useState(choices[0].branch);
  const { repositories: members } = choices.find((choice) => choice.branch === branch);
  const leftOut = repositories.filter((repository) => !members.includes(repository));

  return (
    <ActionDialog
      title={`Open ${group.name} as a mono repo`}
      okText={`Open ${describeCount(members.length)}`}
      onSubmit={() => onOpen(branch)}
      onClose={onClose}
    >
      <p className={styles.intro}>
        A mono repo brings together repositories on the same branch.{' '}
        {choices.length > 1
          ? 'These are on different branches, so pick the one to work on.'
          : 'Not all of these can join right now.'}
      </p>
      <Radio.Group
        className={styles.choices}
        aria-label="Branch to open"
        value={branch}
        onChange={(event) => setBranch(event.target.value)}
      >
        {choices.map((choice) => (
          <Radio key={choice.branch} className={styles.choice} value={choice.branch}>
            <span className={styles.branch}>{choice.branch}</span>
            <span className={styles.names}>
              {choice.repositories.map(({ name }) => name).join(', ')}
            </span>
          </Radio>
        ))}
      </Radio.Group>
      <div className={styles.leftOut}>
        <h4 className={styles.leftOutTitle}>Left out for now</h4>
        <ul className={styles.leftOutList}>
          {leftOut.map((repository) => (
            <li key={repository.id}>
              {repository.name} <span className={styles.names}>{describeLeftOut(repository)}</span>
            </li>
          ))}
        </ul>
        <p className={styles.note}>You can bring these in later from the mono repo tab.</p>
      </div>
    </ActionDialog>
  );
}

/** Opens a group as one tab, asking which branch only if its repositories disagree. */
export function OpenMonoButton({ group }) {
  const { data: allRepositories = [] } = useRepositories();
  const { notification } = App.useApp();
  const navigate = useNavigate();
  const openMono = useOpenMono();
  const [choosing, setChoosing] = useState(false);

  // From the full list, as a search must not change who a mono repo takes in.
  const repositories = allRepositories.filter(({ groupId }) => groupId === group.id);
  const choices = findMonoBranches(repositories);

  const open = async (branch) => {
    try {
      await openMono.mutateAsync({ groupId: group.id, branch });
      navigate(paths.repository(monoRepositoryId(group.id)));
      return true;
    } catch (error) {
      notification.error({ title: 'Could not open the mono repo', description: error.message });
      return false;
    }
  };

  if (repositories.length === 0) return null;

  const isSplit = choices.length > 1 || choices[0]?.repositories.length < repositories.length;
  const hint =
    choices.length === 0
      ? 'None of these repositories are on a branch'
      : 'Work on these repositories together in one tab';

  return (
    <>
      <Tooltip title={hint}>
        {/* A disabled button fires no hover events, so the wrapper carries the tooltip. */}
        <span>
          <Button
            type="text"
            size="small"
            icon={<ClusterOutlined />}
            disabled={choices.length === 0}
            loading={openMono.isPending}
            onClick={() => (isSplit ? setChoosing(true) : open(choices[0].branch))}
          >
            Open as mono repo
          </Button>
        </span>
      </Tooltip>
      {choosing && (
        <ChooseBranchDialog
          group={group}
          repositories={repositories}
          choices={choices}
          onOpen={open}
          onClose={() => setChoosing(false)}
        />
      )}
    </>
  );
}
