import { describe, expect, it } from 'vitest';

import type { TemplateVariable } from '..';
import {
  compile,
  jsonNull,
  listVariables,
  TemplateParseError,
  UnresolvedVariableError,
} from '..';

describe('position awareness', () => {
  it('bare number stays a number', () => {
    const r = compile('{"port": ${port}}').render({ port: 8080 });
    expect(r).toEqual({ port: 8080 });
  });

  it('bare string in bare position gets auto-typed', () => {
    const r = compile('{"val": ${val}}').render({ val: 'hello' });
    expect(r).toEqual({ val: 'hello' });
  });

  it('embedded number is coerced to string', () => {
    const r = compile('{"addr": "${host}:${port}"}').render({ host: 'localhost', port: 3000 });
    expect(r).toEqual({ addr: 'localhost:3000' });
  });

  it('bare boolean preserved', () => {
    expect(compile('{"flag": ${flag}}').render({ flag: false })).toEqual({ flag: false });
  });

  it('bare null preserved', () => {
    expect(compile('{"n": ${n}}').render({ n: jsonNull })).toEqual({ n: jsonNull });
  });

  it('bare object preserved', () => {
    const cfg = { retries: 3, timeout: 1000 };
    expect(compile('{"cfg": ${cfg}}').render({ cfg })).toEqual({ cfg });
  });

  it('bare array preserved', () => {
    expect(compile('{"items": ${items}}').render({ items: [1, 2, 3] })).toEqual({ items: [1, 2, 3] });
  });

  it('mixed bare and embedded in same template', () => {
    const tpl = compile('{"label": "port=${port}", "port": ${port}}');
    const r = tpl.render({ port: 8080 });
    expect(r).toEqual({ label: 'port=8080', port: 8080 });
  });
});

describe('typed defaults', () => {
  it('bare default number stays a number', () => {
    const r = compile('{"port": ${port:-3000}}').render({});
    expect(r).toEqual({ port: 3000 });
  });

  it('bare default boolean', () => {
    expect(compile('{"flag": ${flag:-true}}').render({})).toEqual({ flag: true });
  });

  it('bare default null', () => {
    expect(compile('{"val": ${val:-null}}').render({})).toEqual({ val: jsonNull });
  });

  it('bare default string (quoted in default)', () => {
    const r = compile('{"name": ${name:-"hello"}}').render({});
    expect(r).toEqual({ name: 'hello' });
  });

  it('bare default that isn\'t valid JSON falls back to string', () => {
    const r = compile('{"x": ${x:-hello}}').render({});
    expect(r).toEqual({ x: 'hello' });
  });

  it('embedded default is always a string', () => {
    const r = compile('{"msg": "port=${port:-3000}"}').render({});
    expect(r).toEqual({ msg: 'port=3000' });
  });
});

describe('unresolved fallback', () => {
  it('unresolved bare → null (not empty string)', () => {
    const r = compile('{"val": ${missing}}').render({});
    expect(r).toEqual({ val: jsonNull });
  });

  it('unresolved embedded → empty string', () => {
    const r = compile('{"msg": "hello ${missing}"}').render({});
    expect(r).toEqual({ msg: 'hello ' });
  });
});

describe('immutable result', () => {
  it('variables array is frozen', () => {
    const tpl = compile('{"x": ${x}}');
    expect(() => {
      (tpl.variables as unknown as TemplateVariable[]).push(
        {} as TemplateVariable,
      );
    }).toThrow();
  });

  it('variable elements are frozen', () => {
    const tpl = compile('{"x": ${x}}');
    expect(() => {
      (tpl.variables[0] as { name: string }).name = 'hacked';
    }).toThrow();
  });
});

describe('dual output: render() vs toJSON()', () => {
  it('render() returns a native JS object', () => {
    const tpl = compile('{"host": "${host:-localhost}", "port": ${port:-3000}}');
    const object = tpl.render({}) as Record<string, unknown>;
    expect(typeof object).toEqual('object');
    expect(object.host).toEqual('localhost');
    expect(object.port).toEqual(3000);
    expect(typeof object.port).toEqual('number');
  });

  it('toJSON() returns a JSON string', () => {
    const tpl = compile('{"host": "${host:-localhost}", "port": ${port:-3000}}');
    const json = tpl.toJSON({});
    expect(typeof json).toEqual('string');
    expect(JSON.parse(json)).toEqual({ host: 'localhost', port: 3000 });
  });

  it('toJSON() supports indent', () => {
    const json = compile('{"a": ${a:-1}}').toJSON({}, 2);
    expect(json).toContain('\n');
    expect(JSON.parse(json)).toEqual({ a: 1 });
  });

  it('render() handles top-level array', () => {
    expect(compile('[${a:-1}, ${b:-2}]').render({})).toEqual([1, 2]);
  });

  it('render() handles single bare variable (any type)', () => {
    const tpl = compile('${val}');
    expect(tpl.render({ val: 42 })).toEqual(42);
    expect(tpl.render({ val: 'hi' })).toEqual('hi');
    expect(tpl.render({ val: [1, 2] })).toEqual([1, 2]);
    expect(tpl.render({ val: jsonNull })).toEqual(jsonNull);
    expect(tpl.render({ val: true })).toEqual(true);
  });
});

