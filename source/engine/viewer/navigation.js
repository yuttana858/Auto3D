import { Coord2D, CoordDistance2D, SubCoord2D } from '../geometry/coord2d.js';
import { Coord3D, CoordDistance3D, CrossVector3D, SubCoord3D, VectorAngle3D } from '../geometry/coord3d.js';
import { DegRad, IsGreater, IsLower, IsZero } from '../geometry/geometry.js';
import { ParabolicTweenFunction, TweenCoord3D } from '../geometry/tween.js';
import { CameraIsEqual3D, NavigationMode } from './camera.js';
import { GetDomElementClientCoordinates } from './domutils.js';

export class MouseInteraction
{
    constructor ()
    {
        this.prev = new Coord2D (0.0, 0.0);
        this.curr = new Coord2D (0.0, 0.0);
        this.diff = new Coord2D (0.0, 0.0);
        this.buttons = [];
    }

    Down (canvas, ev)
    {
        this.buttons.push (ev.which);
        this.curr = this.GetPositionFromEvent (canvas, ev);
        this.prev = this.curr.Clone ();
    }

    Move (canvas, ev)
    {
        this.curr = this.GetPositionFromEvent (canvas, ev);
		this.diff = SubCoord2D (this.curr, this.prev);
		this.prev = this.curr.Clone ();
	}

	Up (canvas, ev)
	{
		let buttonIndex = this.buttons.indexOf (ev.which);
		if (buttonIndex !== -1) {
			this.buttons.splice (buttonIndex, 1);
		}
		this.curr = this.GetPositionFromEvent (canvas, ev);
	}

	Leave (canvas, ev)
	{
		this.buttons = [];
		this.curr = this.GetPositionFromEvent (canvas, ev);
	}

	IsButtonDown ()
	{
		return this.buttons.length > 0;
	}

	GetButton ()
	{
		let length = this.buttons.length;
		if (length === 0) {
			return 0;
		}
		return this.buttons[length - 1];
	}

	GetPosition ()
	{
		return this.curr;
	}

	GetMoveDiff ()
	{
		return this.diff;
	}

	GetPositionFromEvent (canvas, ev)
	{
		return GetDomElementClientCoordinates (canvas, ev.clientX, ev.clientY);
	}
}

export class TouchInteraction
{
	constructor ()
	{
		this.prevPos = new Coord2D (0.0, 0.0);
		this.currPos = new Coord2D (0.0, 0.0);
		this.diffPos = new Coord2D (0.0, 0.0);
		this.prevDist = 0.0;
		this.currDist = 0.0;
		this.diffDist = 0.0;
		this.fingers = 0;
	}

	Start (canvas, ev)
	{
		if (ev.touches.length === 0) {
			return;
		}

		this.fingers = ev.touches.length;

		this.currPos = this.GetPositionFromEvent (canvas, ev);
		this.prevPos = this.currPos.Clone ();

		this.currDist = this.GetTouchDistanceFromEvent (canvas, ev);
		this.prevDist = this.currDist;
	}

	Move (canvas, ev)
	{
		if (ev.touches.length === 0) {
			return;
		}

		this.currPos = this.GetPositionFromEvent (canvas, ev);
		this.diffPos = SubCoord2D (this.currPos, this.prevPos);
		this.prevPos = this.currPos.Clone ();

		this.currDist = this.GetTouchDistanceFromEvent (canvas, ev);
		this.diffDist = this.currDist - this.prevDist;
		this.prevDist = this.currDist;
	}

	End (canvas, ev)
	{
		if (ev.touches.length === 0) {
			return;
		}

		this.fingers = 0;
		this.currPos = this.GetPositionFromEvent (canvas, ev);
		this.currDist = this.GetTouchDistanceFromEvent (canvas, ev);
	}

	IsFingerDown ()
	{
		return this.fingers !== 0;
	}

	GetFingerCount ()
	{
		return this.fingers;
	}

	GetPosition ()
	{
		return this.currPos;
	}

	GetMoveDiff ()
	{
		return this.diffPos;
	}

	GetDistanceDiff ()
	{
		return this.diffDist;
	}

	GetPositionFromEvent (canvas, ev)
	{
		let coord = null;
		if (ev.touches.length !== 0) {
			let touchEv = ev.touches[0];
			coord = GetDomElementClientCoordinates (canvas, touchEv.pageX, touchEv.pageY);
		}
		return coord;
	}

