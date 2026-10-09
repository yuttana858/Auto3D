import { BuildPackaging } from '../modules/packaging/tools/build.mjs';
import path from 'node:path';
await BuildPackaging (path.resolve (process.argv[2] || 'build/website/packaging'), false);
