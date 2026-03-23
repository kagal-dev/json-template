# AGENTS.md

This file provides guidance to AI coding assistants
(Claude Code, GitHub Copilot, Cody, etc.) when working
with the json-template repository.

## Project Overview

`@kagal/json-template` is a TypeScript template engine
for JSON documents with shell-style `${var:-default}`
variable substitution. It compiles a JSON template
string once, then renders it to native JavaScript
objects by resolving variables against a context.

## Structure

```text
src/
├── types.ts             — TemplateVariable, CompileOptions
├── errors.ts            — TemplateParseError, UnresolvedVariableError
├── json.ts              — jsonNull, isNull, isNonStringPrimitive, isObject
├── scanner.ts           — scan(), ScannedExpr
├── tree.ts              — buildTree(), TNode, IPart, SENTINEL
├── template.ts          — Template class, compile(), listVariables()
├── index.ts             — barrel re-exports
└── __tests__/
    ├── index.test.ts    — VERSION test
    ├── scanner.test.ts  — scanner and parse error tests
    └── template.test.ts — Template rendering tests
```

## Common Commands

```bash
pnpm build        # Build with unbuild
pnpm test         # Run vitest
pnpm lint         # ESLint with auto-fix
pnpm typecheck    # tsc --noEmit
pnpm precommit    # build, lint, typecheck, test
```

## Code Style Guidelines

Enforced by .editorconfig and @poupe/eslint-config:

- **Indentation**: 2 spaces
- **Line Endings**: Unix (LF)
- **Charset**: UTF-8
- **Quotes**: Single quotes
- **Semicolons**: Always
- **Module System**: ES modules (`type: "module"`)
- **Line Length**: Max 78 characters preferred
- **Comments**: Use TSDoc format for documentation
- **Naming**: camelCase for variables/functions,
  PascalCase for types/interfaces/classes
- **Final Newline**: Always insert
- **Trailing Whitespace**: Always trim

### JSON null handling

The `unicorn/no-null` rule is enforced project-wide.
Use `jsonNull` and `isNull()` from `json.ts` where
JSON null semantics are needed. A single
`eslint-disable` exists at the `jsonNull` declaration.
Use `undefined` where semantically viable.

## Development Practices

### Pre-commit (MANDATORY)

Before committing any changes, ALWAYS run:

1. `pnpm precommit` (if any source changed)
2. Fix any issues found

### DO

- Write tests for all new functionality
- Check existing code patterns before creating new ones
- Follow strict TypeScript practices
- Use `git -C <subpath>` instead of `cd` for git on
  subpaths, but not `-C .` at repo root

### DON'T

- Create files unless necessary — prefer editing
  existing ones
- Add external dependencies without careful
  consideration
- Ignore TypeScript errors or ESLint warnings
- **NEVER use `git add .` or `git add -A`**
- **NEVER commit without explicitly listing files**
- **NEVER rely on the staging area — always list files
  explicitly**
- **NEVER use `cd`** — it loses working directory
  context for all subsequent tool calls

## Git Workflow

### Commits

- Always use `-s` flag for sign-off
- Write clear messages describing actual changes
- No AI advertising in commit messages
- Focus commit messages on the final result, not the
  iterations

### Direct Commits (MANDATORY)

ALWAYS list files explicitly in the commit command.
Use `git add` only for new/untracked files, then pass
all files (new and modified) to `git commit`.

```bash
# Stage new files, then commit with explicit file list
git add src/new-file.ts
git commit -sF .tmp/commit-<slug>.txt -- src/new-file.ts src/changed.ts
```

Temporary message files use a shared prefix with a
meaningful slug:

- Commit messages: `.tmp/commit-<slug>.txt`
- PR descriptions: `.tmp/pr-<slug>.md`

### Commit Message Guidelines

- First line: type(scope): brief description (50 chars)
- Blank line
- Body: what and why, not how (wrap at 72 chars)
- Use bullet points for multiple changes
- Reference issues/PRs when relevant

## Build and Test

- **Build**: unbuild (ESM + DTS, sourcemaps)
- **Test**: Vitest with v8 coverage (90/90/85
  thresholds)
- **Lint**: @poupe/eslint-config via `defineConfig()`
- **Prepare**: `cross-test -s dist/index.mjs || unbuild --stub`

## Publishing

Published via GitHub Actions using npm's OIDC trusted
publishing with `--provenance`. No tokens stored as
secrets.

## Architecture

### Pipeline overview

