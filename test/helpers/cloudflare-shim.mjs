import { registerHooks } from 'node:module';
registerHooks ({ resolve (specifier, context, nextResolve) { if (specifier === 'cloudflare:workers') { return { url : 'data:text/javascript,export class WorkerEntrypoint {}', shortCircuit : true }; } return nextResolve (specifier, context); } });
