import { DatabaseRequest } from './accounts.js';
import { AuthRequest, AuthResponse, VerifiedUser } from './auth.js';
import { KeyedIpHash, SupportContact } from './privacy.js';
const Message = env => 'If your account is approved and email delivery is available, you will receive a recovery link. Check your inbox and spam folder. If it does not arrive, ' + SupportContact (env) + '.';
async function Hash (value) { return Array.from (new Uint8Array (await crypto.subtle.digest ('SHA-256', new TextEncoder ().encode (value))), (byte) => byte.toString (16).padStart (2, '0')).join (''); }
export async function Recover (context, body)
{
    if (!body || Object.keys (body).some ((key) => key !== 'email') || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test (body.email.trim ())) { return AuthResponse ({ error : 'Enter a valid email.' }, 400); }
    const email = body.email.trim ().toLowerCase ();
    const attempt = await DatabaseRequest (context.env, 'rpc/auto3d_recovery_attempt', { method : 'POST', body : JSON.stringify ({ p_email_hash : await Hash (email), p_ip_hash : await KeyedIpHash (context.env, context.request.headers.get ('CF-Connecting-IP')) }) });
    if (!attempt) { return AuthResponse ({ message : Message (context.env) }, 202); }
    const allowed = await DatabaseRequest (context.env, 'rpc/auto3d_recovery_allowed', { method : 'POST', body : JSON.stringify ({ p_email : email }) });
    if (allowed) {
        const redirect = new URL ('/?password=recovery', context.request.url).href;
        const response = await AuthRequest (context.env, 'recover?redirect_to=' + encodeURIComponent (redirect), { method : 'POST', body : JSON.stringify ({ email }) });
        if (!response.ok && response.status >= 500) { throw Object.assign (new Error ('Recovery email service unavailable. Try later.'), { status : 503 }); }
    }
    return AuthResponse ({ message : Message (context.env) }, 202);
}
export async function ResetPassword (context, body)
{
    if (!body || Object.keys (body).some ((key) => !['accessToken', 'password'].includes (key)) || typeof body.accessToken !== 'string' || body.accessToken.length > 4096 || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 1024) { return AuthResponse ({ error : 'Use the recovery link and a new password of at least 12 characters.' }, 400); }
    const user = await VerifiedUser (context.env, body.accessToken);
    const allowed = await DatabaseRequest (context.env, 'rpc/auto3d_recovery_allowed', { method : 'POST', body : JSON.stringify ({ p_email : user.email }) });
    if (!allowed) { return AuthResponse ({ error : 'An approved account is required.' }, 403); }
    const response = await AuthRequest (context.env, 'user', { method : 'PUT', headers : { Authorization : 'Bearer ' + body.accessToken }, body : JSON.stringify ({ password : body.password }) });
    if (!response.ok) { return AuthResponse ({ error : 'Password could not be changed. Request a new recovery link or choose a stronger password.' }, response.status === 429 ? 429 : 400); }
    const revoked = await AuthRequest (context.env, 'logout?scope=global', { method : 'POST', headers : { Authorization : 'Bearer ' + body.accessToken } });
    if (!revoked.ok && ![401, 403, 404].includes (revoked.status)) { return AuthResponse ({ error : 'Password changed. Sign out of existing sessions before signing in again.' }, 503, null, true, 'logout'); }
    return AuthResponse ({ message : 'Password changed. Sign in with your new password.' }, 200, null, true, 'logout');
}
