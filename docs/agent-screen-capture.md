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

In Auto3D, open Preferences → **Agent access** and choose **Connect this window**. Copy the generated app window code, then paste it into the optional **App window code** field on the Auto3D OAuth authorization page for the harness. Approving authorization pairs that client with the currently active app session. Codes are random, expire after 10 minutes, and can be used once. If omitted, use the MCP `auto3d.sessions.list` and `auto3d.sessions.select` tools to choose a window and session manually.

The same authorization and pairing flow works for OAuth-compatible harnesses such as ChatGPT and Claude; the registration page records which harness is being authorized. This does not bypass OAuth consent, grant broader scopes, or provide an API key. Keep the temporary code private and reconnect to issue a fresh code if it expires or has already been used.

Users can also search “capture” in Commands and macros, run Capture app screenshot, preview the image and download PNG. Macros can capture after modeling steps. Image bytes are omitted from the textual results panel and previews are omitted from subsequent captures.

Capture requires a signed-in, ready account; logout, recovery and identity changes during capture reject the result. Workspace captures omit all input/textarea values, password wrappers (including passwords revealed with the eye button), account/login/request/admin dialogs and elements marked `data-capture-private`. Viewport capture contains only the rendered scene. Loaded model names, visible text and model geometry may still be visible; capture only content authorized for the chat. External cross-origin images/fonts that cannot be read may be omitted or cause capture to fail. Local app assets are covered by the browser verification.

Verification: `npm test` and `node test/browser/capture.mjs` against the local development server. Browser tests use a mock account, never production credentials.
