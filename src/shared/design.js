// The design system of a talk: presets, tokens, layouts, blocks, classes
// and chart styles. One registry, used by the parser (to check values),
// by `quorum schema` (to tell agents what exists) and by the docs.
//
// Runs in Node and in the browser: no imports from Node here.

// Tokens: front matter keys with a fixed list of values.
export const TOKENS = {
  mode: { values: ['light', 'dark'], about: 'Light or dark colours. Without it, a dark background makes the talk dark.' },
  scale: { values: ['compact', 'normal', 'large', 'huge'], about: 'The size of all text.' },
  weight: { values: ['light', 'regular', 'bold', 'heavy'], about: 'How heavy titles are.' },
  case: { values: ['none', 'upper', 'small-caps'], about: 'Titles in normal case, capitals or small capitals.' },
  radius: { values: ['none', 'soft', 'round', 'pill'], about: 'Corners of cards, images, bars and buttons.' },
  density: { values: ['tight', 'normal', 'airy'], about: 'Margins and gaps.' },
  surface: { values: ['flat', 'outline', 'shadow', 'glass'], about: 'How cards, callouts and bars are drawn.' },
  texture: { values: ['none', 'grain', 'dots', 'grid', 'lines'], about: 'A subtle pattern on the background.' },
  gradient: { values: ['none', 'aurora', 'sunset', 'ocean', 'mesh', 'spotlight'], about: 'A gradient over the background colour.' },
  transition: { values: ['none', 'fade', 'slide', 'zoom', 'morph'], about: 'How one slide replaces the previous one. "morph" also moves elements with the same {#name}.' },
  charts: { values: ['bars', 'columns', 'donut', 'pictogram', 'race', 'bubbles'], about: 'The default look of poll, multi and rounds results.' },
  reveal: { values: ['highlight', 'flip', 'spotlight'], about: 'How the right answer appears.' },
};

// Colours and fonts, which take free values.
export const BRAND_KEYS = {
  accent: 'Buttons, bars, the frame around audience slides. A colour.',
  primary: 'Titles. A colour.',
  secondary: 'List markers, subheadings, table headers, callout titles. A colour.',
  background: 'The slide background. A colour.',
  text: 'Body text. A colour.',
  palette: 'Series colours for charts and answer options: a list such as ["#e63946", "#457b9d"].',
  logo: 'A file in the talk folder, shown on every slide and on phones.',
  font: 'Titles: a font file in the talk folder or a CSS font-family.',
  'text-font': 'Body text: a font file in the talk folder or a CSS font-family.',
  'accent-font': 'Emphasis (*text*) and the .hand class: a font file or a CSS font-family.',
  footer: 'Text along the bottom: "left | right" with {title}, {author}, {section}, {n}, {total}. "off" removes it.',
  style: 'A CSS file in the talk folder, loaded last.',
  theme: 'A preset name, light, dark, or a theme file in the talk folder (themes/acme.yaml).',
  reactions: 'Emoji the audience can send at any time, shown floating on the screen: "👏 😂 🤯".',
  'phone-welcome': 'What phones show while there is nothing to answer.',
  'phone-thanks': 'What phones show once the last slide is reached.',
  'phone-background': 'A colour or an image in the talk folder, behind the phone screen.',
};

const FONTS = {
  inter: "'Inter Display', 'Inter', system-ui, sans-serif",
  interText: "'Inter', system-ui, sans-serif",
  fraunces: "'Fraunces', Georgia, serif",
  newsreader: "'Newsreader', Georgia, serif",
  oswald: "'Oswald', 'Arial Narrow', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
  caveat: "'Caveat', 'Comic Sans MS', cursive",
  grotesk: "'Space Grotesk', 'Inter', system-ui, sans-serif",
};

