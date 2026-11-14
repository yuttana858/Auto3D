// Presentation foundation. Messaging and AI transport are added separately.
export class Messenger
{
    constructor (website)
    {
        this.website = website; this.tab = 'people'; this.drafts = { people : '', ai : '' };
        const launcher = document.createElement ('button'); this.launcher = launcher; launcher.type = 'button'; launcher.className = 'messenger_launcher'; launcher.textContent = 'Messenger'; launcher.setAttribute ('aria-label', 'Open Messenger'); launcher.setAttribute ('aria-expanded', 'false'); document.body.appendChild (launcher);
        const root = document.createElement ('section'); this.root = root; root.className = 'messenger_window'; root.setAttribute ('role', 'dialog'); root.setAttribute ('aria-label', 'Messenger'); root.dataset.capturePrivate = ''; root.hidden = true; document.body.appendChild (root);
        const header = document.createElement ('div'); header.className = 'messenger_header'; root.appendChild (header);
        const handle = document.createElement ('button'); handle.type = 'button'; handle.className = 'messenger_handle'; handle.textContent = 'Messenger'; handle.setAttribute ('aria-label', 'Move Messenger; drag or use arrow keys'); header.appendChild (handle);
        const close = document.createElement ('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute ('aria-label', 'Close Messenger'); close.addEventListener ('click', () => this.SetVisible (false)); header.appendChild (close);
        const tabs = document.createElement ('div'); tabs.className = 'messenger_tabs'; tabs.setAttribute ('role', 'tablist'); tabs.setAttribute ('aria-label', 'Messenger conversations'); root.appendChild (tabs); this.tabs = new Map ();
        for (const [id, title] of [['people', 'Messages'], ['ai', 'AI']]) { const button = document.createElement ('button'); button.type = 'button'; button.textContent = title; button.setAttribute ('role', 'tab'); button.addEventListener ('click', () => this.SetTab (id)); tabs.appendChild (button); this.tabs.set (id, button); }
        this.content = document.createElement ('div'); this.content.className = 'messenger_content'; this.content.setAttribute ('role', 'tabpanel'); root.appendChild (this.content);
        this.identity = document.createElement ('div'); this.identity.className = 'messenger_identity'; root.appendChild (this.identity);
        const form = document.createElement ('form'); form.className = 'messenger_composer'; root.appendChild (form);
        this.input = document.createElement ('textarea'); this.input.rows = 1; this.input.maxLength = 4000; this.input.setAttribute ('aria-label', 'Messenger message'); this.input.placeholder = 'Write a message'; form.appendChild (this.input);
        const send = document.createElement ('button'); this.send = send; send.type = 'submit'; send.textContent = 'Send'; send.disabled = true; form.appendChild (send); form.addEventListener ('submit', event => { event.preventDefault (); this.SendToAgent (); });
        this.mic = document.createElement ('button'); this.mic.type = 'button'; this.mic.textContent = '🎙'; this.mic.setAttribute ('aria-label', 'Start voice dictation'); this.mic.setAttribute ('aria-pressed', 'false'); this.mic.title = 'Dictate a message'; form.insertBefore (this.mic, send);
        this.voiceStatus = document.createElement ('div'); this.voiceStatus.className = 'messenger_voice_status'; this.voiceStatus.setAttribute ('role', 'status'); root.appendChild (this.voiceStatus);
        this.voiceStatus.textContent = 'Voice recognition may send audio to your browser provider. Dictation is never sent automatically.';
        this.recognition = null; this.readReplies = false; this.speaking = false;
        this.mic.disabled = !(window.SpeechRecognition || window.webkitSpeechRecognition);
        if (this.mic.disabled) { this.voiceStatus.textContent = 'Voice dictation is unavailable in this browser. You can type your message.'; }
        this.mic.addEventListener ('click', () => this.ToggleDictation ());
        const voiceControls = document.createElement ('div'); voiceControls.className = 'messenger_voice_controls'; root.appendChild (voiceControls);
        this.speechToggle = document.createElement ('button'); this.speechToggle.type = 'button'; this.speechToggle.textContent = 'Read AI replies: off'; this.speechToggle.setAttribute ('aria-pressed', 'false'); this.speechToggle.disabled = !('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window); voiceControls.appendChild (this.speechToggle);
        this.speechToggle.addEventListener ('click', () => this.SetReadReplies (!this.readReplies));
        this.stopSpeech = document.createElement ('button'); this.stopSpeech.type = 'button'; this.stopSpeech.textContent = 'Stop speaking'; this.stopSpeech.disabled = true; voiceControls.appendChild (this.stopSpeech); this.stopSpeech.addEventListener ('click', () => this.StopSpeech ());
        this.input.addEventListener ('input', () => { this.input.style.height = 'auto'; this.input.style.height = Math.min (this.input.scrollHeight, 180) + 'px'; this.UpdateIdentity (); });
        launcher.addEventListener ('click', () => this.SetVisible (root.hidden));
        const position = (left, top) => { root.style.left = Math.max (0, Math.min (window.innerWidth - root.offsetWidth, left)) + 'px'; root.style.top = Math.max (0, Math.min (window.innerHeight - root.offsetHeight, top)) + 'px'; root.style.right = 'auto'; root.style.bottom = 'auto'; };
        handle.addEventListener ('pointerdown', event => { if (event.button !== 0) { return; } const bounds = root.getBoundingClientRect (), origin = { x : event.clientX, y : event.clientY, left : bounds.left, top : bounds.top }; handle.setPointerCapture (event.pointerId); const move = e => position (origin.left + e.clientX - origin.x, origin.top + e.clientY - origin.y); const end = () => { handle.removeEventListener ('pointermove', move); handle.removeEventListener ('pointerup', end); handle.removeEventListener ('pointercancel', end); handle.removeEventListener ('lostpointercapture', end); }; handle.addEventListener ('pointermove', move); handle.addEventListener ('pointerup', end); handle.addEventListener ('pointercancel', end); handle.addEventListener ('lostpointercapture', end); event.preventDefault (); });
        handle.addEventListener ('keydown', event => { const step = { ArrowLeft : [-10, 0], ArrowRight : [10, 0], ArrowUp : [0, -10], ArrowDown : [0, 10] }[event.key]; if (!step) { return; } event.preventDefault (); const bounds = root.getBoundingClientRect (); position (bounds.left + step[0], bounds.top + step[1]); });
        const placeLauncher = () => { const button = website.parameters.headerButtonsDiv.querySelector ('.header_fullscreen_button'); const header = website.parameters.headerDiv.getBoundingClientRect (), rect = button?.getBoundingClientRect (); launcher.style.top = Math.round ((rect?.bottom || header.bottom) + 5) + 'px'; launcher.style.right = Math.max (5, Math.round (window.innerWidth - (rect?.right || window.innerWidth - 5))) + 'px'; if (!root.hidden) { const bounds = root.getBoundingClientRect (); position (bounds.left, bounds.top); } };
        window.addEventListener ('resize', placeLauncher); const layoutObserver = new ResizeObserver (placeLauncher); layoutObserver.observe (website.parameters.headerDiv); const fullscreen = website.parameters.headerButtonsDiv.querySelector ('.header_fullscreen_button'); if (fullscreen) { layoutObserver.observe (fullscreen); } requestAnimationFrame (placeLauncher); let account = website.auth.user?.id || null; website.auth.Subscribe (user => { const next = user?.id || null; if (next !== account) { this.input.value = ''; this.drafts = { people : '', ai : '' }; this.SetVisible (false); this.SetReadReplies (false); account = next; } this.UpdateIdentity (); }); this.SetTab ('people');
    }
    Inspect () { return { visible : !this.root.hidden, tab : this.tab, messagingConnected : false, aiConnected : !!this.website.sessionEditor?.commandBar?.AgentConnected () }; }
    SetVisible (visible)
    {
        if (typeof visible !== 'boolean') { throw new Error ('Choose whether Messenger is visible.'); }
        if (visible && (!this.website.auth?.user || this.website.sessionEditor?.readOnly)) { throw new Error ('Sign in to an editable session to open Messenger.'); }
        if (!visible) { this.StopDictation (); this.StopSpeech (); } this.root.hidden = !visible; this.launcher.setAttribute ('aria-expanded', String (visible)); if (visible) { this.input.focus (); } return this.Inspect ();
    }
    SetTab (tab)
    {
        if (!['people', 'ai'].includes (tab)) { throw new Error ('Choose Messages or AI.'); }
        this.StopDictation (); this.drafts[this.tab] = this.input.value; this.tab = tab; this.input.value = this.drafts[tab]; this.input.style.height = 'auto'; this.input.style.height = Math.min (this.input.scrollHeight, 180) + 'px'; for (const [id, button] of this.tabs) { button.setAttribute ('aria-selected', String (id === tab)); button.tabIndex = id === tab ? 0 : -1; }
        this.input.placeholder = tab === 'people' ? 'Write a message' : 'Ask about Auto3D'; this.send.disabled = tab !== 'ai'; this.RenderConversation (); this.UpdateIdentity (); return this.Inspect ();
    }
    BindAgentChannel ()
    {
        const bar = this.website.sessionEditor?.commandBar; if (!bar || this.agentBar === bar) { return; } this.agentBar = bar;
        bar.root.addEventListener ('auto3d-command-entry', event => { if (event.detail?.from === 'agent' && event.detail.kind === 'response') { this.SpeakAgentReply (event.detail.text); } if (this.tab === 'ai') { this.RenderConversation (); } });
    }
    RenderConversation ()
    {
        this.content.replaceChildren (); if (this.tab !== 'ai') { this.content.textContent = 'Messages and group conversations are being set up.'; return; }
        this.BindAgentChannel (); const note = document.createElement ('p'); note.textContent = 'Agent messages are kept in this window during this session. A connected agent must respond.'; this.content.appendChild (note);
        for (const entry of this.agentBar?.log || []) { if (!['message', 'response'].includes (entry.kind)) { continue; } const row = document.createElement ('p'); const who = document.createElement ('strong'); who.textContent = entry.from === 'agent' ? 'Agent: ' : (this.website.auth?.user?.email || 'You') + ': '; row.append (who, document.createTextNode (entry.text)); this.content.appendChild (row); } this.content.scrollTop = this.content.scrollHeight;
    }
    SendToAgent ()
    {
        const message = this.input.value.trim (); if (this.tab !== 'ai' || !message || !this.website.auth?.user || this.website.sessionEditor?.readOnly) { return; }
        this.BindAgentChannel (); if (!this.agentBar) { return; } if (message.length > 2000) { this.voiceStatus.textContent = 'Agent messages are limited to 2,000 characters.'; return; }
        this.agentBar.SendToAgent (message); this.input.value = ''; this.drafts.ai = ''; this.input.dispatchEvent (new Event ('input', { bubbles : true })); this.RenderConversation ();
    }
    UpdateIdentity () { const user = this.website.auth?.user; const name = user?.email || user?.id || 'Signed-out user'; this.identity.textContent = (this.input.value.trim () ? 'Drafting as ' : 'Signed in as ') + name; }
    ToggleDictation ()
    {
        if (this.recognition) { this.StopDictation (); return; }
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition || this.root.hidden) { return; }
        const recognition = new Recognition (); this.recognition = recognition; recognition.continuous = false; recognition.interimResults = false; recognition.lang = document.documentElement.lang || navigator.language || 'en-US';
        recognition.onresult = event => { if (this.recognition !== recognition) { return; } let text = ''; for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) { text += event.results[i][0].transcript; } } if (text) { const prefix = this.input.value && !/\s$/.test (this.input.value) ? ' ' : ''; this.input.value = (this.input.value + prefix + text.trim ()).slice (0, this.input.maxLength); this.input.dispatchEvent (new Event ('input', { bubbles : true })); } };
        recognition.onerror = event => { if (this.recognition === recognition) { this.voiceStatus.textContent = event.error === 'not-allowed' ? 'Microphone access was denied. Check your browser permissions.' : 'Voice dictation stopped. Check your microphone and try again.'; } };
        recognition.onend = () => { if (this.recognition === recognition) { this.recognition = null; this.mic.setAttribute ('aria-pressed', 'false'); this.mic.setAttribute ('aria-label', 'Start voice dictation'); if (this.voiceStatus.textContent.startsWith ('Listening.')) { this.voiceStatus.textContent = 'Dictation stopped. Review the text before sending.'; } } };
        try { recognition.start (); this.mic.setAttribute ('aria-pressed', 'true'); this.mic.setAttribute ('aria-label', 'Stop voice dictation'); this.voiceStatus.textContent = 'Listening. Your browser may send audio to its speech provider. Click the microphone to stop.'; } catch (error) { this.recognition = null; this.voiceStatus.textContent = 'Voice dictation could not start. Check your microphone and browser permissions.'; }
    }
    StopDictation () { if (this.recognition) { const recognition = this.recognition; this.recognition = null; recognition.abort (); this.voiceStatus.textContent = 'Dictation stopped. Review the text before sending.'; } if (this.mic) { this.mic.setAttribute ('aria-pressed', 'false'); this.mic.setAttribute ('aria-label', 'Start voice dictation'); } }
    SetReadReplies (enabled)
    {
        if (typeof enabled !== 'boolean') { throw new Error ('Choose whether AI replies are read aloud.'); }
        if (enabled && this.speechToggle.disabled) { throw new Error ('Speech playback is unavailable in this browser.'); }
        this.readReplies = enabled; this.speechToggle.textContent = 'Read AI replies: ' + (enabled ? 'on' : 'off'); this.speechToggle.setAttribute ('aria-pressed', String (enabled)); if (!enabled) { this.StopSpeech (); } return { readReplies : enabled };
    }
    // Called only for authenticated AI replies after the conversation transport exists.
    SpeakAgentReply (text)
    {
        if (!this.readReplies || this.root.hidden || typeof text !== 'string' || !text.trim ()) { return false; }
        this.StopSpeech (); const utterance = new SpeechSynthesisUtterance (text.slice (0, 4000)); this.speaking = true; this.stopSpeech.disabled = false; utterance.onend = utterance.onerror = () => { this.speaking = false; this.stopSpeech.disabled = true; }; window.speechSynthesis.speak (utterance); return true;
    }
    StopSpeech () { if (this.speaking) { window.speechSynthesis.cancel (); this.speaking = false; } if (this.stopSpeech) { this.stopSpeech.disabled = true; } }
}
