/**
 * JSON `null` value.
 *
 * Use this instead of bare `null` to satisfy the
 * `unicorn/no-null` lint rule.
 */
// eslint-disable-next-line unicorn/no-null
export const jsonNull: null = null;

/** Type guard for JSON `null`. */
export function isNull(value: unknown): value is null {
  return value === jsonNull;
}

/**
 * Returns `true` for non-string JSON primitives:
 * `null`, `boolean`, `number`.
 *
 * Strings are excluded — they may contain sentinel
 * markers in the template pipeline and need further
 * inspection during tree building.
 */
export function isNonStringPrimitive(value: unknown): boolean {
  return isNull(value) ||
    typeof value === 'boolean' ||
    typeof value === 'number';
}

/** Returns `true` for non-null objects (including arrays). */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && !isNull(value);
}
