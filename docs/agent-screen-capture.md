# Agent screen capture

Use `capture.image` on the signed-in Auto3D page. `scope: "viewport"` captures the 3D scene; `scope: "workspace"` captures the visible application, including the Packaging editor and panels. This is app capture, not desktop capture. `maxSize` is an integer from 256 to 2048 (default 1600); the aspect ratio is preserved and images are capped at 16 MiB.

```js
const response = await window.Auto3D.execute('capture.image', {
  scope: 'workspace', maxSize: 1600
});
if (!response.ok) throw new Error(response.error.message);
// Forward these image content blocks to the agent/chat tool result.
return { content: response.result.content };
```

The result includes PNG MIME type, width, height, scope, timestamp, filename and standard MCP image content (`type: "image", mimeType, data`). Forward image blocks as images, not JSON text. In this chat's tool environment, use `image(result.content[0])`; other clients use their image attachment mechanism. Images are not uploaded, stored in account Library, or sent to a chat automatically.

For an agent with an already authorized Playwright page, `tools/agent_capture.mjs` exports `CaptureForChat(page, options)` and returns an MCP-compatible image tool result. The adapter invokes only the stable capture command. It neither starts a remote-control server nor obtains login cookies. A connected browser tool or authenticated MCP bridge must supply the live page; the deployed website alone cannot access a chat conversation. Never expose unauthenticated browser debugging ports.

## Pair an MCP chat with an app window

Sign in to Auto3D and approve the OAuth connection. One approval includes every read/write tool and screenshots. To share a window, open Preferences → **Agent access** and choose **Live Control**. The agent can list connected windows with `auto3d.sessions.list` and select the intended active session with `auto3d.sessions.select`. There is no separate screenshot preference. Code-based pairing remains available through `agent.access.connect` and `auto3d.sessions.pair_code` for clients that use it; codes expire after 10 minutes and can be used once.

The same authorization and pairing flow works for OAuth-compatible clients such as ChatGPT and Claude. The single approval includes `auto3d.read`, `auto3d.write` and `auto3d.capture`. Old restricted grants must reconnect through OAuth once to approve this permission set; refreshing an old token does not expand its permissions. `auto3d.capabilities.inspect` reports effective permissions and reconnection guidance. Account and administrator commands still require the appropriate Auto3D permissions. Disconnect or revoke the agent to stop access.

For efficient agent operation, `tools/list` stays compact. With `auto3d.write`, the agent gets `auto3d.commands.categories`, `auto3d.commands.list`, and `auto3d.commands.invoke` rather than all command definitions at once. The agent can list categories, request one category or search results (up to 25 commands per page), then invoke a command using its returned schema. It should inspect the app state after changes and request more catalog pages only when needed. The MCP pilot guide documents this workflow.

Users can also search “capture” in Commands and macros, run Capture app screenshot, preview the image and download PNG. Macros can capture after modeling steps. Image bytes are omitted from the textual results panel and previews are omitted from subsequent captures.

Capture requires a signed-in, ready account; logout, recovery and identity changes during capture reject the result. Workspace captures omit all input/textarea values, password wrappers (including passwords revealed with the eye button), account/login/request/admin dialogs and elements marked `data-capture-private`. Viewport capture contains only the rendered scene. Loaded model names, visible text and model geometry may still be visible; capture only content authorized for the chat. External cross-origin images/fonts that cannot be read may be omitted or cause capture to fail. Local app assets are covered by the browser verification.

Verification: `npm test` and `node test/browser/capture.mjs` against the local development server. Browser tests use a mock account, never production credentials.
