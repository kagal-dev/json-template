/** Thrown when a template string cannot be parsed. */
export class TemplateParseError extends Error {
  constructor(message: string, public readonly offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = 'TemplateParseError';
  }
}

/** Thrown in strict mode when a variable has no value and no default. */
export class UnresolvedVariableError extends Error {
  constructor(public readonly variableName: string) {
    super(`Unresolved variable with no default: \${${variableName}}`);
    this.name = 'UnresolvedVariableError';
  }
}
