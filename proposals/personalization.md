# Proposal: a design system for Quorum talks

Status: implemented. The user guide is [docs/design.md](../docs/design.md); the registry of every option is `src/shared/design.js`.

Where the implementation differs from this proposal:

- Phone settings are flat front matter keys (`phone-welcome:`, `phone-thanks:`, `phone-background:`), since the front matter is one `key: value` per line.
- `theme:` keeps meaning light or dark for components (`meta.theme`); the preset is `meta.preset` and the mode `meta.mode`.
- Overflow is estimated from the text in `quorum check`, and measured in a browser with `quorum check --visual` and `quorum snapshot`.
- Results take `{chart=...}` and `{reveal=...}` on the block; the defaults come from `charts:` and `reveal:` in the front matter.

## Why

Quorum's goal is a platform where an agent writes an interactive talk from a brief. Today an agent can do the interactive part well, but it has very few ways to make the talk look good. Every talk ends up as the same thing: a title, a few bullets, a bar chart, on a flat background. The result works, but it does not catch the eye, and a talk that looks generic is a talk people stop watching.

The problem is not that Quorum lacks a stylesheet escape hatch (`style:` exists). It is that the only way to go beyond the basics is to write raw CSS against internal class names, and agents are bad at that: they cannot see the result, they break the layout, and nothing tells them they did.

So the proposal has two halves:

1. **More expressive building blocks**: themes, layouts, visual blocks, motion and styles for the results, all written in the Markdown the talk already uses.
2. **A design loop an agent can close on its own**: a schema of every option, checks that catch visual mistakes (overflow, contrast, monotony) and screenshots of every slide.

## What exists today

| Area | What a talk can set |
| --- | --- |
| Colours | `accent`, `primary`, `secondary`, `background`, `text`, `theme: light` or `dark` |
| Type | `font`, `text-font` (title and body families only) |
| Brand | `logo`, `footer` |
| Slide | `layout: center`, a background colour or image (optionally dimmed), logo and footer on or off |
| Layout blocks | `columns`, `stat`, `callout`, `center` |
| Motion | steps fade in. No slide transitions |
| Results | one look per kind: horizontal bars, a ring, a dot strip |
| Anything else | `style:` (a CSS file) or a component |

Why talks come out plain, concretely:

- **One composition.** Every slide is a vertical stack of text on a padded stage. There is no way to put an image on half the slide, bleed it to the edge, or make a section divider look different from a content slide.
- **One type scale, one weight, one radius, one density.** Brands differ more in these than in colour.
- **Text-only blocks.** No cards, icons, timelines, comparisons, charts from data, or highlighted code.
- **No motion between slides**, so the talk feels like a document being scrolled.
- **Results look the same in every talk.** The moment the audience is most engaged (the reveal) is the least designed.
- **Phones show the brand colours but nothing else.**

## Principles

- **Tokens before CSS.** Every choice is a named value an agent can set and `quorum check` can validate. CSS stays as the last resort, not the first.
- **Presets first, details second.** One line (`theme: editorial`) should give a finished look. Fine tuning is optional.
- **Written in the Markdown.** No new file formats unless a theme is shared between talks.
- **Checkable.** Every new option is known to the parser, listed in a schema and validated, with the slide number in the warning.
- **Same everywhere.** The screen, the panel preview, phones, static builds and exports all follow the theme.
- **Within the existing rules.** No runtime or build dependencies, works offline, no requests to other hosts, nothing that identifies the audience, the component API stays backwards compatible.

## 1. Themes

### Presets

`theme:` keeps `light` and `dark` and gains named presets. Each preset is a complete look: palette, fonts, scale, radius, surfaces, texture, transitions and chart style.

```yaml
---
title: How bread rises
theme: editorial        # or: bold, midnight, paper, studio, signal, terminal
mode: dark              # optional: the preset's dark variant
accent: "#c2410c"       # anything set here overrides the preset
---
```

A first set of six to eight, chosen to be far apart from each other:

