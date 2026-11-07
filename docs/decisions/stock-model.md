# Stock model

**Status:** Accepted. Built in schema 4; see [GLOSSARY.md](../../GLOSSARY.md),
[inventory](../features/inventory/README.md) and [data model](../features/data-model/README.md).

**Three layers: item, product, stock.** An **item** is generic and comes from the pack ("Baked
beans": what one unit of size counts towards); a **product** is the household's specific thing
("Heinz Beanz 415 g": a name, a size, barcodes, and which item it counts as); **stock** is a
quantity of one product in one place with a best-before month. People store specifics; the app
counts them through their item. Why: a scan of a product Open Food Facts already knew still asked
"what is it?", and size-baked types duplicated. Replaces the single "item type" with per-size types
and custom types. [D166]

**The names, top to bottom: Capability › Resource › Category › Item › Product › Stock.** The
generic is an **Item** (not "kind", which meant nothing to people); **Category** stays the pack's
grouping above items (Food, Water, Fuel…). Screens may prefer phrases ("Counts as Baked beans",
"What is it?") where they read better. [D172, D187]

**Resource, not store.** The named quantities targets count (water litres, food kcal…) are
**resources** on screens, in docs and in code. Why: to people "store" is a physical place. [D173]

**The Stores tab keeps its name.** It is the household's physical stores; inside, rows group by
item, then product, then batches by place and month. [D174, D180]

**Items come only from the pack.** Every figure on an item is sourced. A product may count towards
nothing (kept, listed, scores nothing). There are no custom items: a recurring "nothing fits" means
the pack needs an item. [D175]

**Pack size lives on the product** as amount and unit ("330 ml", "24 × 500 ml"); one item per
thing, and sizes are products or the pack's suggested quick sizes. Units are g, kg, ml, L and
pieces; a multipack is count × size and its total counts. [D167, D177]

**Stock rows merge** on the same product, place and best-before month. [D170]

**Quantities are whole packs or quarters** (¼, ½, ¾), for part-used packs. [D182, D194]

**Rotating places count a minimum, not today's count.** A pantry, fridge or freezer runs up and
down with weekly use and shopping, so it cannot be relied on. A place is either **rotating** or
**stored**; a rotating place counts at most the household's **minimum** of each item there (the
level never gone below in a normal week), a stored place counts everything. A rotating place with
no minimum counts nothing. Planned, not built: suggesting minimums from recounts. [D4, D16, D90]

**"Minimum", not "floor".** The badge says "min N", its sheet "Always keep at least", the docs
"minimum". Why: "floor 1" read as a storey. [D165]

**A minimum is per item and place, in packs.** It lives on the item (any product of that item
counts) and counts packs of any size, not an amount. [D184, D191]

**Places carry conditions; items carry suitability.** A place has a condition profile (frost,
heat, damp, indoor-stable) and a rough size band with optional litres; an item lists the conditions
it tolerates; a mismatch warns. [D17]

**One home per thing.** Equipment (anything that converts fuel to heat, cooking or power, or needs
maintenance: heaters, stoves, generators, leisure batteries, solar, power stations) lives under
Home → Equipment only. Stores holds consumables, fuels included; quick add routes equipment to the
equipment form, and Stores lists each place's equipment. [D127]

**A place holding stock cannot be deleted.** [D89]

**Water containers are stock for now.** A container "kept filled" is stock counting what it holds.
Open: they may become equipment that holds a capacity of a resource, the inverse of equipment that
burns fuel ([#91](https://github.com/pskillen/shtf-planner/issues/91)). [D196]

Fuel remains stock and is matched by exact item to confirmed equipment. Allocation tracks each
stock row and its proportional rotating minimum; an equipment bottle-size answer is not stock.
