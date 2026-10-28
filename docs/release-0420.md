# Auto3D 0.42.0 / Packaging 1.10.0

Box generation accepts inside, outside and score-distance targets, with inside
selected by default in the panel. The CAD Measurement layer and generated 3D
model share resolved score spans and board caliper. Existing score-based command
calls remain compatible; the preset command accepts an explicit basis. For a
selected generated box, changing the board holds the selected ID/OD targets and
rebuilds the linked CAD and 3D object, with Undo. New generated CAD dimensions
default to ID, while saved measurement bases are preserved.

FEFCO 0201 has reference inside correction factors. Other styles and outside
targets require converter-supplied factors; unspecified zero factors are not
silently used for driving. Generate in score mode and enter the applicable
factors in the selected box's Measurement layer before using those targets.
Switching the draft basis converts values when the current style and board have
the necessary factors; otherwise it asks for new targets instead of silently
converting an unqualified number. Tolerances and supplier qualifications remain explicit.

The nominal catalog adds ACA and BCB starting records, and exposed-edge maps
illustrate EB, BC, ACA and BCB as multiple media and intermediate liners.
Individual wall proportions and flute pitches are visual approximations; the
account catalog's measured total caliper and allowances drive engineering.
Existing saved account catalogs are not overwritten.
