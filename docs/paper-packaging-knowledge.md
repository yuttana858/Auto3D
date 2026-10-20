# Auto3D paper-packaging knowledge base

Auto3D now contains a curated corrugated-paper packaging knowledge layer intended for connected AI agents and future generative packaging tools.

## Access

Public JSON API:

- Full knowledge base: `GET /api/knowledge/paper-packaging`
- Search: `GET /api/knowledge/paper-packaging?q=BC%20flute%20heavy%20stack`
- Section: `GET /api/knowledge/paper-packaging?section=flutes`

In-page Auto3D agents can call:

- `knowledge.paper_packaging`
- `knowledge.paper_packaging_section`

The API is read-only and contains no secrets. It includes source metadata with each technical subject so downstream agents can distinguish reference facts from design guidance.

## Knowledge model

The knowledge base intentionally separates three things that are often mixed together:

1. **Structure** — FEFCO design family/style.
2. **Material** — liner, corrugating medium, flute geometry, wall construction and grammage.
3. **Performance** — ECT, BCT, burst, flat crush, Cobb/water uptake, glue-bond strength, environmental/unit-load performance.

A FEFCO code identifies structure. It does **not** by itself define a board grade or guarantee strength.

## FEFCO styles

The current FEFCO design-style library is the 12th edition (2022). FEFCO describes it as the internationally applied coding system adopted by ICCA and notes that the 12th edition added more than one hundred designs, including a new retail/e-commerce series.

Families captured in the knowledge base:

| Series | Family |
| --- | --- |
| 01 | Commercial rolls and sheets |
| 02 | Slotted boxes |
| 03 | Telescopic boxes |
| 04 | Folder boxes and trays |
| 05 | Slide boxes |
| 06 | Rigid boxes |
| 07 | Ready-glued cases |
| 08 | Retail and e-commerce packaging |
| 09 | Interior fitments |

Representative style metadata is included for 0201, 0203, 0427 and 0713. The API does not reproduce the copyrighted FEFCO drawing catalog; production geometry should always be checked against the official drawing/version or converter CAD.

FEFCO dimensional convention is `L × W × H` in millimetres, normally internal dimensions.

## Corrugated construction

Corrugated board is made from liners bonded to a fluted corrugating medium, typically with starch adhesive.

- Single face: one liner + one medium
- Single wall: two liners + one medium
- Double wall: three liners + two mediums
- Triple wall: four liners + three mediums

FEFCO European production data reports typical liner basis weights around 90–200 g/m² and typical fluting around 90–150 g/m². Finished corrugated board can range from below 300 g/m² to above 900 g/m² depending on construction.

Common paper families in the data model include kraftliner, testliner, semi-chemical fluting and recycled fluting.

## Flute geometry

Indicative FEFCO flute data captured in the API:

| Flute | Nominal flute height | Flutes/m | Approx. flutes/ft | Take-up factor | Typical design character |
| --- | ---: | ---: | ---: | ---: | --- |
| A | 4.8 mm | 110 | 33 | 1.50–1.55 | thick, cushioning, structural depth |
| B | 2.4 mm | 150 | 47 | 1.30–1.35 | flat-crush/converting/print balance |
| C | 3.6 mm | 130 | 38 | 1.40–1.45 | general-purpose transit balance |
| E | 1.2 mm | 290 | 90 | 1.20–1.35 | microflute, graphics, compactness |
| F | about 0.8 mm | about 410 | 125 | F/G/N group 1.15–1.25 | fine microflute, retail presentation |
| G/N | 0.5–0.8 mm | 400–550 | varies | 1.15–1.25 | ultra-fine specialty profiles |

FEFCO and FBA both emphasize that flute letters describe a profile family, not an exact universal geometry. Corrugating-roll designs vary by supplier/machine.

General performance tendency:

- Larger flute profiles tend to provide greater cushioning and vertical compression potential.
- Smaller flute profiles tend to provide a smoother print surface, compact caliper and finer die-cut/folding detail.

The API includes common double-wall combinations such as BC and EB, but explicitly warns agents not to infer ECT or BCT from flute combination alone.

## Strength and performance

The knowledge base defines the most useful performance terms:

**ECT — Edge Crush Test**
Measures edgewise compression resistance of combined board. It is an important input when stacking strength matters, but is not finished-box compression strength.

**BCT — Box Compression Test**
Measures the maximum compression load sustained by an erected container. For stacking-critical design, finished-box BCT under relevant conditions is more directly useful than ECT alone.

**Burst / Mullen**
Measures pressure required to rupture corrugated board. It characterizes a different failure mode from ECT.

