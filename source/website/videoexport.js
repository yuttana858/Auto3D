/* global VideoEncoder, VideoFrame */
import * as THREE from 'three';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import { RenderCamera, FlipRenderPixels, HideRenderHelpers } from './rendercore.js';
import { CaptureCameraState } from './sessiontimeline.js';
import { CaptureAllowed } from './agentcapture.js';

// Video export of the animation sequence. The timeline is stepped frame by frame (deterministic, never real-time
// recording), each frame is rendered offscreen at the output size and encoded with WebCodecs, then muxed to MP4 (H.264)
// or WebM (VP9/VP8). Nothing is uploaded: the result stays in this browser until the user downloads it.

export const VideoSizes = { viewport : null, '720p' : { width : 1280, height : 720 }, '1080p' : { width : 1920, height : 1080 }, '4k' : { width : 3840, height : 2160 } };
export const VideoFrameRates = [24, 25, 30, 60];
export const VideoFormats = ['auto', 'mp4', 'webm'];
const MaxFrames = 36000, MaxPixels = 3840 * 2160;
const Even = value => Math.max (2, Math.floor (value / 2) * 2);

// Output size: a preset, or the viewport at device resolution (capped to 4K area, even dimensions for the encoders).
export function VideoDimensions (size, viewport, pixelRatio = 1)
{
    if (!Object.hasOwn (VideoSizes, size)) { throw new Error ('Choose Viewport, 720p, 1080p or 4K video.'); }
    if (VideoSizes[size]) { return { ...VideoSizes[size] }; }
    if (!viewport || !(viewport.width > 0) || !(viewport.height > 0)) { throw new Error ('The viewer has no size to record.'); }
    let width = viewport.width * pixelRatio, height = viewport.height * pixelRatio; const scale = Math.min (1, Math.sqrt (MaxPixels / (width * height)));
    width *= scale; height *= scale; return { width : Even (width), height : Even (height) };
}

// Frame times for [start, end] at fps: the first frame shows start, the last shows end exactly.
export function VideoFrameTimes (start, end, fps)
{
    if (!VideoFrameRates.includes (fps)) { throw new Error ('Choose 24, 25, 30 or 60 frames per second.'); }
    if (!Number.isFinite (start) || !Number.isFinite (end) || end <= start) { throw new Error ('The animation range is empty. Set a range end after its start.'); }
    const count = Math.round ((end - start) * fps) + 1; if (count > MaxFrames) { throw new Error ('The range is too long for one video (' + MaxFrames + ' frames at most). Shorten the range or lower the frame rate.'); }
    return Array.from ({ length : count }, (_, index) => index === count - 1 ? end : Math.min (end, start + index / fps));
}

export function VideoBitrate (width, height, fps) { return Math.round (Math.min (60e6, Math.max (1e6, width * height * fps * 0.1))); }

// Candidate encoder configurations, most compatible first for each container. 'auto' prefers MP4 (plays everywhere).
export function VideoCodecCandidates (format)
{
    if (!VideoFormats.includes (format)) { throw new Error ('Choose Auto, MP4 or WebM video.'); }
    const mp4 = [['mp4', 'avc1.640034', 'avc'], ['mp4', 'avc1.4d0034', 'avc'], ['mp4', 'avc1.42003e', 'avc']];
    const webm = [['webm', 'vp09.00.51.08', 'V_VP9'], ['webm', 'vp8', 'V_VP8']];
    return (format === 'mp4' ? mp4 : format === 'webm' ? webm : [...mp4, ...webm]).map (([container, codec, muxCodec]) => ({ container, codec, muxCodec }));
}

export async function ChooseVideoCodec (format, width, height, fps, encoder = globalThis.VideoEncoder)
{
    if (!encoder?.isConfigSupported) { throw new Error ('This browser cannot encode video (WebCodecs is unavailable). Use a current Chrome, Edge, Safari or Firefox.'); }
    for (const candidate of VideoCodecCandidates (format)) {
        const config = { codec : candidate.codec, width, height, bitrate : VideoBitrate (width, height, fps), framerate : fps, ...(candidate.container === 'mp4' ? { avc : { format : 'avc' } } : {}) };
        try { const support = await encoder.isConfigSupported (config); if (support?.supported) { return { ...candidate, config : support.config || config }; } } catch { /* Try the next codec. */ }
    }
    throw new Error (format === 'auto' ? 'This browser cannot encode MP4 or WebM at ' + width + ' × ' + height + '. Choose a smaller size.' : 'This browser cannot encode ' + format.toUpperCase () + ' at ' + width + ' × ' + height + '. Choose another format or a smaller size.');
}

export function ValidateVideoOptions (options = {})
{
    const { size = '1080p', fps = 30, format = 'auto', start = null, end = null } = options || {};
    if (!Object.hasOwn (VideoSizes, size)) { throw new Error ('Choose Viewport, 720p, 1080p or 4K video.'); }
    if (!VideoFrameRates.includes (fps)) { throw new Error ('Choose 24, 25, 30 or 60 frames per second.'); }
    if (!VideoFormats.includes (format)) { throw new Error ('Choose Auto, MP4 or WebM video.'); }
    for (const value of [start, end]) { if (value !== null && (!Number.isFinite (value) || value < 0)) { throw new Error ('Range times must be seconds of 0 or more.'); } }
    return { size, fps, format, start, end };
}

