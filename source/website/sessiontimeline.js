import * as THREE from 'three';

function Clamp (value, min, max)
{
    return Math.min (max, Math.max (min, value));
}

function SmoothStep (value)
{
    const t = Clamp (value, 0, 1);
    return t * t * (3 - 2 * t);
}

function LerpArray (a, b, t)
{
    return a.map ((value, index) => THREE.MathUtils.lerp (value, b[index], t));
}

function CameraVector (value)
{
    return [value.x, value.y, value.z];
}

export function CaptureCameraState (viewer)
{
    const camera = viewer.GetCamera ();
    const eye = CameraVector (camera.eye);
    const center = CameraVector (camera.center);
    const up = CameraVector (camera.up);
    const offset = new THREE.Vector3 (...eye).sub (new THREE.Vector3 (...center));
    const distance = Math.max (offset.length (), 1e-9);
    const azimuth = THREE.MathUtils.radToDeg (Math.atan2 (offset.x, offset.z));
    const elevation = THREE.MathUtils.radToDeg (Math.asin (Clamp (offset.y / distance, -1, 1)));
    return {
        eye,
        center,
        up,
        fov : Number.isFinite (camera.fov) ? camera.fov : 45,
        distance,
        azimuth,
        elevation
    };
}

export function ApplyCameraState (viewer, state)
{
    if (!state || !['eye', 'center', 'up'].every ((key) => Array.isArray (state[key]) && state[key].length === 3 && state[key].every (Number.isFinite))) { return; }
    const camera = viewer.GetCamera ().Clone ();
    for (const [key, value] of [['eye', state.eye], ['center', state.center], ['up', state.up]]) {
        camera[key].x = value[0]; camera[key].y = value[1]; camera[key].z = value[2];
    }
    if (Number.isFinite (state.fov)) { camera.fov = state.fov; }
    viewer.SetCamera (camera);
}

function NormalizeInterpolation (value)
{
    return ['linear', 'smooth', 'step'].includes (value) ? value : 'smooth';
}

function NormalizeObjectKeyframe (item)
{
    if (!item || !Number.isFinite (item.time) || item.time < 0) { return null; }
    if (![item.position, item.rotation, item.scale].every ((value) => Array.isArray (value) && value.length === 3 && value.every (Number.isFinite))) { return null; }
    if (item.scale.some ((value) => Math.abs (value) < 1e-6)) { return null; }
    return {
        id : String (item.id || crypto.randomUUID ()),
        time : item.time,
        interpolation : NormalizeInterpolation (item.interpolation),
        position : [...item.position],
        rotation : [...item.rotation],
        scale : [...item.scale]
    };
}

function NormalizeCameraKeyframe (item)
{
    if (!item || !Number.isFinite (item.time) || item.time < 0) { return null; }
    if (!['eye', 'center', 'up'].every ((key) => Array.isArray (item[key]) && item[key].length === 3 && item[key].every (Number.isFinite))) { return null; }
    const result = {
        id : String (item.id || crypto.randomUUID ()),
        time : item.time,
        interpolation : NormalizeInterpolation (item.interpolation),
        eye : [...item.eye],
        center : [...item.center],
        up : [...item.up],
        fov : Number.isFinite (item.fov) ? item.fov : 45
    };
    const offset = new THREE.Vector3 (...result.eye).sub (new THREE.Vector3 (...result.center));
    result.distance = Math.max (offset.length (), 1e-9);
    result.azimuth = THREE.MathUtils.radToDeg (Math.atan2 (offset.x, offset.z));
    result.elevation = THREE.MathUtils.radToDeg (Math.asin (Clamp (offset.y / result.distance, -1, 1)));
    return result;
}

function InterpolationFactor (mode, value)
{
    if (mode === 'step') { return 0; }
    return mode === 'smooth' ? SmoothStep (value) : Clamp (value, 0, 1);
}

