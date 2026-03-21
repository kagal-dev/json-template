import { expect, it } from 'vitest';

import { VERSION } from '..';
import pkg from '../../package.json' with { type: 'json' };

it('VERSION matches package.json', () => {
  expect(VERSION).toEqual(pkg.version);
});
