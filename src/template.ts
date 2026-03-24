import type { ScannedExpr } from './scanner';
import type { TNode } from './tree';
import type { CompileOptions, TemplateVariable } from './types';

import { TemplateParseError, UnresolvedVariableError } from './errors';
import { isObject, jsonNull } from './json';
import { scan } from './scanner';
import { buildTree, SENTINEL } from './tree';

/**
 * Matches a JSON unicode escape that will decode to U+E000.
 * Even-length backslash runs like `\\uE000` stay literal and must not be rejected.
 */
const SENTINEL_ESC_RE = /(?<=(?:^|[^\\])(?:\\\\)*)\\u[eE]000/;

/** Convert a {@link ScannedExpr} to public {@link TemplateVariable} metadata. */
function toVariable(template: string, expr: ScannedExpr): TemplateVariable {
  return {
    raw: template.slice(expr.offset + 2, expr.offset + expr.length - 1),
    name: expr.name,
    defaultValue: expr.defaultValue,
    bare: !expr.inString,
    offset: expr.offset,
  };
}

/** Create a frozen Set from an iterable. */
function newReadOnlySet<T>(values: Iterable<T>): ReadonlySet<T> {
  return Object.freeze(new Set(values));
}

/** Create a frozen array with each element frozen. */
function newReadOnlyArray<T extends object>(items: readonly T[]): readonly Readonly<T>[] {
  return Object.freeze(items.map((item) => Object.freeze(item)));
}

/** Check that `v` is a non-null object with `k` as an own property. */
function hasOwn(v: unknown, k: PropertyKey): v is Record<PropertyKey, unknown> {
  return v != undefined &&
    typeof v === 'object' &&
    Object.prototype.hasOwnProperty.call(v, k);
}

/**
 * Walk a pre-split key path through own properties of nested objects.
 * Returns `undefined` if any segment is missing, inherited, or non-object.
 */
