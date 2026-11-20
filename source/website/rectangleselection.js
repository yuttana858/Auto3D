import * as THREE from 'three';
import { Coord2D } from '../engine/geometry/coord2d.js';

const Faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
const ClipPlanes = [p => p.w + p.x, p => p.w - p.x, p => p.w + p.y, p => p.w - p.y, p => p.w + p.z, p => p.w - p.z];

export function SelectionRectangle ({ x1, y1, x2, y2 })
{
    if (![x1, y1, x2, y2].every (value => Number.isFinite (value) && value >= 0 && value <= 1) || x1 === x2 || y1 === y2) { throw new Error ('Use a nonempty rectangle with viewport coordinates from 0 to 1.'); }
    return { x1 : Math.min (x1, x2), y1 : Math.min (y1, y2), x2 : Math.max (x1, x2), y2 : Math.max (y1, y2) };
}

function ClipPolygon (points, distance)
{
    const result = [];
    for (let index = 0; index < points.length; index++) {
        const a = points[index], b = points[(index + 1) % points.length], da = distance (a), db = distance (b);
        if (da >= 0) { result.push (a); }
        if ((da < 0) !== (db < 0)) { result.push (a.clone ().lerp (b, da / (da - db))); }
    }
    return result;
}

// Project the visible portion of an object's bounds. Clipping before division by
// w keeps geometry behind the camera or crossing the near plane from mirroring
// across the viewport or producing infinite selection rectangles.
export function ProjectSelectionBounds (bounds, camera)
{
    if (bounds.isEmpty () || ![...bounds.min.toArray (), ...bounds.max.toArray ()].every (Number.isFinite)) { return null; }
    camera.updateMatrixWorld ();
    const matrix = new THREE.Matrix4 ().multiplyMatrices (camera.projectionMatrix, camera.matrixWorldInverse);
    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) { for (const y of [bounds.min.y, bounds.max.y]) { for (const z of [bounds.min.z, bounds.max.z]) { corners.push (new THREE.Vector4 (x, y, z, 1).applyMatrix4 (matrix)); } } }
    const projected = [];
    for (const face of Faces) {
        let points = face.map (index => corners[index]);
        for (const plane of ClipPlanes) { points = ClipPolygon (points, plane); if (!points.length) { break; } }
        for (const point of points) { if (point.w > 0 && Number.isFinite (point.w)) { projected.push ([(point.x / point.w + 1) / 2, (1 - point.y / point.w) / 2]); } }
    }
    if (!projected.length) {
        // A very large bound can contain the entire view frustum, with none of
        // its faces inside it. Its projected volume still covers the viewport.
        if (bounds.containsPoint (new THREE.Vector3 (0, 0, -1).unproject (camera))) { return { x1 : 0, y1 : 0, x2 : 1, y2 : 1 }; }
        return null;
    }
    const xs = projected.map (p => p[0]), ys = projected.map (p => p[1]);
    if (![...xs, ...ys].every (Number.isFinite)) { return null; }
    const clamp = value => Math.max (0, Math.min (1, value));
    return { x1 : clamp (Math.min (...xs)), y1 : clamp (Math.min (...ys)), x2 : clamp (Math.max (...xs)), y2 : clamp (Math.max (...ys)) };
}

export function VisibleSelectionBounds (root)
{
    const bounds = new THREE.Box3 ();
    if (!root?.visible) { return bounds; }
    root.updateWorldMatrix (true, true);
    root.traverseVisible (node => {
        if (!node.geometry || node.material && !(Array.isArray (node.material) ? node.material : [node.material]).some (material => material.visible !== false)) { return; }
        let local;
        if (node.isSkinnedMesh || node.isInstancedMesh) { node.computeBoundingBox (); local = node.boundingBox; }
        else { if (!node.geometry.boundingBox) { node.geometry.computeBoundingBox (); } local = node.geometry.boundingBox; }
        if (local && !local.isEmpty ()) { bounds.union (local.clone ().applyMatrix4 (node.matrixWorld)); }
    });
    return bounds;
}

export function ObjectsInSelectionRectangle (objects, camera, rectangle)
{
    const rect = SelectionRectangle (rectangle);
    return objects.filter (object => {
        if (object.visible === false || !object.threeObject?.visible) { return false; }
        const projected = ProjectSelectionBounds (VisibleSelectionBounds (object.threeObject), camera);
        return projected && projected.x2 >= rect.x1 && projected.x1 <= rect.x2 && projected.y2 >= rect.y1 && projected.y1 <= rect.y2;
    });
}

