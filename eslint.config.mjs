// @ts-check
import { defineConfig, GLOB_SRC } from '@poupe/eslint-config';

// TODO: upstream arrow-parens to @poupe/eslint-config
export default defineConfig({
  ignores: [
    '.claude/**/memory',
    '.tmp',
  ],
}, {
  files: [GLOB_SRC],
  rules: {
    '@stylistic/arrow-parens': ['error', 'always'],
  },
});
