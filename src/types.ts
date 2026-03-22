/** Metadata for a single variable occurrence in a template. */
export interface TemplateVariable {
  /** Raw expression text between `${` and `}` */
  readonly raw: string
  /** Variable name (may be dotted, e.g. "server.host") */
  readonly name: string
  /** Shell-style default after :- (undefined if none) */
  readonly defaultValue?: string
  /** Whether this variable sits in a bare JSON value position vs inside a string */
  readonly bare: boolean
  /** Offset of the opening `${` in the source template */
  readonly offset: number
}

/** Options for {@link compile}. */
export interface CompileOptions {
  /** Throw on unresolved variables with no default (default: false → null for bare, "" for embedded) */
  strict?: boolean
}
