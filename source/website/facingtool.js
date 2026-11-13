import * as THREE from 'three';
import { Direction } from '../engine/geometry/geometry.js';

// Assign facing: show the selected model's footprint as a glowing blue ground rectangle with Front and Up arrows,
// let the user click a face of its bounding box to make it the Front (or, in Up mode / Shift+click, the Up side),
// and turn the model so that side points to the world front (toward the default camera) or world up.

export const FacingAxes = Object.freeze (['+x', '-x', '+y', '-y', '+z', '-z']);
const Glow = 0x3fa9ff, UpColor = 0x5ad17a;

export function AxisVector (name)
{
    if (!FacingAxes.includes (name)) { throw new Error ('Choose an axis: ' + FacingAxes.join (', ') + '.'); }
    const vector = new THREE.Vector3 (); vector[name[1]] = name[0] === '-' ? -1 : 1; return vector;
}
export function AxisName (vector)
{
    const components = [['x', vector.x], ['y', vector.y], ['z', vector.z]]; const [axis, value] = components.reduce ((best, item) => Math.abs (item[1]) > Math.abs (best[1]) ? item : best);
    return (value < 0 ? '-' : '+') + axis;
}
// World up from the viewer's up vector, and world front toward the default camera for that up vector.
export function WorldFrame (upVector)
{
    const direction = upVector?.direction ?? Direction.Y, sign = upVector?.isFlipped ? -1 : 1;
    const up = new THREE.Vector3 (direction === Direction.X ? sign : 0, direction === Direction.Y ? sign : 0, direction === Direction.Z ? sign : 0);
    const front = direction === Direction.Y ? new THREE.Vector3 (0, 0, 1) : new THREE.Vector3 (0, -1, 0);
    return { up, front };
}
// Smallest rotation that turns `from` onto `to`; opposite directions turn half way around `pivot`.
export function TurnOnto (from, to, pivot)
{
    const a = from.clone ().normalize (), b = to.clone ().normalize ();
    if (a.dot (b) < -1 + 1e-9) { return new THREE.Quaternion ().setFromAxisAngle (pivot.clone ().normalize (), Math.PI); }
    return new THREE.Quaternion ().setFromUnitVectors (a, b);
}

export class FacingTool
{
    constructor (editor)
    {
        this.editor = editor; this.website = editor.website; this.object = null; this.mode = 'front'; this.hover = null; this.group = null; this.bar = null;
        this.onMove = event => this.Hover (event);
        this.onKey = event => { if (event.key === 'Escape' && this.active) { event.preventDefault (); event.stopPropagation (); this.Stop (); } };
    }
    get active () { return Boolean (this.object); }
    Frame () { return WorldFrame (this.website.viewer.upVector); }

    Start (object = this.editor.selected)
    {
        if (this.editor.readOnly) { throw new Error ('This session is read-only.'); }
        if (!object?.threeObject) { throw new Error ('Select a model to assign its facing.'); }
        if (this.active) { this.Stop (); }
        this.object = object; this.mode = 'front'; this.hover = null;
        this.group = new THREE.Group (); this.group.name = 'auto3d-facing-overlay'; this.website.viewer.scene.add (this.group);
        this.BuildBar (); this.Refresh ();
        this.website.viewer.GetCanvas ().addEventListener ('pointermove', this.onMove);
        window.addEventListener ('keydown', this.onKey, true);
        this.editor.Status ('Assign facing · click a face to make it the Front · Up mode or Shift+click sets Up');
        return this.Inspect ();
    }
    Stop ()
    {
        if (!this.active) { return this.Inspect (); }
        this.website.viewer.GetCanvas ().removeEventListener ('pointermove', this.onMove);
        window.removeEventListener ('keydown', this.onKey, true);
        this.ClearGroup (); this.website.viewer.scene.remove (this.group); this.group = null;
        this.bar?.remove (); this.bar = null; this.object = null; this.hover = null; this.website.viewer.Render ();
        return this.Inspect ();
    }
    SetMode (mode)
    {
        if (!['front', 'up'].includes (mode)) { throw new Error ('Mode must be front or up.'); }
        this.mode = mode; this.bar?.querySelectorAll ('[data-facing-mode]').forEach (button => button.setAttribute ('aria-pressed', String (button.dataset.facingMode === mode))); this.DrawHover ();
        return this.Inspect ();
    }
    Inspect ()
    {
        const frame = this.Frame (); let stored = null;
        try { stored = this.object?.userData?._auto3dFacing ? JSON.parse (this.object.userData._auto3dFacing) : null; } catch { stored = null; }
        // World-space extent (x, y, z) and floor offset of the model while assigning, in model units.
        let world = null; if (this.active) { const box = this.Bounds (); if (!box.isEmpty ()) { const size = box.getSize (new THREE.Vector3 ()), axis = AxisName (frame.up)[1]; world = { size : size.toArray ().map (value => Number (value.toFixed (4))), floor : Number ((frame.up[axis] > 0 ? box.min[axis] : -box.max[axis]).toFixed (4)) }; } }
        return { active : this.active, objectId : this.object?.id ?? null, mode : this.mode, hover : this.hover ? AxisName (this.hover.normal) : null, worldFront : AxisName (frame.front), worldUp : AxisName (frame.up), assigned : stored, world };
    }

