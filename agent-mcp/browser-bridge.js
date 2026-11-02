import { CaptureImageResult } from './capture-image.js';

// Read-only pilot adapter. An authenticated transport must supply the request;
// this module does not open a socket or grant access on its own.
export const PilotCommands = Object.freeze (['capture.image', 'scene.inspect', 'camera.current.inspect', 'packaging.measurements.inspect', 'render.queue.inspect', 'session.tabs.inspect']);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test (value);

export class BrowserBridge
{
    constructor ({ website, instanceId, windowLabel = 'Auto3D window' })
    {
        if (!website || !validId (instanceId)) { throw new Error ('Invalid browser bridge.'); }
        this.website = website; this.instanceId = instanceId; this.enabled = false; this.completed = new Set (); this.SetWindowLabel (windowLabel);
    }
    SetWindowLabel (label) { if (typeof label !== 'string' || !label.trim () || label.length > 80 || [...label].some (character => character.charCodeAt (0) < 32 || character.charCodeAt (0) === 127)) { throw new Error ('Enter a window label up to 80 characters.'); } this.windowLabel = label.trim (); }
    Connect ()
    {
        if (!this.website.auth?.user?.id || this.website.accountReady !== true || this.website.sessionEditor?.readOnly) { throw new Error ('Sign in to an editable Auto3D workspace.'); }
        this.accountId = this.website.auth.user.id; this.enabled = true; this.generation = (this.generation || 0) + 1; this.completed.clear (); return this.Describe ();
    }
    Disconnect () { this.enabled = false; this.accountId = null; this.generation = (this.generation || 0) + 1; this.completed.clear (); }
    Describe ()
    {
        if (!this.enabled || this.website.auth?.user?.id !== this.accountId || this.website.accountReady !== true) { throw new Error ('Agent connection unavailable.'); }
        const tabs = this.website.sessionEditor.sessions?.Inspect (); if (!tabs) { throw new Error ('Session manager unavailable.'); }
        return { instanceId : this.instanceId, windowLabel : this.windowLabel, sessions : tabs.tabs.map (tab => ({ id : tab.id, name : tab.name, active : tab.active })) };
    }
    async Execute (request)
    {
        if (!request || !validId (request.requestId) || !validId (request.sessionId) || !PilotCommands.includes (request.command) || !request.arguments || typeof request.arguments !== 'object' || Array.isArray (request.arguments)) { throw new Error ('Invalid or unsupported pilot request.'); }
        if (this.website.sessionEditor.sessions?.switching) { throw new Error ('Session is still opening.'); }
        const generation = this.generation, revision = this.website.sessionEditor.sessions?.selectionRevision; const before = this.Describe (); if (!before.sessions.some (session => session.id === request.sessionId && session.active)) { throw new Error ('The requested session is not active in this browser.'); }
        if (this.completed.has (request.requestId)) { throw new Error ('Duplicate request.'); } if (this.completed.size >= 10000) { throw new Error ('Request history is full.'); }
        this.completed.add (request.requestId);
        const result = await this.website.commands.Execute (request.command, request.arguments);
        if (request.command === 'capture.image') { CaptureImageResult (result); }
        const after = this.Describe (); if (this.generation !== generation || this.website.sessionEditor.sessions?.switching || this.website.sessionEditor.sessions?.selectionRevision !== revision || !after.sessions.some (session => session.id === request.sessionId && session.active)) { throw new Error ('The requested session changed; outcome may be unknown.'); }
        return result;
    }
}