// Presets: a complete look each. Anything in the front matter wins.
export const PRESETS = {
  clean: {
    about: 'The default: neutral, light, one orange accent.',
    mode: 'light',
    accent: '#ff6a00',
    palette: [],
    font: '',
    textFont: '',
    accentFont: '',
    tokens: { scale: 'normal', weight: 'bold', case: 'none', radius: 'soft', density: 'normal', surface: 'flat', texture: 'none', gradient: 'none', transition: 'fade', charts: 'bars', reveal: 'highlight' },
  },
  editorial: {
    about: 'Magazine: serif titles, warm paper, generous margins, thin rules.',
    mode: 'light',
    accent: '#b4441f',
    primary: '#1f1b16',
    secondary: '#6b5b3e',
    background: '#f6f1e7',
    text: '#2a241d',
    palette: ['#b4441f', '#2f5d62', '#c99a2e', '#5b4b8a', '#7a8450'],
    font: FONTS.fraunces,
    textFont: FONTS.newsreader,
    accentFont: FONTS.fraunces,
    tokens: { scale: 'large', weight: 'regular', case: 'none', radius: 'none', density: 'airy', surface: 'outline', texture: 'none', gradient: 'none', transition: 'fade', charts: 'columns', reveal: 'highlight' },
  },
  bold: {
    about: 'Poster: huge condensed capitals, solid colour blocks, high contrast.',
    mode: 'light',
    accent: '#ff3d00',
    primary: '#0d0d0d',
    secondary: '#0d0d0d',
    background: '#f4f1ea',
    text: '#0d0d0d',
    palette: ['#ff3d00', '#0d0d0d', '#2962ff', '#ffb300', '#00a86b'],
    font: FONTS.oswald,
    textFont: FONTS.interText,
    accentFont: FONTS.oswald,
    tokens: { scale: 'huge', weight: 'heavy', case: 'upper', radius: 'none', density: 'normal', surface: 'flat', texture: 'none', gradient: 'none', transition: 'slide', charts: 'columns', reveal: 'spotlight' },
  },
  midnight: {
    about: 'Dark, soft gradients, glowing accents and glass cards.',
    mode: 'dark',
    accent: '#7c5cff',
    primary: '#ffffff',
    secondary: '#22d3ee',
    background: '#0b1020',
    text: '#e3e8f4',
    palette: ['#7c5cff', '#22d3ee', '#f472b6', '#facc15', '#34d399'],
    font: FONTS.grotesk,
    textFont: FONTS.interText,
    accentFont: FONTS.grotesk,
    tokens: { scale: 'large', weight: 'bold', case: 'none', radius: 'round', density: 'normal', surface: 'glass', texture: 'none', gradient: 'aurora', transition: 'zoom', charts: 'bars', reveal: 'flip' },
  },
  paper: {
    about: 'Warm and handmade: grain, handwritten notes, marker highlights.',
    mode: 'light',
    accent: '#d9480f',
    primary: '#2b2620',
    secondary: '#1c7c54',
    background: '#f3ecdc',
    text: '#2b2620',
    palette: ['#d9480f', '#1c7c54', '#1864ab', '#e67700', '#862e9c'],
    font: FONTS.fraunces,
    textFont: FONTS.newsreader,
    accentFont: FONTS.caveat,
    tokens: { scale: 'normal', weight: 'bold', case: 'none', radius: 'soft', density: 'airy', surface: 'outline', texture: 'grain', gradient: 'none', transition: 'fade', charts: 'pictogram', reveal: 'highlight' },
  },
  studio: {
    about: 'Friendly: rounded cards, soft shadows, bright playful colours. Good for classrooms and workshops.',
    mode: 'light',
    accent: '#ff7a59',
    primary: '#2d2a32',
    secondary: '#6c63ff',
    background: '#fdf7f2',
    text: '#2d2a32',
    palette: ['#ff7a59', '#6c63ff', '#2ec4b6', '#ffbf47', '#ef476f'],
    font: FONTS.grotesk,
    textFont: FONTS.interText,
    accentFont: FONTS.grotesk,
    tokens: { scale: 'large', weight: 'bold', case: 'none', radius: 'pill', density: 'airy', surface: 'shadow', texture: 'dots', gradient: 'none', transition: 'slide', charts: 'bubbles', reveal: 'flip' },
  },
  signal: {
    about: 'Corporate: strict grid, white, one strong blue accent.',
    mode: 'light',
    accent: '#0b5fff',
    primary: '#0f172a',
    secondary: '#475569',
    background: '#ffffff',
    text: '#1e293b',
    palette: ['#0b5fff', '#0f172a', '#14b8a6', '#f59e0b', '#94a3b8'],
    font: FONTS.inter,
    textFont: FONTS.interText,
    accentFont: '',
    tokens: { scale: 'normal', weight: 'bold', case: 'none', radius: 'none', density: 'tight', surface: 'outline', texture: 'grid', gradient: 'none', transition: 'slide', charts: 'bars', reveal: 'highlight' },
  },
  terminal: {
    about: 'Technical: monospace, green on black, scanlines.',
    mode: 'dark',
    accent: '#39ff88',
    primary: '#e9ffe9',
    secondary: '#ffb000',
    background: '#0a0f0a',
    text: '#b6f5c8',
    palette: ['#39ff88', '#ffb000', '#5ac8fa', '#ff5f56', '#c792ea'],
    font: FONTS.mono,
    textFont: FONTS.mono,
    accentFont: FONTS.mono,
    tokens: { scale: 'normal', weight: 'bold', case: 'none', radius: 'none', density: 'normal', surface: 'outline', texture: 'lines', gradient: 'none', transition: 'fade', charts: 'bars', reveal: 'highlight' },
  },
};

