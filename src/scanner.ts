import { TemplateParseError } from './errors';

/**
 * Single path segment: starts with a letter or underscore,
 * may contain letters, digits, underscores, or hyphens.
 */
const SEGMENT_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/** Output of {@link scan} — a single `${…}` expression found in the template. */
export interface ScannedExpr {
  /** Position of the `$` in the template */
  offset: number
  /** Total span including `${` and `}` */
  length: number
  /** Parsed variable name */
  name: string
  /** Raw default text after `:-`, if present */
  defaultValue?: string
  /** Whether the `${` was inside a JSON string */
  inString: boolean
}

/**
 * Single-pass scanner that finds variable expressions in a
 * template string.
 *
 * Tracks JSON string context via an `inString` flag — the
 * flag's value at the moment an expression is encountered
 * determines whether it gets a bare (`B`) or embedded (`E`)
 * sentinel downstream. If this flag is wrong, the variable
 * will be classified into the wrong position. The
 * backslash handling (`pos += 2` to skip `\"`) must exactly
 * mirror JSON's escape rules.
 *
 * Also tracks brace depth and string state inside
 * expression bodies so that defaults containing nested
 * braces (e.g. `{"a":{"b":1}}`) parse correctly.
 */
export function scan(template: string): ScannedExpr[] {
  const exprs: ScannedExpr[] = [];
  let pos = 0;
  let inString = false;

  while (pos < template.length) {
    const ch = template[pos];

    if (!inString && ch === '"') {
      inString = true;
      pos++;
      continue;
    }
    if (inString && ch === '\\') {
      pos += 2;
      continue;
    }
    if (inString && ch === '"') {
      inString = false;
      pos++;
      continue;
    }

    if (ch === '$' && template[pos + 1] === '{') {
      const start = pos;
      const wasInString = inString;
      pos += 2; // skip ${

      let depth = 1;
      let inner = false; // string state inside the expression
      while (pos < template.length && depth > 0) {
        const c = template[pos];
        if (inner) {
          if (c === '\\') {
            pos += 2;
            continue;
          }
          if (c === '"') inner = false;
        } else {
          // eslint-disable-next-line unicorn/prefer-switch
          if (c === '"') inner = true;
          else if (c === '{') depth++;
          else if (c === '}') {
            depth--;
            if (depth === 0) break;
          }
        }
        pos++;
      }

      if (depth !== 0) throw new TemplateParseError('Unterminated variable expression', start);

      const raw = template.slice(start + 2, pos);
      pos++; // skip closing }

      if (raw.length === 0) throw new TemplateParseError('Empty variable expression', start);

      const separatorIndex = raw.indexOf(':-');
      const name = (separatorIndex === -1 ? raw : raw.slice(0, separatorIndex)).trim();
      const defaultValue = separatorIndex === -1 ? undefined : raw.slice(separatorIndex + 2);

      const segments = name.split('.');
      if (segments.some((s) => !SEGMENT_RE.test(s))) {
        throw new TemplateParseError(`Invalid variable name "${name}"`, start + 2);
      }

      exprs.push({ offset: start, length: pos - start, name, defaultValue, inString: wasInString });
      continue;
    }

    pos++;
  }

  return exprs;
}