Compilation is three phases. Rendering is a single
tree walk.

```text
template string
     │
     ▼
  scan()           → ScannedExpr[]
                     (phase 1: find expressions,
                      track string context,
                      pre-split dotted paths)
     │
     ▼
  sentinel replace → modified JSON str
  + JSON.parse()   → unknown
                     (phase 2: substitute expressions
                      with markers, parse once)
     │
     ▼
  buildTree()      → TNode
                     (phase 3: convert parsed JSON
                      into template AST)

                    ─── compile time ends here ───

  Template.render()  → unknown
                       (per-call: walk tree, resolve
                        vars, assemble object)
```

### Key invariants

These are the things most likely to break during
modification:

1. **Scanner string tracking determines everything
   downstream.** The `inString` flag when `${` is
   encountered determines whether the sentinel
   gets `B` (bare) or `E` (embedded) prefix. The
   scanner's backslash handling (`pos += 2` to skip
   `\"`) must exactly mirror JSON's escape rules.

2. **Expression index = sentinel index.** The
   `for (const [i, expr] of exprs.entries())` loop in
   `compile()` writes sentinels using `i` as the
   index. If expressions were ever reordered or
   filtered between `scan()` and sentinel replacement,
   every `TNode.idx` in the tree would point to the
   wrong `ScannedExpr`.

3. **`buildTree()` runs once at compile time;
   `Template.renderNode()` runs per-call.** Structural
   classification and default parsing belong at compile
   time. Variable resolution belongs in
   `Template.renderNode`. Moving compile-time work
   into render or vice versa is a correctness risk.

4. **Object keys are checked for sentinels in
   `buildTree`, not the scanner.** The scanner doesn't
   know about JSON structure. The key-rejection check
   happens after `JSON.parse`. If you add key support,
   you'd need a new `TNode` kind for interpolated keys
   and corresponding `Template.renderNode` logic.

5. **`SENTINEL_RE` is a module-level regex in
   `tree.ts` with the `g` flag.** Its `lastIndex` is
   reset before each use in `buildTree`. If you add
   another call site, you must also reset `lastIndex`.

6. **`compile()` rejects the sentinel character
   (U+E000) in input.** The PUA character is used as
   an in-band marker between `scan()` and
   `JSON.parse`. If it appeared in user input —
   either as a literal character or as a JSON-encoded
   `\uE000` escape — it would collide with the
   markers and cause miscompilation. Both forms are
   checked before `scan()`.

7. **Embedded non-primitives use `JSON.stringify`, not
   `String()`.** `String({})` produces
   `[object Object]`. The current code checks
   `isObject(value)` before choosing the serialisation
   path. If you change the coercion logic, test with
   objects and arrays in embedded positions.

## Known Limitations

### Worth fixing if the use case arises

**No variable interpolation in object keys.**
Expressions in JSON keys are detected and rejected at
compile time. Supporting this would require a new
`TNode` variant for interpolated keys and changes to
`Template.renderNode`'s object branch.

**No escape mechanism for literal `${`.** There's no
way to include `${` verbatim. Since `${` has no meaning
in standard JSON, this rarely matters. Workaround:
use a variable with a default, e.g.
`"${dollar:-$}{rest"`.

### By design

**Bare defaults that fail `JSON.parse` silently become
strings.** `${name:-hello}` defaults to `"hello"`
because `JSON.parse("hello")` throws and the engine
falls back to the raw text. This allows simple unquoted
string defaults without forcing `${name:-"hello"}`.
The trade-off: a typo like `${cfg:-{broken}` produces
a string instead of an error.

**`resolve()` only follows own properties.** Inherited
keys like `toString` or `__proto__` are treated as
missing, not resolved from the prototype chain. This
prevents leaking prototype methods/objects through
templates. It also means `resolve()` cannot distinguish
a missing key from explicit `undefined` — `{ v:
undefined }` is treated the same as `{}`. Both choices
match POSIX shell `:-` semantics and are consistent
with JSON (where `undefined` is not a valid value).

### Low priority

**No streaming or partial rendering.** The engine
builds the complete object tree synchronously. Not a
problem for config-sized templates.

## Claude Code Specific Instructions

- **CRITICAL: Always enumerate files explicitly in git
  commit commands**
- **NEVER use bare `git commit` without file
  arguments**
- **Check `git status --porcelain` before every
  commit**
- NEVER apologise or explain why you did something
  wrong
- Fix issues immediately without commentary
- Stay focused on the task at hand
