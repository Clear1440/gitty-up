import { CodeOutlined, DownOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Dropdown } from 'antd';
import { gitApi } from '../../api';
import { useScripts } from '../../queries/git.js';
import { queryKeys } from '../../queries/queryKeys.js';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './ScriptsMenu.module.css';

function ScriptOutput({ output, exitCode, durationMs }) {
  const seconds = (durationMs / 1000).toFixed(1);
  return (
    <div className={styles.result}>
      <span className={styles.resultMeta}>
        Exit code {exitCode} · {seconds}s
      </span>
      {output.trim() ? (
        <pre className={styles.output}>{output.trimEnd()}</pre>
      ) : (
        <span className={styles.resultMeta}>No output</span>
      )}
    </div>
  );
}

function useRunScript(repositoryId) {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

  return useMutation({
    mutationFn: (name) => gitApi.runScript(repositoryId, { name }),
    onSuccess: (result, name) => {
      const succeeded = result.exitCode === 0;
      notification[succeeded ? 'success' : 'error']({
        title: succeeded ? `${name} finished` : `${name} failed`,
        description: <ScriptOutput {...result} />,
        // A failure has output worth reading, so it stays until closed.
        duration: succeeded ? 6 : 0,
        className: styles.notification,
      });
    },
    onError: (error, name) => {
      notification.error({ title: `Could not run ${name}`, description: error.message });
    },
    // A script can change anything in the folder, the .gitty file included.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.repository(repositoryId) }),
  });
}

function scriptItem({ name, description, runs }) {
  return {
    key: name,
    label: (
      <div className={styles.item}>
        <span className={styles.itemName}>{name}</span>
        {description && <span className={styles.itemDetail}>{description}</span>}
        <code className={styles.itemRuns}>{runs}</code>
      </div>
    ),
  };
}

/**
 * Lists the scripts in the repository's .gitty file, and runs the one picked in the
 * repository's folder. Shows nothing when there is no .gitty file.
 */
export function ScriptsMenu() {
  const { repository } = useRepositoryContext();
  const { data } = useScripts(repository.id);
  const { mutate: runScript, isPending, variables: runningName } = useRunScript(repository.id);

  if (!data?.found) return null;
  const { scripts, errors } = data;

  const items =
    scripts.length > 0
      ? scripts.map(scriptItem)
      : [{ key: 'empty', label: 'No scripts listed in .gitty', disabled: true }];

  if (errors.length > 0) {
    items.push(
      { type: 'divider' },
      {
        key: 'errors',
        disabled: true,
        label: (
          <div className={styles.errors}>
            {errors.map((error) => (
              <span key={error}>{error}</span>
            ))}
          </div>
        ),
        icon: <WarningOutlined className={styles.warningIcon} />,
      },
    );
  }

  const hasErrors = errors.length > 0;

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      disabled={isPending}
      menu={{ items, onClick: ({ key }) => runScript(key), className: styles.menu }}
    >
      <Button
        aria-label="Available scripts"
        title={hasErrors ? '.gitty has problems. Open the list to see them.' : undefined}
        icon={hasErrors ? <WarningOutlined className={styles.warningIcon} /> : <CodeOutlined />}
        loading={isPending}
      >
        <span className={styles.label}>
          {isPending ? `Running ${runningName}…` : 'Available scripts'}
        </span>
        <DownOutlined className={styles.caret} />
      </Button>
    </Dropdown>
  );
}
