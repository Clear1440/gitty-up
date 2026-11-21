import { Alert, App, Button, Checkbox, Flex, Input, Select, Spin } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Field, Outcome } from '../../../components/Field.jsx';
import { useCreatePullRequest, usePullRequestDraft } from '../../../queries/pullRequests.js';
import { LinkHelper } from '../../../utils/LinkHelper.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { usePush } from '../usePush.js';

/**
 * Says when the branch isn't on its remote, or has commits that aren't, and offers to
 * push the checked out branch first. Pushing never forces. Another branch has to be
 * checked out to push, so for those it only says so.
 */
function PushFirst({ draft, isCurrent }) {
  const { run, isBusy } = useRepositoryContext();
  const push = usePush();
  const { branch, remote, pushed, ahead, host } = draft;

  if (!pushed) {
    return (
      <Alert
        type="warning"
        showIcon
        title={`${branch} isn't on ${remote ?? 'a remote'} yet, so ${host.name} can't see it.`}
        description={isCurrent ? undefined : 'Check it out and publish it first.'}
        action={
          isCurrent &&
          remote && (
            <Button
              size="small"
              loading={isBusy}
              onClick={() => run('publishBranch', { remote, upstreamName: branch })}
            >
              Publish first
            </Button>
          )
        }
      />
    );
  }
  if (ahead > 0) {
    return (
      <Alert
        type="warning"
        showIcon
        title={`${branch} has ${TextHelper.countOf(ahead, 'commit')} that ${host.name} doesn't have yet.`}
        description={[
          `The ${host.term} leaves ${ahead === 1 ? 'it' : 'them'} out until you push.`,
          !isCurrent && 'Check the branch out to push it.',
        ]
          .filter(Boolean)
          .join(' ')}
        action={
          isCurrent && (
            <Button size="small" loading={isBusy} onClick={() => push()}>
              Push first
            </Button>
          )
        }
      />
    );
  }
  return null;
}

/** What pressing the button does, as a sentence. */
function describeOutcome({ host, headName, base, draft }) {
  const what = `${draft ? `a draft ${host.term}` : `a ${host.term}`} from `;
  const branches = (
    <>
      <strong>{headName}</strong> into <strong>{base}</strong>
    </>
  );
  if (host.canCreate) {
    return (
      <>
        Creates {what}
        {branches} on {host.name}.
      </>
    );
  }
  const filledIn = host.prefills.title
    ? ', filled in with these'
    : '. Add the title and description there';
  return (
    <>
      Opens {host.name} in your browser to finish {what}
      {branches}
      {filledIn}.
    </>
  );
}

/**
 * Opens a pull request for `branch` (a remote one when `remote` is true) on the host its
 * remote is on. With a token where the host's API allows, it is created here; otherwise
 * the host's own page opens in the browser, filled in as far as it allows.
 */
export function CreatePullRequestDialog({ branch, remote = false, onClose }) {
  const { repository, status } = useRepositoryContext();
  const { notification } = App.useApp();
  const [chosenBase, setChosenBase] = useState(null);
  // Left null until edited, so they follow the base branch's commits until then.
  const [title, setTitle] = useState(null);
  const [body, setBody] = useState(null);
  const [isDraft, setIsDraft] = useState(false);
  const { data, error, isPending } = usePullRequestDraft(repository.id, {
    branch,
    remote,
    base: chosenBase ?? undefined,
  });
  const { mutateAsync } = useCreatePullRequest(repository.id);

  const isCurrent = !remote && status.branch === branch;
  const base = chosenBase ?? data?.base ?? null;
  const shownTitle = title ?? data?.title ?? '';
  const shownBody = body ?? data?.body ?? '';
  const host = data?.host;
  const term = host?.term ?? 'pull request';
  const takesFields = Boolean(host && (host.canCreate || host.prefills.title));
  const takesDraft = Boolean(host && (host.canCreate || host.prefills.draft));
  const canSubmit = Boolean(
    data?.pushed && base && base !== data.headName && (shownTitle.trim() || !takesFields),
  );

  const submit = async () => {
    try {
      const result = await mutateAsync({
        branch,
        remote,
        base,
        title: shownTitle.trim() || data.headName,
        body: shownBody,
        draft: takesDraft && isDraft,
      });
      const link = (text) => (
        <a href={result.url} target="_blank" rel="noreferrer">
          {text}
        </a>
      );
      if (result.created) {
        notification.success({
          title: `Created ${term} #${result.number}`,
          description: link(`Open it on ${result.hostName}`),
        });
      } else {
        LinkHelper.openExternal(result.url);
        notification.info({
          title: result.reason ?? `Finish the ${term} on ${result.hostName}`,
          description: link(`Open ${result.hostName} again`),
        });
      }
      return true;
    } catch (failure) {
      notification.error({ title: `Create ${term} failed`, description: failure.message });
      return false;
    }
  };

  let content;
  if (error) {
    content = <Alert type="error" showIcon title={error.message} />;
  } else if (isPending) {
    content = <Spin className="centered" />;
  } else {
    content = (
      <Flex vertical gap={12}>
        <PushFirst draft={data} isCurrent={isCurrent} />
        {data.bases.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            title={`${data.remote} has no other branch for ${data.headName} to go into.`}
          />
        ) : (
          <Field label="Into" hint={`The branch on ${data.remote} that the ${term} merges into.`}>
            <Select
              showSearch
              aria-label="Base branch"
              value={base}
              options={data.bases.map((name) => ({ value: name, label: name }))}
              onChange={setChosenBase}
            />
          </Field>
        )}
        {takesFields && (
          <>
            <Field label="Title">
              <Input
                autoFocus
                aria-label="Title"
                value={shownTitle}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field label="Description">
              <Input.TextArea
                aria-label="Description"
                autoSize={{ minRows: 3, maxRows: 12 }}
                value={shownBody}
                onChange={(event) => setBody(event.target.value)}
              />
            </Field>
          </>
        )}
        {takesDraft && (
          <Checkbox checked={isDraft} onChange={(event) => setIsDraft(event.target.checked)}>
            Draft
          </Checkbox>
        )}
        {canSubmit && (
          <Outcome>
            {describeOutcome({ host, headName: data.headName, base, draft: isDraft && takesDraft })}
          </Outcome>
        )}
      </Flex>
    );
  }

  return (
    <ActionDialog
      title={`Create a ${term} for ${branch}`}
      okText={host && !host.canCreate ? `Open ${host.name}` : `Create ${term}`}
      canSubmit={canSubmit}
      wide
      onSubmit={submit}
      onClose={onClose}
    >
      {content}
    </ActionDialog>
  );
}
