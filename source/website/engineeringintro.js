import { EngineeringIntroduction } from './engineeringsequence.js';

// Original wordmark lettering outlined from Liberation Sans Bold for deterministic drafting.
const logoPaths = [
    'M73.322265625 97.0 67.21875 79.421875H40.998046875L34.89453125 97.0H20.490234375L45.587890625 28.201171875H62.580078125L87.580078125 97.0ZM54.083984375 38.796875 53.791015625 39.87109375Q53.302734375 41.62890625 52.619140625 43.875Q51.935546875 46.12109375 44.220703125 68.58203125H63.99609375L57.208984375 48.806640625L55.109375 42.166015625Z',
    'M108.138671875 44.16796875V73.806640625Q108.138671875 87.72265625 117.513671875 87.72265625Q122.494140625 87.72265625 125.5458984375 83.4501953125Q128.59765625 79.177734375 128.59765625 72.48828125V44.16796875H142.318359375V85.18359375Q142.318359375 91.921875 142.708984375 97.0H129.623046875Q129.037109375 89.96875 129.037109375 86.501953125H128.79296875Q126.05859375 92.5078125 121.8349609375 95.2421875Q117.611328125 97.9765625 111.80078125 97.9765625Q103.40234375 97.9765625 98.91015625 92.8251953125Q94.41796875 87.673828125 94.41796875 77.712890625V44.16796875Z',
    'M167.80859375 97.87890625Q161.75390625 97.87890625 158.482421875 94.5830078125Q155.2109375 91.287109375 155.2109375 84.59765625V53.4453125H148.521484375V44.16796875H155.89453125L160.19140625 31.765625H168.78515625V44.16796875H178.794921875V53.4453125H168.78515625V80.88671875Q168.78515625 84.744140625 170.25 86.5751953125Q171.71484375 88.40625 174.791015625 88.40625Q176.40234375 88.40625 179.380859375 87.72265625V96.21875Q174.302734375 97.87890625 167.80859375 97.87890625Z',
    'M235.779296875 70.53515625Q235.779296875 83.376953125 228.650390625 90.6767578125Q221.521484375 97.9765625 208.923828125 97.9765625Q196.5703125 97.9765625 189.5390625 90.65234375Q182.5078125 83.328125 182.5078125 70.53515625Q182.5078125 57.791015625 189.5390625 50.4912109375Q196.5703125 43.19140625 209.216796875 43.19140625Q222.15625 43.19140625 228.9677734375 50.2470703125Q235.779296875 57.302734375 235.779296875 70.53515625ZM221.423828125 70.53515625Q221.423828125 61.111328125 218.34765625 56.86328125Q215.271484375 52.615234375 209.412109375 52.615234375Q196.912109375 52.615234375 196.912109375 70.53515625Q196.912109375 79.373046875 199.9638671875 83.9873046875Q203.015625 88.6015625 208.77734375 88.6015625Q221.423828125 88.6015625 221.423828125 70.53515625Z',
    'M289.6875 77.908203125Q289.6875 87.576171875 283.33984375 92.849609375Q276.9921875 98.123046875 265.2734375 98.123046875Q254.189453125 98.123046875 247.646484375 93.0205078125Q241.103515625 87.91796875 239.98046875 78.298828125L253.9453125 77.078125Q255.263671875 86.990234375 265.224609375 86.990234375Q270.15625 86.990234375 272.890625 84.548828125Q275.625 82.107421875 275.625 77.078125Q275.625 72.48828125 272.3046875 70.046875Q268.984375 67.60546875 262.44140625 67.60546875H257.65625V56.521484375H262.1484375Q268.056640625 56.521484375 271.03515625 54.1044921875Q274.013671875 51.6875 274.013671875 47.1953125Q274.013671875 42.947265625 271.6455078125 40.5302734375Q269.27734375 38.11328125 264.736328125 38.11328125Q260.48828125 38.11328125 257.8759765625 40.45703125Q255.263671875 42.80078125 254.873046875 47.09765625L241.15234375 46.12109375Q242.2265625 37.234375 248.525390625 32.205078125Q254.82421875 27.17578125 264.98046875 27.17578125Q275.771484375 27.17578125 281.8505859375 32.0341796875Q287.9296875 36.892578125 287.9296875 45.486328125Q287.9296875 51.931640625 284.1455078125 56.08203125Q280.361328125 60.232421875 273.232421875 61.599609375V61.794921875Q281.142578125 62.72265625 285.4150390625 66.9951171875Q289.6875 71.267578125 289.6875 77.908203125Z',
    'M359.318359375 62.087890625Q359.318359375 72.732421875 355.1435546875 80.6669921875Q350.96875 88.6015625 343.3271484375 92.80078125Q335.685546875 97.0 325.822265625 97.0H297.990234375V28.201171875H322.892578125Q340.275390625 28.201171875 349.796875 36.9658203125Q359.318359375 45.73046875 359.318359375 62.087890625ZM344.81640625 62.087890625Q344.81640625 51.00390625 339.0546875 45.1689453125Q333.29296875 39.333984375 322.599609375 39.333984375H312.39453125V85.8671875H324.6015625Q333.87890625 85.8671875 339.34765625 79.470703125Q344.81640625 73.07421875 344.81640625 62.087890625Z'
];
const logoWidth = 379.52;

