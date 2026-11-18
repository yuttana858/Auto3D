import assert from 'node:assert/strict';
import { VideoDimensions, VideoFrameTimes, VideoBitrate, VideoCodecCandidates, ChooseVideoCodec, ValidateVideoOptions } from '../source/website/videoexport.js';

describe ('Animation video export', () => {
    it ('steps the range frame by frame and ends on the exact end pose', () => {
        const times = VideoFrameTimes (1, 3, 30);
        assert.equal (times.length, 61); assert.equal (times[0], 1); assert.equal (times.at (-1), 3);
        times.slice (1).forEach ((time, index) => assert.ok (time > times[index], 'frame times increase'));
        assert.ok (Math.abs (times[1] - times[0] - 1 / 30) < 1e-12);
        assert.equal (VideoFrameTimes (0, 0.5, 24).length, 13);
        assert.throws (() => VideoFrameTimes (2, 2, 30), /range is empty/); assert.throws (() => VideoFrameTimes (0, 1, 29), /frames per second/);
        assert.throws (() => VideoFrameTimes (0, 3600, 60), /too long/);
    });
    it ('sizes presets exactly and keeps the viewport aspect with even dimensions within 4K', () => {
        assert.deepEqual (VideoDimensions ('1080p', null), { width : 1920, height : 1080 }); assert.deepEqual (VideoDimensions ('4k', null), { width : 3840, height : 2160 });
        assert.deepEqual (VideoDimensions ('viewport', { width : 801, height : 451 }, 1), { width : 800, height : 450 });
        const large = VideoDimensions ('viewport', { width : 3000, height : 2000 }, 2);
        assert.ok (large.width * large.height <= 3840 * 2160); assert.equal (large.width % 2, 0); assert.equal (large.height % 2, 0); assert.ok (Math.abs (large.width / large.height - 1.5) < 0.01);
        assert.throws (() => VideoDimensions ('8k', null), /Viewport, 720p/); assert.throws (() => VideoDimensions ('viewport', { width : 0, height : 0 }), /no size/);
    });
    it ('validates options and orders codecs MP4 first for auto', () => {
        assert.deepEqual (ValidateVideoOptions ({}), { size : '1080p', fps : 30, format : 'auto', start : null, end : null });
        assert.throws (() => ValidateVideoOptions ({ fps : 15 }), /frames per second/); assert.throws (() => ValidateVideoOptions ({ format : 'gif' }), /MP4 or WebM/); assert.throws (() => ValidateVideoOptions ({ start : -1 }), /0 or more/);
        assert.deepEqual (VideoCodecCandidates ('auto').map (c => c.container), ['mp4', 'mp4', 'mp4', 'webm', 'webm']);
        assert.deepEqual (VideoCodecCandidates ('webm').map (c => c.muxCodec), ['V_VP9', 'V_VP8']);
        assert.equal (VideoBitrate (1920, 1080, 30), 6220800); assert.equal (VideoBitrate (16, 16, 24), 1e6);
    });
    it ('falls back to WebM when H.264 encoding is unavailable and explains when nothing encodes', async () => {
        const encoder = { isConfigSupported : async config => ({ supported : config.codec.startsWith ('vp09'), config }) };
        const chosen = await ChooseVideoCodec ('auto', 1280, 720, 30, encoder); assert.equal (chosen.container, 'webm'); assert.equal (chosen.muxCodec, 'V_VP9'); assert.equal (chosen.config.bitrate, VideoBitrate (1280, 720, 30));
        await assert.rejects (ChooseVideoCodec ('mp4', 1280, 720, 30, encoder), /cannot encode MP4/);
        await assert.rejects (ChooseVideoCodec ('auto', 1280, 720, 30, undefined), /WebCodecs is unavailable/);
        const h264 = await ChooseVideoCodec ('auto', 1920, 1080, 30, { isConfigSupported : async config => ({ supported : true, config }) }); assert.equal (h264.container, 'mp4'); assert.deepEqual (h264.config.avc, { format : 'avc' });
    });
});
