// Visual storytelling only: no prompt submission, speech synthesis or microphone access.
import { EngineeringFinishDuration, EngineeringFinishState } from './engineeringfinish.js';
export const EngineeringIntroduction = Object.freeze ({
    drawStart : 0.15, drawEnd : 2.3, colorStart : 2.1, colorEnd : 2.9,
    landStart : 2.4, landEnd : 3.25, sloganStart : 2.9, sloganEnd : 3.8,
    fadeStart : 4.6, logoEnd : 5.2, greetingEnd : 7.8,
    greeting : 'Hi Glen, what would you like to create today?',
    slogan : 'Automated Intelligent Packaging System'
});
export const EngineeringPrompts = Object.freeze ([
    { prompt : 'Create 3D model US-54783.', inputMode : 'typing', reply : 'Building US-54783 and preparing its geometry.', complete : 'Product model ready.', tasks : ['Drawing product geometry', 'Resolving details', 'Preparing the model'], from : 0.1, to : 3.5, typing : 2, docking : 0.8, speaking : 0.9, executing : 2.6, hold : 0.4 },
    { prompt : 'Utilize MP tool for side and bottom protection.', inputMode : 'speech', reply : 'Forming molded-pulp side and base protection.', complete : 'Protective insert ready.', tasks : ['Mapping contact surfaces', 'Forming side protection', 'Adding bottom support'], from : 3.5, to : 7.1, typing : 2, docking : 0, speaking : 1, executing : 2.7, hold : 0.4 },
    { prompt : 'Pull in CAD design EC-US54783-110926 and assemble.', inputMode : 'speech', reply : 'Loading the CAD dieline and folding the kraft pack.', complete : 'Pack assembled. Ready for review.', tasks : ['Loading the CAD dieline', 'Folding walls and side returns', 'Aligning inner lids', 'Closing and locking the pack'], from : 7.1, to : 16.4, typing : 2.6, docking : 0, speaking : 1.1, executing : 5.8, hold : 0.5 }
]);

let offset = EngineeringIntroduction.greetingEnd;
export const EngineeringTiming = EngineeringPrompts.map (prompt => {
    const start = offset, dock = start + prompt.typing, reply = dock + prompt.docking, execute = reply + prompt.speaking, complete = execute + prompt.executing;
    offset = complete + prompt.hold; return Object.freeze ({ start, dock, reply, execute, complete, end : offset });
});
export const EngineeringReviewStart = offset;
export const EngineeringOutro = Object.freeze ({ fadeStart : offset + EngineeringFinishDuration, fadeEnd : offset + EngineeringFinishDuration + 1, pauseDuration : 2 });
export const EngineeringSequenceDuration = EngineeringOutro.fadeEnd + EngineeringOutro.pauseDuration;
export const EngineeringStagePositions = [...EngineeringTiming.map (item => item.complete + 0.05), offset + 8.8];
const ramp = (value, from, to) => Math.max (0, Math.min (1, (value - from) / (to - from)));
const ease = value => value * value * (3 - 2 * value);

export function EngineeringSequenceState (seconds)
{
    const sequenceTime = Math.max (0, seconds) % EngineeringSequenceDuration, cycle = Math.floor (Math.max (0, seconds) / EngineeringSequenceDuration);
    const intro = EngineeringIntroduction, t = sequenceTime;
    const finish = EngineeringFinishState (t - EngineeringReviewStart);
    let step = EngineeringTiming.findIndex (item => t < item.end), stage = step, phase, progress = 0, sceneTime;
    if (t < intro.logoEnd) { step = 0; stage = 0; phase = 'logo'; progress = t / intro.logoEnd; sceneTime = 0.1; }
    else if (t < intro.greetingEnd) { step = 0; stage = 0; phase = 'greeting'; progress = (t - intro.logoEnd) / (intro.greetingEnd - intro.logoEnd); sceneTime = 0.1; }
    else if (step === -1) {
        step = 2; stage = 3; progress = Math.min ((t - EngineeringReviewStart) / (EngineeringFinishDuration - 0.8), 1);
        phase = progress < 1 ? 'reviewing' : 'complete'; sceneTime = 16.4 + (21 - 16.4) * progress;
    } else {
        const timing = EngineeringTiming[step], item = EngineeringPrompts[step];
        if (t < timing.dock) { phase = 'drafting'; progress = (t - timing.start) / item.typing; sceneTime = item.from; }
        else if (t < timing.reply) { phase = 'docking'; progress = (t - timing.dock) / item.docking; sceneTime = item.from; }
        else if (t < timing.execute) { phase = 'replying'; progress = (t - timing.reply) / item.speaking; sceneTime = item.from; }
        else if (t < timing.complete) { phase = 'executing'; progress = (t - timing.execute) / item.executing; sceneTime = item.from + (item.to - item.from) * progress; }
        else { phase = 'complete'; progress = 1; sceneTime = item.to; }
    }
    const item = EngineeringPrompts[step], drafting = phase === 'drafting', welcome = ['logo', 'greeting'].includes (phase);
    const words = item.prompt.split (' '), greetingWords = intro.greeting.split (' ');
    const displayPrompt = welcome ? '' : !drafting ? item.prompt : item.inputMode === 'typing' ? item.prompt.slice (0, Math.floor (item.prompt.length * progress)) : words.slice (0, Math.floor (words.length * progress)).join (' ');
    const greetingText = greetingWords.slice (0, Math.ceil (greetingWords.length * ramp (t, intro.logoEnd + 0.2, intro.logoEnd + 1.7))).join (' ');
    return {
        sequenceTime, cycle, stage, step, phase, progress, sceneTime, finish, prompt : item.prompt, inputMode : item.inputMode,
        outro : { opacity : 1 - ease (ramp (t, EngineeringOutro.fadeStart, EngineeringOutro.fadeEnd)), phase : t < EngineeringOutro.fadeStart ? 'visible' : t < EngineeringOutro.fadeEnd ? 'fading' : 'holding' },
        micActive : drafting && item.inputMode === 'speech', displayPrompt,
        sceneVisible : t >= EngineeringTiming[0].execute,
        dockProgress : ease (ramp (t, EngineeringTiming[0].dock, EngineeringTiming[0].reply)),
        promptOpacity : ease (ramp (t, intro.logoEnd, intro.logoEnd + 0.4)),
        logo : {
            visible : t < intro.logoEnd,
            draw : ramp (t, intro.drawStart, intro.drawEnd), color : ease (ramp (t, intro.colorStart, intro.colorEnd)),
            land : ease (ramp (t, intro.landStart, intro.landEnd)), slogan : ramp (t, intro.sloganStart, intro.sloganEnd),
            opacity : ease (ramp (t, 0, 0.2)) * (1 - ease (ramp (t, intro.fadeStart, intro.logoEnd)))
        },
        reply : stage === 3 ? finish.reply : welcome ? greetingText : step === 0 && (drafting || phase === 'docking') ? intro.greeting : drafting ? 'Voice request becoming text…' : phase === 'complete' ? item.complete : item.reply,
        execution : welcome ? 'AUTO3D / ENGINEERING ASSISTANT' : phase === 'docking' ? 'Request received' : drafting ? item.inputMode === 'speech' ? 'VOICE → TEXT' : 'GLEN IS TYPING' : phase === 'replying' ? 'Agent response' : phase === 'reviewing' ? 'Inspecting every layer' : phase === 'complete' ? 'Complete' : item.tasks[Math.min (item.tasks.length - 1, Math.floor (progress * item.tasks.length))]
    };
}
