import { MessengerService } from './messengerservice.js';
import { MessengerPeople } from './messengerpeople.js';
import { MessengerAIHistory } from './messengeraistory.js';
import { MessengerArchive } from './messengerarchive.js';
// Presentation foundation. Messaging and AI transport are added separately.
export class Messenger
{
    constructor (website)
    {
        this.website = website; this.service = new MessengerService (website); this.tab = 'people'; this.drafts = { people : '', ai : '' }; this.peopleDrafts = new Map (); this.historyOpen = false;
        const launcher = document.createElement ('button'); this.launcher = launcher; launcher.type = 'button'; launcher.className = 'messenger_launcher'; launcher.textContent = 'Messenger'; launcher.setAttribute ('aria-label', 'Open Messenger'); launcher.setAttribute ('aria-expanded', 'false'); document.body.appendChild (launcher);
        const root = document.createElement ('section'); this.root = root; root.className = 'messenger_window'; root.setAttribute ('role', 'dialog'); root.setAttribute ('aria-label', 'Messenger'); root.dataset.capturePrivate = ''; root.hidden = true; document.body.appendChild (root);
        const header = document.createElement ('div'); header.className = 'messenger_header'; root.appendChild (header);
        const handle = document.createElement ('button'); handle.type = 'button'; handle.className = 'messenger_handle'; handle.textContent = 'Messenger'; handle.setAttribute ('aria-label', 'Move Messenger; drag or use arrow keys'); header.appendChild (handle);
        const history = document.createElement ('button'); this.historyButton = history; history.type = 'button'; history.textContent = 'History'; history.setAttribute ('aria-pressed', 'false'); history.addEventListener ('click', () => this.SetHistory (!this.historyOpen)); header.appendChild (history);
        const close = document.createElement ('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute ('aria-label', 'Close Messenger'); close.addEventListener ('click', () => this.SetVisible (false)); header.appendChild (close);
        const tabs = document.createElement ('div'); tabs.className = 'messenger_tabs'; tabs.setAttribute ('role', 'tablist'); tabs.setAttribute ('aria-label', 'Messenger conversations'); root.appendChild (tabs); this.tabs = new Map ();
        for (const [id, title] of [['people', 'Messages'], ['ai', 'AI']]) { const button = document.createElement ('button'); button.type = 'button'; button.textContent = title; button.setAttribute ('role', 'tab'); button.addEventListener ('click', () => this.SetTab (id)); tabs.appendChild (button); this.tabs.set (id, button); }
        this.content = document.createElement ('div'); this.content.className = 'messenger_content'; this.content.setAttribute ('role', 'tabpanel'); root.appendChild (this.content);
        this.identity = document.createElement ('div'); this.identity.className = 'messenger_identity'; root.appendChild (this.identity);
        const form = document.createElement ('form'); form.className = 'messenger_composer'; root.appendChild (form);
        this.input = document.createElement ('textarea'); this.input.rows = 1; this.input.maxLength = 4000; this.input.setAttribute ('aria-label', 'Messenger message'); this.input.placeholder = 'Write a message'; form.appendChild (this.input);
        const send = document.createElement ('button'); this.send = send; send.type = 'submit'; send.textContent = 'Send'; send.disabled = true; form.appendChild (send); form.addEventListener ('submit', event => { event.preventDefault (); this.Submit (); });
        this.mic = document.createElement ('button'); this.mic.type = 'button'; this.mic.textContent = '🎙'; this.mic.setAttribute ('aria-label', 'Start voice dictation'); this.mic.setAttribute ('aria-pressed', 'false'); this.mic.title = 'Dictate a message'; form.insertBefore (this.mic, send);
        this.voiceStatus = document.createElement ('div'); this.voiceStatus.className = 'messenger_voice_status'; this.voiceStatus.setAttribute ('role', 'status'); root.appendChild (this.voiceStatus);
        this.voiceStatus.textContent = 'Voice recognition may send audio to your browser provider. Dictation is never sent automatically.';
        this.recognition = null; this.readReplies = false; this.speaking = false;
        this.speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition); this.mic.disabled = !this.speechSupported;
        if (this.mic.disabled) { this.voiceStatus.textContent = 'Voice dictation is unavailable in this browser. You can type your message.'; }
        this.mic.addEventListener ('click', () => this.ToggleDictation ());
        const voiceControls = document.createElement ('div'); voiceControls.className = 'messenger_voice_controls'; root.appendChild (voiceControls);
        this.speechToggle = document.createElement ('button'); this.speechToggle.type = 'button'; this.speechToggle.textContent = 'Read AI replies: off'; this.speechToggle.setAttribute ('aria-pressed', 'false'); this.speechToggle.disabled = !('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window); voiceControls.appendChild (this.speechToggle);
        this.speechToggle.addEventListener ('click', () => this.SetReadReplies (!this.readReplies));
        this.stopSpeech = document.createElement ('button'); this.stopSpeech.type = 'button'; this.stopSpeech.textContent = 'Stop speaking'; this.stopSpeech.disabled = true; voiceControls.appendChild (this.stopSpeech); this.stopSpeech.addEventListener ('click', () => this.StopSpeech ());
        this.input.addEventListener ('input', () => { this.input.style.height = 'auto'; this.input.style.height = Math.min (this.input.scrollHeight, 180) + 'px'; if (this.tab === 'people') { if (!this.input.value.trim ()) { this.peopleAgentDraft = false; this.peopleAgentDraftConversation = null; } const id = this.people?.current; if (id) { if (this.input.value) { this.peopleDrafts.set (id, { text : this.input.value, agent : this.peopleAgentDraft && this.peopleAgentDraftConversation === id }); } else { this.peopleDrafts.delete (id); } } } this.UpdateIdentity (); });
        launcher.addEventListener ('click', () => this.SetVisible (root.hidden));
        const position = (left, top) => { root.style.left = Math.max (0, Math.min (window.innerWidth - root.offsetWidth, left)) + 'px'; root.style.top = Math.max (0, Math.min (window.innerHeight - root.offsetHeight, top)) + 'px'; root.style.right = 'auto'; root.style.bottom = 'auto'; };
        handle.addEventListener ('pointerdown', event => { if (event.button !== 0) { return; } const bounds = root.getBoundingClientRect (), origin = { x : event.clientX, y : event.clientY, left : bounds.left, top : bounds.top }; handle.setPointerCapture (event.pointerId); const move = e => position (origin.left + e.clientX - origin.x, origin.top + e.clientY - origin.y); const end = () => { handle.removeEventListener ('pointermove', move); handle.removeEventListener ('pointerup', end); handle.removeEventListener ('pointercancel', end); handle.removeEventListener ('lostpointercapture', end); }; handle.addEventListener ('pointermove', move); handle.addEventListener ('pointerup', end); handle.addEventListener ('pointercancel', end); handle.addEventListener ('lostpointercapture', end); event.preventDefault (); });
        handle.addEventListener ('keydown', event => { const step = { ArrowLeft : [-10, 0], ArrowRight : [10, 0], ArrowUp : [0, -10], ArrowDown : [0, 10] }[event.key]; if (!step) { return; } event.preventDefault (); const bounds = root.getBoundingClientRect (); position (bounds.left + step[0], bounds.top + step[1]); });
        const placeLauncher = () => { const button = website.parameters.headerButtonsDiv.querySelector ('.header_fullscreen_button'); const header = website.parameters.headerDiv.getBoundingClientRect (), rect = button?.getBoundingClientRect (); launcher.style.top = Math.round ((rect?.bottom || header.bottom) + 5) + 'px'; launcher.style.right = Math.max (5, Math.round (window.innerWidth - (rect?.right || window.innerWidth - 5))) + 'px'; if (!root.hidden) { const bounds = root.getBoundingClientRect (); position (bounds.left, bounds.top); } };
        window.addEventListener ('resize', placeLauncher); const layoutObserver = new ResizeObserver (placeLauncher); layoutObserver.observe (website.parameters.headerDiv); const fullscreen = website.parameters.headerButtonsDiv.querySelector ('.header_fullscreen_button'); if (fullscreen) { layoutObserver.observe (fullscreen); } requestAnimationFrame (placeLauncher); let account = website.auth.user?.id || null; website.auth.Subscribe (user => { const next = user?.id || null; if (next !== account) { this.input.value = ''; this.drafts = { people : '', ai : '' }; this.peopleAgentDraft = false; this.peopleAgentDraftConversation = null; this.peopleDrafts.clear (); this.lastPeopleConversation = null; this.SetVisible (false); this.SetReadReplies (false); account = next; } this.UpdateIdentity (); }); this.aiHistory = new MessengerAIHistory (this); this.SetTab ('people'); this.BindAgentChannel ();
    }
    Inspect () { return { visible : !this.root.hidden, tab : this.tab, messagingConnected : this.people?.available === true, aiConnected : !!this.website.sessionEditor?.commandBar?.AgentConnected () }; }
    SetVisible (visible)
    {
        if (typeof visible !== 'boolean') { throw new Error ('Choose whether Messenger is visible.'); }
        if (visible && (!this.website.auth?.user || this.website.sessionEditor?.readOnly)) { throw new Error ('Sign in to an editable session to open Messenger.'); }
        if (!visible) { this.historyOpen = false; this.archive?.Close (); this.archive = null; this.historyButton.setAttribute ('aria-pressed', 'false'); this.input.disabled = this.tab !== 'ai'; this.send.disabled = this.tab !== 'ai'; this.StopDictation (); this.StopSpeech (); this.people?.Close (); this.people = null; } this.root.hidden = !visible; this.launcher.setAttribute ('aria-expanded', String (visible)); if (visible) { this.RenderConversation (); this.input.focus (); } return this.Inspect ();
    }
    SetTab (tab)
    {
        if (!['people', 'ai'].includes (tab)) { throw new Error ('Choose Messages or AI.'); }
        this.StopDictation (); this.archive?.Close (); this.archive = null; this.historyOpen = false; this.historyButton.setAttribute ('aria-pressed', 'false'); this.drafts[this.tab] = this.input.value; this.tab = tab; this.input.value = this.drafts[tab]; this.input.style.height = 'auto'; this.input.style.height = Math.min (this.input.scrollHeight, 180) + 'px'; for (const [id, button] of this.tabs) { button.setAttribute ('aria-selected', String (id === tab)); button.tabIndex = id === tab ? 0 : -1; }
        this.input.placeholder = tab === 'people' ? 'Select a conversation to write' : 'Ask about Auto3D'; this.input.disabled = tab !== 'ai'; this.send.disabled = tab !== 'ai'; this.RenderConversation (); this.RefreshDictationAvailability (); this.UpdateIdentity (); return this.Inspect ();
    }
    SetHistory (open)
    {
        if (typeof open !== 'boolean') { throw new Error ('Choose whether history is open.'); }
        if (this.root.hidden) { throw new Error ('Open Messenger first.'); }
        if (open === this.historyOpen) { return { open, tab : this.tab }; }
        this.StopDictation (); this.archive?.Close (); this.archive = null; this.historyOpen = open; this.historyButton.setAttribute ('aria-pressed', String (open));
        if (open) { const conversation = this.tab === 'people' ? this.people?.current : null; this.people?.Close (); this.people = null; this.input.disabled = true; this.send.disabled = true; this.RefreshDictationAvailability (); this.archive = new MessengerArchive (this, this.tab, conversation); }
        else { this.input.disabled = this.tab !== 'ai'; this.send.disabled = this.tab !== 'ai'; this.RenderConversation (); this.RefreshDictationAvailability (); }
        return { open, tab : this.tab };
    }
    BindAgentChannel ()
    {
        const bar = this.website.sessionEditor?.commandBar; if (!bar || this.agentBar === bar) { return; } this.agentBar = bar;
        bar.root.addEventListener ('auto3d-command-entry', event => { if (event.detail?.from === 'agent' && event.detail.kind === 'response') { this.SpeakAgentReply (event.detail.text); } this.aiHistory.Record (event.detail); });
    }
    RenderConversation ()
    {
        if (this.historyOpen) { return; }
        const oldTop = this.content.scrollTop, oldHeight = this.content.scrollHeight, preserveScroll = this.tab === 'ai' && this.aiHistory?.preserveScroll; if (this.aiHistory) { this.aiHistory.preserveScroll = false; }
        this.people?.Close (); this.people = null; this.content.replaceChildren (); if (this.tab !== 'ai') { if (!this.root.hidden && this.website.auth?.user) { this.people = new MessengerPeople (this); } else { this.content.textContent = 'Open Messenger to load conversations.'; } return; }
        this.BindAgentChannel (); const note = document.createElement ('p'); note.textContent = 'AI history is private to your account. A connected agent must respond; agent labels are reported by the client.'; this.content.appendChild (note);
        if (this.aiHistory?.error || this.aiHistory?.pending.length) { const status = document.createElement ('p'); status.setAttribute ('role', 'status'); status.textContent = this.aiHistory.error || 'Saving AI history…'; this.content.appendChild (status); if (this.aiHistory.error && this.aiHistory.pending.length) { const retry = document.createElement ('button'); retry.type = 'button'; retry.textContent = 'Retry saving'; retry.addEventListener ('click', () => this.aiHistory.Flush ()); this.content.appendChild (retry); } }
        if (this.aiHistory?.more) { const older = document.createElement ('button'); older.type = 'button'; older.textContent = 'Load older messages'; older.addEventListener ('click', () => this.aiHistory.Load (true)); this.content.appendChild (older); }
        const messages = new Map ([...(this.aiHistory?.items || []), ...(this.aiHistory?.pending || [])].map (entry => [entry.id, entry])); for (const entry of messages.values ()) { const row = document.createElement ('p'); const who = document.createElement ('strong'); who.textContent = entry.origin === 'agent' ? 'Agent: ' : (this.website.auth?.user?.email || 'You') + ': '; row.append (who, document.createTextNode (entry.body)); this.content.appendChild (row); } this.content.scrollTop = preserveScroll ? oldTop + this.content.scrollHeight - oldHeight : this.content.scrollHeight;
    }
    SendToAgent ()
    {
        const message = this.input.value.trim (); if (this.tab !== 'ai' || !message || !this.website.auth?.user || this.website.sessionEditor?.readOnly) { return; }
        if (this.aiHistory.pending.length >= 100) { this.voiceStatus.textContent = 'AI history is waiting to save. Retry before sending another message.'; return; }
        this.BindAgentChannel (); if (!this.agentBar) { return; } if (message.length > 2000) { this.voiceStatus.textContent = 'Agent messages are limited to 2,000 characters.'; return; }
        this.agentBar.SendToAgent (message); this.input.value = ''; this.drafts.ai = ''; this.input.dispatchEvent (new Event ('input', { bubbles : true })); this.RenderConversation ();
    }
    async Submit ()
    {
        if (this.tab === 'ai') { this.SendToAgent (); return; }
        const text = this.input.value.trim (), people = this.people; if (!text || !people || text.length > 4000) { return; } if (this.peopleAgentDraft && this.peopleAgentDraftConversation !== people.current) { people.status.textContent = 'Select the original conversation or clear this agent draft.'; return; }
        if (await people.Send (text) && this.people === people && this.tab === 'people' && this.input.value.trim () === text) { this.peopleDrafts.delete (people.current); this.input.value = ''; this.drafts.people = ''; this.peopleAgentDraft = false; this.input.dispatchEvent (new Event ('input', { bubbles : true })); }
    }
    async DraftForConversation (id, text)
    {
        if (!this.website.auth?.user || this.website.sessionEditor?.readOnly) { throw new Error ('Sign in to an editable session.'); } if (!text.trim ()) { throw new Error ('Enter a message draft.'); }
        const currentDraft = () => this.tab === 'people' ? this.input.value : this.drafts.people; if (currentDraft ().trim () || this.peopleDrafts.get (id)?.text.trim ()) { throw new Error ('Finish or clear the existing message draft first.'); }
        const owner = this.website.auth.user.id; const { conversations } = await this.service.List (); if (this.website.auth?.user?.id !== owner) { throw new Error ('Account changed.'); }
        if (!conversations.some (item => item.id === id && item.kind !== 'ai')) { throw new Error ('Conversation unavailable.'); }
        if (currentDraft ().trim () || this.peopleDrafts.get (id)?.text.trim ()) { throw new Error ('Finish or clear the existing message draft first.'); }
        this.SetVisible (true); this.SetTab ('people'); const people = this.people; people.current = id; this.lastPeopleConversation = id; await people.Refresh ();
        if (this.people !== people || !people.Valid () || people.current !== id) { throw new Error ('Conversation unavailable.'); }
        if (this.input.value.trim () || this.peopleDrafts.get (id)?.text.trim ()) { throw new Error ('Finish or clear the existing message draft first.'); }
        this.input.value = text; this.drafts.people = text; this.peopleAgentDraft = true; this.peopleAgentDraftConversation = id; this.input.dispatchEvent (new Event ('input', { bubbles : true })); people.status.textContent = 'Agent prepared a reply. Review it before pressing Send.'; this.input.focus (); return { prepared : true, sent : false, conversationId : id };
    }
    async LeaveConversation (id)
    {
        if (!this.website.auth?.user || this.website.sessionEditor?.readOnly) { throw new Error ('Sign in to an editable session.'); }
        if (navigator.userActivation?.isActive === false) { return { left : false, requiresUserGesture : true }; }
        if (!window.confirm ('Leave this conversation? You will lose access. If you are the last member, its messages will be deleted.')) { return { left : false }; }
        return this.service.Leave (id);
    }
    UpdateIdentity () { const user = this.website.auth?.user; const name = user?.email || user?.id || 'Signed-out user'; this.identity.textContent = (this.input.value.trim () ? 'Drafting as ' : 'Signed in as ') + name; }
    RefreshDictationAvailability () { if (!this.mic) { return; } this.mic.disabled = !this.speechSupported || this.input.disabled; if (this.mic.disabled) { this.StopDictation (); } }
    ToggleDictation ()
    {
        if (this.recognition) { this.StopDictation (); return; }
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition || this.root.hidden || this.input.disabled) { return; }
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
