// Existing tests load pure production TypeScript through data URLs. Resolve the
// shared localization runtime and bundled JSON there without a React Native bridge.
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = new URL('../../', import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@/localization/runtime') return { url: new URL('src/localization/runtime.ts', root).href, shortCircuit: true };
    if (context.parentURL?.startsWith(new URL('src/', root).href) && specifier.startsWith('.')) {
      const url = new URL(specifier, context.parentURL);
      if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + '.ts')) return { url: url.href + '.ts', shortCircuit: true };
    }
    if (specifier === 'i18next' && context.parentURL?.startsWith('data:')) return next(specifier, { ...context, parentURL: new URL('package.json', root).href });
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.includes('/src/localization/') && url.endsWith('.json')) return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};`, shortCircuit: true };
    return next(url, context);
  },
});