    // Bounds of the model in world space, recomputed after every turn.
    Bounds () { return new THREE.Box3 ().setFromObject (this.object.threeObject, true); }
    ClearGroup () { if (!this.group) { return; } this.group.traverse (item => { item.geometry?.dispose (); item.material?.dispose?.(); }); this.group.clear (); }
    Refresh ()
    {
        if (!this.active) { return; }
        this.ClearGroup (); const box = this.Bounds (); if (box.isEmpty ()) { return; }
        const { up, front } = this.Frame (); const size = box.getSize (new THREE.Vector3 ()), center = box.getCenter (new THREE.Vector3 ());
        const upAxis = AxisName (up)[1], floor = center.clone (); floor[upAxis] = up[upAxis] > 0 ? box.min[upAxis] : box.max[upAxis];
        const extent = Math.max (size.x, size.y, size.z, 1e-6);
        // Ground rectangle: the footprint across the two horizontal axes, slightly enlarged so it reads as a glow.
        const horizontal = ['x', 'y', 'z'].filter (axis => axis !== upAxis), pad = extent * 0.06;
        const width = size[horizontal[0]] + pad * 2, depth = size[horizontal[1]] + pad * 2;
        const plane = new THREE.Mesh (new THREE.PlaneGeometry (width, depth), new THREE.MeshBasicMaterial ({ color : Glow, transparent : true, opacity : 0.22, side : THREE.DoubleSide, depthWrite : false }));
        const planeNormal = new THREE.Vector3 (0, 0, 1); plane.quaternion.setFromUnitVectors (planeNormal, up); plane.position.copy (floor);
        const axisU = new THREE.Vector3 (), axisV = new THREE.Vector3 (); axisU[horizontal[0]] = 1; axisV[horizontal[1]] = 1;
        // PlaneGeometry lies along its local X/Y; align local X with the first horizontal axis.
        const localX = new THREE.Vector3 (1, 0, 0).applyQuaternion (plane.quaternion); if (Math.abs (localX.dot (axisU)) < 0.5) { plane.rotateZ (Math.PI / 2); }
        plane.renderOrder = 10; this.group.add (plane);
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map (([u, v]) => floor.clone ().addScaledVector (axisU, u * width / 2).addScaledVector (axisV, v * depth / 2));
        const outline = new THREE.LineLoop (new THREE.BufferGeometry ().setFromPoints (corners), new THREE.LineBasicMaterial ({ color : Glow, transparent : true, opacity : 0.95, depthTest : false }));
        outline.renderOrder = 11; this.group.add (outline);
        // Front arrow along the ground, Up arrow from the footprint centre.
        const lift = up.clone ().multiplyScalar (extent * 0.01);
        const frontArrow = new THREE.ArrowHelper (front, floor.clone ().add (lift), Math.max (size[AxisName (front)[1]] / 2 + extent * 0.35, extent * 0.4), Glow, extent * 0.12, extent * 0.07);
        const upArrow = new THREE.ArrowHelper (up, floor.clone ().add (lift), size[upAxis] + extent * 0.3, UpColor, extent * 0.12, extent * 0.07);
        for (const arrow of [frontArrow, upArrow]) { arrow.traverse (item => { if (item.material) { item.material.depthTest = false; item.material.transparent = true; } item.renderOrder = 12; }); this.group.add (arrow); }
        this.DrawHover (); this.website.viewer.Render ();
    }