| Preset | Feel |
| --- | --- |
| `clean` | Today's look, the default, so nothing changes for existing talks |
| `editorial` | Serif titles, generous margins, thin rules, magazine layouts |
| `bold` | Huge condensed titles, solid colour blocks, high contrast |
| `midnight` | Dark, soft gradients, glowing accents, glass surfaces |
| `paper` | Warm off-white, grain texture, hand-drawn underlines and markers |
| `studio` | Rounded cards, pastel palette, friendly for workshops and classrooms |
| `signal` | Corporate: grid, strict alignment, a single strong accent |
| `terminal` | Monospace, scanlines, green or amber on black, for technical talks |

Presets need a few more fonts. Only fonts with an open licence (OFL), bundled in `app/fonts/`, subset to keep the size down: for example a serif, a condensed sans and a monospace.

### More tokens

The front matter gains a small number of tokens with fixed values, so an agent cannot produce something broken:

```yaml
palette: ["#c2410c", "#0f766e", "#7c3aed", "#ca8a04"]  # series colours for charts and options
scale: large            # compact, normal, large, huge: the type scale
weight: heavy           # titles: light, regular, bold, heavy
case: upper             # titles: none, upper, small-caps
radius: round           # none, soft, round, pill
density: airy           # tight, normal, airy: margins and gaps
surface: glass          # flat, outline, shadow, glass: cards, callouts, bars
texture: grain          # none, grain, dots, grid, lines
gradient: aurora        # none, or a named background gradient
transition: slide       # none, fade, slide, zoom, morph
charts: rounded         # the default style for results (see section 5)
```

Each maps to CSS custom properties on `:root`, as `brand.js` already does for colours. Unknown values are a warning from `quorum check`, not a broken talk.

`palette:` is generated from `accent` when it is missing, so polls get distinct option colours without the author doing anything.

### Theme files

A theme can live in its own file and be shared between talks:

```yaml
theme: themes/acme.yaml
```

```yaml
# themes/acme.yaml
extends: signal
accent: "#0b5fff"
font: fonts/AcmeSans-Bold.woff2
logo: logo.svg
footer: Acme · {section} | {n} / {total}
style: acme.css         # still allowed, loaded last
```

`quorum theme new acme` creates one from the current talk. This is how a company sets its brand once and every generated talk follows it.

## 2. Layouts

Layouts are the biggest single improvement: they change the composition, not just the colours. All are set the same way as today's `layout: center`.