	GetTouchDistanceFromEvent (canvas, ev)
	{
		if (ev.touches.length !== 2) {
			return 0.0;
		}
		let touchEv1 = ev.touches[0];
		let touchEv2 = ev.touches[1];
		let distance = CoordDistance2D (
			GetDomElementClientCoordinates (canvas, touchEv1.pageX, touchEv1.pageY),
			GetDomElementClientCoordinates (canvas, touchEv2.pageX, touchEv2.pageY)
		);
		return distance;
	}
}

export class ClickDetector
{
	constructor ()
	{
		this.isClick = false;
		this.startPosition = null;
	}

	Start (startPosition)
	{
		this.isClick = true;
		this.startPosition = startPosition;
	}

	Move (currentPosition)
	{
		if (!this.isClick) {
			return;
		}

		if (this.startPosition !== null) {
			const maxClickDistance = 3.0;
			const currentDistance = CoordDistance2D (this.startPosition, currentPosition);
			if (currentDistance > maxClickDistance) {
				this.Cancel ();
			}
		} else {
			this.Cancel ();
		}
	}

	End ()
	{
		this.startPosition = null;
	}

	Cancel ()
	{
		this.isClick = false;
		this.startPosition = null;
	}

	IsClick ()
	{
		return this.isClick;
	}
}

export const NavigationType =
{
	None : 0,
	Orbit : 1,
	Pan : 2,
	Zoom : 3
};

export class Navigation
{
	constructor (canvas, camera, callbacks)
	{
		this.canvas = canvas;
		this.camera = camera;
		this.callbacks = callbacks;
		this.navigationMode = NavigationMode.FixedUpVector;

		this.mouse = new MouseInteraction ();
		this.touch = new TouchInteraction ();
		this.clickDetector = new ClickDetector ();

		this.onMouseClick = null;
		this.onMouseMove = null;
		this.onContext = null;
        this.enabled = true;
        this.suppressContextMenu = false;
        this.spacePan = false;
        this.panGesture = false;
        this.orbitCenter = null; this.rightOrbitStarted = false; this.heldOrbitAxes = [];

		if (this.canvas.addEventListener) {
			this.canvas.addEventListener ('mousedown', this.OnMouseDown.bind (this));
			this.canvas.addEventListener ('wheel', this.OnMouseWheel.bind (this));
			this.canvas.addEventListener ('touchstart', this.OnTouchStart.bind (this));
			this.canvas.addEventListener ('touchmove', this.OnTouchMove.bind (this));
			this.canvas.addEventListener ('touchcancel', this.OnTouchEnd.bind (this));
			this.canvas.addEventListener ('touchend', this.OnTouchEnd.bind (this));
			this.canvas.addEventListener ('contextmenu', this.OnContextMenu.bind (this));
		}
		if (document.addEventListener) {
            document.addEventListener ('keydown', this.OnPanKeyDown.bind (this));
            document.addEventListener ('keydown', this.OnAxisKeyDown.bind (this));
            document.addEventListener ('keyup', this.OnAxisKeyUp.bind (this));
            document.addEventListener ('keyup', ev => { if (ev.code === 'Space') { this.SetSpacePan (false); } });
            document.addEventListener ('visibilitychange', () => { if (document.hidden) { this.CancelPan (); this.heldOrbitAxes = []; this.onOrbitAxisChanged?.(null); } });
            globalThis.window?.addEventListener ('blur', () => { this.heldOrbitAxes = []; this.onOrbitAxisChanged?.(null); this.CancelPan (); });
			document.addEventListener ('mousemove', this.OnMouseMove.bind (this));
			document.addEventListener ('mouseup', this.OnMouseUp.bind (this));
			document.addEventListener ('mouseleave', this.OnMouseLeave.bind (this));
		}
	}

	SetMouseClickHandler (onMouseClick)
	{
		this.onMouseClick = onMouseClick;
	}

	SetMouseMoveHandler (onMouseMove)
	{
		this.onMouseMove = onMouseMove;
	}

	SetContextMenuHandler (onContext)
	{
		this.onContext = onContext;
	}

	GetNavigationMode ()
	{
		return this.navigationMode;
	}

	SetNavigationMode (navigationMode)
	{
		this.navigationMode = navigationMode;
	}

	GetCamera ()
	{
		return this.camera;
	}

	SetCamera (camera)
	{
		this.StopCameraMovement ();
		this.camera = camera;
	}

	StopCameraMovement ()
	{
		this.cameraMoveGeneration = (this.cameraMoveGeneration || 0) + 1;
		const movement = this.cameraMovement;
		this.cameraMovement = null;
		movement?.resolve ();
	}

	// Resolves when the current animated camera move ends or is superseded, so callers can await a settled view.
	WaitForCameraMovement ()
	{
		return this.cameraMovement ? this.cameraMovement.promise : Promise.resolve ();
	}