function NeighborPair (items, time)
{
    if (!items.length) { return null; }
    if (time <= items[0].time) { return [items[0], items[0], 0]; }
    const last = items[items.length - 1];
    if (time >= last.time) { return [last, last, 0]; }
    for (let index = 0; index < items.length - 1; index++) {
        const a = items[index]; const b = items[index + 1];
        if (time >= a.time && time <= b.time) {
            const span = Math.max (b.time - a.time, 1e-9);
            return [a, b, InterpolationFactor (a.interpolation, (time - a.time) / span)];
        }
    }
    return [last, last, 0];
}

export class SessionTimeline
{
    constructor (editor)
    {
        this.editor = editor;
        this.duration = 5;
        this.time = 0;
        this.loop = false;
        this.interpolation = 'smooth';
        this.cameraKeyframes = [];
        this.playing = false;
        this.frame = null;
        this.onTime = null;
        this.onPlaybackChanged = null;
    }

    Load (data)
    {
        this.Stop ();
        const source = data && typeof data === 'object' ? data : {};
        this.duration = Number.isFinite (source.duration) ? Clamp (source.duration, 0.1, 3600) : 5;
        this.time = Number.isFinite (source.time) ? Clamp (source.time, 0, this.duration) : 0;
        this.loop = source.loop === true;
        this.interpolation = NormalizeInterpolation (source.interpolation);
        this.cameraKeyframes = Array.isArray (source.cameraKeyframes) ? source.cameraKeyframes.map (NormalizeCameraKeyframe).filter (Boolean).sort ((a, b) => a.time - b.time) : [];
        this.ExtendDurationForKeys ();
    }

    Serialize ()
    {
        return {
            version : 1,
            duration : this.duration,
            time : this.time,
            loop : this.loop,
            interpolation : this.interpolation,
            cameraKeyframes : this.cameraKeyframes.map ((item) => ({ ...item }))
        };
    }

    ExtendDurationForKeys ()
    {
        let maximum = this.cameraKeyframes.reduce ((value, item) => Math.max (value, item.time), 0);
        for (const object of this.editor.document.objects) {
            for (const keyframe of object.keyframes || []) { maximum = Math.max (maximum, keyframe.time || 0); }
        }
        this.duration = Math.max (this.duration, maximum, 0.1);
        this.time = Clamp (this.time, 0, this.duration);
    }

    NormalizeObjectKeyframes (object)
    {
        object.keyframes = Array.isArray (object.keyframes) ? object.keyframes.map (NormalizeObjectKeyframe).filter (Boolean).sort ((a, b) => a.time - b.time) : [];
        return object.keyframes;
    }

    CaptureObject (object)
    {
        if (!object) { return null; }
        const keyframes = this.NormalizeObjectKeyframes (object);
        const keyframe = {
            id : crypto.randomUUID (),
            time : this.time,
            interpolation : this.interpolation,
            position : [...object.position],
            rotation : [...object.rotation],
            scale : [...object.scale]
        };
        const existing = keyframes.findIndex ((item) => Math.abs (item.time - this.time) < 1e-4);
        if (existing >= 0) { keyframe.id = keyframes[existing].id; keyframes[existing] = keyframe; }
        else { keyframes.push (keyframe); }
        keyframes.sort ((a, b) => a.time - b.time);
        this.ExtendDurationForKeys ();
        return keyframe;
    }

    CaptureCamera ()
    {
        const keyframe = { id : crypto.randomUUID (), time : this.time, interpolation : this.interpolation, ...CaptureCameraState (this.editor.website.viewer) };
        const existing = this.cameraKeyframes.findIndex ((item) => Math.abs (item.time - this.time) < 1e-4);
        if (existing >= 0) { keyframe.id = this.cameraKeyframes[existing].id; this.cameraKeyframes[existing] = keyframe; }
        else { this.cameraKeyframes.push (keyframe); }
        this.cameraKeyframes.sort ((a, b) => a.time - b.time);
        this.ExtendDurationForKeys ();
        return keyframe;
    }

    DeleteKeyframe (type, id, object = null)
    {
        if (type === 'camera') { this.cameraKeyframes = this.cameraKeyframes.filter ((item) => item.id !== id); return; }
        if (object) { object.keyframes = this.NormalizeObjectKeyframes (object).filter ((item) => item.id !== id); }
    }

