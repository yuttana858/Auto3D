import { CreateEngineeringHero, EngineeringStages } from './engineeringhero.js';
import { EngineeringSequenceState, EngineeringSequenceDuration } from './engineeringsequence.js';
import { EngineeringIntroMarkup, CreateEngineeringIntroduction } from './engineeringintro.js';
import { CreateEngineeringEntrance } from './engineeringentrance.js';
import { EngineeringMaterialsMarkup, CreateEngineeringMaterials } from './engineeringmaterials.js';

export function CreateEngineeringLanding (root, { panel, onSignIn, version = '' })
{
    root.classList.add ('engineering_entry');
    root.innerHTML = `
        <div class="entry_banner">
            <div class="entry_frame_flash" aria-hidden="true"></div>
            <header class="entry_nav">
                <button class="entry_brand" data-action="home" aria-label="Auto3D home">Auto<span>3D</span><i></i><small>ENGINEERING INTELLIGENCE</small></button>
                <nav aria-label="Main navigation"><span class="entry_edition">NEXT GENERATION / AGENTIC ENGINEERING</span><button class="entry_text_button" data-action="signin" aria-label="Go to sign in">Sign in <span aria-hidden="true">→</span></button></nav>
            </header>
            <main class="entry_main">
                <div class="entry_story">
                    <div class="entry_pitch">
                        <div class="entry_eyebrow"><span></span> FROM PRODUCT TO PROTECTION</div>
                        <h1 aria-label="Engineering intelligence. Built around your product."><span class="entry_heading_type" aria-hidden="true"><span class="entry_heading_measure">Engineering intelligence.</span><span class="entry_heading_ink">Engineering intelligence.</span></span><br><em>Built around your product.</em></h1>
                        <p class="entry_description">Product geometry. Protective structures. One agentic workspace.</p>
                    </div>
                    <section class="entry_visual" aria-label="Animated packaging workflow">
                        <div class="entry_visual_heading"><span>PACKAGING DESIGN STUDY / 001</span><span><span class="entry_scene_number">04 /</span><strong class="entry_scene_title">See every layer</strong></span></div>
                        <div class="entry_canvas_wrap">
                            <div class="entry_webgl_fallback" hidden>Product → protection → structure<br><small>The animated study needs WebGL. Sign-in is available alongside.</small></div>
                            <canvas role="img" aria-label="A motor protected by molded pulp and a folding kraft box, followed by black artwork, a white multicolor print wipe, a rightward turn and material callouts"></canvas>
                            ${EngineeringIntroMarkup ()}
                            ${EngineeringMaterialsMarkup ()}
                            <div class="entry_agent" role="img" aria-label="Animated glass prompt with a greeting to Glen, typed and spoken requests, agent replies and execution" data-phase="complete" data-running="false" data-mic-active="false">
                                <div class="entry_prompt_shell"><span class="entry_prompt_chevron" aria-hidden="true">›</span><span class="entry_prompt_line"><span class="entry_prompt_text"></span><i class="entry_typing_cursor" aria-hidden="true"></i></span><span class="entry_prompt_mic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6"/></svg></span><span class="entry_prompt_send" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></span></div>
                                <div class="entry_agent_response"><span aria-hidden="true">✦</span><p class="entry_agent_reply"></p></div>
                                <div class="entry_agent_execution"><span class="entry_prompt_step">01 / 03</span><span class="entry_execution_text"></span><span class="entry_execution_percent"></span><span class="entry_voice_wave" aria-hidden="true">${[0, 1, 2, 3, 4].map (i => `<i style="--bar:${i}"></i>`).join ('')}</span></div>
                                <div class="entry_execution_track" aria-hidden="true"><i></i></div>
                            </div>
                        </div>
                        <div class="entry_scene_footer">
                            <section class="entry_workflow" aria-label="Explore the packaging workflow">${[['01', 'Model'], ['02', 'Protect'], ['03', 'Engineer'], ['04', 'Review']].map (([n, title], i) => `<button class="entry_step" data-stage="${i}" aria-pressed="false"><span>${n}</span><strong>${title}</strong></button>`).join ('')}</section>
                            <div class="entry_playback"><button data-action="pause" aria-label="Pause animation" title="Pause animation">Ⅱ</button><button data-action="replay" aria-label="Replay animation" title="Replay animation">↻</button></div>
                        </div>
                    </section>
                </div>
                <aside class="entry_login" aria-label="Workspace access">
                    <div class="entry_eyebrow">YOUR ENGINEERING WORKSPACE</div>
                    <div class="entry_auth_mount"></div>
                    <div class="entry_session"></div>
                </aside>
            </main>
            <footer class="entry_footer"><span>Auto3D <b>·</b> Agentic packaging engineering</span><span class="entry_study_note">Animated workflow</span><span class="entry_version"></span></footer>
        </div>`;
    root.querySelector ('.entry_version').textContent = version;
    root.querySelector ('.entry_auth_mount').append (panel);
    let hero = null, suspended = false, login = true, state = { available : true, playing : true, stage : 3 };
    const agent = root.querySelector ('.entry_agent');
    const introduction = CreateEngineeringIntroduction (root);
    const entrance = CreateEngineeringEntrance (root);
    const materials = CreateEngineeringMaterials (root);
    const setText = (selector, text) => { const element = root.querySelector (selector); if (element.textContent !== text) { element.textContent = text; } };
    const update = value => {
        state = value; const stage = EngineeringStages[value.stage];
        const sequence = value.sequence || EngineeringSequenceState (EngineeringSequenceDuration - 1);
        const welcoming = sequence.phase === 'logo' || sequence.phase === 'greeting';
        setText ('.entry_scene_number', welcoming ? '00 /' : '0' + (value.stage + 1) + ' /'); setText ('.entry_scene_title', welcoming ? 'An idea starts here' : value.stage === 3 ? sequence.finish.title : stage.title);
        const pause = root.querySelector ('[data-action="pause"]'); pause.textContent = value.playing ? 'Ⅱ' : '▷'; pause.setAttribute ('aria-label', value.playing ? 'Pause animation' : 'Play animation'); pause.title = pause.getAttribute ('aria-label');
        root.querySelectorAll ('[data-stage]').forEach (item => item.setAttribute ('aria-pressed', String (Number (item.dataset.stage) === value.stage)));
        root.querySelector ('.entry_webgl_fallback').hidden = value.available; root.querySelector ('.entry_canvas_wrap canvas').hidden = !value.available; agent.hidden = !value.available;
        root.querySelectorAll ('.entry_playback button, [data-stage]').forEach (item => { item.disabled = !value.available; });
        root.querySelector ('.entry_canvas_wrap').dataset.sceneVisible = String (sequence.sceneVisible);
        agent.dataset.phase = sequence.phase; agent.dataset.input = sequence.inputMode; agent.dataset.micActive = String (sequence.micActive); agent.dataset.running = String (Boolean (value.playing && value.active));
        setText ('.entry_prompt_text', welcoming ? 'Your next idea…' : sequence.displayPrompt); setText ('.entry_agent_reply', sequence.reply); setText ('.entry_execution_text', sequence.execution);
        setText ('.entry_prompt_step', welcoming ? '✦' : '0' + (sequence.step + 1) + ' / 03'); setText ('.entry_execution_percent', sequence.phase === 'executing' ? Math.round (sequence.progress * 100) + '%' : '');
        const progress = ['logo', 'greeting', 'drafting', 'docking', 'replying'].includes (sequence.phase) ? 0 : sequence.phase === 'executing' ? sequence.progress : 1;
        root.querySelector ('.entry_execution_track i').style.transform = 'scaleX(' + progress + ')';
        introduction.update (sequence); entrance.update (value);
        agent.style.opacity = String (sequence.promptOpacity * sequence.finish.promptOpacity);
        materials.update (value);
    };
    function resume () { if (hero) { return; } suspended = false; hero = CreateEngineeringHero (root.querySelector ('canvas'), { onState : update }); }
    function show (view, focus = true) {
        if (!['home', 'signin'].includes (view)) { throw new Error ('Choose home or signin.'); }
        login = view === 'signin'; root.classList.toggle ('entry_signin', login);
        if (focus) { root.querySelector (login ? '.entry_login' : '.entry_pitch').scrollIntoView ({ block : 'nearest', behavior : 'instant' }); }
        if (focus) { (login ? panel.querySelector ('input:not(:disabled), button:not(:disabled)') : root.querySelector ('.entry_brand'))?.focus ({ preventScroll : true }); }
        return { opened : true, view };
    }
    function demo (action, stage) { if (suspended) { return { available : false, playing : false }; } if (action === 'restart') { entrance.restart (); } return hero.control (action, stage); }
    root.addEventListener ('click', event => {
        const button = event.target.closest ('button'); if (!button || !root.contains (button)) { return; }
        if (button.dataset.stage !== undefined) { demo ('stage', Number (button.dataset.stage)); return; }
        const action = button.dataset.action;
        if (action === 'signin') { onSignIn (); }
        else if (action === 'home') { show ('home'); }
        else if (action === 'pause') { demo (state.playing ? 'pause' : 'play'); }
        else if (action === 'replay') { demo ('restart'); }
    });
    const observer = new IntersectionObserver (entries => { hero?.setActive (entries[0].isIntersecting); }, { threshold : 0.03 }); observer.observe (root.querySelector ('.entry_visual'));
    resume ();
    return { show, demo, inspect : () => ({ view : login ? 'signin' : 'home', ...hero?.inspect (), presentationOnly : true, entrance : entrance.inspect () }), session : root.querySelector ('.entry_session'), resume, suspend () { suspended = true; hero?.dispose (); hero = null; }, dispose () { observer.disconnect (); introduction.dispose (); entrance.dispose (); hero?.dispose (); hero = null; } };
}
