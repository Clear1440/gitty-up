import {
  DesktopOutlined,
  FolderOpenOutlined,
  MoonOutlined,
  SunOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { App, Button, ColorPicker, Result, Segmented, Select, Spin, Typography } from 'antd';
import { useState } from 'react';
// Only the version is bundled, read when the app is built, so it is the release's own.
import { version as appVersion } from '../../../package.json';
import { useAppearance } from '../../appearance/AppearanceContext.jsx';
import { useSetDataDir, useSettings } from '../../queries/settings.js';
import {
  CUSTOM_COLORS,
  CUSTOM_SCHEME_ID,
  DEFAULT_CUSTOM_COLORS,
  SCHEMES,
  SYSTEM_MODE,
  paletteOf,
} from '../../styles/themes.js';
import { DataFolderDialog, MOVE_OUTCOMES } from './DataFolderDialog.jsx';
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

function Setting({ label, description, children }) {
  return (
    <div className={styles.setting}>
      <div className={styles.settingText}>
        <div className={styles.settingLabel}>{label}</div>
        {description && <div className={styles.settingDescription}>{description}</div>}
      </div>
      <div className={styles.settingControl}>{children}</div>
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

export function SettingsPage() {
  const { data: settings, isPending, error } = useSettings();

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
      <section className={styles.section} aria-labelledby="about-heading">
        <h2 id="about-heading" className={styles.sectionTitle}>
          About
        </h2>
        <Setting label="Version" description="The release of Gitty Up you are running.">
          <Typography.Text className={styles.version} copyable={{ text: appVersion }}>
            v{appVersion}
          </Typography.Text>
        </Setting>
      </section>
    </div>
  );
}