**Flat crush**
Measures resistance to crushing the flutes through the board thickness and is important for preserving caliper/cushioning.

**Cobb**
Measures water absorptiveness. Corrugated performance is moisture-sensitive, so Cobb and environmental conditioning matter for wet/cold-chain applications.

**Glue-bond / adhesion**
Weak liner-to-flute bonding can reduce board and box performance even when component papers are strong.

FEFCO public test-method indexes captured in the API include burst, puncture, flat crush, Cobb, edgewise crush, water resistance of the glue bond, adhesion strength, container compression and vertical impact.

## Environmental and unit-load effects

The agent rules require downstream design tools to account for more than laboratory board ratings.

Important variables include:

- relative humidity and moisture exposure
- long-duration creep under stack load
- box dimensions and perimeter
- score/slot quality
- manufacturer joint and closure
- hand holes or other cut-outs
- product support inside the box
- pallet deck/support conditions
- pallet overhang and stack misalignment
- distribution shock/drop/vibration
- print/coating/converting damage to the board

For these reasons, the system should not generate a production claim such as “32 ECT is sufficient” solely from product weight.

## Reference board-rating table

A public Walmart/Fibre Box Association specification is included as a **reference example**, not a universal rule.

Examples from that reference include:

- single wall: 32 ECT / 200 psi burst for a listed 65 lb / 75 in limit
- single wall: 40 ECT / 250 psi burst for a listed 80 lb / 85 in limit
- single wall: 44 ECT / 275 psi burst for a listed 95 lb / 95 in limit
- double wall examples range from 42 to 82 ECT
- triple wall examples range from 67 to 112 ECT

Agents are instructed to apply the governing customer, carrier and regional specification rather than treating these values as generic law.

## Generative-tool design rules

Before a future Auto3D packaging generator makes a final recommendation, it should collect at least:

- product dimensions
- packed mass
- fragility
- required stacking height/load
- pallet pattern and support
- distribution mode
- humidity/wet exposure
- printing/graphics requirements
- manual vs automated erection/filling
- closure method
- regional/customer specification
- whether the package is transit-only, retail-ready, e-commerce or returnable

Then the system should:

1. choose a structural family/style,
2. choose a flute/wall/material concept,
3. calculate/estimate geometry and material usage,
4. set a target performance requirement,
5. generate the Auto3D model/dieline,
6. flag assumptions,
7. require converter/CAD confirmation and physical testing before production release.

## Primary sources

- FEFCO — FEFCO Code: https://www.fefco.org/technical-information/fefco-code
- FEFCO — 12th edition design-style library: https://www.fefco.org/sites/default/files/files/FEFCO%20Code_WEB%287%29.pdf
- FEFCO — Corrugated board production: https://www.fefco.org/node/1588
- FEFCO — Testing methods and recommendations: https://www.fefco.org/node/534
- FEFCO — Common Footprint Quality: https://www.fefco.org/technical-information/common-footprint-quality-standard-cfq
- Fibre Box Association — What is Corrugated: https://www.fibrebox.org/what-is-corrugated
- Fibre Box Association — ECT Application and Reference Guide: https://store.fibrebox.org/products/ect-application-and-reference-guide-1
- Fibre Box Association / Walmart — Corrugated Board Specifications: https://www.fibrebox.org/assets/2025/09/Walmart_Corrugated-Board_Specifications_Automation_Packaging_Standards.pdf
- Packaging Corporation of America — Profiles with a Purpose: https://www.packagingcorp.com/resource-hub/beyond-the-box/profiles-with-a-purpose/

## Copyright and engineering boundary

FEFCO style drawings and some industry handbooks/standards are copyrighted or commercial references. Auto3D should store normalized facts, metadata, classifications, derived engineering fields and source links, but should not bulk-copy proprietary catalogs or standards into the repository.

This knowledge base is an engineering aid. Final production packaging should be released only after the applicable converter, customer and transport requirements have been confirmed and appropriate physical testing has been completed.

## Dimensional engineering update — 2026-10-18

The API now exposes/searches `dimensionalEngineering`: continuous scores versus cuts, allowance/tolerance/clearance, FEFCO 101 scoped equations, independent inside/outside corrections, worst-case tolerance propagation, measured-caliper/component inputs, PMMI/FBA RSC tolerance scope and measurement-method references. See [corrugated-dimensions-and-creases.md](corrugated-dimensions-and-creases.md) for the implementation contract and editable material-record workflow. Rendering never supplies authoritative CAD dimensions.