	// Jumps an in-progress animated move to its destination.
	FinishCameraMovement ()
	{
		const movement = this.cameraMovement;
		if (!movement) { return; }
		this.StopCameraMovement ();
		this.camera = movement.target;
		this.Update ();
	}

	MoveCamera (newCamera, stepCount)
	{
		function Step (obj, steps, count, index, generation, movement)
		{
			if (obj.cameraMoveGeneration !== generation) { movement.resolve (); return; }
			obj.camera.eye = steps.eye[index];
			obj.camera.center = steps.center[index];
			obj.camera.up = steps.up[index];
			obj.Update ();

			if (index < count - 1) {
				requestAnimationFrame (() => {
					Step (obj, steps, count, index + 1, generation, movement);
				});
			} else {
				if (obj.cameraMovement === movement) { obj.cameraMovement = null; }
				movement.resolve ();
			}
		}

		if (newCamera === null) {
			return;
		}
		this.StopCameraMovement ();
		const generation = this.cameraMoveGeneration;

		if (stepCount === 0 || CameraIsEqual3D (this.camera, newCamera)) {
			this.camera = newCamera;
		} else {
			let resolve = null;
			const promise = new Promise ((done) => { resolve = done; });
			const movement = { target : newCamera.Clone (), promise, resolve };
			this.cameraMovement = movement;
			let tweenFunc = ParabolicTweenFunction;
			let steps = {
				eye : TweenCoord3D (this.camera.eye, newCamera.eye, stepCount, tweenFunc),
				center : TweenCoord3D (this.camera.center, newCamera.center, stepCount, tweenFunc),
				up : TweenCoord3D (this.camera.up, newCamera.up, stepCount, tweenFunc)
			};
			requestAnimationFrame (() => {
				Step (this, steps, stepCount, 0, generation, movement);
			});
		}

		this.Update ();
	}

	GetFitToSphereCamera (center, radius)
	{
		if (IsZero (radius)) {
			return null;
		}

		let fitCamera = this.camera.Clone ();

		let offsetToOrigo = SubCoord3D (fitCamera.center, center);
		fitCamera.eye = SubCoord3D (fitCamera.eye, offsetToOrigo);
		fitCamera.center = center.Clone ();

		let centerEyeDirection = SubCoord3D (fitCamera.eye, fitCamera.center).Normalize ();
		let fieldOfView = this.camera.fov / 2.0;
		if (this.canvas.width < this.canvas.height) {
			fieldOfView = fieldOfView * this.canvas.width / this.canvas.height;
		}
		let distance = radius / Math.sin (fieldOfView * DegRad);

		fitCamera.eye = fitCamera.center.Clone ().Offset (centerEyeDirection, distance);

		return fitCamera;
	}

    SetSpacePan (held)
    {
        this.spacePan = held;
        this.onPanModifier?.(held || this.panGesture);
    }

    OnPanKeyDown (event)
    {
        if (event.code !== 'Space' || !this.enabled || event.ctrlKey || event.metaKey || event.altKey) { return; }
        if (event.target?.closest?.('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"]')) { return; }
        this.SetSpacePan (true);
        if (event.target === this.canvas || this.canvas.matches?.(':hover')) { event.preventDefault (); }
    }

    OnAxisKeyDown (event)
    {
        const axis = event.key?.toLowerCase (); if (!['x', 'y', 'z'].includes (axis) || event.ctrlKey || event.metaKey || event.altKey || event.target?.closest?.('input,textarea,select,button,[contenteditable="true"],[role="textbox"],dialog')) { return; }
        this.heldOrbitAxes ||= []; if (!this.heldOrbitAxes.includes (axis)) { this.heldOrbitAxes.push (axis); this.onOrbitAxisChanged?.(axis); }
    }
    OnAxisKeyUp (event) { this.heldOrbitAxes = (this.heldOrbitAxes || []).filter (axis => axis !== event.key?.toLowerCase ()); this.onOrbitAxisChanged?.(this.heldOrbitAxes.at (-1) || null); }

    CancelPan ()
    {
        this.panGesture = false; this.SetSpacePan (false);
        this.mouse.buttons = []; this.clickDetector.Cancel ();
    }

	OnMouseDown (ev)
	{
        if (!this.enabled) { return; }
		ev.preventDefault ();

		this.mouse.Down (this.canvas, ev);
        this.panGesture = this.spacePan && ev.which === 1;
		this.clickDetector.Start (this.mouse.GetPosition ());
        this.orbitCenter = null; this.rightOrbitStarted = false;
        if (ev.which === 3) { this.suppressContextMenu = false; }
	}

