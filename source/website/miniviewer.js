import { RestorePresentationCamera, SavedPresentationCamera } from './sharedpresentation.js';
import { ApplyCameraState } from './sessiontimeline.js';
import { HDRILighting } from '../engine/viewer/hdrilighting.js';
import { SceneEffects } from '../engine/viewer/sceneeffects.js';
import { GetBackgroundPreset } from '../engine/viewer/background.js';
import { HexStringToRGBAColor, RGBAColor } from '../engine/model/color.js';
import { PreparePackagingPresentations } from './packagingadapter.js';
import { OpenSessionArchive } from './sessionarchive.js';
import { ConvertModelToThreeObject, ModelToThreeConversionParams, ModelToThreeConversionOutput } from '../engine/threejs/threeconverter.js';
import { Viewer } from '../engine/viewer/viewer.js';
import { Direction } from '../engine/geometry/geometry.js';

const query = new URLSearchParams (location.search); const audience = query.has ('share'); const token = query.get ('share') || query.get ('view') || '';
let downloadAllowed = false; let accessCode = '';
const isToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test (token);
const stage = document.getElementById ('stage');
const notice = document.getElementById ('notice');
const heading = document.getElementById ('heading');
const launch = document.getElementById ('launch');
const accessForm = document.getElementById ('accessForm');
const pin = document.getElementById ('code');
const full = document.getElementById ('full');
const fullscreen = document.getElementById ('fullscreen');
let viewer = null; let loaded = false; let initialCamera = null; let appearanceWarning = '';
const sharePath = (audience ? '/api/audience/' : '/api/share/') + encodeURIComponent (token);

function Status (message) { notice.textContent = message; if (!notice.isConnected) { let status = document.getElementById ('viewerStatus'); if (!status) { status = document.createElement ('span'); status.id = 'viewerStatus'; status.setAttribute ('role', 'status'); document.getElementById ('viewerControls').appendChild (status); } status.textContent = message; } }
function ShowChallenge (required)
{
    accessForm.hidden = !required;
    launch.hidden = true;
    if (required) { pin.focus (); }
}

function Fit ()
{
    if (!viewer) { return; }
    viewer.Resize (Math.max (1, stage.clientWidth), Math.max (1, stage.clientHeight));
    viewer.Render ();
}