describe('dotted keys', () => {
  it('resolves nested keys', () => {
    const tpl = compile('{"addr": "${server.host}:${server.port}"}');
    expect(tpl.render({ server: { host: '10.0.0.1', port: 443 } })).toEqual({ addr: '10.0.0.1:443' });
  });

  it('falls back to default for missing nested key', () => {
    expect(compile('{"h": "${db.host:-127.0.0.1}"}').render({})).toEqual({ h: '127.0.0.1' });
  });

  it('deep dotted path', () => {
    const r = compile('{"v": ${a.b.c}}').render({ a: { b: { c: 99 } } });
    expect(r).toEqual({ v: 99 });
  });

  it('hyphenated variable name', () => {
    const r = compile('{"v": ${my-var}}').render({ 'my-var': 42 });
    expect(r).toEqual({ v: 42 });
  });

  it('numeric segment is rejected at compile time', () => {
    expect(() => compile('{"v": ${arr.0}}')).toThrow(TemplateParseError);
  });
});

describe('names set', () => {
  it('names is deduplicated', () => {
    const tpl = compile('{"a": "${x}", "b": "${y}", "c": "${x}"}');
    expect([...tpl.names].toSorted()).toEqual(['x', 'y']);
  });
});

describe('listVariables', () => {
  it('returns frozen array with frozen elements', () => {
    const vars = listVariables('{"a": "${x}", "b": ${y:-1}}');
    expect(vars).toHaveLength(2);
    expect(() => {
      (vars as unknown as TemplateVariable[]).push({} as TemplateVariable);
    }).toThrow();
    expect(() => {
      (vars[0] as { name: string }).name = 'hacked';
    }).toThrow();
  });
});

describe('strict mode', () => {
  it('throws on unresolved bare variable', () => {
    expect(() => {
      compile('{"v": ${required}}', { strict: true }).render({});
    }).toThrow(UnresolvedVariableError);
  });

  it('throws on unresolved embedded variable', () => {
    expect(() => {
      compile('{"v": "hello ${who}"}', { strict: true }).render({});
    }).toThrow(UnresolvedVariableError);
  });

  it('strict allows variables with defaults', () => {
    expect(compile('{"v": "${x:-ok}"}', { strict: true }).render({})).toEqual({ v: 'ok' });
  });
});

