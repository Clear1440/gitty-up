import {
  CloudDownloadOutlined,
  CopyOutlined,
  DesktopOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  KeyOutlined,
  MoonOutlined,
  SunOutlined,
  SyncOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Checkbox,
  ColorPicker,
  Result,
  Segmented,
  Select,
  Spin,
  Switch,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useAppearance } from '../../appearance/AppearanceContext.jsx';
import { ChangelogDialog } from '../../changelog/ChangelogDialog.jsx';
// Read when the app is built, so it is the release's own.
import { APP_VERSION as appVersion, RELEASES } from '../../changelog/releases.js';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { useConfirmDanger } from '../../components/useConfirmDanger.js';
import { updateLabel, useStartUpdate } from '../../layouts/UpdateButton.jsx';
import { useRepositories, useRepositoryGroups } from '../../queries/repositories.js';
import {
  useRegenerateMcpToken,
  useSetDataDir,
  useSetMcp,
  useSettings,
} from '../../queries/settings.js';
import { isUpdating, useCheckForUpdates, useUpdateStatus } from '../../queries/updates.js';
import {
  CUSTOM_COLORS,
  CUSTOM_SCHEME_ID,
  DEFAULT_CUSTOM_COLORS,
  SCHEMES,
  SYSTEM_MODE,
  paletteOf,
} from '../../styles/themes.js';
import { useCopyToClipboard } from '../../utils/useCopyToClipboard.js';
import { AiActivity } from './AiActivity.jsx';
import { DataFolderDialog, MOVE_OUTCOMES } from './DataFolderDialog.jsx';
import { McpSnippets } from './McpSnippets.jsx';
import {
  ALL_REPOSITORIES,
  allowedRepositories,
  groupEntry,
  nextScope,
  repositoryEntry,
} from './mcpScope.js';
import styles from './SettingsPage.module.css';

const MODE_OPTIONS = [
  { value: 'dark', label: 'Dark', icon: <MoonOutlined /> },
  { value: 'light', label: 'Light', icon: <SunOutlined /> },
  { value: SYSTEM_MODE, label: 'System', icon: <DesktopOutlined /> },
];

/** The colors that give a scheme its character, drawn as a row of dots. */
const SWATCHES = ['bg', 'primary', 'accent', 'graph-3'];

function SchemeSwatches({ palette }) {
  return (
    <span className={styles.swatches} aria-hidden>
      {SWATCHES.map((name) => (
        <span key={name} className={styles.swatch} style={{ background: palette[name] }} />
      ))}
    </span>
  );
}

function SchemeOption({ palette, label, description }) {
  return (
    <span className={styles.schemeOption}>
      <SchemeSwatches palette={palette} />
      <span className={styles.schemeLabel}>{label}</span>
      <span className={styles.schemeDescription}>{description}</span>
    </span>
  );
}

/** `mode` is the one on show, 'dark' or 'light'. */
function schemeOptions(appearance, mode) {
  const builtIn = SCHEMES.map((scheme) => ({
    value: scheme.id,
    label: (
      <SchemeOption
        palette={scheme[mode]}
        label={scheme.label}
        description={scheme.description}
      />
    ),
  }));
  const custom = {
    value: CUSTOM_SCHEME_ID,
    label: (
      <SchemeOption
        palette={paletteOf({ ...appearance, scheme: CUSTOM_SCHEME_ID })}
        label="Custom"
        description="Your own four colors"
      />
    ),
  };
  return [...builtIn, custom];
}

/**
 * The four colors of the custom scheme, for the mode being shown. Dragging previews
 * a color across the app, and letting go saves it.
 */
function CustomColors({ appearance, mode, onChange }) {
  const { custom } = appearance;
  const colors = custom[mode];
  const isDefault = CUSTOM_COLORS.every(({ key }) => colors[key] === DEFAULT_CUSTOM_COLORS[mode][key]);

  const setColors = (nextColors, options) =>
    onChange({ custom: { ...custom, [mode]: nextColors } }, options);

  return (
    <Setting
      label="Custom colors"
      description={`For ${mode} mode. Switch the mode below to set its colors too. Everything else, such as borders and hover shades, is worked out from these.`}
    >
      <div className={styles.customColors}>
        {CUSTOM_COLORS.map(({ key, label }) => (
          <label key={key} className={styles.customColor}>
            <ColorPicker
              aria-label={`${label} color`}
              value={colors[key]}
              disabledAlpha
              disabledFormat
              format="hex"
              showText={(color) => color.toHexString()}
              onChange={(color) => setColors({ ...colors, [key]: color.toHexString() }, { save: false })}
              onChangeComplete={(color) => setColors({ ...colors, [key]: color.toHexString() })}
            />
            <span className={styles.customColorLabel}>{label}</span>
          </label>
        ))}
        <Button
          type="text"
          icon={<UndoOutlined />}
          disabled={isDefault}
          onClick={() => setColors(DEFAULT_CUSTOM_COLORS[mode])}
        >
          Reset
        </Button>
      </div>
    </Setting>
  );
}

