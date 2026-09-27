import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
// Share server credentials with the gateway; existing process/app values win.
const sharedEnv = new URL('../../.env', import.meta.url);
if (existsSync(sharedEnv)) loadEnvFile(sharedEnv);

export default { distDir: process.env.NEXT_DIST_DIR || '.next', experimental: { externalDir: true }, poweredByHeader: false };
