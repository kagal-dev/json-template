import { describe, expect, it } from 'vitest';

import {
  compile,
  listVariables,
  TemplateParseError,
} from '..';

describe('listVariables', () => {
  it('extracts names from object template', () => {
    const vars = listVariables('{"a":"${name}","b":${port}}');
    expect(vars.map((v) => v.name)).toEqual(['name', 'port']);
  });

  it('extracts defaults', () => {
    const vars = listVariables('{"h":"${host:-localhost}","p":${port:-3000}}');
    expect(vars[0].defaultValue).toEqual('localhost');
    expect(vars[1].defaultValue).toEqual('3000');
  });

  it('marks bare vs embedded', () => {
    const vars = listVariables('{"a":"${emb}","b":${bare}}');
    expect(vars[0].bare).toEqual(false);
    expect(vars[1].bare).toEqual(true);
  });

  it('preserves duplicates', () => {
    expect(listVariables('{"a":"${x}","b":"${x}"}').length).toEqual(2);
  });

  it('handles dotted names', () => {
    expect(listVariables('${server.host}')[0].name).toEqual('server.host');
  });
});

describe('brace depth in defaults', () => {
  it('default can be a JSON object', () => {
    const r = compile('{"cfg": ${cfg:-{"retries":3}}}').render({});
    expect(r).toEqual({ cfg: { retries: 3 } });
  });

  it('default can be a JSON array', () => {
    const r = compile('{"ids": ${ids:-[1,2,3]}}').render({});
    expect(r).toEqual({ ids: [1, 2, 3] });
  });

  it('default object with nested braces', () => {
    const r = compile('{"d": ${d:-{"a":{"b":1}}}}').render({});
    expect(r).toEqual({ d: { a: { b: 1 } } });
  });

  it('provided value overrides complex default', () => {
    const r = compile('{"cfg": ${cfg:-{"retries":3}}}').render({ cfg: { retries: 10 } });
    expect(r).toEqual({ cfg: { retries: 10 } });
  });
});

describe('shell-style defaults', () => {
  it('uses default when var is missing', () => {
    expect(compile('{"v": "${name:-world}"}').render({})).toEqual({ v: 'world' });
  });

  it('uses provided value over default', () => {
    expect(compile('{"v": "${name:-world}"}').render({ name: 'Alejandro' })).toEqual({ v: 'Alejandro' });
  });

  it('default can be empty string', () => {
    expect(compile('{"v": "${x:-}"}').render({})).toEqual({ v: '' });
  });

  it('default can contain colons (URLs)', () => {
    expect(
      compile('{"u": "${url:-http://localhost:8080}"}').render({}),
    ).toEqual({ u: 'http://localhost:8080' });
  });

  it('default can contain spaces', () => {
    expect(compile('{"m": "${msg:-hello world}"}').render({})).toEqual({ m: 'hello world' });
  });
});

describe('parse errors', () => {
  it('unterminated expression', () => {
    expect.assertions(2);
    try {
      compile('{"v": ${oops');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateParseError);
      expect((error as TemplateParseError).offset).toBe(6);
    }
  });

  it('empty expression', () => {
    expect.assertions(2);
    try {
      compile('{"v": ${}}');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateParseError);
      expect((error as TemplateParseError).offset).toBe(6);
    }
  });

  it('invalid variable name', () => {
    expect.assertions(2);
    try {
      compile('{"v": ${123bad}}');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateParseError);
      expect((error as TemplateParseError).offset).toBe(8);
    }
  });

  it('consecutive dots in variable name', () => {
    expect(() => compile('{"v": ${a..b}}')).toThrow(TemplateParseError);
  });

  it('trailing dot in variable name', () => {
    expect(() => compile('{"v": ${a.}}')).toThrow(TemplateParseError);
  });

  it('leading dot in variable name', () => {
    expect(() => compile('{"v": ${.a}}')).toThrow(TemplateParseError);
  });

  it('invalid JSON structure (after extraction)', () => {
    expect.assertions(2);
    try {
      compile('not json ${x}');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateParseError);
      expect((error as TemplateParseError).offset).toBe(0);
    }
  });
});

describe('variable in object key', () => {
  it('${var} in key position throws TemplateParseError', () => {
    expect(() => compile('{"${key}": "value"}')).toThrow(TemplateParseError);
  });

  it('static keys still work fine', () => {
    expect(compile('{"static-key": ${v:-1}}').render({})).toEqual({ 'static-key': 1 });
  });
});