/** `footer` goes the full width of the setting, below its text and control. */
function Setting({ label, description, children, footer }) {
  return (
    <div className={styles.setting}>
      <div className={styles.settingText}>
        <div className={styles.settingLabel}>{label}</div>
        {description && <div className={styles.settingDescription}>{description}</div>}
      </div>
      <div className={styles.settingControl}>{children}</div>
      {footer && <div className={styles.settingFooter}>{footer}</div>}
    </div>
  );
}

function AppearanceSection() {
  const { notification } = App.useApp();
  const { appearance, resolvedMode, setAppearance } = useAppearance();

  const change = async (changes, options) => {
    try {
      await setAppearance({ ...appearance, ...changes }, options);
    } catch (error) {
      notification.error({ title: 'Could not save the appearance', description: error.message });
    }
  };

  return (
    <section className={styles.section} aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className={styles.sectionTitle}>
        Appearance
      </h2>
      <Setting label="Color scheme" description="The colors used across the app.">
        <Select
          aria-label="Color scheme"
          className={styles.schemeSelect}
          value={appearance.scheme}
          onChange={(scheme) => change({ scheme })}
          options={schemeOptions(appearance, resolvedMode)}
          popupMatchSelectWidth={false}
          // Tall enough for every scheme, so Custom at the end never needs a scroll.
          listHeight={360}
        />
      </Setting>
      {appearance.scheme === CUSTOM_SCHEME_ID && (
        <CustomColors appearance={appearance} mode={resolvedMode} onChange={change} />
      )}
      <Setting
        label="Mode"
        description="Every color scheme comes in light and dark. System follows your computer’s setting."
      >
        <Segmented
          aria-label="Mode"
          options={MODE_OPTIONS}
          value={appearance.mode}
          onChange={(mode) => change({ mode })}
        />
      </Setting>
    </section>
  );
}

function DataSection({ settings }) {
  const { notification, modal } = App.useApp();
  const [isChoosing, setChoosing] = useState(false);
  const setDataDir = useSetDataDir();

  const announce = ({ outcome, dataDir }) => {
    if (outcome === 'unchanged') return;
    notification.success({ title: `Data folder is now ${dataDir}`, description: MOVE_OUTCOMES[outcome] });
  };

  const resetToDefault = () =>
    modal.confirm({
      title: 'Go back to the default data folder?',
      content: (
        <>
          gitty-up will use <code>{settings.defaultDataDir}</code> again. Data already there is
          used, otherwise your current data is copied over.
        </>
      ),
      okText: 'Use the default',
      onOk: async () => {
        try {
          announce(await setDataDir.mutateAsync(null));
        } catch (error) {
          notification.error({ title: 'Could not change the data folder', description: error.message });
        }
      },
    });

  return (
    <section className={styles.section} aria-labelledby="data-heading">
      <h2 id="data-heading" className={styles.sectionTitle}>
        Data
      </h2>
      <Setting
        label="Data folder"
        description={
          <>
            Where gitty-up keeps your linked repositories and groups. These settings always
            stay in <code>{settings.defaultDataDir}</code>, so they can find it again.
          </>
        }
      >
        <div className={styles.dataFolder}>
          <Typography.Text className={styles.path} copyable={{ text: settings.dataDir }}>
            {settings.dataDir}
          </Typography.Text>
          <div className={styles.dataActions}>
            <Button icon={<FolderOpenOutlined />} onClick={() => setChoosing(true)}>
              Change…
            </Button>
            {!settings.isDefaultDataDir && (
              <Button icon={<UndoOutlined />} onClick={resetToDefault}>
                Use default
              </Button>
            )}
          </div>
        </div>
      </Setting>
      {isChoosing && <DataFolderDialog onMoved={announce} onClose={() => setChoosing(false)} />}
    </section>
  );
}

