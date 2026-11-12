import { CodeOutlined, DownOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Dropdown } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useScripts } from '../../queries/git.js';
import { queryKeys } from '../../queries/queryKeys.js';
import { toConsoleText } from './consoleText.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { ScriptConsole } from './ScriptConsole.jsx';
import { ScriptParamsDialog } from './ScriptParamsDialog.jsx';
import {
  markScriptRunSeen,
  startScriptRun,
  stopScriptRun,
  useLatestScriptRun,
} from './scriptRuns.js';
import styles from './ScriptsMenu.module.css';

const CONSOLE_KEY = '\u0000console';
/** How much of the output a notification shows. The console has the rest. */
const NOTIFICATION_LINES = 12;

function lastLines(output) {
  const lines = toConsoleText(output).trimEnd().split('\n');
  return lines.slice(-NOTIFICATION_LINES).join('\n');
}

function scriptItem({ name, description, runs, params }, disabled) {
  return {
    key: name,
    disabled,
    label: (
      <div className={styles.item}>
        {/* The ellipsis says a form comes first, as for any other command that asks. */}
        <span className={styles.itemName}>{params?.length > 0 ? `${name}…` : name}</span>
        {description && <span className={styles.itemDetail}>{description}</span>}
        <code className={styles.itemRuns}>{runs}</code>
      </div>
    ),
  };
}

/** Tells the user how a run ended, once, when they were not watching it in the console. */
function useRunEndNotice(repositoryId, run, consoleOpen, openConsole) {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

  useEffect(() => {
    if (!run || run.status === 'running' || run.seen) return;
    markScriptRunSeen(run.id);
    // A script can change anything in the folder, the .gitty file included.
    queryClient.invalidateQueries({ queryKey: queryKeys.repository(repositoryId) });
    if (consoleOpen) return;

    const succeeded = run.status === 'finished' && run.exitCode === 0 && !run.stopReason;
    const output = lastLines(run.output);
    const key = `script-run-${run.id}`;
    notification[succeeded ? 'success' : 'error']({
      key,
      title: succeeded ? `${run.name} finished` : `${run.name} did not finish`,
      description: output ? <pre className={styles.output}>{output}</pre> : 'No output',
      actions: (
        <Button
          size="small"
          onClick={() => {
            notification.destroy(key);
            openConsole();
          }}
        >
          Show console
        </Button>
      ),
      // A failure has output worth reading, so it stays until closed.
      duration: succeeded ? 6 : 0,
      className: styles.notification,
    });
  }, [repositoryId, run, consoleOpen, openConsole, notification, queryClient]);
}

/**
 * Lists the scripts in the repository's .gitty file. Picking one asks for its parameters,
 * if it has any, then runs it in the repository's folder with its output in a console.
 * Shows nothing when there is no .gitty file.
 */
export function ScriptsMenu() {
  const { repository } = useRepositoryContext();
  const { notification } = App.useApp();
  const { data } = useScripts(repository.id);
  const run = useLatestScriptRun(repository.id);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [asking, setAsking] = useState(null);
  const [starting, setStarting] = useState(null);
  const [stopping, setStopping] = useState(false);
  const openConsole = useCallback(() => setConsoleOpen(true), []);

  useRunEndNotice(repository.id, run, consoleOpen, openConsole);

  if (!data?.found) return null;
  const { scripts, errors } = data;
  const running = run?.status === 'running';

  /** Starts the script, rejecting if the server turns it down so a form can stay open. */
  const start = async (name, params) => {
    setStarting(name);
    try {
      await startScriptRun(repository.id, { name, params });
      setConsoleOpen(true);
    } finally {
      setStarting(null);
    }
  };

  const startOrAsk = (script) => {
    if (script.params?.length > 0) {
      setAsking(script);
      return;
    }
    start(script.name, {}).catch((error) =>
      notification.error({ title: `Could not run ${script.name}`, description: error.message }),
    );
  };

  const stop = async () => {
    setStopping(true);
    try {
      await stopScriptRun(repository.id, run.id);
    } catch (error) {
      notification.error({ title: `Could not stop ${run.name}`, description: error.message });
    } finally {
      setStopping(false);
    }
  };

  const runAgain = () => {
    const script = scripts.find(({ name }) => name === run.name);
    if (!script) {
      notification.error({ title: `.gitty no longer has a script named ${run.name}` });
      return;
    }
    start(run.name, run.request?.params ?? {}).catch((error) =>
      notification.error({ title: `Could not run ${run.name}`, description: error.message }),
    );
  };

  const items =
    scripts.length > 0
      ? scripts.map((script) => scriptItem(script, running))
      : [{ key: 'empty', label: 'No scripts listed in .gitty', disabled: true }];

  if (run) {
    items.unshift(
      {
        key: CONSOLE_KEY,
        icon: <CodeOutlined />,
        label: running ? `Show ${run.name} console` : `Show console for the last run (${run.name})`,
      },
      { type: 'divider' },
    );
  }

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

  const onMenuClick = ({ key }) => {
    if (key === CONSOLE_KEY) {
      openConsole();
      return;
    }
    const script = scripts.find(({ name }) => name === key);
    if (script) startOrAsk(script);
  };

  const hasErrors = errors.length > 0;
  const busyName = starting ?? (running ? run.name : null);

  return (
    <>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        disabled={Boolean(starting)}
        menu={{ items, onClick: onMenuClick, className: styles.menu }}
      >
        <Button
          aria-label="Available scripts"
          title={hasErrors ? '.gitty has problems. Open the list to see them.' : undefined}
          // Not `loading`, which would stop the menu, and its console item, from opening.
          icon={
            busyName ? (
              <LoadingOutlined />
            ) : hasErrors ? (
              <WarningOutlined className={styles.warningIcon} />
            ) : (
              <CodeOutlined />
            )
          }
        >
          <span className={styles.label}>{busyName ? `Running ${busyName}…` : 'Available scripts'}</span>
          <DownOutlined className={styles.caret} />
        </Button>
      </Dropdown>
      {asking && (
        <ScriptParamsDialog
          repositoryId={repository.id}
          script={asking}
          onRun={(params) => start(asking.name, params)}
          onClose={() => setAsking(null)}
        />
      )}
      {run && (
        <ScriptConsole
          run={run}
          open={consoleOpen}
          stopping={stopping}
          onClose={() => setConsoleOpen(false)}
          onStop={stop}
          onRunAgain={runAgain}
        />
      )}
    </>
  );
}
