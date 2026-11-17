import { ValidatePackaging } from './profile.js';

// Carton accessories: corrugated pads and slotted partitions sized from a carton's
// engineering INSIDE dimensions (canonical mm). Every piece is a standard CAD profile
// (closed cut outline, board caliper as thickness) so it extrudes, exports and opens
// in the CAD designer like any other board. Pure: no host imports.
//
// Axes: length = the carton's RSC length, width = its RSC width, height = inside height.

export const AccessoryClearanceMm = 1;
export const PartitionSlotClearanceMm = 0.5;
const MaxCells = 12;

function Positive (value, name)
{
    if (typeof value !== 'number' || !Number.isFinite (value) || value <= 0) { throw new Error (name + ' must be a positive number of millimetres.'); }
    return value;
}
function Inside (insideMm)
{
    return { length : Positive (insideMm?.length, 'Inside length'), width : Positive (insideMm?.width, 'Inside width'), height : Positive (insideMm?.height, 'Inside height') };
}
function Clearance (value, name, max = 20)
{
    if (typeof value !== 'number' || !Number.isFinite (value) || value < 0 || value > max) { throw new Error (name + ' must be 0–' + max + ' mm.'); }
    return value;
}
function Profile (name, thickness, points)
{
    return ValidatePackaging ({ version : 1, name, grade : 'Custom', thickness, paths : [{ id : 'outline', type : 'cut', closed : true, points }] });
}

export const PadPositions = Object.freeze (['bottom', 'top', 'front', 'back']);
export const BoardGrades = Object.freeze (['32 ECT', '44 ECT', '48 ECT', '200# test', '275# test']);

// Pads for the chosen positions. Bottom/top pads are horizontal and cover the inside footprint
// (length × width); front/back pads are vertical against the two long walls (length × height)
// and stand between any bottom and top pads. Every edge keeps the clearance from the walls.
// growthMm is how much the carton inside must grow to keep the same product space.
export function CreatePadPlan ({ insideMm, thickness, positions = ['bottom'], clearanceMm = AccessoryClearanceMm } = {})
{
    const inside = Inside (insideMm), t = Positive (thickness, 'Board caliper'), c = Clearance (clearanceMm, 'Pad clearance');
    if (!Array.isArray (positions) || !positions.length || positions.some (p => !PadPositions.includes (p)) || new Set (positions).size !== positions.length) { throw new Error ('Choose one or more pad positions: bottom, top, front or back.'); }
    const ordered = PadPositions.filter (p => positions.includes (p));
    const horizontal = ordered.filter (p => p === 'bottom' || p === 'top').length, vertical = ordered.length - horizontal;
    if (horizontal * t >= inside.height) { throw new Error ('The pads would fill the carton height.'); }
    if (vertical * t >= inside.width) { throw new Error ('The pads would fill the carton width.'); }
    const length = inside.length - 2 * c, width = inside.width - 2 * c, standing = inside.height - horizontal * t - 2 * c;
    if (length <= 0 || width <= 0 || (vertical && standing <= 0)) { throw new Error ('The carton is too small for these pads with this clearance.'); }
    const pads = ordered.map (position => {
        const flat = position === 'bottom' || position === 'top', across = flat ? width : standing;
        const name = (position[0].toUpperCase () + position.slice (1)) + ' pad · ' + Round (length) + ' × ' + Round (across);
        return { position, orientation : flat ? 'horizontal' : 'vertical', lengthMm : length, [flat ? 'widthMm' : 'heightMm'] : across, profile : Profile (name, t, [[0, 0], [length, 0], [length, across], [0, across]]) };
    });
    return { version : 1, units : 'mm', kind : 'pads', thicknessMm : t, clearanceMm : c, pads, growthMm : { length : 0, width : vertical * t, height : horizontal * t } };
}

// Slotted partition (divider) set. columns = cells along the length, rows = cells along the width.
// Length strips run along the carton length and carry slots from the top; width strips run across
// and carry slots from the bottom, so each crossing interlocks at half height.
export function CreatePartitionPlan ({ insideMm, thickness, columns, rows, clearanceMm = AccessoryClearanceMm, slotClearanceMm = PartitionSlotClearanceMm } = {})
{
    const inside = Inside (insideMm), t = Positive (thickness, 'Board caliper');
    const c = Clearance (clearanceMm, 'Partition clearance'), slotGap = Clearance (slotClearanceMm, 'Slot clearance', 5);
    for (const [value, name] of [[columns, 'Columns'], [rows, 'Rows']]) { if (!Number.isInteger (value) || value < 1 || value > MaxCells) { throw new Error (name + ' must be a whole number from 1 to ' + MaxCells + '.'); } }
    if (columns === 1 && rows === 1) { throw new Error ('Choose at least two columns or two rows of cells.'); }
    const cellLength = (inside.length - (columns - 1) * t) / columns, cellWidth = (inside.width - (rows - 1) * t) / rows;
    if (cellLength <= t || cellWidth <= t) { throw new Error ('The cells would be narrower than the board caliper. Use fewer columns or rows.'); }
    const height = inside.height - 2 * c; if (height <= 4 * t) { throw new Error ('The carton is too shallow for partitions.'); }
    const lengthStrip = inside.length - 2 * c, widthStrip = inside.width - 2 * c, slot = t + slotGap, half = height / 2;
    // Centre lines of each strip, measured from the inside wall at the start of the other axis.
    const crossLength = Array.from ({ length : columns - 1 }, (_, i) => (i + 1) * cellLength + i * t + t / 2);
    const crossWidth = Array.from ({ length : rows - 1 }, (_, i) => (i + 1) * cellWidth + i * t + t / 2);
    const notched = (span, centres, fromTop) => {
        // Outline in profile X (along the strip) and Y (up the strip), counter-clockwise, slots cut from one edge.
        const points = [];
        const edge = fromTop ? height : 0, depth = fromTop ? height - half : half;
        const slots = centres.map (x => [x - c - slot / 2, x - c + slot / 2]);
        if (fromTop) {
            points.push ([0, 0], [span, 0], [span, height]);
            for (const [a, b] of [...slots].reverse ()) { points.push ([b, edge], [b, depth], [a, depth], [a, edge]); }
            points.push ([0, height]);
        } else {
            points.push ([0, 0]);
            for (const [a, b] of slots) { points.push ([a, edge], [a, depth], [b, depth], [b, edge]); }
            points.push ([span, 0], [span, height], [0, height]);
        }
        return points;
    };
    const strips = [
        ...crossWidth.map ((offset, i) => ({ id : 'length-' + (i + 1), axis : 'length', offsetMm : offset, lengthMm : lengthStrip, heightMm : height, slots : 'top', profile : Profile ('Partition · length strip ' + (i + 1), t, notched (lengthStrip, crossLength, true)) })),
        ...crossLength.map ((offset, i) => ({ id : 'width-' + (i + 1), axis : 'width', offsetMm : offset, lengthMm : widthStrip, heightMm : height, slots : 'bottom', profile : Profile ('Partition · width strip ' + (i + 1), t, notched (widthStrip, crossWidth, false)) }))
    ];
    return { version : 1, units : 'mm', kind : 'partitions', columns, rows, cells : columns * rows, cellMm : { length : cellLength, width : cellWidth, height }, thicknessMm : t, clearanceMm : c, slotWidthMm : slot, slotDepthMm : half, strips };
}

const Round = value => Number (value.toFixed (1));