// Slide layouts: <!-- layout: name --> or <!-- layout: name, option -->.
export const LAYOUTS = {
  center: 'Everything centred.',
  canvas: 'Free positions: give each element {x=10 y=20 w=40 h=30}, shares of the slide, and drag them in `quorum studio`.',
  title: 'An opening slide: a large title, a subtitle and the author.',
  section: 'A section divider in the accent colour, with the section number (from <!-- section: -->).',
  split: 'Content on one side, the first image (or video) on the other half, edge to edge. "split, right" puts the image on the right.',
  full: 'The first image fills the slide and the content sits on a panel over it. "full, right" or "full, center" move the panel.',
  statement: 'One sentence, very large.',
  quote: 'A quotation (a > quote) with its author in the next paragraph.',
  grid: 'Images or cards in an even grid under the title.',
  'big-number': 'The first heading becomes one huge figure, the rest explains it.',
  compare: 'Two columns (::: columns or ::: compare) with a divider between them.',
  agenda: 'Lists the sections of the talk (from <!-- section: -->), highlighting the next one.',
  closing: 'The last slide: thanks, contact, links.',
};

// Blocks: ::: name ... :::
export const BLOCKS = {
  notes: 'Speaker notes, only for the presenter.',
  columns: 'Columns separated by +++ lines.',
  center: 'Centred content.',
  stat: 'A big number: ::: stat 88 then the label.',
  callout: 'A highlighted box with an optional title.',
  cards: 'Columns drawn as cards, separated by +++. A heading {icon=name} puts an icon on top.',
  timeline: 'A list of "date: text" items as a timeline. {.vertical} stacks it, {.steps} shows one item per click.',
  steps: 'A numbered process from a list, with connectors. {.steps} shows one item per click.',
  kpis: 'A row of figures from a list of "value: label" items. Numbers count up.',
  compare: 'Two sides separated by +++, with a divider and {vs="or"} in the middle.',
  chart: 'A chart from "label: value" lines: ::: chart bar, column, line, donut or pictogram.',
  style: 'CSS for this slide only. Rules apply inside the slide; bare declarations apply to the slide itself.',
  join: 'A big QR code to join, the link and how many people are in.',
  poll: 'One answer from a list. [x] marks the right one.',
  multi: 'Several answers from a list.',
  estimate: 'Guess a number.',
  rounds: 'The same question over several items.',
  sentence: 'The audience writes a sentence one word at a time.',
  questions: 'Questions from the audience, with votes.',
  component: 'A JavaScript component from components/<name>.js, or a built-in one (countdown, qr, embed).',
};

export const CHART_TYPES = ['bar', 'column', 'line', 'donut', 'pictogram'];