const ACCESS_OPTIONS = [
  { value: 'read-only', label: 'Read-only tools', icon: <EyeOutlined /> },
  { value: 'full', label: 'Full access', icon: <EditOutlined /> },
];

/** The choices for which repositories AI tools may use: all, groups, or single ones. */
function scopeOptions(groups, repositories) {
  const linked = repositories.filter((repository) => repository.path);
  const countIn = (group) =>
    linked.filter((repository) => (repository.groupIds ?? []).includes(group.id)).length;
  return [
    { value: ALL_REPOSITORIES, label: 'All repositories (*)' },
    {
      label: 'Groups',
      options: groups.map((group) => ({
        value: groupEntry(group),
        label: `${group.name} (${countIn(group)})`,
      })),
    },
    {
      label: 'Repositories',
      options: linked.map((repository) => ({
        value: repositoryEntry(repository),
        label: repository.name,
        title: repository.path,
      })),
    },
  ];
}

function scopeDescription(scope, allowed, linkedCount) {
  if (scope.includes(ALL_REPOSITORIES)) {
    return 'AI tools can use every linked repository, including ones you link later.';
  }
  if (allowed.length === 0) return 'AI tools cannot use any repository. Pick some, or All.';
  return `AI tools can use ${allowed.length} of your ${linkedCount} repositories. A group covers whatever is in it, including repositories added to it later.`;
}

/**
 * Which repositories AI tools may use. Entries for a group or repository that no longer
 * exists are left out, so they drop from the setting the next time it is saved.
 */
function RepositoryScopeSetting({ scope, onChange }) {
  const { data: repositories = [] } = useRepositories();
  const { data: groups = [] } = useRepositoryGroups();
  const options = scopeOptions(groups, repositories);
  const known = new Set(
    options.flatMap((option) => (option.options ?? [option]).map(({ value }) => value)),
  );
  const value = scope.filter((entry) => known.has(entry));
  const linkedCount = repositories.filter((repository) => repository.path).length;

  return (
    <Setting
      label="Repositories"
      description={scopeDescription(scope, allowedRepositories(scope, repositories), linkedCount)}
    >
      <Select
        aria-label="Repositories AI tools can use"
        className={styles.scopeSelect}
        mode="multiple"
        allowClear
        placeholder="No repositories"
        value={value}
        options={options}
        optionFilterProp="label"
        maxTagCount="responsive"
        onChange={(next) => onChange(nextScope(value, next))}
      />
    </Setting>
  );
}

/** Stands in for the token until shown. The same length whatever the token, so it says nothing of it. */
const HIDDEN_TOKEN = '•'.repeat(24);

/**
 * The secret AI tools send with every request. Hidden until asked for, though the configs
 * below hold it too. Making a new one turns away every AI tool set up with the old one.
 */
