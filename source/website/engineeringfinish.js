// A clock-driven finish study, following the existing product / protection / fold sequence.
const ramp = (time, from, to) => Math.max (0, Math.min (1, (time - from) / (to - from)));
const ease = value => value * value * (3 - 2 * value);

export const EngineeringFinishDuration = 10.4;
export function EngineeringFinishState (time)
{
    const ink = ease (ramp (time, 0, 0.9)), white = ease (ramp (time, 2.2, 4));
    const turn = ease (ramp (time, 4.5, 6.7)), callouts = ease (ramp (time, 6.7, 7.8));
    const cutaway = ease (ramp (time, 7, 8.4));
    const phase = time < 0 ? 'none' : time < 2.2 ? 'kraft' : time < 4.5 ? 'white' : time < 6.7 ? 'turn' : 'materials';
    return { phase, ink, white, turn, callouts, cutaway, promptOpacity : 1 - ease (ramp (time, 4.5, 5.3)),
        title : phase === 'kraft' ? 'Black ink. Natural kraft.' : phase === 'white' ? 'White liner. Full color.' : phase === 'turn' ? 'A new perspective' : 'Materials, made visible',
        reply : phase === 'kraft' ? 'Applying black artwork to natural kraft.' : phase === 'white' ? 'Previewing multicolor print on a white liner.' : 'Inspecting the printed liner, corrugated core and molded pulp.' };
}
