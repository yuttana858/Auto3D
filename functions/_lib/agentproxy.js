// These routes preserve the app origin and host-only login cookies. They only
// reach private Worker service bindings; missing bindings fail closed.
export function AgentProxy (context, binding, allowed)
{
    const url = new URL (context.request.url);
    if (!allowed (url.pathname)) { return new Response ('Not found.', { status : 404, headers : { 'Cache-Control' : 'no-store' } }); }
    const service = context.env[binding];
    if (!service || typeof service.fetch !== 'function') { return new Response ('Agent connector is not configured.', { status : 503, headers : { 'Cache-Control' : 'no-store' } }); }
    return service.fetch (context.request);
}
