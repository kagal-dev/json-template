import pkg from '../package.json' with { type: 'json' };

/** Package version from package.json. */
export const VERSION: string = pkg.version;

export {
  TemplateParseError,
  UnresolvedVariableError,
} from './errors';

export {
  isNull,
  jsonNull,
} from './json';

export {
  compile,
  listVariables,
  Template,
} from './template';

export type {
  CompileOptions,
  TemplateVariable,
} from './types';
