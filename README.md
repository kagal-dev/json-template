# @kagal/json-template

A TypeScript template engine for JSON documents with
shell-style `${var:-default}` variable substitution.
Compiles once, renders to native JavaScript objects —
types are preserved, not stringified.

## Why

JavaScript template literals handle string interpolation
well but don't understand JSON structure — a number like
`${port}` can silently become the string `"8080"`,
special characters in strings break JSON syntax, and
there's no way to list which variables a template
expects.

This engine treats JSON structure as a first-class
concern. It parses the template at compile time,
understands whether each variable sits in a bare value
position or inside a string, and assembles a native JS
object at render time — no string concatenation of JSON,
no `JSON.parse` at render time.

## Installation

```bash
npm install @kagal/json-template
```

## Usage

```ts
import { compile } from '@kagal/json-template';

const tpl = compile(
  '{"host": "${host:-localhost}", "port": ${port:-3000}}'
);

tpl.render({});
// → { host: "localhost", port: 3000 }

tpl.render({ host: "10.0.0.1", port: 8080 });
// → { host: "10.0.0.1", port: 8080 }

tpl.toJSON({}, 2);
// → pretty-printed JSON string
```

### Bare vs embedded variables

**Bare** variables (outside JSON strings) preserve
their native type:

```ts
compile('{"port": ${port}}').render({ port: 8080 })
// → { port: 8080 }   ← number, not string
```

**Embedded** variables (inside `"..."`) concatenate as
strings:

```ts
compile('{"addr": "${host}:${port}"}')
  .render({ host: "localhost", port: 3000 })
// → { addr: "localhost:3000" }
```

The position is determined at compile time by tracking
JSON string context, not with a runtime heuristic.

### Shell-style defaults

Variables can specify a fallback value using the `:-`
separator, matching POSIX shell parameter expansion:

```ts
compile(
  '{"host": "${host:-localhost}", "port": ${port:-3000}}'
).render({})
// → { host: "localhost", port: 3000 }
```

For bare variables, defaults are JSON-parsed to preserve
type: `${port:-3000}` defaults to the number `3000`,
`${flag:-true}` to the boolean `true`. If the default
isn't valid JSON, it falls back to a plain string.

For embedded variables, defaults are always treated as
strings (they're inside a `"..."` already).

### Defaults with nested JSON

Default values can contain nested JSON with balanced
braces:

```ts
compile('{"cfg": ${cfg:-{"retries":3}}}').render({})
// → { cfg: { retries: 3 } }
```

### Dotted key paths

Variable names can use dotted notation to traverse
nested context objects. Resolution only follows own
properties, so inherited keys like `toString`,
`constructor`, and `__proto__` are treated as missing:

```ts
compile('{"h": "${server.host}"}')
  .render({ server: { host: "10.0.0.1" } })
// → { h: "10.0.0.1" }
```

### Static analysis

Extract variable metadata without compiling (does not
require valid JSON):

```ts
import { listVariables } from '@kagal/json-template';

listVariables('{"a": "${name}", "b": ${port:-3000}}')
// → [
//   { name: "name", bare: false, ... },
//   { name: "port", bare: true, defaultValue: "3000", ... }
// ]
```

### Strict mode

```ts
compile('{"v": ${required}}', { strict: true }).render({})
// throws UnresolvedVariableError
```

## API

### `compile(template, options?)`

Parses and compiles a JSON template string. Returns a
`Template` instance.

```ts
const tpl = compile(
  '{"port": ${port:-3000}, "host": "${host:-localhost}"}'
);

tpl.variables  // readonly TemplateVariable[]
tpl.names      // ReadonlySet<string>

tpl.render({})              // → { port: 3000, ... }
tpl.render({ port: 8080 })  // → { port: 8080, ... }
tpl.toJSON({})              // → JSON string
tpl.toJSON({}, 2)           // → pretty-printed
```

**Options:**

| Option   | Default | Description                     |
|----------|---------|---------------------------------|
| `strict` | `false` | Throw `UnresolvedVariableError` when a variable has no value and no default. When `false`, bare unresolved variables become `null` and embedded ones become `""`. |

### `listVariables(template)`

Static analysis only — extracts variable metadata
without requiring valid JSON. Useful for tooling,
documentation generation, or validation.

```ts
listVariables('{"a": "${name}", "b": ${port:-3000}}')
// → [
//   { name: "name", bare: false, ... },
//   { name: "port", bare: true, ... }
// ]
```

### `TemplateVariable`

Each variable occurrence exposes:

| Field          | Type      | Description            |
|----------------|-----------|------------------------|
| `raw`          | `string`  | Full expression text   |
| `name`         | `string`  | Variable name          |
| `defaultValue` | `string?` | Raw default after `:-` |
| `bare`         | `boolean` | Bare vs embedded       |
| `offset`       | `number`  | `$` offset in source   |

### Variable name rules

Names are dot-separated segments where each segment
matches `/^[a-zA-Z_][a-zA-Z0-9_-]*$/` — letters,
digits, underscores, and hyphens, starting with a
letter or underscore. Dots delimit path segments for
nested context traversal.

### Errors

| Error                    | When                       |
|--------------------------|----------------------------|
| `TemplateParseError`     | Unterminated `${`, empty expression, invalid name, variable in key, reserved sentinel character, or invalid JSON after extraction |
| `UnresolvedVariableError`| `strict: true` and no value or default |

### `jsonNull`

The `null` value used by bare unresolved variables
(when `strict` is `false`). Use it when you need to
explicitly pass or check for JSON null:

```ts
import { compile, jsonNull } from '@kagal/json-template';

compile('{"v": ${missing}}').render({})
// → { v: null }  (jsonNull)
```

### `isNull(value)`

Type guard — returns `true` when `value` is `null`.

### Unresolved variable behaviour

| Position           | `strict: true`  | `strict: false` |
|--------------------|-----------------|-----------------|
| Bare (no default)  | throws          | `null`          |
| Embedded (no def.) | throws          | `""`            |
| Any (with default) | uses default    | uses default    |

### Embedded non-primitive coercion

When an object or array is resolved in an embedded
(string) position, it is serialised via
`JSON.stringify` rather than `String()`:

```ts
compile('{"msg": "config=${cfg}"}')
  .render({ cfg: { retries: 3 } })
// → { msg: 'config={"retries":3}' }
//   not 'config=[object Object]'
```

Primitives (`number`, `boolean`, `null`) use
`String()` as expected.

## Provenance

Published with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements)
via GitHub Actions OIDC — no long-lived tokens involved.

## Licence

[MIT](LICENCE.txt)