async function RenderArchive (buffer)
{
    const session = OpenSessionArchive (buffer);
    if (!session.document.objects.length) { throw new Error ('Shared model is empty.'); }
    const canvas = document.createElement ('canvas');
    canvas.className = 'model_canvas';
    stage.replaceChildren (canvas);
    viewer = new Viewer ();
    viewer.Init (canvas);
    Fit ();
    const output = new ModelToThreeConversionOutput ();
    const root = await new Promise ((resolve, reject) => {
        try { ConvertModelToThreeObject (session.document.model, new ModelToThreeConversionParams (), output, {
            onTextureLoaded : () => viewer.Render (),
            onError : reject, onModelLoaded : resolve
        }); } catch (error) { reject (error); }
    });
    for (let i = 0; i < session.document.objects.length; i++) {
        const object = session.document.objects[i];
        if (root.children[i]) { object.threeObject = root.children[i]; root.children[i].visible = object.visible; }
    }
    await PreparePackagingPresentations (session.document.objects, session.document.model.materials, session.document.model.GetUnit ());
    viewer.SetMainObject (root);
    viewer.SetUpVector (Direction.Y, false);
    const sphere = viewer.GetBoundingSphere (() => true);
    viewer.AdjustClippingPlanesToSphere (sphere);
    const view = session.view || {};
    const savedBackground = view.presentationBackground;
    const palette = GetBackgroundPreset (view.backgroundPreset, true);
    const colors = Array.isArray (savedBackground?.colors) && savedBackground.colors.length === 5 && savedBackground.colors.every (c => /^#[0-9a-f]{6}$/i.test (c)) ? savedBackground.colors : palette.colors;
    viewer.SetBackgroundColor (HexStringToRGBAColor (colors[0].slice (1) + 'ff'));
    const color = savedBackground?.color;
    if (color && ['r', 'g', 'b', 'a'].every (k => Number.isFinite (color[k]) && color[k] >= 0 && color[k] <= 255)) { viewer.SetBackgroundColor (new RGBAColor (color.r, color.g, color.b, color.a)); }
    const dome = view.horizonGradient === true && view.lighting?.mode !== 'hdri';
    viewer.SetBackgroundGradient (view.horizonGradient === true && !dome, savedBackground?.dark !== false, colors);
    viewer.SetDefaultDome (dome, colors);
    viewer.SetGroundGrid (view.showGroundGrid === true, palette.dark);
    const lighting = new HDRILighting (viewer);
    if (view.lighting?.mode === 'hdri' && /^[a-z0-9_]{1,80}$/.test (view.lighting.environment || '')) {
        try {
            const l = view.lighting;
            await lighting.Load ('/assets/hdri/' + l.environment + '.hdr');
            lighting.Adjust (...[['brightness', 0, 3, 1], ['rotation', -180, 180, 0], ['elevation', -90, 90, 0]].map (([key, min, max, fallback]) => Number.isFinite (l[key]) ? Math.max (min, Math.min (max, l[key])) : fallback));
            lighting.SetBackgroundVisible (l.background === true);
        } catch { appearanceWarning = 'Saved lighting could not load; default lighting is shown. '; }
    }
    const effects = new SceneEffects (viewer); effects.ApplyObjectSettings (session.document.objects); effects.Restore (view.lighting?.effects);
    if (!RestorePresentationCamera (viewer, view)) { viewer.FitSphereToWindow (sphere, false); }
    initialCamera = SavedPresentationCamera (viewer);
    Fit (); loaded = true;
    document.getElementById ('viewerControls').hidden = false;
    document.getElementById ('download').hidden = !downloadAllowed;
    Fit ();
}

async function OpenModel (code = '')
{
    Status ('Loading secure model…');
    const response = await fetch (sharePath + '/archive', {
        method : 'POST', credentials : 'same-origin', cache : 'no-store',
        headers : { 'Content-Type' : 'application/json' }, body : JSON.stringify ({ code })
    });
    if (!response.ok) {
        if (response.status === 429) { throw new Error ('Too many code attempts. Try again after ' + Math.ceil (Number (response.headers.get ('Retry-After') || 1800) / 60) + ' minutes.'); }
        if (response.status === 401) { ShowChallenge (true); throw new Error ('Incorrect code, missing sign-in, or unavailable model.'); }
        if (response.status === 403) { throw new Error ('Viewing permission denied.'); }
        if (response.status === 503) { throw new Error ('Protected model access is temporarily unavailable.'); }
        throw new Error ('Unable to load shared model (' + response.status + ').');
    }
    ShowChallenge (false);
    await RenderArchive (await response.arrayBuffer ()); accessCode = code; Status (appearanceWarning + 'Drag to rotate · Scroll or pinch to zoom');
    pin.value = '';
}

async function Initialize ()
{
    if (!isToken) { Status ('A valid model share link is required.'); return; }
    const url = new URL ('/', location.origin); url.searchParams.set ('view', token);
    full.href = url.href; if (audience) { full.hidden = true; }
    try {
        const response = await fetch (sharePath, { credentials : 'same-origin', cache : 'no-store' });
        if (response.status === 429) { throw new Error ('Too many code attempts. Try again after ' + Math.ceil (Number (response.headers.get ('Retry-After') || 1800) / 60) + ' minutes.'); }
        if (response.status === 401) { Status ('Sign in to Auto3D to access this shared model.'); launch.href = url.href; launch.hidden = false; return; }
        if (!response.ok) { Status ('Share link unavailable or expired.'); return; }
        const info = await response.json (); heading.textContent = info.name || 'Shared 3D model'; downloadAllowed = info.allowDownload === true;
        if (info.codeRequired) { Status ('Enter the four-digit access code to view this shared model.'); ShowChallenge (true); }
        else { await OpenModel (); }
    } catch (error) { Status (error.message); }
}

accessForm.addEventListener ('submit', async (event) => {
    event.preventDefault ();
    if (!/^\d{4}$/.test (pin.value)) { Status ('Enter exactly four digits.'); return; }
    const submit = accessForm.querySelector ('button[type=submit]'); submit.disabled = true;
    try { await OpenModel (pin.value); } catch (error) { Status (error.message); }
    finally { pin.value = ''; submit.disabled = false; }
});
document.getElementById ('download').addEventListener ('click', async () => {
    try { const response = await fetch (sharePath + '/download', { method : 'POST', credentials : 'same-origin', cache : 'no-store', headers : { 'Content-Type' : 'application/json' }, body : JSON.stringify ({ code : accessCode }) }); if (!response.ok) { throw new Error ('Download unavailable (' + response.status + ').'); } const url = URL.createObjectURL (await response.blob ()); const link = document.createElement ('a'); link.href = url; link.download = 'Auto3D-shared-model.auto3d'; link.click (); setTimeout (() => URL.revokeObjectURL (url), 1000); } catch (error) { Status (error.message); }
});
fullscreen.addEventListener ('click', () => stage.requestFullscreen?.());
document.getElementById ('resetView').addEventListener ('click', () => { if (loaded && initialCamera) { ApplyCameraState (viewer, initialCamera); } });
document.getElementById ('fit').addEventListener ('click', () => {
    if (!loaded || !viewer) { return; }
    viewer.FitAllToWindow (true);
});
window.addEventListener ('resize', Fit);
new ResizeObserver (Fit).observe (stage);
Initialize ();
