import { TemplateParseError } from './errors';
import { isNonStringPrimitive } from './json';

/**
 * Template AST node — compiled representation of the JSON
 * structure with variable holes.
 *
 * Discriminated on `kind`:
 * - `literal` — static value (no variables)
 * - `bare` — whole-value variable reference
 * - `interpolated` — string with mixed text and variables
 * - `object` — JSON object with child nodes
 * - `array` — JSON array with child nodes
 */
export type TNode =
  { kind: 'array'; items: readonly TNode[] } |
  { kind: 'bare'; idx: number } |
  { kind: 'interpolated'; parts: readonly IPart[] } |
  { kind: 'literal'; value: unknown } |
  { kind: 'object'; entries: readonly [string, TNode][] };

/** Part of an interpolated string: literal text or a variable reference by index. */
export type IPart = { idx: number } | { text: string };

/**
 * PUA sentinel delimiter used to mark variable positions
 * in the JSON string between `scan()` and `JSON.parse`.
 *
 * The encoding scheme couples the `ScannedExpr[]` array
 * index with the sentinel marker index:
 *
 * 1. `scan()` produces `exprs[0]`, `exprs[1]`, etc.
 * 2. `compile()` writes `"\uE000B0\uE000"` (bare) or
 *    `\uE000E0\uE000` (embedded) into the JSON string,
 *    where `0` is the index into `exprs`.
 * 3. `buildTree()` extracts the index from the sentinel
 *    via regex and stores it in the `TNode` as `idx`.
 * 4. `Template.renderNode()` uses `idx` to look up
 *    `exprs[idx]` at render time.
 *
 * The `B`/`E` prefix distinguishes bare from embedded;
 * `BARE_RE` only matches when the sentinel is the entire
 * string value.
 *
 * `\uE000` was chosen because it is valid inside JSON
 * strings (unlike null bytes) and vanishingly unlikely
 * to appear in real template content.
 */
export const SENTINEL = '\uE000';

/**
 * Matches a bare sentinel — the entire string value is
 * a single variable reference.
 */
const BARE_RE = new RegExp(String.raw`^${SENTINEL}B(\d+)${SENTINEL}$`);

/**
 * Matches any sentinel (bare or embedded) within a
 * string value. Module-level with `g` flag — `lastIndex`
 * must be reset before each use.
 */
const SENTINEL_RE = new RegExp(String.raw`${SENTINEL}[BE](\d+)${SENTINEL}`, 'g');

/**
 * Convert a post-`JSON.parse` value into a template AST.
 *
 * Runs once at compile time. Matches sentinel patterns in
 * string values to classify them as `bare`, `interpolated`,
 * or `literal`. Objects and arrays become structural nodes.
 * Object keys containing sentinels are rejected with a
 * {@link TemplateParseError} (variable keys are not
 * supported — detection happens here, not in the scanner,
 * because the scanner doesn't know JSON structure).
 *
 * Default parsing belongs in `compile()` (see
 * `parseFallback`). Runtime variable resolution belongs
 * in `Template.renderNode()`. Neither belongs here.
 */
export function buildTree(value: unknown): TNode {
  if (isNonStringPrimitive(value)) {
    return { kind: 'literal', value };
  }

  if (typeof value === 'string') {
    const bareMatch = value.match(BARE_RE);
    if (bareMatch) return { kind: 'bare', idx: Number.parseInt(bareMatch[1], 10) };

    SENTINEL_RE.lastIndex = 0;
    if (SENTINEL_RE.test(value)) {
      SENTINEL_RE.lastIndex = 0;
      const parts: IPart[] = [];
      let last = 0;
      let m: null | RegExpExecArray;
      while ((m = SENTINEL_RE.exec(value))) {
        if (m.index > last) parts.push({ text: value.slice(last, m.index) });
        parts.push({ idx: Number.parseInt(m[1], 10) });
        last = m.index + m[0].length;
      }
      if (last < value.length) parts.push({ text: value.slice(last) });
      return { kind: 'interpolated', parts };
    }

    return { kind: 'literal', value };
  }

  if (Array.isArray(value)) {
    return { kind: 'array', items: value.map((v) => buildTree(v)) };
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]): [string, TNode] => {
        SENTINEL_RE.lastIndex = 0;
        if (SENTINEL_RE.test(k)) {
          throw new TemplateParseError(
            'Variable expressions in object keys are not supported',
            0,
          );
        }
        return [k, buildTree(v)];
      });
    return { kind: 'object', entries };
  }

  return { kind: 'literal', value };
}