const Wait = () => new Promise (resolve => setTimeout (resolve, 0));

export class VideoExport
{
    constructor (website) { this.website = website; this.state = { status : 'idle', progress : 0, frame : 0, frames : 0, error : null }; this.result = null; this.listeners = new Set (); this.cancelled = false; }
    Subscribe (listener) { this.listeners.add (listener); return () => this.listeners.delete (listener); }
    Notify () { this.listeners.forEach (listener => listener (this.Inspect ())); }
    get running () { return this.state.status === 'encoding'; }
    Inspect ()
    {
        const r = this.result;
        return { ...this.state, video : r ? { filename : r.filename, mimeType : r.mimeType, container : r.container, codec : r.codec, width : r.width, height : r.height, fps : r.fps, frames : r.frames, durationSeconds : r.durationSeconds, start : r.start, end : r.end, bytes : r.blob.size, createdAt : r.createdAt } : null };
    }
    Cancel () { if (this.running) { this.cancelled = true; } return { cancelling : this.running }; }
    // Download the last finished video (an explicit local download; nothing is uploaded).
    Download ()
    {
        if (!this.result) { throw new Error ('Export a video first.'); }
        const url = URL.createObjectURL (this.result.blob), link = document.createElement ('a'); link.href = url; link.download = this.result.filename; document.body.appendChild (link); link.click (); link.remove ();
        setTimeout (() => URL.revokeObjectURL (url), 60000); return { filename : this.result.filename, bytes : this.result.blob.size };
    }

