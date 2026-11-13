export function EngineeringMaterialsMarkup ()
{
    return `<div class="entry_materials" role="img" aria-label="Material study: white printed liner, kraft corrugated core and molded-pulp protection" hidden>
        <svg class="entry_material_leaders" aria-hidden="true">${['liner', 'core', 'pulp'].map (id => `<g data-leader="${id}"><path pathLength="1"/><circle r="2.5"/></g>`).join ('')}</svg>
        <div class="entry_material_label" data-material="liner"><i class="entry_material_swatch liner"></i><div><strong>Printed liner</strong><small>WHITE PAPER · MULTICOLOR</small></div></div>
        <div class="entry_material_label" data-material="core"><i class="entry_material_swatch core"></i><div><strong>Corrugated core</strong><small>KRAFT · FLUTED BOARD</small></div></div>
        <div class="entry_material_label" data-material="pulp"><i class="entry_material_swatch pulp"></i><div><strong>Molded pulp</strong><small>FORMED FIBER PROTECTION</small></div></div>
    </div>`;
}

export function CreateEngineeringMaterials (root)
{
    const overlay = root.querySelector ('.entry_materials'), svg = overlay.querySelector ('svg');
    return { update (state) {
        const progress = state.sequence?.finish.callouts || 0, data = state.materials;
        overlay.hidden = !state.available || progress <= 0 || !data?.anchors?.length;
        if (overlay.hidden) { return; }
        const { width, height } = data, compact = width < 500, labelWidth = compact ? 126 : 148;
        svg.setAttribute ('viewBox', `0 0 ${width} ${height}`);
        data.anchors.forEach ((anchor, index) => {
            const left = index === 0, y = index === 2 ? height - 55 : 14;
            const x = left ? 8 : width - labelWidth - 8;
            const visible = Math.max (0, Math.min (1, (progress - index * 0.12) / 0.76));
            const label = overlay.querySelector (`[data-material="${anchor.id}"]`), leader = overlay.querySelector (`[data-leader="${anchor.id}"]`);
            label.style.cssText = `left:${x}px;top:${y}px;width:${labelWidth}px;opacity:${visible};transform:translateX(${(left ? -10 : 10) * (1 - visible)}px)`;
            const px = anchor.x * width, py = anchor.y * height, endX = left ? x + labelWidth : x, endY = y + 33;
            leader.querySelector ('path').setAttribute ('d', `M${px},${py} L${endX + (left ? 12 : -12)},${endY} L${endX},${endY}`);
            leader.querySelector ('path').style.strokeDashoffset = String (1 - visible);
            leader.querySelector ('circle').setAttribute ('cx', String (px)); leader.querySelector ('circle').setAttribute ('cy', String (py));
            leader.style.opacity = String (visible);
        });
    } };
}
