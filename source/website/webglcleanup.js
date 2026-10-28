// A disposed Three.js renderer does not by itself release its browser WebGL
// context. Transient previews must release it before creating another one.
const intentionallyReleased = new WeakSet ();

export function ReleaseWebGLRenderer (renderer)
{
    if (!renderer) { return; }
    if (renderer.domElement) { intentionallyReleased.add (renderer.domElement); }
    try { renderer.dispose (); } finally { renderer.forceContextLoss?.(); }
}

export function IsIntentionallyReleasedWebGLContext (canvas)
{
    return Boolean (canvas && intentionallyReleased.has (canvas));
}