function resolve(context: Record<string, unknown>, segments: readonly string[]): unknown {
  let current: unknown = context;
  for (const part of segments) {
    if (!hasOwn(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Pre-parsed fallback — computed once at compile time.
 *
 * Bare fallbacks preserve type: `${port:-3000}` defaults to
 * the number `3000` because `JSON.parse("3000")` succeeds.
 * When parsing fails (e.g. `${name:-hello}`), the raw string
 * is kept as-is. The trade-off: a typo like `${cfg:-{broken}`
 * silently produces a string instead of an error.
 */
type Fallback = { has: false } | { has: true; value: unknown };

/** Return a deep copy for object/array fallbacks, primitives as-is. */
function cloneFallback(value: unknown): unknown {
  return isObject(value) ? structuredClone(value) : value;
}

/** Parse a fallback value at compile time. */
function parseFallback(defaultValue: string | undefined): Fallback {
  if (defaultValue === undefined) return { has: false };
  try {
    return { has: true, value: JSON.parse(defaultValue) };
  } catch {
    return { has: true, value: defaultValue };
  }
}

/**
 * Compiled template — holds the parsed tree and renders against variable contexts.
 *
 * Created via {@link compile}; not meant to be instantiated directly.
 */
export class Template {
  readonly variables: readonly TemplateVariable[];
  readonly names: ReadonlySet<string>;

  private readonly tree: TNode;
  private readonly exprs: readonly ScannedExpr[];
  private readonly segments: readonly (readonly string[])[];
  private readonly fallbacks: readonly Fallback[];
  private readonly strict: boolean;

  /** @internal */
  constructor(
    tree: TNode,
    exprs: readonly ScannedExpr[],
    segments: readonly (readonly string[])[],
    fallbacks: readonly Fallback[],
    variables: readonly TemplateVariable[],
    strict: boolean,
  ) {
    this.tree = tree;
    this.exprs = exprs;
    this.segments = segments;
    this.fallbacks = fallbacks;
    this.variables = newReadOnlyArray(variables);
    this.names = newReadOnlySet(variables.map((v) => v.name));
    this.strict = strict;
  }

  /** Resolve variables and return a native JS value (object, array, string, number, etc.) */
  render(context: Record<string, unknown>): unknown {
    return this.renderNode(this.tree, context);
  }

  /** Resolve variables and return a JSON string (optional indent for pretty-print) */
  toJSON(context: Record<string, unknown>, indent?: number): string {
    return JSON.stringify(this.render(context), undefined, indent);
  }

  /**
   * Recursive render — walks the compiled tree and
   * assembles the output value.
   *
   * - `bare`: resolves the variable and returns the
   *   value directly (type-preserving).
   * - `interpolated`: concatenates parts as strings;
   *   non-primitive values (objects, arrays) are
   *   serialised via `JSON.stringify`, not `String()`.
   * - `object`/`array`: recurses into children.
   * - `literal`: returns as-is.
   */
  private renderNode(node: TNode, context: Record<string, unknown>): unknown {
    switch (node.kind) {
      case 'literal':
        return node.value;

      case 'bare': {
        const expr = this.exprs[node.idx];
        const value = resolve(context, this.segments[node.idx]);
        if (value !== undefined) return value;

        const fallback = this.fallbacks[node.idx];
        if (fallback.has) return cloneFallback(fallback.value);

        if (this.strict) throw new UnresolvedVariableError(expr.name);
        return jsonNull;
      }

      case 'interpolated': {
        let out = '';
        for (const part of node.parts) {
          if ('text' in part) {
            out += part.text;
            continue;
          }
          const expr = this.exprs[part.idx];
          const value = resolve(context, this.segments[part.idx]);
          if (value !== undefined) {
            out += isObject(value) ?
              JSON.stringify(value) :
              String(value);
            continue;
          }
          if (expr.defaultValue !== undefined) {
            out += expr.defaultValue;
            continue;
          }
          if (this.strict) throw new UnresolvedVariableError(expr.name);
          // non-strict embedded unresolved → ""
        }
        return out;
      }

      case 'object': {
        const object: Record<string, unknown> = {};
        for (const [k, child] of node.entries) {
          Object.defineProperty(object, k, {
            value: this.renderNode(child, context),
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
        return object;
      }

      case 'array':
        return node.items.map((item) => this.renderNode(item, context));
    }
  }
}

/**
 * Compile a JSON template with variable placeholders.
 *
 * Three-phase pipeline (all at compile time):
 *
 * 1. `scan()` — find expressions, track string context
 * 2. Sentinel replace + `JSON.parse` — substitute
 *    expressions with markers, parse once
 * 3. `buildTree()` — convert parsed JSON into template
 *    AST
 *
 * The returned {@link Template} holds the compiled tree
 * and renders against variable contexts via
 * `Template.render()`.
 *
 * **Bare** variables (outside JSON strings) preserve type:
 * ```ts
 * compile('{"port": ${port:-3000}}').render({})
 * // → { port: 3000 }   ← number
 * ```
 *
 * **Embedded** variables (inside `"..."`) concatenate as
 * strings:
 * ```ts
 * compile('{"addr": "${host:-localhost}:${port:-3000}"}').render({})
 * // → { addr: "localhost:3000" }   ← string
 * ```
 *
 * Defaults may contain nested JSON (brace-depth aware):
 * ```ts
 * compile('{"cfg": ${cfg:-{"retries":3}}}').render({})
 * // → { cfg: { retries: 3 } }
 * ```
 */
export function compile(template: string, options: CompileOptions = {}): Template {
  const { strict = false } = options;

  if (template.includes(SENTINEL)) {
    throw new TemplateParseError(
      'Template contains reserved sentinel character (U+E000)',
      template.indexOf(SENTINEL),
    );
  }

  const escMatch = template.match(SENTINEL_ESC_RE);
  if (escMatch) {
    throw new TemplateParseError(
      String.raw`Template contains JSON-escaped sentinel sequence (\uE000)`,
      escMatch.index!,
    );
  }

  const exprs = scan(template);

  const variables = exprs.map((expr) => toVariable(template, expr));
  const segments = exprs.map((expr) => expr.segments);
  const fallbacks = exprs.map((expr) => parseFallback(expr.defaultValue));

  // ── Replace expressions with sentinels, then JSON.parse once ──
  let json = '';
  let last = 0;
  for (const [i, expr] of exprs.entries()) {
    json += template.slice(last, expr.offset);
    json += expr.inString ?
      `${SENTINEL}E${i}${SENTINEL}` :
      `"${SENTINEL}B${i}${SENTINEL}"`;
    last = expr.offset + expr.length;
  }
  json += template.slice(last);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new TemplateParseError(
      `Template is not valid JSON (after extracting variables): ${(error as Error).message}`,
      0,
    );
  }

  const tree = buildTree(parsed);
  return new Template(tree, exprs, segments, fallbacks, variables, strict);
}

/**
 * Static analysis only — extract variable metadata without compiling.
 * Does not require the template to be valid JSON.
 */
export function listVariables(template: string): readonly TemplateVariable[] {
  return newReadOnlyArray(scan(template).map((expr) => toVariable(template, expr)));
}