export function EngineeringIntroMarkup ()
{
    return `<div class="entry_intro" aria-hidden="true">
        <svg class="entry_intro_mark" viewBox="0 0 ${logoWidth} 122" fill="none">
            <g class="entry_draft_guides">
                <g class="entry_sketch_grid"><path d="M-24 27H404M-24 44H404M-24 70H404M-24 98H404"/>${[18, 90, 146, 180, 238, 294, 361].map (x => `<path d="M${x} -14V124"/>`).join ('')}</g>
                <g class="entry_sketch_constraints"><circle cx="190" cy="62" r="100"/><circle cx="190" cy="62" r="103"/><path class="entry_sketch_axis" d="M50 62H330M190-62V184"/><path d="M86-39 294 163M86 163 294-39M82 62h16m-8-8v16M282 62h16m-8-8v16"/></g>
                <g class="entry_sketch_dimensions"><path d="M18-10V-24M361-10V-24M18-18H361M18-18l6-2v4ZM361-18l-6-2v4ZM-10 27H4M-10 98H4M-3 27V98M-3 27l-2 6h4ZM-3 98l-2-6h4Z"/><text x="190" y="-24" text-anchor="middle">W</text><text x="-12" y="65" text-anchor="middle">H</text><text x="314" y="117">PROFILE / 01</text><path d="M190 62 250-17h23"/><text x="277" y="-14">R</text></g>
                <g class="entry_sketch_profile">${logoPaths.map (d => `<path d="${d}"/>`).join ('')}</g>
            </g>
            ${logoPaths.map ((d, i) => `<path class="entry_logo_letter${i >= 4 ? ' entry_logo_blue' : ''}" pathLength="1" d="${d}"/>`).join ('')}
        </svg>
        <div class="entry_intro_slogan">${EngineeringIntroduction.slogan.split (' ').map (word => `<span>${word}</span>`).join (' ')}</div>
    </div>`;
}

// Position, lettering and text share the scene's clock, so pause/replay stays exact.
export function CreateEngineeringIntroduction (root)
{
    const wrap = root.querySelector ('.entry_canvas_wrap'), intro = root.querySelector ('.entry_intro');
    const mark = intro.querySelector ('.entry_intro_mark'), guides = intro.querySelector ('.entry_draft_guides');
    const letters = [...intro.querySelectorAll ('.entry_logo_letter')], words = [...intro.querySelectorAll ('.entry_intro_slogan span')];
    const construction = [...intro.querySelectorAll ('.entry_draft_guides > g')];
    const lengths = letters.map (path => path.getTotalLength ()), total = lengths.reduce ((a, b) => a + b, 0);
    const agent = root.querySelector ('.entry_agent'); let current = null;
    const clamp = value => Math.max (0, Math.min (1, value));
    function position () {
        if (!current) { return; }
        const centered = 1 - current.dockProgress, width = agent.offsetWidth, height = agent.offsetHeight;
        if (!width || !height || !wrap.clientWidth || !wrap.clientHeight) { return; }
        const scale = Math.min (1.35, (wrap.clientWidth - 24) / width);
        const x = (wrap.clientWidth - width * scale) / 2 - agent.offsetLeft;
        const y = (wrap.clientHeight - height * scale) / 2 - agent.offsetTop;
        agent.style.transform = `translate(${x * centered}px, ${y * centered}px) scale(${1 + (scale - 1) * centered})`;
    }
    const observer = new ResizeObserver (position); observer.observe (wrap); observer.observe (agent);
    return {
        update (sequence) {
            current = sequence; const logo = sequence.logo;
            intro.hidden = !logo.visible; intro.style.opacity = logo.opacity;
            if (logo.visible) {
                mark.style.transform = `perspective(600px) rotateX(${16 * (1 - logo.land)}deg) rotate(${-6 * (1 - logo.land)}deg) scale(${0.93 + logo.land * 0.07})`;
                guides.style.opacity = 1 - logo.color;
                construction.forEach ((group, i) => { group.style.opacity = clamp (logo.draw * 4 - i * 0.2); });
                let distance = total * logo.draw;
                letters.forEach ((path, i) => {
                    const fraction = clamp (distance / lengths[i]);
                    path.style.strokeDashoffset = 1 - fraction; path.style.fillOpacity = logo.color;
                    distance -= lengths[i];
                });
                words.forEach ((word, i) => { const reveal = clamp (logo.slogan * words.length - i); word.style.opacity = reveal; word.style.transform = `translateY(${(1 - reveal) * 8}px)`; });
            }
            agent.style.opacity = sequence.promptOpacity;
            agent.style.setProperty ('--entry-centered', 1 - sequence.dockProgress);
            agent.dataset.placement = sequence.dockProgress >= 1 ? 'corner' : sequence.dockProgress > 0 ? 'docking' : 'center';
            position ();
        },
        dispose () { observer.disconnect (); }
    };
}