describe('prototype key safety', () => {
  it('toString against {} in strict mode throws', () => {
    expect(() => {
      compile('{"v": ${toString}}', { strict: true }).render({});
    }).toThrow(UnresolvedVariableError);
  });

  it('__proto__ against {} in strict mode throws', () => {
    expect(() => {
      compile('{"v": ${__proto__}}', { strict: true }).render({});
    }).toThrow(UnresolvedVariableError);
  });

  it('constructor against {} in strict mode throws', () => {
    expect(() => {
      compile('{"v": ${constructor}}', { strict: true }).render({});
    }).toThrow(UnresolvedVariableError);
  });

  it('toString in non-strict mode returns null', () => {
    const r = compile('{"v": ${toString}}').render({});
    expect(r).toEqual({ v: jsonNull });
  });

  it('literal __proto__ key becomes own property, not prototype', () => {
    const r = compile('{"__proto__": {"polluted": true}}').render({}) as Record<string, unknown>;
    expect(r).toHaveProperty('__proto__');
    expect(Object.prototype.hasOwnProperty.call(r, '__proto__')).toBe(true);
    expect((r as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('sentinel collision', () => {
  it('template containing sentinel character throws', () => {
    expect(() => compile('{"v": "\uE000"}')).toThrow(TemplateParseError);
  });

  it('sentinel in default value throws', () => {
    expect(() => compile('{"v": "${x:-\uE000}"}')).toThrow(
      /reserved sentinel character/i,
    );
  });

  it(String.raw`JSON-escaped \uE000 forming fake bare marker`, () => {
    expect(() => compile(String.raw`{"v": "\uE000B0\uE000"}`)).toThrow(
      /json-escaped sentinel sequence/i,
    );
  });

  it(String.raw`JSON-escaped \ue000 lowercase variant`, () => {
    expect(() => compile(String.raw`{"v": "\ue000"}`)).toThrow(TemplateParseError);
  });

  it(String.raw`JSON-escaped \uE000 in object key`, () => {
    expect(() => compile(String.raw`{"\uE000k": "v"}`)).toThrow(TemplateParseError);
  });

  it(String.raw`JSON-escaped \uE000 in default value`, () => {
    expect(() => compile('{"v": "${x:-\\uE000}"}')).toThrow(
      /json-escaped sentinel sequence/i,
    );
  });

  it(String.raw`JSON-escaped \uE000 alongside real variables`, () => {
    expect(() => compile('{"a": "${x}", "b": "\\uE000"}')).toThrow(
      TemplateParseError,
    );
  });

  it(String.raw`JSON-escaped \uE000 forming fake embedded marker`, () => {
    expect(() => compile(String.raw`{"v": "pre\uE000E1\uE000post"}`)).toThrow(
      TemplateParseError,
    );
  });

  it(String.raw`double-escaped \\uE000 is allowed (literal text, not sentinel)`, () => {
    const r = compile(String.raw`{"v": "\\uE000"}`).render({});
    expect(r).toEqual({ v: String.raw`\uE000` });
  });
});

describe('fallback isolation', () => {
  it('mutating a rendered object default does not affect later renders', () => {
    const tpl = compile('{"cfg": ${cfg:-{"retries":3}}}');
    const r1 = tpl.render({}) as Record<string, Record<string, unknown>>;
    r1.cfg.retries = 999;
    const r2 = tpl.render({}) as Record<string, Record<string, unknown>>;
    expect(r2.cfg.retries).toEqual(3);
  });

  it('mutating a rendered array default does not affect later renders', () => {
    const tpl = compile('{"ids": ${ids:-[1,2,3]}}');
    const r1 = tpl.render({}) as Record<string, number[]>;
    r1.ids.push(4);
    const r2 = tpl.render({}) as Record<string, number[]>;
    expect(r2.ids).toEqual([1, 2, 3]);
  });
});

describe('edge cases', () => {
  it('strings with special chars pass through correctly', () => {
    const r = compile('{"msg": "${msg}"}').render({ msg: 'say "hello"\nnewline\ttab' });
    expect((r as Record<string, unknown>).msg).toEqual('say "hello"\nnewline\ttab');
  });

  it('multiple embedded vars in one string', () => {
    const r = compile('{"x": "${a}-${b}-${c}"}').render({ a: '1', b: '2', c: '3' });
    expect(r).toEqual({ x: '1-2-3' });
  });

  it('template with no variables is a passthrough', () => {
    const tpl = compile('{"static": true, "count": 42}');
    expect(tpl.names.size).toEqual(0);
    expect(tpl.render({})).toEqual({ static: true, count: 42 });
  });

  it('deeply nested template structure', () => {
    const tpl = compile('{"a": {"b": {"c": ${val:-99}}}}');
    expect(tpl.render({})).toEqual({ a: { b: { c: 99 } } });
    expect(tpl.render({ val: 'X' })).toEqual({ a: { b: { c: 'X' } } });
  });

  it('empty object template', () => {
    expect(compile('{}').render({})).toEqual({});
  });

  it('empty array template', () => {
    expect(compile('[]').render({})).toEqual([]);
  });

  it('default with string containing escaped quotes', () => {
    const r = compile('{"v": ${v:-"say \\"hi\\""}}').render({});
    expect(r).toEqual({ v: 'say "hi"' });
  });
});

describe('embedded non-primitive coercion', () => {
  it('embedded object uses JSON.stringify, not String()', () => {
    const r = compile('{"msg": "cfg=${cfg}"}').render({ cfg: { a: 1 } }) as Record<string, unknown>;
    expect(r.msg).toEqual('cfg={"a":1}');
  });

  it('embedded array uses JSON.stringify, not Array.toString()', () => {
    const r = compile('{"msg": "ids=${ids}"}').render({ ids: [1, 2, 3] }) as Record<string, unknown>;
    expect(r.msg).toEqual('ids=[1,2,3]');
  });

  it('embedded primitive still uses String()', () => {
    const r = compile('{"msg": "n=${n}, b=${b}"}').render({ n: 42, b: true }) as Record<string, unknown>;
    expect(r.msg).toEqual('n=42, b=true');
  });

  it('embedded null uses String()', () => {
    const r = compile('{"msg": "v=${v}"}').render({ v: jsonNull }) as Record<string, unknown>;
    expect(r.msg).toEqual('v=null');
  });
});