    // Which face of the world bounding box is under the canvas point (pixels), or null.
    FaceAt (x, y)
    {
        if (!this.active) { return null; }
        const canvas = this.website.viewer.GetCanvas (), rect = { width : canvas.clientWidth || canvas.width, height : canvas.clientHeight || canvas.height };
        const ray = new THREE.Raycaster (); ray.setFromCamera (new THREE.Vector2 (x / rect.width * 2 - 1, -(y / rect.height) * 2 + 1), this.website.viewer.camera);
        const box = this.Bounds (), point = ray.ray.intersectBox (box, new THREE.Vector3 ()); if (!point) { return null; }
        const size = box.getSize (new THREE.Vector3 ()), center = box.getCenter (new THREE.Vector3 ()); let best = null;
        for (const axis of ['x', 'y', 'z']) { const offset = (point[axis] - center[axis]) / Math.max (size[axis] / 2, 1e-9); if (!best || Math.abs (offset) > Math.abs (best.offset)) { best = { axis, offset }; } }
        const normal = new THREE.Vector3 (); normal[best.axis] = Math.sign (best.offset) || 1; return { normal, point };
    }
    Hover (event)
    {
        const rect = this.website.viewer.GetCanvas ().getBoundingClientRect ();
        const face = this.FaceAt (event.clientX - rect.left, event.clientY - rect.top);
        if (AxisName (face?.normal ?? new THREE.Vector3 ()) === AxisName (this.hover?.normal ?? new THREE.Vector3 ()) && Boolean (face) === Boolean (this.hover)) { return; }
        this.hover = face; this.DrawHover (); this.website.viewer.Render ();
    }
    DrawHover ()
    {
        if (!this.group) { return; } this.group.children.filter (item => item.name === 'facing-hover').forEach (item => { item.geometry.dispose (); item.material.dispose (); this.group.remove (item); });
        if (!this.hover) { return; }
        const box = this.Bounds (), size = box.getSize (new THREE.Vector3 ()), center = box.getCenter (new THREE.Vector3 ()), normal = this.hover.normal, axis = AxisName (normal)[1];
        const others = ['x', 'y', 'z'].filter (item => item !== axis);
        const face = new THREE.Mesh (new THREE.PlaneGeometry (size[others[0]] || 1e-6, size[others[1]] || 1e-6), new THREE.MeshBasicMaterial ({ color : this.mode === 'up' ? UpColor : Glow, transparent : true, opacity : 0.35, side : THREE.DoubleSide, depthTest : false, depthWrite : false }));
        const basis = new THREE.Matrix4 (); const u = new THREE.Vector3 (), v = new THREE.Vector3 (); u[others[0]] = 1; v[others[1]] = 1; basis.makeBasis (u, v, normal.clone ()); face.quaternion.setFromRotationMatrix (basis);
        face.position.copy (center).addScaledVector (normal, size[axis] / 2 + Math.max (size.x, size.y, size.z) * 0.002); face.name = 'facing-hover'; face.renderOrder = 13; this.group.add (face);
    }

