import { Alert, Flex, Spin } from 'antd';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Outcome } from '../../../components/Field.jsx';
import { useSpanPlan } from '../../../queries/git.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { MergeDirection } from './MergePlan.jsx';
import planStyles from './MergePlan.module.css';
import styles from './SwitchSpanDialog.module.css';

function describeStep({ missing, from, to, problem, unstaged }) {
  if (missing) return { text: 'Not on this machine', tone: 'muted' };
  if (problem) return { text: problem, tone: 'danger' };
  if (from === to) return { text: 'Stays', tone: 'muted' };
  if (unstaged > 0) {
    return { text: `${TextHelper.countOf(unstaged, 'change')} come along`, tone: 'muted' };
  }
  return { text: 'Switches', tone: 'normal' };
}

function StepRow({ step }) {
  const { text, tone } = describeStep(step);
  return (
    <li className={planStyles.row}>
      <span className={planStyles.name}>
        {step.name}
        {!step.missing && (
          <span className={styles.move}>
            {' '}
            {step.from === step.to ? (
              `on ${step.to}`
            ) : (
              <MergeDirection
                source={step.from ?? 'detached HEAD'}
                target={step.to ?? '?'}
                label={`From ${step.from ?? 'a detached HEAD'} to ${step.to ?? 'nowhere'}`}
              />
            )}
          </span>
        )}
      </span>
      <span className={styles[tone]}>{text}</span>
    </li>
  );
}

/**
 * Lines the whole group up on a branch that only some of its repositories have: those
 * switch to it, and the rest go to their main line. Says exactly where each one goes,
 * and only goes ahead when every one of them can.
 */
export function SwitchSpanDialog({ branch, onClose }) {
  const { repository, run } = useRepositoryContext();
  const { data: plan, isPending, error } = useSpanPlan(repository.id, branch);

  const blocked = plan?.repositories.filter(({ problem }) => problem) ?? [];
  const otherBranches = [
    ...new Set(
      (plan?.repositories ?? [])
        .filter(({ missing, to }) => !missing && to && to !== branch)
        .map(({ to }) => to),
    ),
  ];

  return (
    <ActionDialog
      title={`Switch ${repository.name} to ${branch}`}
      okText={`Switch to ${branch}`}
      canSubmit={Boolean(plan?.canSwitch)}
      onSubmit={() => run('switchSpan', { branch, onBranch: plan.onBranch, otherBranches })}
      onClose={onClose}
    >
      <Flex vertical gap={12} align="flex-start">
        <Outcome>
          Repositories with <strong>{branch}</strong> switch to it. The rest go to their main
          branch, so the group starts from the same place. Nothing switches unless every
          repository can.
        </Outcome>
        {isPending && <Spin />}
        {error && <Alert type="error" showIcon title={error.message} />}
        {plan && (
          <div className={planStyles.plan}>
            <ul className={planStyles.list} aria-label="Where each repository goes">
              {plan.repositories.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </ul>
          </div>
        )}
        {blocked.length > 0 && (
          <Alert
            type="warning"
            showIcon
            title="Nothing can switch yet"
            description={`Commit, unstage or finish what is under way in ${TextHelper.joinWithAnd(blocked.map(({ name }) => name))} first.`}
          />
        )}
      </Flex>
    </ActionDialog>
  );
}
