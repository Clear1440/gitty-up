import { describe, expect, it } from 'vitest';
import { checkPlaceholders, fillArgs, fillCommand, paramEnvName, parseParams, resolveParams } from './scriptParams.js';

const quote = (text) => `'${text}'`;

describe('parseParams', () => {
  it('reads a list, a map and bare names, and works out the type', () => {
    expect(parseParams(['name']).map(({ name, type, label }) => ({ name, type, label }))).toEqual([
      { name: 'name', type: 'string', label: 'name' },
    ]);
    const params = parseParams({
      env: { options: ['a', 'b'], default: 'b', label: 'Environment' },
      dry: { type: 'boolean', flag: '--dry-run', required: true },
    });
    expect(params).toEqual([
      expect.objectContaining({ name: 'env', type: 'choice', options: ['a', 'b'], label: 'Environment' }),
      expect.objectContaining({ name: 'dry', type: 'boolean', flag: '--dry-run', required: false }),
    ]);
  });

  it('says what is wrong with a parameter', () => {
    expect(() => parseParams([{ name: '1x' }])).toThrow(/must start with a letter/);
    expect(() => parseParams([{ name: 'x', type: 'date' }])).toThrow(/one of string, number/);
    expect(() => parseParams([{ name: 'x', type: 'choice' }])).toThrow(/needs "options"/);
    expect(() => parseParams([{ name: 'x', options: ['a'], default: 'z' }])).toThrow(/default/);
    expect(() => parseParams([{ name: 'x', flag: '--x' }])).toThrow(/only applies to a boolean/);
    expect(() => parseParams([{ name: 'x', type: 'number', default: '3' }])).toThrow(/a number/);
    expect(() => parseParams(['x', 'x'])).toThrow(/two parameters/);
    expect(() => parseParams('x')).toThrow(/list or an object/);
  });
});

describe('checkPlaceholders', () => {
  it('turns down a placeholder with no parameter', () => {
    const params = parseParams(['env']);
    expect(() => checkPlaceholders(['deploy {{env}}', '{{ env }}'], params)).not.toThrow();
    expect(() => checkPlaceholders(['deploy {{envv}}'], params)).toThrow(/no parameter named "envv"/);
  });
});

describe('resolveParams', () => {
  const params = parseParams([
    { name: 'msg', required: true },
    { name: 'count', type: 'number', default: 2 },
    { name: 'verbose', type: 'boolean', flag: '-v' },
    { name: 'fast', type: 'boolean', default: true },
    { name: 'env', options: ['dev', 'prod'] },
  ]);

  it('fills in defaults and gives text for placeholders and the environment', () => {
    const { texts, env, values } = resolveParams(params, { msg: 'hi', count: '5', other: 1 });
    expect(texts).toEqual({ msg: 'hi', count: '5', verbose: '', fast: 'true', env: '' });
    expect(values).toEqual({ msg: 'hi', count: 5, verbose: false, fast: true, env: null });
    expect(env).toMatchObject({ GITTY_PARAM_MSG: 'hi', GITTY_PARAM_VERBOSE: 'false', GITTY_PARAM_ENV: '' });
    expect(JSON.parse(env.GITTY_PARAMS)).toEqual(values);
    expect(resolveParams(params, { msg: 'x', verbose: true }).texts.verbose).toBe('-v');
  });

  it('turns down values that do not fit', () => {
    expect(() => resolveParams(params, {})).toThrow(/"msg" is required/);
    expect(() => resolveParams(params, { msg: '  ' })).toThrow(/required/);
    expect(() => resolveParams(params, { msg: 'x', count: 'many' })).toThrow(/a number/);
    expect(() => resolveParams(params, { msg: 'x', verbose: 'yes' })).toThrow(/true or false/);
    expect(() => resolveParams(params, { msg: 'x', env: 'qa' })).toThrow(/one of dev, prod/);
    expect(() => resolveParams(params, [])).toThrow(/must be an object/);
  });

  it('needs nothing for a script without parameters', () => {
    expect(resolveParams([], undefined)).toEqual({ texts: {}, env: {}, values: {} });
  });
});

describe('filling placeholders', () => {
  it('quotes values in a command and leaves nothing for an empty one', () => {
    expect(fillCommand('run {{a}} {{b}} --x', { a: 'one two', b: '' }, quote)).toBe("run 'one two'  --x");
  });

  it('fills args as they are and drops an arg that comes out empty', () => {
    expect(fillArgs(['--env={{a}}', '{{b}}', '{{ a }}', 'plain'], { a: 'x y', b: '' })).toEqual([
      '--env=x y',
      'x y',
      'plain',
    ]);
  });

  it('names the environment variable in capitals', () => {
    expect(paramEnvName('target-env')).toBe('GITTY_PARAM_TARGET_ENV');
  });
});
