# Auto3D Messenger: product and implementation outline

Status: local development. The floating AI tab shares the bottom command bar’s in-memory agent channel. Connected agents can read and respond through existing command-bar tools; this is not a model provider or persistent conversation service. Direct/group messaging remains disabled. No account data or messages have been migrated.

## Voice service research and foundation

The local Messenger shell offers user-initiated browser dictation into the editable draft and opt-in browser speech synthesis for future authenticated AI replies. Dictation stops when the tab changes, the window closes or the account changes; a transcript never sends or executes itself. Browser recognition has limited availability and may transmit audio to the browser's recognition provider, as explained in the UI. Playback is off by default, stops on close or sign-out, and the account change resets the setting. The speech playback hook reads replies from a connected agent through the session-only command-bar channel; it does not generate replies. Microphone activation requires the user's direct action and is not exposed as an agent command. Speech transcripts must pass the same untrusted-content and authorization checks as typed messages.

Recommendation: use browser capabilities as an inexpensive initial option, with clear availability and privacy disclosures. For consistent support, evaluate a server-mediated fallback with authenticated and rate-limited endpoints, short-lived processing, size/duration limits, explicit consent and provider-specific data handling. Cloudflare Workers AI offers Whisper transcription and TTS models, including Deepgram Aura; compare latency, language quality, pricing and processing/retention terms against other providers before selection. Browser speech synthesis can be sufficient initially; richer server voices are optional. Neither approach requires exposing provider keys in the browser. Never record silently or retain audio by default. Actual hardware, browser, language, denial and accessibility testing remains necessary.

Sources: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [MDN Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API), [Cloudflare Whisper](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/) and [Cloudflare model catalog](https://developers.cloudflare.com/workers-ai/models/).

## User experience

- A Messenger button near Full Screen opens a movable, resizable, non-modal window. Messages and AI tabs have separate drafts; the composer grows and can be resized. The view must stay reachable on mobile and not steal camera shortcuts while typing.
- Messages: discover approved users, start a one-to-one conversation or a named private group, see a chronological history, unread indicators and send status. Subsequent stages can add search, mentions, attachments, edits and read receipts. Group membership, invitation, leaving and removal must be explicit; no global directory exposure unless policy permits it.
- The shell shows the signed-in account and whether there is a local draft. Once messaging exists, each message must display its server-authenticated sender identity; typing indicators for other users must be conversation-scoped, ephemeral, optional and expire automatically. The local draft label is not a remote typing indicator.
- AI: a conversation linked to the user's account and explicitly selected app window/session. The user can inspect agent identity, connection and action results. Use the same validated commands and macros as the command bar; preserve conversation history and show which requested actions succeeded or failed. A command is not evidence that a human authorized a different command.
- When a live app is closed, the agent should clearly indicate which operations require a selected live window versus supported headless operations. AI chat should not claim a response or action completed when no agent or backend is connected.

## Messaging and storage

Use existing Auto3D authenticated accounts. A candidate design is server-mediated conversation, member, message and per-member read-cursor records. Enforce approved active accounts, conversation membership and role checks on every server read, send, group membership change, agent retrieval and realtime subscription. Scope all queries by immutable account IDs, support message pagination and idempotent send IDs, and treat account revocation, membership removal and logout as immediate access revocation. Decide retention, deletion, abuse controls, backup and administrator visibility before applying a migration. Avoid assuming all users share the same organization until an organization model exists.

Evaluate [Supabase private Realtime authorization](https://supabase.com/docs/guides/realtime/authorization) with membership-based RLS, plus authenticated Pages API routes for persistence; use private channels and server-authoritative membership checks. Apply RLS even with server access and verify the actual configured Data API grants. Establish limits, quotas, encryption at rest and a retention policy. This architecture does not promise end-to-end encryption: if agents can read server-stored content, end-to-end encryption requires a separate key-sharing design.

## Agent and AI security

Treat every message, attachment, retrieved page and tool result as untrusted content, not higher-priority instructions. A message author may request an action, but cannot give an agent permissions belonging to another member. Agents read only conversations and messages permitted to the authorizing user and the explicit connection grant. Group participants should be clearly informed when an agent is present and the scope of its access; prevent a private message in one conversation from becoming visible to another user or agent.

Authenticate and authorize every operation outside the model. Bind each action to the signed-in user, agent grant, selected app window, conversation, scope and current account state. Route through the strict command registry; enforce command schemas, read-only state and permissions server-side. Higher-impact operations retain explicit user approval where appropriate. Record who requested each action and its result without storing secrets. Deny out-of-scope or unauthorized requests with an actionable error and do not invoke tools.

No classifier, system prompt, or denylist can guarantee that every prompt-injection attempt is detected. Use layered controls, least privilege and structured tool calls, and test adversarial content without promoting it to instructions. See [OWASP prompt injection guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) and [OWASP agent security](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html).

## Delivery milestones

1. Floating shell and accessible tabs/composer; clearly disable sending until wired. Drafts exist only in memory until sign-out or reload; nothing is saved or sent.
2. Approved-account directory and direct/group conversations: migrations, authorization, send/read APIs, pagination, optimistic UI, private subscriptions, logout cleanup and multi-account isolation tests.
3. AI conversation persistence and a real AI or agent transport. MCP connections are client-initiated; an existing ChatGPT connection cannot be treated as a server-side LLM endpoint. Define an actual provider/agent bridge, correlation, reconnect, explicit window selection and error handling before promising responses.
4. Scope-limited agent tools to list permitted conversations, read authorized messages and post explicit replies. Connect model requests to the existing command and macro registry with action authorization and untrusted-content boundaries. No agent may send messages merely because it encountered a third-party instruction.
5. Retention and moderation/admin controls, audit, notifications, accessible/mobile interaction, operational limits, security tests, prompt-injection evaluation and actual multi-user/client verification. Add attachments and search only after storage, privacy and access controls are specified.

During development, stack changes on a shared draft PR and avoid production deployments or paid CI reruns until the relevant work is ready.
