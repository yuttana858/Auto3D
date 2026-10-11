import { OpenSessionArchive } from './sessionarchive.js';
import { ConvertModelToThreeObject, ModelToThreeConversionParams, ModelToThreeConversionOutput } from '../engine/threejs/threeconverter.js';
import { Viewer } from '../engine/viewer/viewer.js';
import { Direction } from '../engine/geometry/geometry.js';

const token = new URLSearchParams (location.search).get ('view') || '';
const isToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test (token);
const stage = document.getElementById ('stage');
const notice = document.getElementById ('notice');
const heading = document.getElementById ('heading');
const launch = document.getElementById ('launch');
const accessForm = document.getElementById ('accessForm');
const pin = document.getElementById ('code');
const full = document.getElementById ('full');
const fullscreen = document.getElementById ('fullscreen');
let viewer = null; let loaded = false;
const sharePath = '/api/share/' + encodeURIComponent (token);

function Status (message) { notice.textContent = message; }
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
            onModelLoaded : resolve
        }); } catch (error) { reject (error); }
    });
    for (let i = 0; i < session.document.objects.length; i++) {
        const object = session.document.objects[i];
        if (root.children[i]) { root.children[i].visible = object.visible; }
    }
    viewer.SetMainObject (root);
    viewer.SetUpVector (Direction.Y, false);
    const sphere = viewer.GetBoundingSphere (() => true);
    viewer.AdjustClippingPlanesToSphere (sphere);
    viewer.FitSphereToWindow (sphere, false);
    Fit (); loaded = true;
    document.getElementById ('viewerControls').hidden = false;
    document.getElementById ('download').hidden = true;
}

async function OpenModel (code = '')
{
    Status ('Loading secure model…');
    const response = await fetch (sharePath + '/archive', {
        method : 'POST', credentials : 'same-origin', cache : 'no-store',
        headers : { 'Content-Type' : 'application/json' }, body : JSON.stringify ({ code })
    });
    if (!response.ok) {
        if (response.status === 401) { ShowChallenge (true); throw new Error ('Incorrect code, missing sign-in, or unavailable model.'); }
        if (response.status === 403) { throw new Error ('Viewing permission denied.'); }
        if (response.status === 503) { throw new Error ('Protected model access is temporarily unavailable.'); }
        throw new Error ('Unable to load shared model (' + response.status + ').');
    }
    ShowChallenge (false);
    await RenderArchive (await response.arrayBuffer ());
    pin.value = '';
}

async function Initialize ()
{
    if (!isToken) { Status ('A valid model share link is required.'); return; }
    const url = new URL ('/', location.origin); url.searchParams.set ('view', token);
    full.href = url.href;
    try {
        const response = await fetch (sharePath, { credentials : 'same-origin', cache : 'no-store' });
        if (response.status === 401) { Status ('Sign in to Auto3D to access this shared model.'); launch.href = url.href; launch.hidden = false; return; }
        if (!response.ok) { Status ('Share link unavailable or expired.'); return; }
        const info = await response.json (); heading.textContent = info.name || 'Shared 3D model';
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
fullscreen.addEventListener ('click', () => stage.requestFullscreen?.());
document.getElementById ('fit').addEventListener ('click', () => {
    if (!loaded || !viewer) { return; }
    const sphere = viewer.GetBoundingSphere (() => true);
    viewer.FitSphereToWindow (sphere, true);
});
window.addEventListener ('resize', Fit);
Initialize ();
