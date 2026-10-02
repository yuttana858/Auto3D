import * as THREE from 'three';
import { AppVersion } from './preferences.js';
import { WorkspaceDialog } from './modellibrary.js';
import { EnablePopupFade, FadeOut } from './popuptransition.js';

function CreateScene (canvas, animated)
{
    let renderer;
    try { renderer = new THREE.WebGLRenderer ({ canvas, antialias : true, alpha : true }); }
    catch { return () => {}; }
    renderer.setPixelRatio (Math.min (window.devicePixelRatio || 1, 1.5));
    const scene = new THREE.Scene ();
    const camera = new THREE.PerspectiveCamera (42, 1, 0.1, 100);
    camera.position.set (0, 0, animated ? 12 : 10);
    const group = new THREE.Group (); scene.add (group);
    const geometries = [];
    const materials = [];
    const add = (geometry, material, position, scale = 1) => {
        geometries.push (geometry); materials.push (material);
        const mesh = new THREE.Mesh (geometry, material); mesh.position.set (...position); mesh.scale.setScalar (scale); group.add (mesh);
        return mesh;
    };
    if (animated) {
        add (new THREE.IcosahedronGeometry (2.2, 1), new THREE.MeshBasicMaterial ({ color : 0x48a8df, wireframe : true, transparent : true, opacity : 0.28 }), [-4, 0.3, -1]);
        add (new THREE.TorusKnotGeometry (1.6, 0.45, 90, 10), new THREE.MeshBasicMaterial ({ color : 0x687ff0, wireframe : true, transparent : true, opacity : 0.24 }), [4, -0.2, -1]);
        add (new THREE.OctahedronGeometry (2.2, 0), new THREE.MeshBasicMaterial ({ color : 0x73dfef, wireframe : true, transparent : true, opacity : 0.14 }), [0, -2.8, -4]);
    } else {
        scene.add (new THREE.AmbientLight (0xffffff, 1.3));
        for (const [color, intensity, position] of [[0x67dfff, 65, [3, 4, 4]], [0x8e66ff, 80, [-4, 1, 2]], [0xffffff, 40, [0, -2, 4]]]) {
            const light = new THREE.PointLight (color, intensity); light.position.set (...position); scene.add (light);
        }
        const hero = add (new THREE.TorusKnotGeometry (1.1, 0.34, 160, 24), new THREE.MeshPhysicalMaterial ({ color : 0x71b9d2, metalness : 0.72, roughness : 0.2, clearcoat : 1 }), [1.75, 0, 0]);
        hero.scale.setScalar (2);
        hero.rotation.set (0.4, 0.7, 0.2);
        const cage = add (new THREE.IcosahedronGeometry (1.55, 0), new THREE.MeshBasicMaterial ({ color : 0x6c98c8, wireframe : true, transparent : true, opacity : 0.28 }), [1.75, 0, 0]);
        cage.scale.setScalar (2);
        cage.rotation.set (0.2, 0.5, 0);
    }
    const resize = () => {
        const width = canvas.clientWidth || 800; const height = canvas.clientHeight || 300;
        renderer.setSize (width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix ();
        renderer.render (scene, camera);
    };
    resize ();
    window.addEventListener ('resize', resize);
    const reduced = window.matchMedia ('(prefers-reduced-motion: reduce)').matches;
    if (animated && !reduced) {
        renderer.setAnimationLoop ((time) => {
            group.children.forEach ((mesh, index) => {
                mesh.rotation.x = time * 0.00012 + index * 0.4;
                mesh.rotation.y = time * 0.00018 + index;
            });
            renderer.render (scene, camera);
        });
    }
    return () => {
        window.removeEventListener ('resize', resize); renderer.setAnimationLoop (null);
        geometries.forEach ((geometry) => geometry.dispose ()); materials.forEach ((material) => material.dispose ()); renderer.dispose ();
    };
}

function ShowWelcome ()
{
    const dialog = WorkspaceDialog ('Welcome to Auto3D'); dialog.classList.add ('welcome_dialog');
    dialog.addEventListener ('click', (event) => {
        const bounds = dialog.getBoundingClientRect ();
        if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) { dialog.close (); }
    });
    const banner = document.createElement ('div'); banner.className = 'welcome_banner';
    const canvas = document.createElement ('canvas'); canvas.setAttribute ('role', 'img'); canvas.setAttribute ('aria-label', 'Glossy sculptural 3D knot inside a geometric wireframe');
    const title = document.createElement ('div'); title.className = 'welcome_banner_title';
    const eyebrow = document.createElement ('span'); eyebrow.textContent = 'YOUR NEXT DIMENSION';
    const headline = document.createElement ('h3'); headline.textContent = 'Big ideas.\nEvery angle.';
    title.append (eyebrow, headline); banner.append (canvas, title); dialog.appendChild (banner);
    const copy = document.createElement ('div'); copy.className = 'welcome_copy';
    const intro = document.createElement ('p'); intro.textContent = 'Turn your models into a scene worth exploring. Auto3D brings viewing, material editing and presentation together in your browser.';
    copy.appendChild (intro);
    const features = document.createElement ('div'); features.className = 'welcome_features';
    for (const [heading, description] of [
        ['Explore every detail', 'Drop in CAD and 3D files—including bundled ZAE models. Orbit, zoom and inspect geometry and dimensions.'],
        ['Make it your own', 'Swap textures, preserve UV layouts and tune materials, gloss, color and studio lighting.'],
        ['Build a bigger picture', 'Arrange multiple models, save reusable sessions on your device or to a file, and publish to the shared library.']
    ]) {
        const feature = document.createElement ('div');
        const name = document.createElement ('h4'); name.textContent = heading;
        const text = document.createElement ('p'); text.textContent = description;
        feature.append (name, text); features.appendChild (feature);
    }
    copy.appendChild (features);
    const footer = document.createElement ('div'); footer.className = 'welcome_footer';
    const hint = document.createElement ('span'); hint.textContent = 'Start with a model. See where it takes you. · v' + AppVersion;
    const start = document.createElement ('button'); start.className = 'workspace_primary'; start.textContent = 'Let’s explore'; start.addEventListener ('click', () => dialog.close ());
    const tour = document.createElement ('button'); tour.textContent = 'Take a tour'; tour.className = 'welcome_tour';
    tour.addEventListener ('click', () => { dialog.close (); StartTour (); });
    footer.append (hint, tour, start); copy.appendChild (footer); dialog.appendChild (copy);
    const dispose = CreateScene (canvas, false); dialog.addEventListener ('close', dispose, { once : true }); start.focus ();
}