    async Export (options = {})
    {
        const website = this.website, editor = website.sessionEditor, viewer = website.viewer, timeline = editor.timeline;
        CaptureAllowed (website);
        if (this.running) { throw new Error ('A video export is already running.'); }
        if (editor.busy) { throw new Error ('Wait for the current edit to finish.'); }
        if (!editor.document.objects.length) { throw new Error ('Add a model before exporting video.'); }
        const { size, fps, format, start : startInput, end : endInput } = ValidateVideoOptions (options);
        const start = startInput ?? timeline.rangeStart, end = Math.min (endInput ?? timeline.rangeEnd, timeline.duration);
        const times = VideoFrameTimes (start, end, fps);
        const { width, height } = VideoDimensions (size, viewer.GetImageSize (), Math.min (2, window.devicePixelRatio || 1));
        const renderer = viewer.renderer, gl = renderer.getContext ();
        const limit = Math.min (renderer.capabilities.maxTextureSize, gl.getParameter (gl.MAX_RENDERBUFFER_SIZE) || 4096);
        if (width > limit || height > limit) { throw new Error ('This graphics device renders at most ' + limit + ' pixels per side. Choose a smaller video size.'); }
        const codec = await ChooseVideoCodec (format, width, height, fps);

        this.cancelled = false; this.state = { status : 'encoding', progress : 0, frame : 0, frames : times.length, error : null, width, height, fps, container : codec.container }; this.Notify ();
        // Same isolation as the render queue: the scene must not change while frames are captured.
        const navigation = viewer.navigation, navigationEnabled = navigation.enabled;
        const elements = ['toolbar', 'upload_panel_content', 'advance_animation_panel', 'material_drawer'].map (id => document.getElementById (id)).filter (Boolean);
        elements.push (...[editor.strip, website.sidebar?.detailsPanel?.contentDiv, website.sidebar?.settingsPanel?.panelDiv].filter (Boolean));
        const inert = elements.map (element => [element, element.inert]); inert.forEach (([element]) => { element.inert = true; });
        const timeBefore = timeline.time, players = (editor.players || []).map (player => [player, player.state.playing, player.state.time]);
        timeline.Stop (); players.forEach (([player]) => player.SetPlaying (false)); editor.busy = true; navigation.StopCameraMovement?.(); navigation.enabled = false; editor.RefreshButtons ();

        const scene = viewer.scene, light = viewer.shadingModel.directionalLight, lightBefore = light.position.clone ();
        const background = scene.background, targetBefore = renderer.getRenderTarget ();
        const dome = viewer.defaultDome, domePosition = dome?.position.clone (), domeScale = dome?.scale.clone ();
        const chunks = { error : null };
        const muxer = codec.container === 'mp4'
            ? new Mp4Muxer ({ target : new Mp4Target (), video : { codec : 'avc', width, height, frameRate : fps }, fastStart : 'in-memory', firstTimestampBehavior : 'offset' })
            : new WebmMuxer ({ target : new WebmTarget (), video : { codec : codec.muxCodec, width, height, frameRate : fps }, firstTimestampBehavior : 'offset' });
        const encoder = new VideoEncoder ({ output : (chunk, meta) => muxer.addVideoChunk (chunk, meta), error : error => { chunks.error = error; } });
        let target = null, hidden = [];
        try {
            encoder.configure (codec.config);
            await editor.packaging?.presentation?.PrepareAll?.();
            target = new THREE.WebGLRenderTarget (width, height, { depthBuffer : true, samples : Math.min (4, renderer.capabilities.maxSamples || 0) }); target.texture.colorSpace = THREE.SRGBColorSpace;
            const pixels = new Uint8Array (width * height * 4), keyInterval = fps * 2;
            for (let index = 0; index < times.length; index++) {
                if (this.cancelled) { throw new Error ('Video export cancelled.'); }
                if (chunks.error) { throw chunks.error; }
                if (gl.isContextLost ()) { throw new Error ('WebGL context lost. Reload the app before retrying.'); }
                const time = times[index];
                // Fold framing on, viewer refresh off: the same poses and automatic camera framing playback shows.
                timeline.Seek (time, false, true);
                players.forEach (([player]) => { if (!timeline.embeddedClips.some (action => action.objectId === player.object.id)) { SeekPlayer (player, time - start); } });
                const cameraState = CaptureCameraState (viewer), camera = RenderCamera (cameraState, width, height, viewer.camera.near, viewer.camera.far);
                hidden = HideRenderHelpers (viewer, false);
                if (dome) { dome.position.copy (camera.position); dome.scale.setScalar (Math.max (10, camera.far * 0.8)); dome.updateMatrixWorld (true); }
                viewer.shadingModel.UpdateByCamera ({ eye : { x : cameraState.eye[0], y : cameraState.eye[1], z : cameraState.eye[2] }, center : { x : cameraState.center[0], y : cameraState.center[1], z : cameraState.center[2] } });
                renderer.setRenderTarget (target); renderer.render (scene, camera); renderer.readRenderTargetPixels (target, 0, 0, width, height, pixels); renderer.setRenderTarget (targetBefore);
                hidden.forEach (([child, visible]) => { child.visible = visible; }); hidden = [];
                const frame = new VideoFrame (FlipRenderPixels (pixels, width, height), { format : 'RGBA', codedWidth : width, codedHeight : height, timestamp : Math.round (index * 1e6 / fps), duration : Math.round (1e6 / fps) });
                try { encoder.encode (frame, { keyFrame : index % keyInterval === 0 }); } finally { frame.close (); }
                this.state.frame = index + 1; this.state.progress = Math.round ((index + 1) / times.length * 98); this.Notify ();
                // Show progress in the viewer now and then, and let the encoder drain so memory stays bounded.
                if (index % 6 === 0) { if (dome) { dome.position.copy (domePosition); dome.scale.copy (domeScale); dome.updateMatrixWorld (true); } light.position.copy (lightBefore); viewer.Render (); }
                while (encoder.encodeQueueSize > 4) { await new Promise (resolve => setTimeout (resolve, 5)); }
                await Wait ();
            }
            await encoder.flush (); if (chunks.error) { throw chunks.error; }
            muxer.finalize ();
            const mimeType = codec.container === 'mp4' ? 'video/mp4' : 'video/webm';
            const blob = new Blob ([muxer.target.buffer], { type : mimeType });
            const name = (editor.document.name || 'Auto3D animation').replace (/[^\w .-]+/g, '').trim () || 'Auto3D animation';
            this.result = { blob, mimeType, container : codec.container, codec : codec.codec, width, height, fps, frames : times.length, durationSeconds : times.length / fps, start, end, createdAt : new Date ().toISOString (), filename : name + ' ' + width + 'x' + height + ' ' + fps + 'fps.' + codec.container };
            this.state = { ...this.state, status : 'completed', progress : 100 };
            return this.Inspect ();
        } catch (error) {
            this.state = { ...this.state, status : this.cancelled ? 'cancelled' : 'failed', error : this.cancelled ? null : error.message };
            if (!this.cancelled) { website.errorLogs?.Record ('error', 'video', error.message); }
            throw this.cancelled ? new Error ('Video export cancelled.') : error;
        } finally {
            hidden.forEach (([child, visible]) => { child.visible = visible; });
            if (encoder.state !== 'closed') { encoder.close (); }
            target?.dispose (); renderer.setRenderTarget (targetBefore); scene.background = background;
            if (dome) { dome.position.copy (domePosition); dome.scale.copy (domeScale); dome.updateMatrixWorld (true); }
            light.position.copy (lightBefore);
            editor.busy = false; navigation.enabled = navigationEnabled; inert.forEach (([element, value]) => { element.inert = value; });
            players.forEach (([player, playing, time]) => { player.Seek (time); if (playing) { player.SetPlaying (true); } });
            timeline.Seek (timeBefore); editor.RefreshButtons (); this.Notify ();
        }
    }
}

// Embedded glTF clips follow the video clock from the range start, looping when the clip loops.
function SeekPlayer (player, elapsed)
{
    const clip = player.clips?.[player.state.clip]; if (!clip || !player.action) { return; }
    const duration = clip.duration || 0, time = duration > 0 && player.state.loop ? elapsed * (player.state.speed || 1) % duration : Math.min (duration, elapsed * (player.state.speed || 1));
    player.action.paused = false; player.action.enabled = true; player.action.play (); player.action.time = Math.max (0, time); player.mixer.update (0); player.state.time = player.action.time;
}
