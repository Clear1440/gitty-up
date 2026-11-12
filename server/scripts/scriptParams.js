import { ApiError } from '../errors.js';

/**
 * Parameters a script asks for before it runs. The app shows a form for them, then hands
 * the answers to the script as {{name}} placeholders in its `command` or `args`, and as
 * GITTY_PARAM_<NAME> environment variables.
 */

export const PARAM_TYPES = ['string', 'number', 'boolean', 'choice'];

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}/g;

const isString = (value) => typeof value === 'string';

/** The environment variable a parameter is passed in: GITTY_PARAM_ and its name in capitals. */
export const paramEnvName = (name) => `GITTY_PARAM_${name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;

function checkDefault(param) {
  const { type, default: fallback, options } = param;
  if (fallback === undefined) return;
  const fits =
    (type === 'string' && isString(fallback)) ||
    (type === 'number' && Number.isFinite(fallback)) ||
    (type === 'boolean' && typeof fallback === 'boolean') ||
    (type === 'choice' && options.includes(fallback));
  if (!fits) {
    const expected = type === 'choice' ? 'one of its "options"' : `a ${type}`;
    throw new Error(`The default of parameter "${param.name}" must be ${expected}.`);
  }
}

/** Turns one entry of a script's `params` into a parameter, or throws to say what is wrong. */
function toParam(entry, fallbackName) {
  const spec = isString(entry) ? { name: entry } : entry;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new Error('Each parameter must be a name or an object.');
  }
  const name = isString(spec.name) && spec.name.trim() ? spec.name.trim() : fallbackName;
  if (!name || !NAME_PATTERN.test(name)) {
    throw new Error(
      `Parameter name "${name ?? ''}" must start with a letter or _ and hold only letters, digits, _ and -.`,
    );
  }

  const type = spec.type ?? (spec.options !== undefined ? 'choice' : 'string');
  if (!PARAM_TYPES.includes(type)) {
    throw new Error(`Parameter "${name}" has type "${type}". It must be one of ${PARAM_TYPES.join(', ')}.`);
  }
  if (type === 'choice') {
    const { options } = spec;
    if (!Array.isArray(options) || options.length === 0 || !options.every(isString)) {
      throw new Error(`Parameter "${name}" needs "options": a list of strings to choose from.`);
    }
  } else if (spec.options !== undefined) {
    throw new Error(`Parameter "${name}": "options" only applies to a choice.`);
  }
  if (spec.flag !== undefined) {
    if (type !== 'boolean') throw new Error(`Parameter "${name}": "flag" only applies to a boolean.`);
    if (!isString(spec.flag) || !spec.flag.trim()) {
      throw new Error(`Parameter "${name}": "flag" must be the text to pass when it is on.`);
    }
  }
  for (const key of ['label', 'description', 'placeholder']) {
    if (spec[key] !== undefined && !isString(spec[key])) {
      throw new Error(`Parameter "${name}": "${key}" must be text.`);
    }
  }
  if (spec.required !== undefined && typeof spec.required !== 'boolean') {
    throw new Error(`Parameter "${name}": "required" must be true or false.`);
  }

  const param = {
    name,
    label: spec.label?.trim() || name,
    description: spec.description,
    placeholder: spec.placeholder,
    type,
    // A switch always has a value, so it can't be left out.
    required: type !== 'boolean' && spec.required === true,
    options: type === 'choice' ? spec.options : undefined,
    flag: spec.flag?.trim(),
    default: spec.default,
  };
  checkDefault(param);
  return param;
}

/** A script's `params`, written as a list or as a name-to-parameter map. */
export function parseParams(params) {
  if (params === undefined || params === null) return [];
  let entries;
  if (Array.isArray(params)) entries = params.map((entry) => ({ entry }));
  else if (typeof params === 'object') {
    entries = Object.entries(params).map(([fallbackName, entry]) => ({ entry, fallbackName }));
  } else throw new Error('"params" must be a list or an object.');

  const parsed = entries.map(({ entry, fallbackName }) => toParam(entry ?? {}, fallbackName));
  const seen = new Set();
  for (const { name } of parsed) {
    if (seen.has(name)) throw new Error(`There are two parameters named "${name}".`);
    seen.add(name);
  }
  return parsed;
}

/** The names of the {{placeholders}} in `text`. */
export function placeholdersIn(text) {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

/** Throws when a command or arg uses a {{placeholder}} the script has no parameter for. */
export function checkPlaceholders(texts, params) {
  const names = new Set(params.map(({ name }) => name));
  for (const text of texts) {
    const unknown = placeholdersIn(text).find((name) => !names.has(name));
    if (unknown) throw new Error(`"${text}" uses {{${unknown}}}, but there is no parameter named "${unknown}".`);
  }
}

function resolveOne(param, input) {
  const { name, label, type, required, options, flag } = param;
  const raw = input === undefined || input === null ? param.default : input;
  const missing = () => ApiError.badRequest(`"${label}" is required.`);

  switch (type) {
    case 'boolean': {
      if (raw !== undefined && typeof raw !== 'boolean') {
        throw ApiError.badRequest(`"${label}" must be true or false.`);
      }
      const on = raw === true;
      return { name, value: on, text: flag ? (on ? flag : '') : String(on), env: String(on) };
    }
    case 'number': {
      if (raw === undefined || raw === '') {
        if (required) throw missing();
        return { name, value: null, text: '', env: '' };
      }
      const number = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(number) || (isString(raw) && !raw.trim())) {
        throw ApiError.badRequest(`"${label}" must be a number.`);
      }
      return { name, value: number, text: String(number), env: String(number) };
    }
    case 'choice': {
      if (raw === undefined || raw === '') {
        if (required) throw missing();
        return { name, value: null, text: '', env: '' };
      }
      if (!options.includes(raw)) {
        throw ApiError.badRequest(`"${label}" must be one of ${options.join(', ')}.`);
      }
      return { name, value: raw, text: raw, env: raw };
    }
    default: {
      if (raw !== undefined && !isString(raw)) throw ApiError.badRequest(`"${label}" must be text.`);
      const text = raw ?? '';
      if (required && !text.trim()) throw missing();
      return { name, value: text, text, env: text };
    }
  }
}

/**
 * Checks the values the user gave against a script's parameters, filling in defaults.
 * Returns each one as `text` for placeholders, plus the environment variables to set.
 * Values for parameters the script does not have are ignored.
 */
export function resolveParams(params, input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw ApiError.badRequest('"params" must be an object.');
  }
  const resolved = params.map((param) => resolveOne(param, input[param.name]));
  const texts = Object.fromEntries(resolved.map(({ name, text }) => [name, text]));
  const env = Object.fromEntries(resolved.map(({ name, env: value }) => [paramEnvName(name), value]));
  if (resolved.length > 0) {
    env.GITTY_PARAMS = JSON.stringify(Object.fromEntries(resolved.map(({ name, value }) => [name, value])));
  }
  return { texts, env, values: Object.fromEntries(resolved.map(({ name, value }) => [name, value])) };
}

/**
 * Fills the placeholders in a command line, quoting each value for the shell. A value
 * that is empty, such as a switch with a `flag` that is off, leaves nothing behind.
 */
export function fillCommand(line, texts, quote) {
  return line.replace(PLACEHOLDER, (_match, name) => (texts[name] ? quote(texts[name]) : ''));
}

/**
 * Fills the placeholders in a list of args, which no shell reads, so nothing is quoted.
 * An arg that is only a placeholder and comes out empty is dropped, rather than passed
 * as an empty argument.
 */
export function fillArgs(args, texts) {
  return args.flatMap((arg) => {
    const filled = arg.replace(PLACEHOLDER, (_match, name) => texts[name] ?? '');
    const onlyPlaceholder = placeholdersIn(arg).length > 0 && !arg.replace(PLACEHOLDER, '').trim();
    return onlyPlaceholder && !filled ? [] : [filled];
  });
}