| Layout | What it does |
| --- | --- |
| `title` | Large title, subtitle, author, optional background art |
| `section` | A divider: big number or word, colour-filled, starts a section |
| `split` | Content on one side, the first image on the other, edge to edge (`split, right` to swap) |
| `full` | The image fills the slide, text on a panel or over a gradient |
| `statement` | One sentence, very large, nothing else |
| `quote` | A quotation with its author and an optional portrait |
| `grid` | Images or cards in an even grid |
| `big-number` | One figure taking most of the slide (today's `stat`, but as a layout) |
| `compare` | Two columns with a divider and headings, for before and after |
| `agenda` | A list of sections that highlights the current one, filled from `section:` |
| `closing` | Thanks, contact, QR of the slides |

```markdown
<!-- layout: split, right -->

## Dough needs time

Yeast feeds on sugar and releases gas. The gluten traps it.

![Dough rising in a bowl](images/dough.jpg)
```

The `agenda` layout is a good example of what tokens make possible: it reads the talk's sections, so an agent gets a correct agenda slide for free.

### An attribute syntax

Quorum already uses `{#id}` on interactions. Extending it to any heading, block or image gives authors and agents a uniform, checkable way to tweak one element:

```markdown
## The three stages {.center .accent}

![A sourdough loaf](images/loaf.jpg){.cover .right width=50%}

::: poll {#flour .wide chart=donut} Which flour do you use?
```

Classes come from a documented list (`.center`, `.accent`, `.muted`, `.huge`, `.cover`, `.left`, `.right`, `.wide`, `.card`, ...). Unknown ones are a warning. Key and value pairs are limited per block.

## 3. Visual blocks

New `:::` blocks that cover what decks usually need and plain Markdown cannot express:

```markdown
::: cards
### Flour {icon=wheat}
Protein becomes gluten.

+++

### Water {icon=droplet}
Starts the enzymes.

+++

### Yeast {icon=sparkles}
Makes the gas.
:::

::: timeline
- 6000 BC: the first leavened bread in Egypt
- 1857: Pasteur explains fermentation
- 1961: the Chorleywood process
:::

::: chart bar {title="Bread eaten per person, kg a year"}
Germany: 80
France: 50
United States: 25
:::

::: kpis
- 4 h: proving time
- 230 °C: oven
- 1:0.7: flour to water
:::
```

| Block | What it is |
| --- | --- |
| `cards` | Columns as cards, with an optional icon, number or image each |
| `timeline` | A horizontal or vertical timeline; one step per item if the slide has steps |
| `steps` | A numbered process with connectors |
| `chart` | `bar`, `column`, `line`, `donut`, `pictogram` from inline data, drawn by the same code as the results |
| `kpis` | A row of big numbers with labels |
| `compare` | Two sides with a versus divider |
| `icon` and `icon=` | A bundled, offline icon set (a few hundred SVGs, open licence, tree-shaken at build) |
| `badge` | A small coloured label inside text |
| `video` | A local video file, autoplay, loop and mute options |
| Code | Syntax highlighting (a small highlighter written for Quorum, a dozen languages), and `{lines=3-5}` to highlight lines, one range per step |

Charts drawn from the same renderer as poll results matter more than they look: a talk can show "what experts think" with `::: chart` next to "what you think" from a poll, in the same style.

## 4. Motion

- **Slide transitions**: `transition:` in the front matter, overridable per slide with `<!-- transition: zoom -->`. A handful only: `fade`, `slide`, `zoom`, `morph`.
- **Morph between slides**: elements with the same `{#name}` on two consecutive slides move and resize from one to the other. This one effect is what makes decks feel produced, and it is cheap to build with the FLIP technique on top of the existing stage.
- **Step effects**: `--` keeps fading by default; `-- fly`, `-- zoom`, `-- highlight` choose another.
- **Results**: numbers count up, bars grow with a spring, the right answer gets a short emphasis.
- **Reduced motion**: all of it turns off when the system asks for reduced motion, and in thumbnails and exports (`html.still` already does this).

## 5. Results that look designed

The reveal is the highlight of an interactive talk, so each interaction kind gets a few looks, chosen with `chart=` or the theme's `charts:` default:

| Kind | Looks |
| --- | --- |
| `poll`, `multi`, `rounds` | `bars` (today), `columns`, `donut`, `pictogram` (one icon per voter), `race` (bars re-sort as votes arrive), `bubbles` |
| `estimate` | `strip` (today), `histogram`, `beeswarm`, `thermometer` |
| `sentence` | `bars` (today), `tree` (the paths not taken stay visible) |
| `questions` | `list` (today), `wall` (cards), `spotlight` (one question at a time, large) |

Options use the theme's `palette`, so each answer has its own colour on the screen and the same colour on phones.

A `reveal:` option chooses how the right answer appears: `highlight` (today), `flip` (the bars flip to show it), `spotlight` (everything else dims).

## 6. Phones

Phones already follow the colours, fonts and logo. They should also follow:

- The theme's surfaces, radius, texture and the option colours from `palette`.
- A `phone:` section in the front matter: a background image, a welcome message, a thank-you screen after the last slide.
- Reactions as an option (`reactions: 👏 😂 🤯`), shown as floating emoji on the screen. Anonymous, counted, never stored with anything that identifies a person.

## 7. Escape hatches agents can use safely

- **Slide CSS**: a `::: style` block on a slide, automatically scoped to that slide, so a mistake cannot break the rest of the talk.
- **Theme values in components**: `ctx.theme` gives a component the resolved tokens (colours, palette, fonts, radius), and a small helper module (`quorum/ui.js`: chart, count-up, colour of option *n*) makes components look native without copying CSS. This adds to `ctx`, so the component API stays compatible.
- **Raw CSS** with `style:` stays, now with documented, stable class names and custom properties.

## 8. The agent's design loop

The building blocks only help if an agent can find them, use them and see the result. This part is what turns Quorum into a platform for generated talks rather than a format agents happen to write.

### A schema

`quorum schema --json` prints every theme, token (with allowed values), layout, block, class and chart style, from the same registry the parser uses (the way `kinds.js` works for interactions). The skill, `llms-full.txt` and the docs tables are generated from it, so they never drift. An agent asks the tool what is possible instead of guessing.

### Visual checks

`quorum check` learns about design, not just syntax:

- **Overflow**: content taller or wider than the stage (the most common agent mistake). Measured by laying out each slide in a headless browser when Playwright is available, and estimated from word and line counts when it is not.
- **Contrast**: text and accent against the background, with the WCAG ratio in the warning.
- **Too much text**: more than about 40 words, or more than 6 bullets, on a slide.
- **Monotony**: five slides in a row with the same layout, or a talk with no images, gets a suggestion with the layouts that would fit.
- **Missing alt text** on images.

All of it appears in `--json`, with a `kind` per warning so an agent can fix them by type.

### Screenshots

`quorum snapshot <folder>` renders every slide (and the result of every interaction with the simulated audience) to `.quorum-snapshots/slide-03.png`, plus a contact sheet of the whole talk on one image. A multimodal agent looks at the talk the way the speaker will, and fixes what looks wrong. This reuses `scripts/screenshots.js` and the simulator that already exist.

### Help with the brief

- `quorum theme from images/logo.svg` proposes a palette and preset from the logo's colours.
- A library of **slide patterns** in the skill (opening, agenda, problem, big number, story with image, comparison, quote, section break, quiz, closing) with Markdown for each, so an agent composes a talk from proven pieces instead of inventing layouts.

## Before and after

The same slide today and with this proposal.

Today:

```markdown
## Bread around the world

- Germany eats about 80 kg per person a year
- France about 50 kg
- The United States about 25 kg
```

Proposed:

```markdown
<!-- layout: split -->
<!-- transition: morph -->

## Bread around the world {#heading}

::: chart bar {chart=pictogram icon=bread}
Germany: 80
France: 50
United States: 25
:::

![A bakery window in Berlin](images/berlin.jpg)
```

The second version has an image edge to edge on half the slide, a chart in the talk's palette and a title that glides in from the previous slide. It is still a few lines of Markdown, every option in it is validated by `quorum check`, and an agent can find each one with `quorum schema`.

## Plan

Each phase is useful on its own and keeps existing talks working unchanged.

| Phase | What ships | Why first |
| --- | --- | --- |
| 1. Foundation | Token set and its CSS variables, the attribute syntax, `quorum schema`, overflow and contrast checks | Everything else builds on tokens; the checks make agents reliable right away |
| 2. Composition | Six to eight presets with their fonts, the new layouts, theme files | The largest visible jump for the least new code |
| 3. Visual blocks | `cards`, `timeline`, `steps`, `kpis`, `chart`, icons, code highlighting, video | Covers what most decks need |
| 4. Motion and results | Transitions, morph, step effects, result looks, `reveal:` | The polish that makes it feel produced |
| 5. Agent platform | `quorum snapshot`, design checks, `theme from`, the pattern library, phone theming and reactions | Closes the loop for fully generated talks |

Each phase comes with unit tests for the parser and check behaviour, e2e coverage in `test/e2e/run.js`, docs in `docs/format.md`, an updated skill, and new screenshots.

## Risks and trade-offs

- **Size.** Fonts and icons add weight to the app. Mitigation: subset fonts, include only the icons a talk uses in static builds, load a preset's fonts only when it is used.
- **Surface area for agents.** More options can also mean more ways to make a mess. Mitigation: presets first, fixed value lists, and checks that say what to change.
- **Every view must follow.** Screen, panel, phones, static builds and exports all need to render each feature. The e2e suite should cover one slide per layout and block.
- **Keeping it plain.** Every option should earn its place. A smaller set of well-designed choices beats many weak ones.
- **Naming.** `theme:` changes meaning from light or dark to a preset; `light` and `dark` stay valid and map to `clean`, and `mode:` takes over the light or dark choice.

## Questions to decide

1. Should presets aim at a range of moods (the list above), or at a range of use cases (keynote, classroom, workshop, company all-hands)?
2. Is a headless browser acceptable as an optional dependency for `quorum check` and `quorum snapshot`, as it already is for the screenshots script?
3. Which phase first? The recommendation is phase 1 and 2 together: the tokens alone are not visible, and the presets alone are not checkable.
4. Reactions on phones: in scope, or a separate proposal?
