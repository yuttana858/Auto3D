import * as THREE from 'three';

export function GetWorldAxisDirections (cameraQuaternion)
{
    const inverse = cameraQuaternion.clone ().invert ();
    return [
        { name : 'X', color : '#ef6262', vector : new THREE.Vector3 (1, 0, 0) },
        { name : 'Y', color : '#66bd74', vector : new THREE.Vector3 (0, 1, 0) },
        { name : 'Z', color : '#599de6', vector : new THREE.Vector3 (0, 0, 1) }
    ].map ((axis) => ({ ...axis, vector : axis.vector.applyQuaternion (inverse) }));
}

export class AxisIndicator
{
    constructor (viewer, svg)
    {
        this.svg = svg;
        this.axes = [];
        for (const name of ['X', 'Y', 'Z']) {
            for (const sign of [-1, 1]) {
                const group = this.Element ('g');
                group.setAttribute ('data-axis', (sign > 0 ? '+' : '-') + name);
                const line = this.Element ('line', group);
                line.setAttribute ('x1', '48');
                line.setAttribute ('y1', '45');
                line.setAttribute ('stroke-width', sign > 0 ? '2' : '1');
                const circle = this.Element ('circle', group);
                circle.setAttribute ('r', sign > 0 ? '9' : '3');
                const text = this.Element ('text', group);
                text.textContent = sign > 0 ? name : '';
                text.setAttribute ('text-anchor', 'middle');
                text.setAttribute ('dominant-baseline', 'central');
                text.setAttribute ('fill', '#101820');
                this.axes.push ({ name, sign, group, line, circle, text });
            }
        }
        const label = this.Element ('text');
        label.setAttribute ('x', '48');
        label.setAttribute ('y', '94');
        label.setAttribute ('text-anchor', 'middle');
        label.setAttribute ('class', 'axis_world_label');
        label.textContent = 'WORLD';
        viewer.SetRenderHandler ((camera) => this.Update (camera));
        this.Update (viewer.camera);
    }

    Element (type, parent = this.svg)
    {
        const element = document.createElementNS ('http://www.w3.org/2000/svg', type);
        parent.appendChild (element);
        return element;
    }

    Update (camera)
    {
        const directions = GetWorldAxisDirections (camera.quaternion);
        for (const axis of this.axes) {
            const direction = directions.find ((item) => item.name === axis.name);
            const length = axis.sign > 0 ? 32 : 26;
            const x = 48 + direction.vector.x * length * axis.sign;
            const y = 45 - direction.vector.y * length * axis.sign;
            axis.depth = direction.vector.z * axis.sign;
            axis.line.setAttribute ('x2', x.toFixed (2));
            axis.line.setAttribute ('y2', y.toFixed (2));
            axis.line.setAttribute ('stroke', direction.color);
            axis.circle.setAttribute ('cx', x.toFixed (2));
            axis.circle.setAttribute ('cy', y.toFixed (2));
            axis.circle.setAttribute ('fill', direction.color);
            axis.text.setAttribute ('x', x.toFixed (2));
            axis.text.setAttribute ('y', y.toFixed (2));
            axis.group.setAttribute ('opacity', axis.sign < 0 ? '0.35' : axis.depth < 0 ? '0.65' : '1');
        }
        for (const axis of this.axes.slice ().sort ((a, b) => a.depth - b.depth)) {
            this.svg.appendChild (axis.group);
        }
    }
}