    ObjectStateAt (object, time)
    {
        const pair = NeighborPair (this.NormalizeObjectKeyframes (object), time);
        if (!pair) { return null; }
        const [a, b, t] = pair;
        if (a === b) { return { position : [...a.position], rotation : [...a.rotation], scale : [...a.scale] }; }
        const qa = new THREE.Quaternion ().setFromEuler (new THREE.Euler (...a.rotation.map (THREE.MathUtils.degToRad), 'XYZ'));
        const qb = new THREE.Quaternion ().setFromEuler (new THREE.Euler (...b.rotation.map (THREE.MathUtils.degToRad), 'XYZ'));
        qa.slerp (qb, t);
        const euler = new THREE.Euler ().setFromQuaternion (qa, 'XYZ');
        return {
            position : LerpArray (a.position, b.position, t),
            rotation : [euler.x, euler.y, euler.z].map (THREE.MathUtils.radToDeg),
            scale : LerpArray (a.scale, b.scale, t)
        };
    }

    CameraStateAt (time)
    {
        const pair = NeighborPair (this.cameraKeyframes, time);
        if (!pair) { return null; }
        const [a, b, t] = pair;
        if (a === b) { return { ...a, eye : [...a.eye], center : [...a.center], up : [...a.up] }; }
        const up = new THREE.Vector3 (...a.up).lerp (new THREE.Vector3 (...b.up), t).normalize ();
        return {
            eye : LerpArray (a.eye, b.eye, t),
            center : LerpArray (a.center, b.center, t),
            up : up.toArray (),
            fov : THREE.MathUtils.lerp (a.fov, b.fov, t)
        };
    }

    Seek (time, render = true)
    {
        this.time = Clamp (Number.isFinite (time) ? time : 0, 0, this.duration);
        for (const object of this.editor.document.objects) {
            const state = this.ObjectStateAt (object, this.time);
            if (!state) { continue; }
            object.position = state.position; object.rotation = state.rotation; object.scale = state.scale;
            this.editor.document.ApplyTransform (object);
            if (object.threeObject) {
                object.threeObject.position.fromArray (state.position);
                object.threeObject.rotation.set (...state.rotation.map (THREE.MathUtils.degToRad));
                object.threeObject.scale.fromArray (state.scale);
                object.threeObject.updateMatrixWorld (true);
            }
        }
        const camera = this.CameraStateAt (this.time);
        if (camera) { ApplyCameraState (this.editor.website.viewer, camera); }
        if (render) {
            this.editor.UpdateSelectionBox ();
            this.editor.SyncInputs ();
            this.editor.website.viewer.UpdateGroundGrid ();
            this.editor.website.sceneEffects?.Refresh ();
            this.editor.website.viewer.Render ();
        }
        this.onTime?.(this.time);
    }

    SetDuration (duration)
    {
        this.duration = Clamp (Number (duration) || 5, 0.1, 3600);
        this.ExtendDurationForKeys ();
        this.Seek (Math.min (this.time, this.duration));
    }

    Toggle ()
    {
        if (this.playing) { this.Stop (); return; }
        this.playing = true;
        this.previous = performance.now ();
        this.onPlaybackChanged?.(true);
        const tick = (now) => {
            this.frame = null;
            if (!this.playing) { return; }
            const delta = Math.min ((now - this.previous) / 1000, 0.1); this.previous = now;
            let next = this.time + delta;
            if (next >= this.duration) {
                if (this.loop) { next = next % this.duration; }
                else { this.Seek (this.duration); this.Stop (); return; }
            }
            this.Seek (next);
            this.frame = requestAnimationFrame (tick);
        };
        this.frame = requestAnimationFrame (tick);
    }

    Stop ()
    {
        if (this.frame) { cancelAnimationFrame (this.frame); }
        this.frame = null;
        const changed = this.playing;
        this.playing = false;
        if (changed) { this.onPlaybackChanged?.(false); }
    }

    Reset ()
    {
        this.Stop ();
        this.Seek (0);
    }
}