function StartTour ()
{
    const steps = [
        ['#upload_panel_content', 'Bring your models in', 'Upload or drop a model here. Include its textures, or use a bundled ZAE file. Try the sample model to get started.'],
        ['#session_objects', 'Build your scene', 'Add multiple models, select an object, and manage its visibility or replace it while keeping its placement.'],
        ['#materials_section', 'Give every surface a look', 'Select a model to see its materials. The advanced editor lets you replace textures, inspect UVs, and adjust surface properties.'],
        ['#lighting_section', 'Set the atmosphere', 'Choose backgrounds, studio lighting or HDRI environments. Toggle the horizon and ground grid to frame your scene.'],
        ['.scene_tools', 'Arrange and explore', 'Use the object tools to move, rotate, scale, duplicate and focus your selection. Undo lets you step back through object edits.'],
        ['#data_panel_toggle', 'Inspect the details', 'The Model data panel shows geometry, dimensions and material information for your model.'],
        ['#header_buttons', 'Keep your ideas close', 'Open Library to browse saved models. Save sessions to this browser, a file on disk, or the shared library. Preferences includes display and unit settings.']
    ];
    const dialog = document.createElement ('dialog'); dialog.className = 'tour_overlay'; dialog.setAttribute ('aria-label', 'Auto3D guided tour');
    EnablePopupFade (dialog);
    const spotlight = document.createElement ('div'); spotlight.className = 'tour_spotlight'; spotlight.setAttribute ('aria-hidden', 'true');
    const card = document.createElement ('div'); card.className = 'tour_card';
    const count = document.createElement ('span'); count.className = 'tour_count';
    const heading = document.createElement ('h2'); const text = document.createElement ('p');
    const actions = document.createElement ('div'); actions.className = 'tour_actions';
    const close = document.createElement ('button'); close.textContent = 'Skip tour'; close.addEventListener ('click', () => dialog.close ());
    const next = document.createElement ('button'); next.className = 'tour_next';
    let index = 0;
    const position = () => {
        const target = document.querySelector (steps[index][0]);
        const bounds = (target || document.getElementById ('main_viewer')).getBoundingClientRect ();
        Object.assign (spotlight.style, { left : bounds.left - 5 + 'px', top : bounds.top - 5 + 'px', width : bounds.width + 10 + 'px', height : bounds.height + 10 + 'px' });
        const width = Math.min (340, window.innerWidth - 32);
        const left = bounds.right + width + 28 < window.innerWidth ? bounds.right + 20 : Math.max (16, bounds.left - width - 20);
        const top = Math.max (16, Math.min (bounds.top, window.innerHeight - card.offsetHeight - 16));
        card.style.left = Math.min (left, window.innerWidth - width - 16) + 'px'; card.style.top = top + 'px';
    };
    const show = () => {
        count.textContent = 'QUICK TOUR · ' + (index + 1) + ' / ' + steps.length;
        heading.textContent = steps[index][1]; text.textContent = steps[index][2];
        next.textContent = index === steps.length - 1 ? 'Start exploring' : 'Next'; position (); next.focus ();
    };
    next.addEventListener ('click', () => { if (index === steps.length - 1) { dialog.close (); } else { index++; show (); } });
    actions.append (close, next); card.append (count, heading, text, actions); dialog.append (spotlight, card);
    dialog.addEventListener ('click', (event) => { if (event.target === dialog || event.target === spotlight) { dialog.close (); } });
    window.addEventListener ('resize', position);
    dialog.addEventListener ('close', () => { window.removeEventListener ('resize', position); dialog.remove (); });
    document.body.appendChild (dialog); dialog.showModal (); show ();
}

