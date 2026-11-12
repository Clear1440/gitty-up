import { App, Checkbox, Input, InputNumber, Select } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../components/ActionDialog.jsx';
import { StorageHelper } from '../../utils/StorageHelper.js';
import styles from './ScriptsMenu.module.css';

const storageKey = (repositoryId, name) => `gitty-up.script-params.${repositoryId}.${name}`;

/** Whether `value` is still a valid answer to `param`, which .gitty may have changed since. */
function fits(param, value) {
  switch (param.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return value === null || Number.isFinite(value);
    case 'choice':
      return value === null || param.options.includes(value);
    default:
      return typeof value === 'string';
  }
}

const emptyValue = (param) => {
  if (param.type === 'boolean') return false;
  if (param.type === 'string') return '';
  return null;
};

/** What each field starts with: the answer given last time, else the script's default. */
function initialValues(params, stored) {
  return Object.fromEntries(
    params.map((param) => {
      if (param.name in stored && fits(param, stored[param.name])) {
        return [param.name, stored[param.name]];
      }
      return [param.name, param.default ?? emptyValue(param)];
    }),
  );
}

const isMissing = (param, value) =>
  param.required && (value === null || value === undefined || (typeof value === 'string' && !value.trim()));

function ParamField({ param, value, onChange, autoFocus }) {
  const id = `script-param-${param.name}`;
  const common = { id, autoFocus, 'aria-describedby': param.description ? `${id}-help` : undefined };

  let field;
  switch (param.type) {
    case 'boolean':
      field = (
        <Checkbox {...common} checked={value} onChange={(event) => onChange(event.target.checked)}>
          {param.label}
          {param.flag && <code className={styles.paramFlag}>{param.flag}</code>}
        </Checkbox>
      );
      break;
    case 'number':
      field = (
        <InputNumber
          {...common}
          className={styles.paramInput}
          placeholder={param.placeholder}
          value={value}
          onChange={(next) => onChange(next ?? null)}
        />
      );
      break;
    case 'choice':
      field = (
        <Select
          {...common}
          className={styles.paramInput}
          placeholder={param.placeholder ?? 'Pick one'}
          allowClear={!param.required}
          value={value ?? undefined}
          onChange={(next) => onChange(next ?? null)}
          options={param.options.map((option) => ({ value: option, label: option }))}
        />
      );
      break;
    default:
      field = (
        <Input
          {...common}
          placeholder={param.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }

  return (
    <div className={styles.param}>
      {param.type !== 'boolean' && (
        <label htmlFor={id} className={styles.paramLabel}>
          {param.label}
          {param.required && <span className={styles.paramRequired}> *</span>}
        </label>
      )}
      {field}
      {param.description && (
        <span id={`${id}-help`} className={styles.paramHelp}>
          {param.description}
        </span>
      )}
    </div>
  );
}

/**
 * Asks for the parameters a script declares in .gitty, then starts it with them. The
 * answers are remembered for next time.
 */
export function ScriptParamsDialog({ repositoryId, script, onRun, onClose }) {
  const { notification } = App.useApp();
  const [values, setValues] = useState(() =>
    initialValues(script.params, StorageHelper.read(storageKey(repositoryId, script.name), {})),
  );
  const canSubmit = !script.params.some((param) => isMissing(param, values[param.name]));

  const submit = async () => {
    StorageHelper.write(storageKey(repositoryId, script.name), values);
    try {
      await onRun(values);
      return true;
    } catch (error) {
      notification.error({ title: `Could not run ${script.name}`, description: error.message });
      return false;
    }
  };

  return (
    <ActionDialog
      title={`Run ${script.name}`}
      okText="Run"
      canSubmit={canSubmit}
      onSubmit={submit}
      onClose={onClose}
    >
      {script.description && <p className={styles.paramIntro}>{script.description}</p>}
      <div className={styles.params}>
        {script.params.map((param, index) => (
          <ParamField
            key={param.name}
            param={param}
            value={values[param.name]}
            autoFocus={index === 0}
            onChange={(value) => setValues((current) => ({ ...current, [param.name]: value }))}
          />
        ))}
      </div>
    </ActionDialog>
  );
}
