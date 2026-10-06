# AI Generative integration

Auto3D routes external generative-AI requests through same-origin endpoints under `/api/ai/*`. Meshy is the first provider adapter.

## Why the proxy is required

Meshy does not permit browser CORS requests to its public API. The browser therefore calls the Auto3D Pages Function, which forwards allow-listed requests to Meshy and returns JSON to the UI.

Generated GLB downloads are also streamed through `/api/ai/model` so Auto3D can import the signed result without relying on cross-origin asset access.

## Personal API key

Open **Preferences → AI connections** and select **Meshy**.

- Auto3D AI proxy: `/api/ai`
- Meshy API key: enter a personal `msy_...` key
- **Remember key on this device** is optional

The key is sent only to Auto3D's same-origin proxy in the `X-Auto3D-AI-Key` request header. It is not written into `.auto3d` session archives.

Browser persistence is appropriate for personal/local use only. Leave **Remember key** disabled on shared computers.

## Deployment-level key

A deployment may provide a server-side Meshy key:

- `MESHY_API_KEY`: Meshy bearer token
- `AUTO3D_AI_ALLOW_SHARED_KEY=true`: explicitly allows the server key to be used when the browser does not provide a personal key
- `MESHY_API_BASE_URL`: optional override used for testing; defaults to `https://api.meshy.ai`

Shared-key mode is deliberately disabled unless `AUTO3D_AI_ALLOW_SHARED_KEY` is set to `true`. A public deployment with a shared key can spend provider credits for any visitor, so production use should additionally sit behind authenticated access and provider-side credit limits.

## Current Text to 3D flow

1. Enter a prompt (maximum 800 characters).
2. Choose an output detail budget:
   - Smart · 4k faces
   - Smart · 10k faces
   - Balanced · 30k faces
   - Detailed · 75k faces
   - High · 150k faces
3. Choose whether PBR maps should be generated during refine.
4. Click **Text to 3D**.
5. Auto3D creates a Meshy preview task and polls its task endpoint, respecting `Retry-After` when provided.
6. Progress and the resulting thumbnail appear under **Latest creations**.
7. A successful preview can be:
   - **Imported as GLB** immediately, or
   - **Refined** to generate textures/PBR and then imported.
8. **Import GLB** downloads the result through Auto3D and appends it to the current session.

The standard presets use Meshy's current `latest` Text to 3D model with remeshing and an explicit target polygon count. Smart presets use `smart-topology`, `meshy-t2`, triangle topology and an explicit face target. Auto3D does not use Meshy's deprecated `lowpoly` mode.

## Proxy routes

- `GET /api/ai/balance`
- `POST /api/ai/text-to-3d`
- `GET /api/ai/text-to-3d`
- `GET /api/ai/text-to-3d/:id`
- `GET /api/ai/image-to-3d` (recent-task listing)
- `GET /api/ai/model?url=<signed Meshy GLB URL>`

The model proxy only accepts HTTPS URLs whose host is exactly `assets.meshy.ai`.

## Next provider actions

The UI already reserves actions for Image to 3D, Text to image and Texture generation. Those should reuse the same task cards, progress model and import pipeline rather than creating separate UI systems.
