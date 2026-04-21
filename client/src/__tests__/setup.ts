import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';

// Register jest-dom matchers against vitest's expect. Using the explicit
// `expect.extend` call rather than the side-effect import keeps behaviour
// stable across vitest 2/3/4 (vitest 4 tightened matcher discovery).
expect.extend(matchers);

afterEach(() => {
  cleanup();
});