    // Viewer click while assigning: returns true when it was consumed.
    Click (mouseCoordinates, modifiers = {})
    {
        const face = this.FaceAt (mouseCoordinates.x, mouseCoordinates.y); if (!face) { return false; }
        const mode = modifiers.shiftKey ? 'up' : this.mode;
        this.editor.Run (() => this.Assign ({ [mode] : AxisName (face.normal) }));
        return true;
    }
    // front/up are world-axis names of the model's current sides (as shown by its bounding box).
    Assign ({ front, up } = {})
    {
        if (!this.active) { throw new Error ('Start Assign facing first.'); }
        if ((front === undefined) === (up === undefined)) { throw new Error ('Assign either front or up.'); }
        const frame = this.Frame (), side = AxisVector (front ?? up);
        const turn = front !== undefined ? TurnOnto (side, frame.front, frame.up) : TurnOnto (side, frame.up, frame.front);
        return this.ApplyTurn (turn, front !== undefined ? 'Front' : 'Up');
    }
    // Turn the model about world up by ±90° / 180°, changing which side faces front.
    Turn (degrees)
    {
        if (!this.active) { throw new Error ('Start Assign facing first.'); }
        if (![90, -90, 180].includes (degrees)) { throw new Error ('Turn by 90, -90 or 180 degrees.'); }
        return this.ApplyTurn (new THREE.Quaternion ().setFromAxisAngle (this.Frame ().up, THREE.MathUtils.degToRad (degrees)), 'Turn');
    }
    // Rotate about the bounds centre, set the model on the floor, remember its local front/up, as one Undo step.
    ApplyTurn (turn, label)
    {
        const editor = this.editor, object = this.object; if (editor.readOnly || editor.busy) { throw new Error ('The model cannot be changed right now.'); }
        const snapshot = () => ({ position : [...object.position], rotation : [...object.rotation], scale : [...object.scale], facing : object.userData?._auto3dFacing ?? null });
        const before = snapshot (), center = this.Bounds ().getCenter (new THREE.Vector3 ());
        const quaternion = new THREE.Quaternion ().setFromEuler (new THREE.Euler (...object.rotation.map (THREE.MathUtils.degToRad))); quaternion.premultiply (turn);
        const euler = new THREE.Euler ().setFromQuaternion (quaternion); object.rotation = [euler.x, euler.y, euler.z].map (value => { const degrees = THREE.MathUtils.radToDeg (value); return Math.abs (degrees - Math.round (degrees)) < 1e-4 ? Math.round (degrees) + 0 : Number (degrees.toFixed (6)); });
        const position = new THREE.Vector3 (...object.position).sub (center).applyQuaternion (turn).add (center); object.position = position.toArray ();
        editor.ApplyTransform (object);
        const frame = this.Frame (), box = this.Bounds (), upAxis = AxisName (frame.up)[1];
        object.position[{ x : 0, y : 1, z : 2 }[upAxis]] -= frame.up[upAxis] > 0 ? box.min[upAxis] : box.max[upAxis];
        editor.ApplyTransform (object);
        const inverse = quaternion.clone ().invert ();
        object.userData = { ...object.userData, _auto3dFacing : JSON.stringify ({ front : AxisName (frame.front.clone ().applyQuaternion (inverse)), up : AxisName (frame.up.clone ().applyQuaternion (inverse)) }) };
        const after = snapshot ();
        const restore = state => { Object.assign (object, { position : [...state.position], rotation : [...state.rotation], scale : [...state.scale] }); const data = { ...object.userData }; if (state.facing) { data._auto3dFacing = state.facing; } else { delete data._auto3dFacing; } object.userData = data; editor.ApplyTransform (object); editor.UpdateDetails (); if (this.object === object) { this.Refresh (); } };
        editor.history.Push ({ undo : () => restore (before), redo : () => restore (after) }); editor.MarkDirty?.(); editor.RefreshButtons ();
        this.hover = null; this.Refresh (); editor.UpdateDetails ();
        editor.Status (label === 'Turn' ? 'Turned ' + object.name : label + ' assigned · ' + object.name + ' turned and set on the floor');
        return this.Inspect ();
    }

    BuildBar ()
    {
        const bar = document.createElement ('div'); bar.className = 'facing_bar'; bar.setAttribute ('role', 'toolbar'); bar.setAttribute ('aria-label', 'Assign facing');
        const text = document.createElement ('span'); text.className = 'facing_bar_hint'; text.textContent = 'Click a face of the model to make it the'; bar.appendChild (text);
        const button = (label, title, onClick, extra = {}) => { const item = document.createElement ('button'); item.type = 'button'; item.textContent = label; item.title = title; Object.assign (item.dataset, extra.dataset || {}); if (extra.pressed !== undefined) { item.setAttribute ('aria-pressed', String (extra.pressed)); } if (extra.label) { item.setAttribute ('aria-label', extra.label); } item.addEventListener ('click', onClick); bar.appendChild (item); return item; };
        button ('Front', 'Clicked face becomes the front (blue arrow)', () => this.SetMode ('front'), { dataset : { facingMode : 'front' }, pressed : true });
        button ('Up', 'Clicked face becomes the top (green arrow); Shift+click does this too', () => this.SetMode ('up'), { dataset : { facingMode : 'up' }, pressed : false });
        button ('⟲ 90°', 'Turn left 90°', () => this.editor.Run (() => this.Turn (90)), { label : 'Turn left 90 degrees' });
        button ('⟳ 90°', 'Turn right 90°', () => this.editor.Run (() => this.Turn (-90)), { label : 'Turn right 90 degrees' });
        button ('Done', 'Finish assigning (Escape)', () => this.Stop (), { dataset : { facingDone : '' } });
        this.website.parameters.viewerDiv.appendChild (bar); this.bar = bar;
    }
}