	OnMouseMove (ev)
	{
        if (!this.enabled) { return; }
		this.mouse.Move (this.canvas, ev);
		this.clickDetector.Move (this.mouse.GetPosition ());
		if (this.onMouseMove) {
			let mouseCoords = GetDomElementClientCoordinates (this.canvas, ev.clientX, ev.clientY);
			this.onMouseMove (mouseCoords);
		}

		if (!this.mouse.IsButtonDown ()) {
			return;
		}

		let moveDiff = this.mouse.GetMoveDiff ();
		let mouseButton = this.mouse.GetButton ();

		let navigationType = NavigationType.None;
        // Auto3D desktop navigation:
        // left = selection click only, middle-drag = pan, right-drag = orbit.
        if (mouseButton === 2 || (mouseButton === 1 && this.panGesture)) {
            navigationType = NavigationType.Pan;
        } else if (mouseButton === 3) {
            if (!this.clickDetector.IsClick ()) {
                navigationType = NavigationType.Orbit; this.suppressContextMenu = true;
                if (!this.rightOrbitStarted) { this.rightOrbitStarted = true; this.onOrbitStart?.(); }
            }
        }

		if (navigationType === NavigationType.Orbit) {
			let orbitRatio = 0.5;
			this.Orbit (moveDiff.x * orbitRatio, moveDiff.y * orbitRatio);
		} else if (navigationType === NavigationType.Pan) {
			let eyeCenterDistance = CoordDistance3D (this.camera.eye, this.camera.center);
			let panRatio = 0.001 * eyeCenterDistance;
			this.Pan (moveDiff.x * panRatio, moveDiff.y * panRatio);
		} else if (navigationType === NavigationType.Zoom) {
			let zoomRatio = 0.005;
			this.Zoom (-moveDiff.y * zoomRatio);
		}

		this.Update ();
	}

	OnMouseUp (ev)
	{
        if (!this.enabled) { this.mouse.Up (this.canvas, ev); this.CancelPan (); return; }
        const wasDown = this.mouse.IsButtonDown ();
		this.mouse.Up (this.canvas, ev);
		this.clickDetector.End ();

        if (wasDown && !this.panGesture && this.clickDetector.IsClick ()) {
			let mouseCoords = this.mouse.GetPosition ();
			this.Click (ev.which, mouseCoords, { ctrlKey : ev.ctrlKey, metaKey : ev.metaKey });
		}
        this.clickDetector.Cancel ();
        this.panGesture = false; this.SetSpacePan (this.spacePan);
	}

	OnMouseLeave (ev)
	{
        this.CancelPan ();
		this.mouse.Leave (this.canvas, ev);
		this.clickDetector.Cancel ();
	}

	OnTouchStart (ev)
	{
        this.orbitCenter = null;
        if (!this.enabled) { return; }
		ev.preventDefault ();

		this.touch.Start (this.canvas, ev);
		this.clickDetector.Start (this.touch.GetPosition ());
	}

	OnTouchMove (ev)
	{
        if (!this.enabled) { return; }
		ev.preventDefault ();

		this.touch.Move (this.canvas, ev);
		this.clickDetector.Move (this.touch.GetPosition ());
		if (!this.touch.IsFingerDown ()) {
			return;
		}

		let moveDiff = this.touch.GetMoveDiff ();
		let distanceDiff = this.touch.GetDistanceDiff ();
		let fingerCount = this.touch.GetFingerCount ();

		let navigationType = NavigationType.None;
		if (fingerCount === 1) {
			navigationType = NavigationType.Orbit;
		} else if (fingerCount === 2) {
			navigationType = NavigationType.Pan;
		}

		if (navigationType === NavigationType.Orbit) {
			let orbitRatio = 0.5;
			this.Orbit (moveDiff.x * orbitRatio, moveDiff.y * orbitRatio);
		} else if (navigationType === NavigationType.Pan) {
			let zoomRatio = 0.0025;
			this.Zoom (distanceDiff * zoomRatio);
			let panRatio = 0.001 * CoordDistance3D (this.camera.eye, this.camera.center);
			this.Pan (moveDiff.x * panRatio, moveDiff.y * panRatio);
		}

		this.Update ();
	}

	OnTouchEnd (ev)
	{
        if (!this.enabled) { this.touch.End (this.canvas, ev); this.clickDetector.Cancel (); return; }
		ev.preventDefault ();

		this.touch.End (this.canvas, ev);
		this.clickDetector.End ();

		if (this.clickDetector.IsClick ()) {
			let touchCoords = this.touch.GetPosition ();
			if (this.touch.GetFingerCount () === 1) {
				this.Click (1, touchCoords);
			}
		}
	}

