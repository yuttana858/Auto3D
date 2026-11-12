const ramp = (time, start, end) => Math.max (0, Math.min (1, (time - start) / (end - start)));
const ease = value => 1 - Math.pow (1 - value, 3);
const pulse = (time, start, peak, end) => ramp (time, start, peak) * (1 - ramp (time, peak, end));
export const EngineeringHeading = 'Engineering intelligence.';

export function EngineeringEntranceState (time)
{
    return {
        frame : ease (ramp (time, 0, 0.16)), settle : ease (ramp (time, 0, 0.5)),
        flash : pulse (time, 0.02, 0.13, 0.55), nav : ease (ramp (time, 0.1, 0.42)),
        eyebrow : ease (ramp (time, 0.2, 0.48)), heading : ramp (time, 0.3, 1.25),
        subtitle : ease (ramp (time, 0.62, 1.05)), description : ease (ramp (time, 0.78, 1.15)),
        login : ease (ramp (time, 0.22, 0.95)), loginFlash : pulse (time, 0.83, 1, 1.38),
        visual : ease (ramp (time, 0.2, 0.55)), footer : ease (ramp (time, 0.45, 0.9)),
        text : EngineeringHeading.slice (0, Math.floor (EngineeringHeading.length * ramp (time, 0.3, 1.25))),
        complete : time >= 1.4
    };
}

export function CreateEngineeringEntrance (root)
{
    const banner = root.querySelector ('.entry_banner'), ink = root.querySelector ('.entry_heading_ink');
    const nav = root.querySelector ('.entry_nav'), eyebrow = root.querySelector ('.entry_pitch > .entry_eyebrow');
    const subtitle = root.querySelector ('h1 em'), description = root.querySelector ('.entry_description'), login = root.querySelector ('.entry_login');
    const visual = root.querySelector ('.entry_visual'), footer = root.querySelector ('.entry_footer');
    const reduced = window.matchMedia ('(prefers-reduced-motion: reduce)');
    let finished = reduced.matches, last = null;
    const reveal = (element, progress, travel) => { element.style.opacity = progress; element.style.transform = `translateY(${-travel * (1 - progress)}px)`; };
    function apply (frame) {
        last = frame; banner.dataset.entered = String (frame.complete);
        banner.style.opacity = frame.frame; banner.style.transform = `translateY(${8 * (1 - frame.settle)}px) scale(${0.99 + frame.settle * 0.01})`;
        banner.style.setProperty ('--entry-frame-flash', frame.flash); login.style.setProperty ('--entry-login-flash', frame.loginFlash);
        reveal (nav, frame.nav, 14); reveal (eyebrow, frame.eyebrow, 8); reveal (subtitle, frame.subtitle, 6);
        reveal (description, frame.description, 5); reveal (login, frame.login, 24); reveal (visual, frame.visual, 9); reveal (footer, frame.footer, 0);
        if (ink.textContent !== frame.text) { ink.textContent = frame.text; }
        ink.dataset.typing = String (frame.heading > 0 && frame.heading < 1);
    }
    function finish () { finished = true; apply (EngineeringEntranceState (2)); }
    const motion = () => { if (reduced.matches) { finish (); } };
    const focus = event => { if (event.target.closest ('.entry_login')) { finish (); } };
    root.addEventListener ('focusin', focus); reduced.addEventListener ('change', motion);
    return {
        update (state) {
            if (!state.available || reduced.matches) { finish (); return; }
            if (finished) { if (!last?.complete) { finish (); } return; }
            const frame = EngineeringEntranceState (state.sequence.sequenceTime); apply (frame); if (frame.complete) { finished = true; }
        },
        restart () { finished = reduced.matches; if (finished) { finish (); } },
        finish,
        inspect : () => ({ complete : Boolean (last?.complete), text : last?.text || '', frame : last?.frame || 0 }),
        dispose () { root.removeEventListener ('focusin', focus); reduced.removeEventListener ('change', motion); }
    };
}