export function StartWelcomeSequence ()
{
    const splash = document.getElementById ('startup_splash');
    if (!splash) { return; }
    splash.querySelector ('.splash_version').textContent = 'v' + AppVersion;
    const dispose = CreateScene (splash.querySelector ('canvas'), true);
    const main = document.getElementById ('main'); const header = document.getElementById ('header');
    main.inert = true; header.inert = true;
    let finished = false;
    const finish = async (tour = false, greetUser = true) => {
        if (finished) { return; } finished = true;
        splash.style.pointerEvents = 'none';
        await FadeOut (splash, 500);
        dispose (); splash.remove (); main.inert = false; header.inert = false;
        if (tour) { StartTour (); return; }
        if (!greetUser) { return; }
        const greet = () => {
            if (document.querySelector ('dialog[open], .ov_progress_img')) { window.setTimeout (greet, 300); return; }
            ShowWelcome ();
        };
        greet ();
    };
    const tour = document.createElement ('button'); tour.className = 'splash_tour'; tour.textContent = 'Take a tour →';
    tour.addEventListener ('click', () => finish (true)); splash.appendChild (tour);
    splash.addEventListener ('click', (event) => { if (event.target === splash || event.target.tagName === 'CANVAS') { finish (false, false); } });
    window.setTimeout (() => {
        if (finished) { return; }
        finish ();
    }, 3000);
}