// Result looks per interaction kind: {chart=name} on the block.
export const RESULT_STYLES = {
  poll: ['bars', 'columns', 'donut', 'pictogram', 'race', 'bubbles'],
  multi: ['bars', 'columns', 'donut', 'pictogram', 'race', 'bubbles'],
  rounds: ['bars', 'columns', 'donut', 'pictogram', 'race', 'bubbles'],
  estimate: ['strip', 'histogram', 'beeswarm', 'thermometer'],
  sentence: ['bars', 'tree'],
  questions: ['list', 'wall', 'spotlight'],
};

// Classes for {.name} on headings, paragraphs, images and blocks.
export const CLASSES = {
  center: 'Centre the element.',
  left: 'Align to the left (images: float left of the text).',
  right: 'Align to the right (images: float right of the text).',
  accent: 'In the accent colour.',
  secondary: 'In the secondary colour.',
  muted: 'Quieter, in a grey.',
  huge: 'Much larger.',
  big: 'Larger.',
  small: 'Smaller.',
  hand: 'In the accent font (handwritten in the paper preset).',
  upper: 'In capitals.',
  card: 'On a card.',
  glow: 'With a glow in the accent colour.',
  outline: 'Text as an outline (titles).',
  gradient: 'Text filled with a gradient of the palette (titles).',
  cover: 'Images: fill the space, cropping if needed.',
  contain: 'Images: show all of it.',
  round: 'Images: a circle.',
  shadow: 'Images and cards: a shadow.',
  bleed: 'Images: to the edges of the slide.',
  wide: 'Use the full width.',
  vertical: 'Timelines: top to bottom.',
  steps: 'Lists, cards, timelines, steps and kpis: one item per click.',
  controls: 'Videos: show play controls instead of playing on their own.',
  plain: 'No decoration.',
};

// Keys for {key=value}.
export const ATTRIBUTES = {
  icon: 'An icon name (headings, cards, kpis, pictogram charts).',
  width: 'Images: a width such as 40% or 600px.',
  height: 'Images: a height such as 400px.',
  chart: 'Interactions: how results are drawn (see RESULT_STYLES).',
  reveal: 'Interactions: how the right answer appears (highlight, flip, spotlight).',
  lines: 'Code: lines to highlight, one range per click: lines=1-2|4.',
  title: 'Charts: a title under the chart.',
  unit: 'Charts and kpis: a unit after each value.',
  max: 'Charts: the top of the scale.',
  vs: 'Compare: the word in the middle (default "vs").',
  color: 'Badges and headings: a colour (accent, secondary or #hex).',
  per: 'Pictogram charts: how much one icon is worth.',
  x: 'layout canvas: the left edge, as a share of the slide (0 to 100).',
  y: 'layout canvas: the top edge, as a share of the slide.',
  w: 'layout canvas: the width, as a share of the slide.',
  h: 'layout canvas: the height, as a share of the slide.',
};

export const STEP_EFFECTS = ['fade', 'fly', 'zoom', 'blur', 'drop', 'highlight'];

export const GRADIENTS = TOKENS.gradient.values.filter((g) => g !== 'none');

// Everything above, for `quorum schema` and agents.
export function schema() {
  return {
    presets: Object.fromEntries(Object.entries(PRESETS).map(([name, p]) => [name, {
      about: p.about,
      mode: p.mode,
      accent: p.accent,
      palette: p.palette,
      tokens: p.tokens,
    }])),
    tokens: TOKENS,
    brand: BRAND_KEYS,
    layouts: LAYOUTS,
    blocks: BLOCKS,
    chartTypes: CHART_TYPES,
    resultStyles: RESULT_STYLES,
    classes: CLASSES,
    attributes: ATTRIBUTES,
    stepEffects: STEP_EFFECTS,
    slideSettings: {
      layout: 'One of the layouts.',
      transition: 'One of the transitions, for this slide.',
      background: 'A colour, an image in the talk folder (", dim" darkens it) or a gradient name.',
      section: 'Starts a section: "Name, minutes".',
      id: 'A stable name for the slide.',
      logo: 'off hides the logo.',
      footer: 'off hides the footer, on shows it on the first slide.',
    },
    inline: {
      ':icon[name]': 'An icon inside text.',
      ':badge[text]': 'A small coloured label.',
      '==text==': 'Highlighted like a marker.',
      '{.class key=value}': 'After a heading, an image or a block opener.',
    },
  };
}
