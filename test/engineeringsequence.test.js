import assert from 'node:assert/strict';
import { EngineeringIntroduction, EngineeringPrompts, EngineeringTiming, EngineeringStagePositions, EngineeringSequenceState as state, EngineeringSequenceDuration, EngineeringOutro } from '../source/website/engineeringsequence.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

describe ('Animated packaging conversation', function () {
    it ('preserves the full study and adds a fade and pause to a 44-second loop', function () {
        assert.ok (Math.abs (EngineeringSequenceDuration - 44) < 1e-8);
        assert.ok (EngineeringPrompts.every (item => item.executing <= 5.8));
        let previous = 0;
        for (let time = 0; time < EngineeringSequenceDuration; time += 0.05) { const frame = state (time); assert.ok (frame.sceneTime >= previous - 1e-8); previous = frame.sceneTime; }
        assert.equal (state (EngineeringSequenceDuration).stage, 0);
    });
    it ('fades for one second, holds empty for two, and restarts with a visible introduction', function () {
        assert.equal (EngineeringOutro.fadeEnd - EngineeringOutro.fadeStart, 1);
        assert.equal (EngineeringSequenceDuration - EngineeringOutro.fadeEnd, 2);
        assert.equal (state (EngineeringOutro.fadeStart).outro.opacity, 1);
        const midpoint = state (EngineeringOutro.fadeStart + 0.5);
        assert.equal (midpoint.outro.phase, 'fading'); assert.equal (midpoint.outro.opacity, 0.5);
        for (const delta of [0, 0.5, 1, 1.999]) {
            const frame = state (EngineeringOutro.fadeEnd + delta);
            assert.equal (frame.outro.phase, 'holding'); assert.equal (frame.outro.opacity, 0); assert.equal (frame.sceneTime, 21);
        }
        const loop = state (EngineeringSequenceDuration + 0.1);
        assert.equal (loop.cycle, 1); assert.equal (loop.phase, 'logo'); assert.equal (loop.outro.opacity, 1);
        assert.equal (loop.sceneVisible, false);
        assert.ok (EngineeringStagePositions.every (time => state (time).outro.opacity === 1), 'stage selection and reduced-motion stills stay visible');
    });
    it ('drafts, colorizes and holds the logo before greeting Glen and docking his request', function () {
        const drafting = state (1), colored = state (3.2), held = state (4.3), fading = state (4.9);
        assert.ok (drafting.logo.draw > 0 && drafting.logo.draw < 1); assert.equal (drafting.logo.color, 0);
        assert.equal (colored.logo.color, 1); assert.equal (held.logo.slogan, 1); assert.equal (held.logo.opacity, 1);
        assert.ok (fading.logo.opacity > 0 && fading.logo.opacity < 1);
        const greeting = state (7.4); assert.equal (greeting.phase, 'greeting'); assert.equal (greeting.logo.visible, false);
        assert.equal (greeting.reply, EngineeringIntroduction.greeting); assert.equal (greeting.displayPrompt, ''); assert.equal (greeting.dockProgress, 0);
        const request = state (EngineeringTiming[0].dock - 0.1); assert.equal (request.dockProgress, 0); assert.equal (request.sceneVisible, false);
        const docking = state ((EngineeringTiming[0].dock + EngineeringTiming[0].reply) / 2);
        assert.equal (docking.phase, 'docking'); assert.equal (docking.displayPrompt, EngineeringPrompts[0].prompt); assert.ok (docking.dockProgress > 0 && docking.dockProgress < 1);
        for (let time = 0; time < EngineeringTiming[0].execute; time += 0.1) { assert.equal (state (time).sceneVisible, false); }
        const modeling = state (EngineeringTiming[0].execute + 0.1); assert.equal (modeling.dockProgress, 1); assert.equal (modeling.sceneVisible, true);
        const replay = state (EngineeringSequenceDuration + 1); assert.equal (replay.phase, 'logo'); assert.equal (replay.sceneVisible, false);
    });
    it ('types the first prompt by character and transcribes the voice prompts by whole words', function () {
        const first = state (EngineeringTiming[0].start + 0.8); assert.equal (first.inputMode, 'typing'); assert.equal (first.micActive, false);
        assert.ok (first.displayPrompt.length > 0 && first.displayPrompt.length < first.prompt.length); assert.ok (first.prompt.startsWith (first.displayPrompt));
        for (const step of [1, 2]) {
            let previous = '';
            const item = EngineeringPrompts[step], words = item.prompt.split (' ');
            for (let sample = 0; sample < 50; sample++) {
                const frame = state (EngineeringTiming[step].start + item.typing * sample / 50);
                assert.equal (frame.micActive, true); assert.equal (frame.inputMode, 'speech'); assert.ok (frame.displayPrompt.startsWith (previous));
                const count = frame.displayPrompt ? frame.displayPrompt.split (' ').length : 0;
                assert.equal (frame.displayPrompt, words.slice (0, count).join (' ')); previous = frame.displayPrompt;
            }
            assert.equal (state (EngineeringTiming[step].reply + 0.01).micActive, false);
            assert.equal (state (EngineeringTiming[step].reply + 0.01).displayPrompt, item.prompt);
        }
    });
    it ('keeps geometry held for prompts and replies, then runs the matching assembly action', function () {
        EngineeringTiming.forEach ((timing, step) => {
            const item = EngineeringPrompts[step];
            assert.equal (state (timing.start + 0.1).sceneTime, item.from); assert.equal (state (timing.reply + 0.1).sceneTime, item.from);
            const frame = state ((timing.execute + timing.complete) / 2); assert.equal (frame.phase, 'executing'); assert.ok (frame.sceneTime > item.from && frame.sceneTime < item.to);
            assert.equal (state (timing.complete + 0.1).sceneTime, item.to);
        });
        EngineeringStagePositions.forEach ((position, stage) => { const frame = state (position); assert.equal (frame.stage, stage); assert.equal (frame.displayPrompt, EngineeringPrompts[Math.min (stage, 2)].prompt); });
    });
    it ('retains inert compatibility commands without submitting prompts or enabling voice', async function () {
        const website = { auth : { user : null }, accountReady : false, sessionEditor : {} }; website.sessionEditor.website = website;
        const commands = CreateAgentCommands (website);
        const macro = await commands.RunMacro ({ version : 1, steps : [{ id : 'prompt', command : 'landing.prompt.submit', arguments : { prompt : EngineeringPrompts[0].prompt } }, { id : 'voice', command : 'landing.prompt.voice', arguments : { enabled : true } }] });
        assert.equal (macro.ok, true); assert.equal (macro.completed[0].result.accepted, false); assert.equal (macro.completed[1].result.enabled, false);
        assert.ok (macro.completed.every (item => item.result.presentationOnly));
        for (const args of [{}, { prompt : 1 }, { prompt : '' }, { prompt : 'x'.repeat (241) }, { prompt : 'hello', upload : true }]) { assert.equal ((await commands.Execute ('landing.prompt.submit', args)).ok, false); }
        assert.equal ((await commands.Execute ('landing.prompt.voice', { enabled : 'yes' })).ok, false);
        assert.equal ((await commands.Execute ('object.transform', {})).ok, false);
    });
});