function McpTokenSetting({ token }) {
  const { message, notification } = App.useApp();
  const confirmDanger = useConfirmDanger();
  const regenerate = useRegenerateMcpToken();
  const copy = useCopyToClipboard();
  const [isShown, setShown] = useState(false);

  const confirmRegenerate = () =>
    confirmDanger({
      title: 'Make a new token?',
      content:
        'Every AI tool set up with the current token will be turned away until you copy its config from here again.',
      okText: 'Make a new token',
      onOk: async () => {
        try {
          await regenerate.mutateAsync();
          message.success('Made a new token. Copy the config into each AI tool again.');
        } catch (error) {
          notification.error({ title: 'Could not make a new token', description: error.message });
        }
      },
    });

  return (
    <Setting
      label="Your token"
      description="It is in each config below. Anything that has it can use the MCP server, so keep it secret."
    >
      <div className={styles.tokenControl}>
        <code className={styles.token} aria-label={isShown ? 'Token' : 'Token, hidden'}>
          {isShown ? token : HIDDEN_TOKEN}
        </code>
        <div className={styles.dataActions}>
          <Button
            icon={isShown ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            aria-pressed={isShown}
            onClick={() => setShown((shown) => !shown)}
          >
            {isShown ? 'Hide' : 'Show'}
          </Button>
          <Button icon={<CopyOutlined />} onClick={() => copy(token, 'the token')}>
            Copy
          </Button>
          <Button
            danger
            icon={<KeyOutlined />}
            loading={regenerate.isPending}
            onClick={confirmRegenerate}
          >
            Regenerate token
          </Button>
        </div>
      </div>
    </Setting>
  );
}

/**
 * The MCP server, which lets AI tools such as Claude Code work with the linked
 * repositories: off until turned on, then read-only unless given full access, and
 * limited to the repositories chosen. AI tools send the token shown here, unless the
 * settings let them connect without one.
 */
function AiToolsSection({ settings }) {
  const { notification, modal } = App.useApp();
  const setMcp = useSetMcp();
  const { enabled, access, repositories, token, url, requireToken = true } = settings.mcp;

  const save = async (changes) => {
    try {
      await setMcp.mutateAsync(changes);
    } catch (error) {
      notification.error({ title: 'Could not change the MCP server', description: error.message });
    }
  };

  // Turning it on needs no warning. Off lets any program on this computer connect, so ask.
  const changeRequireToken = (checked) => {
    if (checked) {
      save({ requireToken: true });
      return;
    }
    modal.confirm({
      title: 'Let AI tools connect without a token?',
      content:
        'Any program running on this computer will be able to use the MCP server, with whatever access it has here. The token is kept, so ticking the box again brings it back.',
      okText: 'Connect without a token',
      okButtonProps: { danger: true },
      autoFocusButton: 'cancel',
      onOk: () => save({ requireToken: false }),
    });
  };

  const changeAccess = (nextAccess) => {
    if (nextAccess !== 'full') {
      save({ access: nextAccess });
      return;
    }
    modal.confirm({
      title: 'Give AI tools full access?',
      content:
        'Any AI tool connected to Gitty Up will be able to commit, reset, discard uncommitted changes, push and delete branches in the repositories it can use, without asking you first. Some of that cannot be undone. Force pushing stays off.',
      okText: 'Continue, I understand',
      cancelText: 'On second thought, nevermind',
      okButtonProps: { danger: true },
      // Closing the dialog any other way leaves the access as it was.
      autoFocusButton: 'cancel',
      // Wide enough for both buttons, whose labels are long, to sit on one row.
      width: 520,
      onOk: () => save({ access: 'full' }),
    });
  };

  return (
    <section className={styles.section} aria-labelledby="ai-tools-heading">
      <h2 id="ai-tools-heading" className={styles.sectionTitle}>
        AI tools
      </h2>
      <Setting
        label="MCP server"
        description={
          <>
            Lets AI tools such as Claude Code, Cursor and opencode work with your linked repositories
            over MCP. Only apps on this computer can connect, at <code>{url}</code>.
          </>
        }
      >
        <Switch
          aria-label="MCP server"
          checked={enabled}
          loading={setMcp.isPending}
          onChange={(checked) => save({ enabled: checked })}
        />
      </Setting>
      {enabled && (
        <>
          <Setting
            label="Access"
            description={
              access === 'full'
                ? 'Full access: AI tools can read your repositories, run git commands that change them, such as commit, branch, merge, rebase, stash, reset and push, and run the scripts in your .gitty files. Force pushing is never offered.'
                : 'Read-only tools: AI tools can read status, branches, history, diffs and files, search code and blame lines, and fetch, which only updates remote branches. They cannot change your branches or files.'
            }
            footer={
              <Alert
                type="warning"
                showIcon
                title="Be careful with full access"
                description={
                  <>
                    With full access, any AI tool connected here can change the repositories it can
                    use without asking you: commit, reset, discard uncommitted changes, push, delete
                    branches and run the scripts in your .gitty files. Some of that cannot be undone, and an AI tool can misread a request or be
                    misled by text in a file or web page it reads. Only allow it for AI tools you
                    trust, and keep work you care about committed and pushed. After changing access,
                    reconnect your AI tool so it picks up the new set of tools.
                  </>
                }
              />
            }
          >
            <Segmented
              aria-label="Access"
              options={ACCESS_OPTIONS}
              value={access}
              disabled={setMcp.isPending}
              onChange={changeAccess}
            />
          </Setting>
          <RepositoryScopeSetting
            scope={repositories}
            onChange={(scope) => save({ repositories: scope })}
          />
          <Setting
            label="Token"
            description={
              requireToken
                ? 'AI tools must send the token below with every request, so other programs on this computer cannot connect.'
                : 'Any program on this computer can connect, without a token. Tick the box to turn away those not set up here.'
            }
          >
            <Checkbox
              checked={requireToken}
              disabled={setMcp.isPending}
              onChange={(event) => changeRequireToken(event.target.checked)}
            >
              Require a token
            </Checkbox>
          </Setting>
          {/* The token comes with the server's answer, just after the switch is turned on. */}
          {token && (
            <>
              {requireToken && <McpTokenSetting token={token} />}
              <div className={styles.settingBlock}>
                <div className={styles.settingText}>
                  <div className={styles.settingLabel}>Connect an app</div>
                  <div className={styles.settingDescription}>
                    Pick your app, add what it shows to the app’s MCP config, then restart the app
                    or reload its servers.
                    {requireToken &&
                      ' The config holds your token, so keep it out of files you share, such as a project’s config in a repository.'}
                  </div>
                </div>
                <McpSnippets url={url} token={requireToken ? token : null} />
              </div>
            </>
          )}
        </>
      )}
      <div className={styles.settingBlock}>
        <div className={styles.settingText}>
          <div className={styles.settingLabel}>Activity</div>
          <div className={styles.settingDescription}>
            What AI tools did here, newest first. The last 500 changes are kept between launches,
            and reads until Gitty Up closes. Some changes can be undone: Gitty Up checks nothing
            has moved since, and asks first.
          </div>
        </div>
        <AiActivity isLive={enabled} />
      </div>
    </section>
  );
}

function updateDescription(status) {
  if (isUpdating(status) || status.available) {
    return `v${status.latestVersion} is available. Installing it restarts Gitty Up.`;
  }
  if (status.checkError) return `Could not check for updates: ${status.checkError}`;
  return (
    <>
      You have the latest release.
      {status.checkedAt && (
        <>
          {' '}
          Checked <RelativeTime date={status.checkedAt} />.
        </>
      )}
    </>
  );
}

/** Only the desktop app can update itself, so this is left out when run as a server. */
function UpdatesSetting() {
  const { notification } = App.useApp();
  const { data: status } = useUpdateStatus();
  const check = useCheckForUpdates();
  const startUpdate = useStartUpdate();
  if (!status?.supported) return null;

  const handleCheck = async () => {
    try {
      const result = await check.mutateAsync();
      if (result.checkError) {
        notification.error({ title: 'Could not check for updates', description: result.checkError });
      } else if (!result.available) {
        notification.success({
          title: 'Gitty Up is up to date',
          description: `v${result.currentVersion} is the latest release.`,
        });
      }
    } catch (error) {
      notification.error({ title: 'Could not check for updates', description: error.message });
    }
  };

  return (
    <Setting label="Updates" description={updateDescription(status)}>
      <div className={styles.versionRow}>
        {(status.available || isUpdating(status)) && (
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            loading={isUpdating(status)}
            onClick={startUpdate}
          >
            {isUpdating(status) ? updateLabel(status) : `Install v${status.latestVersion}`}
          </Button>
        )}
        <Button
          icon={<SyncOutlined />}
          loading={check.isPending}
          disabled={isUpdating(status)}
          onClick={handleCheck}
        >
          Check for updates
        </Button>
      </div>
    </Setting>
  );
}

export function SettingsPage() {
  const { data: settings, isPending, error } = useSettings();
  const [showingChangelog, setShowingChangelog] = useState(false);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>Saved on this machine, and kept between launches.</p>
      </header>
      <AppearanceSection />
      {isPending && <Spin className="centered" />}
      {error && <Result status="error" title="Could not load the settings" subTitle={error.message} />}
      {settings && <DataSection settings={settings} />}
      {settings && <AiToolsSection settings={settings} />}
      <section className={styles.section} aria-labelledby="about-heading">
        <h2 id="about-heading" className={styles.sectionTitle}>
          About
        </h2>
        <Setting label="Version" description="The release of Gitty Up you are running.">
          <div className={styles.versionRow}>
            <Typography.Text className={styles.version} copyable={{ text: appVersion }}>
              v{appVersion}
            </Typography.Text>
            <Button icon={<HistoryOutlined />} onClick={() => setShowingChangelog(true)}>
              What's new
            </Button>
          </div>
        </Setting>
        <UpdatesSetting />
        <ChangelogDialog
          open={showingChangelog}
          title="Changelog"
          releases={RELEASES}
          current={appVersion}
          onClose={() => setShowingChangelog(false)}
        />
      </section>
    </div>
  );
}
