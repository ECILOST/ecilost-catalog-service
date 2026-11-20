import { mergeConfig } from 'vitest/config';
import unitConfig from './vitest.config.js';

export default mergeConfig(unitConfig, {
  test: { include: ['test/**/*.e2e-spec.ts'] },
});
