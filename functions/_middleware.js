import { AccessCookie, LoggedOutCookie, AuthCookies, AuthResponse, VerifiedUser } from './_lib/auth.js';
import { LiveMcpPath } from '../mcp/common.js';
export async function onRequest (context)
{
    const path = new URL (context.request.url).pathname;
    if (LiveMcpPath (path)) {
        if (context.env.AUTO3D_MCP_LIVE_ADMIN !== '1') { return AuthResponse ({ error : 'Not found.' }, 404); }
        const { HandleLiveMcp } = await import ('../mcp/live.js'); return HandleLiveMcp (context);
    }
    const protectedFile = /\.(?:auto3d|glb|gltf|obj|stl|step|stp|iges|igs|3mf|3dm|3ds|dae|fbx|ply|off|bim|brep|fcstd|wrl|amf|zae|zip)$/i.test (path);
    if (!protectedFile && !path.endsWith ('embed.html')) { return context.next (); }
    const cookies = AuthCookies (context.request);
    if (!cookies[AccessCookie] || cookies[LoggedOutCookie]) { return path.endsWith ('embed.html') ? Response.redirect (new URL ('/', context.request.url).href, 302) : AuthResponse ({ error : 'Sign in to access model files.' }, 401); }
    try { await VerifiedUser (context.env, cookies[AccessCookie]); }
    catch (error) { return AuthResponse ({ error : 'Sign in again.' }, error.status || 503); }
    return context.next ();
}
