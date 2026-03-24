/**
 * Standalone compatibility test — no test framework required.
 * Exercises Node-version-sensitive code paths in the compiled output.
 */

/* global console, process */
/* eslint unicorn/no-process-exit: "off" */

import { compile, isNull, jsonNull, listVariables } from '../../dist/index.mjs';

let failures = 0;

function assert(label, actual, expected) {
  const a = JSON.stringify(actual);
  const exp = JSON.stringify(expected);
  if (a !== exp) {
    console.error(`FAIL: ${label}\n  expected: ${exp}\n  actual:   ${a}`);
    failures++;
  }
}

// bare variable with default (type-preserving)
assert(
  'bare number default',
  compile('{"v": ${x:-1}}').render({}),
  { v: 1 },
);

// embedded variable (string interpolation)
assert(
  'embedded interpolation',
  compile('{"a": "${h}:${p}"}').render({ h: 'localhost', p: 3000 }),
  { a: 'localhost:3000' },
);

// dotted key path
assert(
  'dotted path',
  compile('{"h": "${s.host}"}').render({ s: { host: '10.0.0.1' } }),
  { h: '10.0.0.1' },
);

// object default — exercises structuredClone
const tpl = compile('{"cfg": ${cfg:-{"retries":3}}}');
const r1 = tpl.render({});
assert('object default', r1, { cfg: { retries: 3 } });
r1.cfg.retries = 999;
const r2 = tpl.render({});
assert('fallback isolation (structuredClone)', r2, { cfg: { retries: 3 } });

// array default — exercises structuredClone
const tpl2 = compile('{"ids": ${ids:-[1,2,3]}}');
const a1 = tpl2.render({});
assert('array default', a1, { ids: [1, 2, 3] });
a1.ids.push(4);
const a2 = tpl2.render({});
assert('array fallback isolation', a2, { ids: [1, 2, 3] });

// unresolved bare → null
const r3 = compile('{"v": ${missing}}').render({});
assert('unresolved bare is null', r3, { v: jsonNull });
assert('isNull recognises null', isNull(r3.v), true);

// embedded non-primitive coercion (JSON.stringify, not String)
assert(
  'embedded object coercion',
  compile('{"m": "cfg=${c}"}').render({ c: { a: 1 } }),
  { m: 'cfg={"a":1}' },
);

// listVariables (static analysis)
const vars = listVariables('{"a": "${name}", "b": ${port:-3000}}');
assert('listVariables count', vars.length, 2);
assert('listVariables[0].name', vars[0].name, 'name');
assert('listVariables[0].bare', vars[0].bare, false);
assert('listVariables[1].name', vars[1].name, 'port');
assert('listVariables[1].bare', vars[1].bare, true);

// strict mode throws
try {
  compile('{"v": ${required}}', { strict: true }).render({});
  console.error('FAIL: strict mode did not throw');
  failures++;
} catch (error) {
  assert('strict error name', error.name, 'UnresolvedVariableError');
}

// parse error throws
try {
  compile('{"v": ${}}');
  console.error('FAIL: empty expression did not throw');
  failures++;
} catch (error) {
  assert('parse error name', error.name, 'TemplateParseError');
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
} else {
  console.log(`ok ${process.version} — all checks passed`);
}