	OnMouseWheel (ev)
	{
        if (!this.enabled) { return; }
		let params = ev || window.event;
		params.preventDefault ();

		let delta = -params.deltaY / 40;
        if (!Number.isFinite (delta) || delta === 0) { return; }
        // Desktop browsers report trackpad pinch as Ctrl+wheel.
        // Match the half-speed two-finger touch pinch without changing wheel steps.
		let ratio = params.ctrlKey ? 0.05 : 0.1;
		if (delta < 0) {
			ratio = ratio * -1.0;
		}

		this.Zoom (ratio);
		this.Update ();
	}

	OnContextMenu (ev)
	{
		ev.preventDefault ();
        if (!this.enabled) { return; }

        // A short right click opens the context menu. A right-button drag is
        // camera orbit, so suppress the contextmenu event generated on release.
        if (this.suppressContextMenu) {
            this.suppressContextMenu = false;
            this.clickDetector.Cancel ();
            return;
        }
        this.Context (ev.clientX, ev.clientY);
        this.clickDetector.Cancel ();
	}

	Orbit (angleX, angleY)
	{
        const pivot = this.orbitCenter || this.camera.center;
        const rotate = (axis, angle) => { this.camera.eye.Rotate (axis, angle, pivot); if (pivot !== this.camera.center) { this.camera.center.Rotate (axis, angle, pivot); } };
		let radAngleX = angleX * DegRad;
		let radAngleY = angleY * DegRad;

        const held = this.heldOrbitAxes?.at (-1);
        if (held) {
            const axis = new Coord3D (held === 'x' ? 1 : 0, held === 'y' ? 1 : 0, held === 'z' ? 1 : 0);
            const angle = -(Math.abs (radAngleX) >= Math.abs (radAngleY) ? radAngleX : radAngleY);
            rotate (axis, angle); this.camera.up.Rotate (axis, angle, new Coord3D (0, 0, 0)); return;
        }

		let viewDirection = SubCoord3D (this.camera.center, this.camera.eye).Normalize ();
		let horizontalDirection = CrossVector3D (viewDirection, this.camera.up).Normalize ();

		if (this.navigationMode === NavigationMode.FixedUpVector) {
			let originalAngle = VectorAngle3D (viewDirection, this.camera.up);
			let newAngle = originalAngle + radAngleY;
			if (IsGreater (newAngle, 0.0) && IsLower (newAngle, Math.PI)) {
				rotate (horizontalDirection, -radAngleY);
			}
			const worldZ = new Coord3D (0, 0, 1); rotate (worldZ, -radAngleX); this.camera.up.Rotate (worldZ, -radAngleX, new Coord3D (0, 0, 0));
		} else if (this.navigationMode === NavigationMode.FreeOrbit) {
			let verticalDirection = CrossVector3D (horizontalDirection, viewDirection).Normalize ();
			rotate (horizontalDirection, -radAngleY);
			const worldZ = new Coord3D (0, 0, 1); rotate (worldZ, -radAngleX); this.camera.up = verticalDirection; this.camera.up.Rotate (worldZ, -radAngleX, new Coord3D (0, 0, 0));
		}
	}

	Pan (moveX, moveY)
	{
		let viewDirection = SubCoord3D (this.camera.center, this.camera.eye).Normalize ();
		let horizontalDirection = CrossVector3D (viewDirection, this.camera.up).Normalize ();
		let verticalDirection = CrossVector3D (horizontalDirection, viewDirection).Normalize ();

		this.camera.eye.Offset (horizontalDirection, -moveX);
		this.camera.center.Offset (horizontalDirection, -moveX);

		this.camera.eye.Offset (verticalDirection, moveY);
		this.camera.center.Offset (verticalDirection, moveY);
	}

	Zoom (ratio)
	{
		let direction = SubCoord3D (this.camera.center, this.camera.eye);
		let distance = direction.Length ();
		let move = distance * ratio;
		this.camera.eye.Offset (direction, move);
	}

	Update ()
	{
		this.callbacks.onUpdate ();
	}

	Click (button, mouseCoords, modifiers = {})
	{
		if (this.onMouseClick) {
			this.onMouseClick (button, mouseCoords, modifiers);
		}
	}

	Context (clientX, clientY)
	{
		if (this.onContext) {
			let globalCoords = {
				x : clientX,
				y : clientY
			};
			let localCoords = GetDomElementClientCoordinates (this.canvas, clientX, clientY);
			this.onContext (globalCoords, localCoords);
		}
	}
}