export class RectangleSelection
{
    constructor (editor)
    {
        this.editor = editor; this.website = editor.website; this.canvas = this.website.viewer.renderer.domElement; this.active = false; this.drag = null; this.listeners = [];
        this.overlay = document.createElement ('div'); this.overlay.className = 'rectangle_selection_overlay'; this.overlay.hidden = true; this.overlay.setAttribute ('aria-hidden', 'true'); this.overlay.style.position = 'fixed'; this.overlay.style.pointerEvents = 'none'; document.body.appendChild (this.overlay);
        const listen = (target, event, callback, options = true) => { target.addEventListener (event, callback, options); this.listeners.push (() => target.removeEventListener (event, callback, options)); };
        listen (this.canvas, 'pointerdown', event => this.Down (event));
        listen (this.canvas, 'pointermove', event => this.Move (event));
        listen (this.canvas, 'pointerup', event => this.Up (event));
        listen (this.canvas, 'pointercancel', () => this.Cancel ());
        listen (this.canvas, 'lostpointercapture', () => this.Cancel ());
        listen (this.canvas, 'mousedown', event => { if (this.drag && event.button === 0) { event.preventDefault (); event.stopImmediatePropagation (); } });
        for (const name of ['touchstart', 'touchmove']) { listen (this.canvas, name, event => { if (this.drag) { event.preventDefault (); event.stopImmediatePropagation (); } }, { capture : true, passive : false }); }
        listen (this.canvas, 'wheel', () => this.Cancel (), { capture : true, passive : true });
        listen (window, 'blur', () => this.Cancel ()); listen (window, 'resize', () => this.Cancel ());
        listen (window, 'scroll', () => this.Cancel ());
        listen (document, 'visibilitychange', () => { if (document.hidden) { this.Cancel (); } });
        listen (document, 'keydown', event => { if (event.key === 'Escape' && this.active && !this.ModalOpen ()) { event.preventDefault (); event.stopImmediatePropagation (); this.SetActive (false); } });
        this.owner = this.website.auth?.user?.id || null;
        this.unsubscribe = this.website.auth?.Subscribe?.(user => { const owner = user?.id || null; if (owner !== this.owner) { this.owner = owner; this.SetActive (false); } });
    }
    ModalOpen () { return Boolean (document.querySelector ('dialog[open]')); }
    Available ()
    {
        return !this.editor.busy && (!this.website.auth || Boolean (this.website.auth.user)) && this.website.accountReady !== false && !this.website.dimensions?.active && !this.editor.facing?.active && !this.website.measureTool?.IsActive?.() && !this.ModalOpen () && !document.body.classList.contains ('auth_locked');
    }
    Inspect () { return { active : this.active, dragging : Boolean (this.drag), coordinates : 'normalized-viewport', hitTest : 'intersecting-visible-object-bounds', includesOccluded : true }; }
    SetActive (active)
    {
        if (typeof active !== 'boolean') { throw new Error ('Set rectangle selection active to true or false.'); }
        if (active && this.website.auth && !this.website.auth.user) { throw new Error ('Sign in before selecting objects.'); }
        if (active && (this.editor.busy || this.website.accountReady === false || this.ModalOpen ())) { throw new Error ('Wait for an idle viewer before selecting objects.'); }
        if (active) { this.editor.SetMode ('select'); this.editor.facing?.Stop?.(); this.website.measureTool?.SetActive (false); }
        const wasActive = this.active; this.Cancel ();
        if (active && !wasActive) { this.previousCursor = this.canvas.style.cursor; this.previousTouchAction = this.canvas.style.touchAction; }
        this.active = active;
        if (active) { this.canvas.style.cursor = 'crosshair'; this.canvas.style.touchAction = 'none'; }
        else if (wasActive) { this.canvas.style.cursor = this.previousCursor || ''; this.canvas.style.touchAction = this.previousTouchAction || ''; }
        this.editor.RefreshButtons?.();
        if (active) { this.editor.Status?.('Rectangle selection: drag over models. Shift or Ctrl adds; Alt removes. Escape closes the tool.'); }
        return this.Inspect ();
    }
    Select ({ mode = 'replace', expandGroups = true, ...rectangle })
    {
        if (!['replace', 'add', 'subtract'].includes (mode) || typeof expandGroups !== 'boolean') { throw new Error ('Choose a valid selection mode and group setting.'); }
        if (!this.Available ()) { throw new Error ('Wait for an idle viewer before selecting objects.'); }
        const rect = SelectionRectangle (rectangle), hits = ObjectsInSelectionRectangle (this.editor.document.objects, this.website.viewer.camera, rect);
        this.editor.SetSelection (hits, { mode, expandGroups });
        const objectIds = this.editor.SelectedObjects ().map (object => object.id);
        this.editor.Status?.(objectIds.length + ' object' + (objectIds.length === 1 ? '' : 's') + ' selected.');
        return { ...this.Inspect (), rectangle : rect, mode, hitObjectIds : hits.map (object => object.id), objectIds, selectedObjectId : this.editor.selected?.id || null };
    }
    CameraKey ()
    {
        const camera = this.website.viewer.camera; camera.updateMatrixWorld ();
        return [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements].join (',');
    }
    Down (event)
    {
        if (!this.active) { return; }
        if (event.button !== 0 || event.isPrimary === false) { this.Cancel (); return; }
        if (this.drag || !this.Available () || this.editor.mode !== 'select' || this.website.viewer.navigation.spacePan) { return; }
        const rect = this.canvas.getBoundingClientRect ();
        if (rect.width <= 0 || rect.height <= 0) { return; }
        const point = this.Point (event, rect);
        event.preventDefault (); event.stopImmediatePropagation (); this.website.viewer.navigation.clickDetector.Cancel ();
        this.drag = { pointer : event.pointerId, document : this.editor.document, owner : this.website.auth?.user?.id || null, rect, start : point, end : point, camera : this.CameraKey (), mode : event.altKey ? 'subtract' : event.ctrlKey || event.metaKey || event.shiftKey ? 'add' : 'replace', modifiers : { ctrlKey : event.ctrlKey || event.shiftKey, metaKey : event.metaKey, shiftKey : event.shiftKey }, objects : this.editor.document.objects.map (object => [object, object.threeObject]) };
        this.overlay.dataset.mode = this.drag.mode;
        this.canvas.setPointerCapture (event.pointerId);
    }
    Point (event, rect) { return { x : Math.max (0, Math.min (rect.width, event.clientX - rect.left)), y : Math.max (0, Math.min (rect.height, event.clientY - rect.top)) }; }
    ValidDrag ()
    {
        const drag = this.drag, rect = this.canvas.getBoundingClientRect ();
        return drag && this.active && this.Available () && this.editor.mode === 'select' && drag.document === this.editor.document && drag.owner === (this.website.auth?.user?.id || null) && ['left', 'top', 'width', 'height'].every (key => Math.abs (rect[key] - drag.rect[key]) < .5) && drag.camera === this.CameraKey () && drag.objects.length === this.editor.document.objects.length && drag.objects.every (([object, rendered], index) => object === this.editor.document.objects[index] && rendered === object.threeObject);
    }
    Move (event)
    {
        if (!this.drag || event.pointerId !== this.drag.pointer) { return; }
        event.preventDefault (); event.stopImmediatePropagation ();
        if (!this.ValidDrag ()) { this.Cancel (); return; }
        const drag = this.drag; drag.end = this.Point (event, drag.rect);
        const left = Math.min (drag.start.x, drag.end.x), top = Math.min (drag.start.y, drag.end.y), width = Math.abs (drag.start.x - drag.end.x), height = Math.abs (drag.start.y - drag.end.y);
        this.overlay.hidden = Math.hypot (width, height) < 4;
        Object.assign (this.overlay.style, { left : drag.rect.left + left + 'px', top : drag.rect.top + top + 'px', width : width + 'px', height : height + 'px' });
    }
    Up (event)
    {
        if (!this.drag || event.pointerId !== this.drag.pointer) { return; }
        this.Move (event); const drag = this.drag; this.Cancel ();
        if (!drag) { return; }
        if (Math.hypot (drag.end.x - drag.start.x, drag.end.y - drag.start.y) < 4) {
            if (drag.mode === 'subtract') { return; }
            this.website.viewer.navigation.Click (1, new Coord2D (drag.end.x, drag.end.y), drag.modifiers); return;
        }
        if (drag.end.x === drag.start.x || drag.end.y === drag.start.y) { return; }
        try { this.Select ({ x1 : drag.start.x / drag.rect.width, y1 : drag.start.y / drag.rect.height, x2 : drag.end.x / drag.rect.width, y2 : drag.end.y / drag.rect.height, mode : drag.mode }); }
        catch (error) { this.editor.Status?.(error.message); }
    }
    Cancel ()
    {
        const drag = this.drag; this.drag = null; this.overlay.hidden = true;
        if (drag && this.canvas.hasPointerCapture?.(drag.pointer)) { this.canvas.releasePointerCapture (drag.pointer); }
        if (drag) { this.website.viewer.navigation.clickDetector.Cancel (); }
    }
    Dispose ()
    {
        this.SetActive (false); for (const remove of this.listeners) { remove (); }
        if (typeof this.unsubscribe === 'function') { this.unsubscribe (); } this.overlay.remove ();
    }
}
