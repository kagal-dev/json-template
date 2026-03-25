# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.3] - 2026-03-25

### Added

- **ci**: Renovate configuration with config validator workflow

### Changed

- **deps**: Bump `@poupe/eslint-config` ~0.8.3 → ^0.8.4 — remove
  local `arrow-parens` override now enforced upstream
- **ci**: Use `pnpm test:compat` script in compat workflow

## [0.1.2] - 2026-03-24

### Added

- **ci**: Node.js compatibility matrix (18, 20, 22) with standalone
  compat test validating the `engines.node` claim
- **pkg**: `homepage`, `bugs`, and `keywords` fields for npm discovery

### Changed

- **pkg**: Remove redundant top-level `main`, `module`, and `types` —
  `exports` map is the single source of truth

## [0.1.1] - 2026-03-24

### Added

- **ci**: Publish workflow for npm with provenance via GitHub Actions
  OIDC trusted publishing on `v*` tag pushes

### Changed

- **scanner**: Expose pre-split dotted path segments on `ScannedExpr`
  so `compile()` reuses them instead of splitting again
- **ci**: Skip `pkg-pr-new` preview on tag pushes — the real npm
  publish handles those

## [0.1.0] - 2026-03-24

Initial release.

### Added

- **core**: `compile()` parses a JSON template string into a reusable
  `Template` that renders against variable contexts via `render()` and
  `toJSON()` — compile once, render many
- **core**: Type-preserving bare variables — `${port:-3000}` resolves
  to the number `3000`, not the string `"3000"`
- **core**: String interpolation — embedded variables inside `"..."`
  concatenate as strings; objects/arrays serialise via `JSON.stringify`,
  not `String()`
- **core**: Shell-style defaults with POSIX `:-` separator — bare
  defaults are JSON-parsed to preserve type, embedded defaults stay
  as strings
- **core**: Nested JSON defaults — brace-depth-aware parsing allows
  defaults like `${cfg:-{"retries":3}}`
- **core**: Dotted key paths — `${server.host}` traverses nested
  context objects via own-property lookup
- **core**: Strict mode — `compile(tpl, { strict: true })` throws
  `UnresolvedVariableError` for variables with no value and no default
- **core**: `listVariables()` for static analysis — extracts variable
  metadata without requiring valid JSON
- **core**: Immutable results — `variables` and `names` on `Template`
  are frozen; `listVariables()` returns frozen arrays with frozen
  elements
- **core**: Fallback isolation — object/array defaults are deep-copied
  per render so mutations cannot leak between calls
- **errors**: `TemplateParseError` for invalid templates,
  `UnresolvedVariableError` for strict-mode failures
- **json**: `jsonNull` constant and `isNull()` type guard for working
  with JSON null values
