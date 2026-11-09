import * as THREE from 'three';
import { WorkspaceDialog } from './modellibrary.js';
import { IntersectionMode } from '../engine/viewer/viewermodel.js';
import { ValidateDimensions, ObjectInstances, FeatureEdges, CachedTopologyKey, CadSegments, ResolveDimension, ProjectDimension, DesignAnchor, DimensionPlanes, ObjectMatrix, ProjectPlacedDimension, LegacyPlacement } from './dimensioncore.js';

function LengthLabel (r, system)
{
    const value = r.lengthMm === null ? r.length : system === 'standard' ? r.lengthMm / 25.4 : r.lengthMm;
    const number = value < 0.0001 ? value.toExponential (3) : value.toLocaleString (undefined, { maximumFractionDigits : 4 });
    return (r.basis ? r.basis + ' · ' : '') + number + (r.lengthMm === null ? ' model units' : system === 'standard' ? ' in' : ' mm');
}
const ns = 'http://www.w3.org/2000/svg';
function Svg (tag, attrs, parent) { const node = document.createElementNS (ns, tag); for (const [key, value] of Object.entries (attrs)) { node.setAttribute (key, String (value)); } parent?.appendChild (node); return node; }
export class DimensionTool
{
    constructor (website)
    {
        this.website = website; this.active = false; this.drag = null; this.edges = new WeakMap (); this.topology = new WeakMap ();
        this.canvas = website.viewer.GetCanvas (); this.host = this.canvas.parentElement;
        if (getComputedStyle (this.host).position === 'static') { this.host.style.position = 'relative'; }
        this.svg = Svg ('svg', { class : 'dimension_overlay', 'aria-label' : 'Live model dimensions' }, this.host);
        this.layer = document.createElement ('details'); this.layer.className = 'dimension_layer';
        const summary = document.createElement ('summary'); this.layer.appendChild (summary);
        this.layerTitle = document.createElement ('span'); summary.appendChild (this.layerTitle);
        this.eye = document.createElement ('button'); this.eye.type = 'button'; summary.appendChild (this.eye);
        this.eye.addEventListener ('click', event => { event.preventDefault (); event.stopPropagation (); this.Run (() => this.LayerVisible (!this.Doc ().dimensionsVisible)); });
        this.list = document.createElement ('div'); this.list.className = 'dimension_layer_list'; this.layer.appendChild (this.list);
        website.navigator.meshesPanel.dimensionsLayerDiv.appendChild (this.layer);
        this.layer.addEventListener ('toggle', () => website.navigator.meshesPanel.Resize ());
        this.host.addEventListener ('pointerdown', event => this.Down (event), true);
        this.host.addEventListener ('pointermove', event => this.Move (event), true);
        this.host.addEventListener ('pointerup', event => this.Up (event), true);
        this.host.addEventListener ('pointercancel', () => this.Cancel (), true);
        this.host.addEventListener ('lostpointercapture', () => this.Cancel (), true);
        // Suppress navigation's legacy mouse handlers only during dimension mode.
        this.host.addEventListener ('mousedown', event => { if (this.active && event.button === 0 && this.drag) { event.preventDefault (); event.stopImmediatePropagation (); } }, true);
        for (const type of ['touchstart', 'touchmove']) { this.host.addEventListener (type, event => { if (this.drag) { event.preventDefault (); event.stopImmediatePropagation (); } }, { capture : true, passive : false }); }
        document.addEventListener ('keydown', event => { if (event.key === 'Escape' && this.active) { this.SetActive (false); } });
        window.addEventListener ('blur', () => this.Cancel ());
        this.owner = website.auth?.user?.id || null;
        website.auth?.Subscribe?.(user => { const owner = user?.id || null; if (owner !== this.owner) { this.owner = owner; if (this.active) { this.SetActive (false); } } });
        this.Draw (website.viewer.camera);
    }
    Doc () { return this.website.sessionEditor.document; }
    Editable () { const e = this.website.sessionEditor; if (!this.website.auth?.user || this.website.accountReady === false || e.readOnly || e.busy) { throw new Error ('Sign in to an editable, idle session to place dimensions.'); } }
    Run (action) { try { const result = action (); if (result?.catch) { result.catch (error => this.website.sessionEditor.Status (error.message)); } return result; } catch (error) { this.website.sessionEditor.Status (error.message); } }
    SetActive (active)
    {
        if (typeof active !== 'boolean') { throw new Error ('Set active to true or false.'); }
        if (active) { this.Editable (); this.website.sessionEditor.SetMode ('select'); this.website.sessionEditor.controls.detach (); this.website.measureTool.SetActive (false); }
        const wasActive = this.active;
        if (active && !wasActive) { this.previousCursor = this.canvas.style.cursor; this.previousTouchAction = this.canvas.style.touchAction; }
        this.Cancel (); this.active = active;
        if (active) { this.canvas.style.cursor = 'crosshair'; this.canvas.style.touchAction = 'none'; } else if (wasActive) { this.canvas.style.cursor = this.previousCursor || ''; this.canvas.style.touchAction = this.previousTouchAction || ''; }
        this.website.sessionEditor.buttons.get ('dimension')?.setAttribute ('aria-pressed', String (active));
        this.website.sessionEditor.Status (active ? 'Dimensions: drag an edge to snap to an adjoining plane (0° / 90°). Click its value in Layers to edit. Escape closes the tool.' : 'Dimension tool closed.');
        this.Draw (this.website.viewer.camera); return { active };
    }
    Inspect () { const doc = this.Doc (); return { active : this.active, layerVisible : doc.dimensionsVisible !== false, dimensions : (doc.dimensions || []).map (d => { const r = ResolveDimension (doc, d, this.topology); return { ...d, stale : r.stale === true, reason : r.reason, length : r.length, lengthMm : r.lengthMm, sourceLengthMm : r.sourceLengthMm, basis : r.basis, editable : r.editable === true }; }) }; }
    Edges (mesh) { const key = CachedTopologyKey (mesh, this.topology); if (this.edges.get (mesh)?.key !== key) { this.edges.set (mesh, { key, edges : FeatureEdges (mesh) }); } return this.edges.get (mesh).edges; }
    Candidates (object)
    {
        if (object.animationAsset || (object.userData?._auto3dFoldPreview !== undefined && Number (object.userData._auto3dFoldPreview) !== 1)) { throw new Error ('Use static geometry or the flat CAD drawing to create dimensions.'); }
        const cad = CadSegments (object); if (cad.length) { return cad; }
        return ObjectInstances (this.Doc (), object).flatMap ((instance, mesh) => {
            const topology = CachedTopologyKey (instance.mesh, this.topology);
            return this.Edges (instance.mesh).map (e => ({ kind : 'edge', objectId : object.id, mesh, meshName : String (instance.mesh.GetName () || '').slice (0, 1000), topology, ...e }));
        });
    }
    Pick (x, y)
    {
        const rect = this.canvas.getBoundingClientRect (), viewer = this.website.viewer, size = viewer.GetCanvasSize (), hits = [];
        for (const [dx, dy] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]) {
            const hit = viewer.GetMeshIntersectionUnderMouse (IntersectionMode.MeshAndLine, { x : (x + dx) / rect.width * size.width, y : (y + dy) / rect.height * size.height });
            if (hit?.object?.userData?.originalMeshInstance) { hits.push (hit); }
        }
        let best = null; const instances = new Map ();
        for (const hit of hits) {
            const object = this.Doc ().Owner (hit.object.userData.originalMeshInstance); if (!object || object.visible === false) { continue; }
            const hitNdc = hit.point.clone ().project (viewer.camera), near = new THREE.Vector3 (hitNdc.x + 28 / rect.width, hitNdc.y, hitNdc.z).unproject (viewer.camera), tolerance = near.distanceTo (hit.point) * 2;
            if (!instances.has (object.id)) { instances.set (object.id, ObjectInstances (this.Doc (), object)); }
            for (const anchor of this.Candidates (object)) {
                const r = ResolveDimension (this.Doc (), anchor, this.topology, instances); if (r.stale || r.hidden) { continue; }
                const p = ProjectDimension (r.a, r.b, viewer.camera, rect.width, rect.height, 0); if (!p) { continue; }
                const edge = p.end.clone ().sub (p.start), t = Math.max (0, Math.min (1, new THREE.Vector2 (x, y).sub (p.start).dot (edge) / edge.lengthSq ())), distance = p.start.clone ().addScaledVector (edge, t).distanceTo (new THREE.Vector2 (x, y));
                const worldDistance = new THREE.Line3 (r.a, r.b).closestPointToPoint (hit.point, true, new THREE.Vector3 ()).distanceTo (hit.point);
                if (distance <= 12 && worldDistance <= tolerance && (!best || distance < best.distance)) { best = { anchor, distance }; }
            }
        }
        return best?.anchor || null;
    }
    EdgeList ({ objectId, offset = 0, limit = 25 })
    {
        const object = this.Doc ().objects.find (o => o.id === objectId); if (!object) { throw new Error ('Source object not found.'); }
        const all = this.Candidates (object), anchors = all.slice (offset, offset + limit), instances = new Map ([[objectId, ObjectInstances (this.Doc (), object)]]);
        return { total : all.length, offset, anchors, segments : anchors.map (a => { const r = ResolveDimension (this.Doc (), a, this.topology, instances); return r.stale ? { stale : true } : { start : r.a.toArray (), end : r.b.toArray (), lengthMm : r.lengthMm, sourceLengthMm : r.sourceLengthMm, basis : r.basis, editable : r.editable === true }; }) };
    }
    Change (next, reveal = false)
    {
        this.Editable (); const editor = this.website.sessionEditor, target = this.Doc (), before = target.dimensions || [], beforeVisible = target.dimensionsVisible !== false, after = ValidateDimensions (next);
        const apply = (data, visible) => { if (this.Doc () !== target) { throw new Error ('Dimensions belong to another session.'); } target.dimensionsVisible = visible; target.dimensions = data.map (d => structuredClone (d)); this.Draw (this.website.viewer.camera); };
        apply (after, reveal || beforeVisible); editor.history.Push ({ undo : () => apply (before, beforeVisible), redo : () => apply (after, reveal || beforeVisible) }); editor.RefreshButtons (); return this.Inspect ();
    }
    Add (anchor, offset = 40, placement = null)
    {
        this.Editable (); anchor = DesignAnchor (this.Doc (), anchor); const record = ValidateDimensions ([{ ...anchor, id : crypto.randomUUID (), offset, visible : true }])[0], resolved = ResolveDimension (this.Doc (), record, this.topology);
        if (resolved.stale) { throw new Error (resolved.reason); }
        if (record.kind === 'edge' && !this.Candidates (resolved.object).some (c => c.kind === 'edge' && c.mesh === record.mesh && c.a === record.a && c.b === record.b)) { throw new Error ('Choose a genuine model edge, not a tessellation diagonal.'); }
        record.placement = placement || this.PlacementFromOffset (record, offset);
        const result = this.Change ([...(this.Doc ().dimensions || []), record], true); this.website.sessionEditor.Status ('Dimension added · ' + LengthLabel (resolved, this.website.preferences?.units || 'metric') + (this.active ? ' · drag another edge or press Escape.' : '')); return result;
    }
    Remove (id) { if (!(this.Doc ().dimensions || []).some (d => d.id === id)) { throw new Error ('Dimension not found.'); } return this.Change (this.Doc ().dimensions.filter (d => d.id !== id)); }
    Offset (id, offset) { if (!(this.Doc ().dimensions || []).some (d => d.id === id)) { throw new Error ('Dimension not found.'); } return this.Change (this.Doc ().dimensions.map (d => d.id === id ? { ...d, offset, placement : this.PlacementFromOffset (d, offset) } : d)); }
    PlacementFromOffset (anchor, offset)
    {
        const r = ResolveDimension (this.Doc (), anchor, this.topology); if (r.stale) { throw new Error (r.reason); }
        const directions = DimensionPlanes (this.Doc (), anchor, r), rect = this.canvas.getBoundingClientRect (), camera = this.website.viewer.camera, matrix = ObjectMatrix (r.object), origin = r.a.clone ().add (r.b).multiplyScalar (.5), local = origin.clone ().applyMatrix4 (matrix.clone ().invert ()), p = ProjectDimension (r.a, r.b, camera, rect.width, rect.height, 0);
        if (!p) { throw new Error ('Rotate the view to see this edge before placing its bracket.'); }
        let best;
        for (const [index, direction] of directions.entries ()) { const q = local.clone ().add (direction).applyMatrix4 (matrix).project (camera), o = origin.clone ().project (camera), projected = new THREE.Vector2 ((q.x-o.x)*rect.width/2, -(q.y-o.y)*rect.height/2), amount = projected.dot (p.normal); if (!best || Math.abs (amount) > Math.abs (best.amount)) { best = { direction, index, amount }; } }
        if (!best || Math.abs (best.amount) < 1e-8) { throw new Error ('Rotate the view to see an adjoining panel plane.'); }
        return { direction : best.direction.toArray ().map (v => v || 0).map (v => v || 0), distance : Math.max (-1e9, Math.min (1e9, offset/best.amount)), plane : best.index*90 };
    }
    Place (id, placement, offset = 0)
    {
        if (!this.Doc ().dimensions.some (d => d.id === id)) { throw new Error ('Dimension not found.'); }
        return this.Change (this.Doc ().dimensions.map (d => d.id === id ? { ...d, placement, offset } : d));
    }
    Placement (id, plane, distanceMm)
    {
        const d = this.Doc ().dimensions.find (item => item.id === id); if (!d) { throw new Error ('Dimension not found.'); }
        const r = ResolveDimension (this.Doc (), d), directions = DimensionPlanes (this.Doc (), d, r), direction = directions[plane/90];
        if (!direction || ![0, 90].includes (plane) || !Number.isFinite (distanceMm) || Math.abs (distanceMm) > 1e6 || !r.lengthMm) { throw new Error ('Choose an available plane (0 or 90) and a finite distance in millimeters.'); }
        return this.Place (id, { direction : direction.toArray ().map (v => v || 0), distance : distanceMm*r.length/r.lengthMm, plane });
    }
    async Value (id, valueMm)
    {
        this.Editable (); const doc = this.Doc (), d = doc.dimensions.find (item => item.id === id); if (!d) { throw new Error ('Dimension not found.'); }
        const r = ResolveDimension (doc, d, this.topology);
        if (r.stale || !r.axis || !r.editable) { throw new Error ('Direct value editing requires an unscaled generated box dimension. Other edges remain measured references.'); }
        if (!Number.isFinite (valueMm) || valueMm <= 0 || valueMm > 10000) { throw new Error ('Enter a dimension greater than zero, up to 10000 mm.'); }
        await this.website.sessionEditor.packaging.UpdateDimensions ({ basis : r.basis === 'OD' ? 'outside' : 'inside', [r.axis] : valueMm }, d.objectId);
        this.Draw (this.website.viewer.camera); return this.Inspect ();
    }
    EditDialog (id)
    {
        this.Editable (); const doc = this.Doc (), owner = this.website.auth.user.id, d = doc.dimensions.find (item => item.id === id), r = d && ResolveDimension (doc, d);
        if (!r || r.stale || !r.editable) { throw new Error ('Value editing is available on unscaled generated box dimensions.'); }
        const dialog = WorkspaceDialog ('Edit dimension'), label = document.createElement ('label'), input = document.createElement ('input'), status = document.createElement ('p'), apply = document.createElement ('button'), factor = this.website.preferences?.units === 'standard' ? 25.4 : 1;
        label.textContent = r.basis + ' · ' + r.axis + (factor === 1 ? ' (mm)' : ' (in)'); input.type = 'number'; input.step = 'any'; input.min = '0'; input.value = String (Number ((r.lengthMm/factor).toFixed (6))); input.setAttribute ('aria-label', 'Dimension value'); label.appendChild (input); apply.type = 'button'; apply.textContent = 'Apply'; dialog.append (label, status, apply);
        apply.onclick = async () => { apply.disabled = true; try { if (this.Doc () !== doc || this.website.auth.user?.id !== owner) { throw new Error ('The session or account changed.'); } await this.Value (id, Number (input.value)*factor); dialog.close (); } catch (error) { status.textContent = error.message; apply.disabled = false; } }; input.focus (); input.select (); return { opened : true };
    }
    LayerVisible (visible)
    {
        this.Editable (); if (typeof visible !== 'boolean') { throw new Error ('Set visible to true or false.'); }
        const target = this.Doc (), before = target.dimensionsVisible !== false, apply = value => { if (this.Doc () !== target) { throw new Error ('Dimensions belong to another session.'); } target.dimensionsVisible = value; this.Draw (this.website.viewer.camera); };
        if (visible !== before) { apply (visible); this.website.sessionEditor.history.Push ({ undo : () => apply (before), redo : () => apply (visible) }); this.website.sessionEditor.RefreshButtons (); } return this.Inspect ();
    }
    Down (event)
    {
        if (!this.active || event.button !== 0 || this.drag) { return; }
        this.Run (() => {
            this.Editable (); const rect = this.canvas.getBoundingClientRect (), x = event.clientX - rect.left, y = event.clientY - rect.top;
            const id = event.target.closest?.('[data-dimension-id]')?.dataset.dimensionId, existing = this.Doc ().dimensions?.find (d => d.id === id), picked = existing || this.Pick (x, y), anchor = picked && (existing || DesignAnchor (this.Doc (), picked));
            if (!anchor) { this.website.sessionEditor.Status ('Choose a visible straight edge or CAD line segment.'); return; }
            event.preventDefault (); event.stopImmediatePropagation (); this.website.viewer.navigation.clickDetector.Cancel ();
            this.drag = { anchor, existing : existing?.id, document : this.Doc (), owner : this.website.auth.user.id, offset : existing?.offset || 0, placement : existing?.placement, pointer : event.pointerId };
            this.host.setPointerCapture (event.pointerId); this.Move (event);
        });
    }
    Move (event)
    {
        if (!this.drag || event.pointerId !== this.drag.pointer) { return; } event.preventDefault (); event.stopImmediatePropagation ();
        const r = ResolveDimension (this.Doc (), this.drag.anchor, this.topology), rect = this.canvas.getBoundingClientRect ();
        if (r.stale) { this.Cancel (); return; }
        const p = ProjectDimension (r.a, r.b, this.website.viewer.camera, rect.width, rect.height, 0); if (!p) { return; }
        const midpoint = p.start.clone ().add (p.end).multiplyScalar (.5), pointer = new THREE.Vector2 (event.clientX-rect.left, event.clientY-rect.top), motion = pointer.clone ().sub (midpoint);
        this.drag.offset = Math.max (-2000, Math.min (2000, motion.dot (p.normal)));
        const planes = DimensionPlanes (this.Doc (), this.drag.anchor, r), matrix = ObjectMatrix (r.object), origin = r.a.clone ().add (r.b).multiplyScalar (.5), localOrigin = origin.clone ().applyMatrix4 (matrix.clone ().invert ()), camera = this.website.viewer.camera;
        let best;
        for (const [index, direction] of planes.entries ()) {
            const world = localOrigin.clone ().add (direction).applyMatrix4 (matrix).sub (origin), projected = origin.clone ().add (world).project (camera), base = origin.clone ().project (camera), screen = new THREE.Vector2 ((projected.x-base.x)*rect.width/2, -(projected.y-base.y)*rect.height/2);
            const score = screen.length () < 1e-5 ? -1 : Math.abs (screen.clone ().normalize ().dot (motion.clone ().normalize ()));
            if (!best || score > best.score + .025) { best = { index, direction, world, score }; }
        }
        if (!best || best.score < 0) { return; }
        const ray = new THREE.Raycaster (); ray.setFromCamera (new THREE.Vector2 (pointer.x/rect.width*2-1, 1-pointer.y/rect.height*2), camera);
        const normal = r.b.clone ().sub (r.a).cross (best.world).normalize (), plane = new THREE.Plane ().setFromNormalAndCoplanarPoint (normal, origin), hit = ray.ray.intersectPlane (plane, new THREE.Vector3 ());
        if (hit) { const local = hit.applyMatrix4 (matrix.clone ().invert ()); this.drag.placement = { direction : best.direction.toArray ().map (v => v || 0).map (v => v || 0), distance : Math.max (-1e9, Math.min (1e9, local.sub (localOrigin).dot (best.direction))), plane : best.index*90 }; }
        this.Draw (camera);
    }
    Up (event)
    {
        if (!this.drag || event.pointerId !== this.drag.pointer) { return; } this.Move (event); const drag = this.drag; this.Cancel ();
        if (!drag || !drag.placement || (!drag.existing && Math.abs (drag.offset) < 8)) { return; }
        this.Run (() => { this.Editable (); if (drag.document !== this.Doc () || drag.owner !== this.website.auth.user.id) { throw new Error ('The account or session changed during dimension placement.'); } if (drag.existing) { this.Place (drag.existing, drag.placement, drag.offset); } else { this.Add (drag.anchor, drag.offset, drag.placement); } });
    }
    Cancel () { const drag = this.drag; this.drag = null; if (drag && this.host.hasPointerCapture?.(drag.pointer)) { this.host.releasePointerCapture (drag.pointer); } this.Draw (this.website.viewer.camera); }
    Draw (camera)
    {
        if (!this.svg || !camera) { return; }
        const doc = this.Doc (), records = doc.dimensions || [], rect = this.canvas.getBoundingClientRect ();
        if (this.drag && (this.drag.document !== doc || this.drag.owner !== this.website.auth?.user?.id || this.website.sessionEditor.readOnly || this.website.sessionEditor.busy)) { this.drag = null; }
        this.svg.style.left = this.canvas.offsetLeft + 'px'; this.svg.style.top = this.canvas.offsetTop + 'px'; this.svg.setAttribute ('width', rect.width); this.svg.setAttribute ('height', rect.height);
        const instances = new Map ();
        for (const d of [...records, ...(this.drag ? [this.drag.anchor] : [])]) { if (d.kind === 'edge' && !instances.has (d.objectId)) { const object = doc.objects.find (o => o.id === d.objectId); if (object) { instances.set (d.objectId, ObjectInstances (doc, object)); } } }
        const labels = records.map (d => { const r = ResolveDimension (doc, d, this.topology, instances); return r.stale ? 'Unavailable · recreate reference' : (d.kind === 'cad' ? 'CAD · ' : '') + LengthLabel (r, this.website.preferences?.units || 'metric'); });
        const layerSignature = JSON.stringify ([records, labels, doc.dimensionsVisible, this.website.sessionEditor.readOnly, this.website.sessionEditor.busy]);
        if (this.layerSignature !== layerSignature) {
            this.layerSignature = layerSignature; this.layer.hidden = records.length === 0; this.layerTitle.textContent = 'Dimensions (' + records.length + ')'; this.eye.textContent = doc.dimensionsVisible === false ? '○' : '◉'; this.eye.setAttribute ('aria-label', (doc.dimensionsVisible === false ? 'Show' : 'Hide') + ' Dimensions layer'); this.eye.setAttribute ('aria-pressed', String (doc.dimensionsVisible !== false)); this.eye.disabled = this.website.sessionEditor.readOnly || this.website.sessionEditor.busy; this.list.replaceChildren ();
            for (const d of records) { const row = document.createElement ('div'), label = document.createElement ('button'), remove = document.createElement ('button'); row.className = 'dimension_layer_item'; label.textContent = labels[records.indexOf (d)]; label.type = 'button'; label.title = 'Edit dimension'; label.disabled = this.eye.disabled; label.addEventListener ('click', () => this.Run (() => this.EditDialog (d.id))); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute ('aria-label', 'Delete dimension ' + d.id); remove.disabled = this.eye.disabled; remove.addEventListener ('click', () => this.Run (() => this.Remove (d.id))); row.append (label, remove); this.list.appendChild (row); }
            this.website.navigator.meshesPanel.Resize ();
        }
        const shown = doc.dimensionsVisible === false || this.website.sessionEditor.busy ? [] : records.filter (d => d.visible && d.id !== this.drag?.existing);
        if (this.drag) { shown.push ({ ...this.drag.anchor, id : 'preview', offset : this.drag.offset, placement : this.drag.placement, visible : true }); }
        const items = shown.map (d => { const r = ResolveDimension (doc, d, this.topology, instances); if (r.stale || r.hidden) { return null; } const p = ProjectPlacedDimension (r, d.placement || LegacyPlacement (doc, d, r), camera, rect.width, rect.height, d.offset); if (!p) { return null; } return { d, r, p, label : LengthLabel (r, this.website.preferences?.units || 'metric') }; }).filter (Boolean);
        const signature = JSON.stringify ([this.active, items.map (i => [i.d.id, i.label, i.p.start, i.p.end, i.p.left, i.p.right, i.d.offset])]); if (signature === this.signature) { return; } this.signature = signature; this.svg.replaceChildren ();
        for (const { d, r, p, label } of items) {
            const g = Svg ('g', { 'data-dimension-id' : d.id }, this.svg), title = Svg ('title', {}, g); title.textContent = (d.kind === 'cad' ? 'Linked CAD path: ' + d.pathId : 'Linked canonical model edge') + ' · source ' + (r.sourceLengthMm === null ? 'unknown units' : r.sourceLengthMm.toFixed (3) + ' mm');
            const bracket = p.right.clone ().sub (p.left).normalize (), tick = new THREE.Vector2 (-bracket.y, bracket.x).multiplyScalar (5), extend = p.left.clone ().sub (p.start).normalize ().multiplyScalar (7);
            const path = `M${p.start.x},${p.start.y} L${p.left.x + extend.x},${p.left.y + extend.y} M${p.end.x},${p.end.y} L${p.right.x + extend.x},${p.right.y + extend.y} M${p.left.x},${p.left.y} L${p.right.x},${p.right.y} M${p.left.x - tick.x},${p.left.y - tick.y} L${p.left.x + tick.x},${p.left.y + tick.y} M${p.right.x - tick.x},${p.right.y - tick.y} L${p.right.x + tick.x},${p.right.y + tick.y}`;
            Svg ('path', { d : path, fill : 'none', stroke : '#111', 'stroke-width' : 5, 'stroke-linecap' : 'round' }, g); Svg ('path', { d : path, fill : 'none', stroke : '#fff', 'stroke-width' : 1.8 }, g);
            const mid = p.left.clone ().add (p.right).multiplyScalar (0.5), width = label.length * 7 + 14;
            const box = Svg ('rect', { x : mid.x - width / 2, y : mid.y - 12, width, height : 24, rx : 4, fill : '#111', stroke : '#fff', 'stroke-width' : 1.5 }, g);
            const text = Svg ('text', { x : mid.x, y : mid.y + 4, fill : '#fff', 'text-anchor' : 'middle', 'font-size' : 12, 'font-family' : 'sans-serif' }, g); text.textContent = label;
            if (d.id !== 'preview') { g.addEventListener ('dblclick', event => { event.preventDefault (); event.stopPropagation (); this.Run (() => this.EditDialog (d.id)); }); box.style.pointerEvents = 'all'; box.style.cursor = 'pointer'; }
            if (this.active && d.id !== 'preview') { Svg ('path', { d : `M${p.left.x},${p.left.y} L${p.right.x},${p.right.y}`, stroke : 'transparent', 'stroke-width' : 16, fill : 'none', 'pointer-events' : 'stroke' }, g); box.style.pointerEvents = 'all'; box.style.cursor = 'grab'; text.style.pointerEvents = 'none'; }
        }
    }
}
