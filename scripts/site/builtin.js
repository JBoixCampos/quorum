// Everything built into Quorum, with one example for each, for the website's
// Examples page. Every block, layout, chart type, result look and step effect
// in the registry (src/shared/design.js) must have an entry here: a unit test
// (test/site-examples.test.js) fails when a new one has none.
//
// An item has:
//   key      a unique id (the card's anchor)
//   label    the name shown
//   source   the Markdown shown to the reader
//   slide    the Markdown built into the live slide, when it differs from the
//            source (a heading is added, or the slides around it define
//            sections)
//   about    one sentence, when the registry has none for it
//   caption  the line under the live slide
//   noplay   true when the playground cannot show it on its own

const OPEN = 'A simulated audience votes by itself. Click the slide to close voting.';
const STEPS = 'Click the slide to show the next step.';

const chartData = 'Mix: 10\nKnead: 10\nFirst rise: 90\nBake: 35';
const holes = (extra = '') => `::: poll {#holes${extra}} What makes the holes in bread?\n- Air you knead in\n- [x] Gas from the yeast\n- Steam from the water\n:::`;
const keys = (extra = '') => `::: estimate {#keys${extra}} How many keys does a piano have?\nanswer: 88\nmin: 1\nmax: 500\n:::`;

export const GROUPS = [
  {
    id: 'audience',
    title: 'Ask the audience',
    intro: 'Each of these is a block in the talk. The audience answers on their phones and the results fill in on the screen.',
    items: [
      { key: 'poll', label: 'Poll', about: 'One answer from a list. Everyone sees the results grow as people vote.', source: '::: poll {#lunch} Where should we go for lunch?\n- Tacos\n- Ramen\n- The place with the long queue\n:::', caption: OPEN },
      { key: 'quiz', label: 'Quiz', about: 'A poll with a right answer: mark it with [x]. It is revealed with an explanation when you close voting.', source: '::: poll {#capital} Which one is true?\n- Paris is the capital of Italy\n- [x] Rome is the capital of Italy\n\nRome has been the capital since 1871.\n:::', caption: OPEN },
      { key: 'multi', label: 'Several answers', about: 'Several answers from a list: people tick everything that applies.', source: '::: multi {#uses} What do you use every day?\n- Email\n- Chat\n- Video calls\n- Paper\n:::', caption: OPEN },
      { key: 'estimate', label: 'Guess a number', about: 'Everyone guesses a number. The spread of guesses is often the best part.', source: keys().replace(/\n:::$/, '\n\nA standard piano has 88 keys: 52 white and 36 black.\n:::'), caption: OPEN },
      { key: 'rounds', label: 'Rounds', about: 'The same question for several cases in a row, for a workshop or a class discussion.', source: '::: rounds {#would} Would you hand this to an AI?\noptions: Yes | No | It depends\n- Writing a birthday message\n- Planning a holiday\n:::', caption: OPEN },
      { key: 'sentence', label: 'Write together', about: 'The audience writes a sentence one word at a time.', source: '::: sentence {#story} Once upon a time\nmax: 6\nstart: there | a | in\nthere: was | lived | were\na: dragon | robot | cat\n*: and | the | .\n:::', caption: OPEN },
      { key: 'questions', label: 'Questions', about: 'Questions from the audience, with votes. You approve which ones appear.', source: '::: questions\n:::', caption: OPEN },
      { key: 'join', label: 'Join code', about: 'A big QR code to join, the link and how many people are in.', source: '<!-- layout: center -->\n\n# Welcome\n\n::: join Scan to join\n:::', caption: 'The code is drawn in the browser. In a live talk it opens the audience page.' },
    ],
  },
  {
    id: 'blocks',
    title: 'Show something',
    intro: 'Visual blocks for the slides where nobody answers: figures, steps, comparisons and charts, drawn in the talk\'s theme.',
    items: [
      { key: 'columns', label: 'Columns', source: '::: columns\n### Before\nSlides you watch.\n\n+++\n\n### After\nSlides you take part in.\n:::', slide: '## Columns\n\n' },
      { key: 'center', label: 'Center', source: '::: center\nCentred content inside an otherwise normal slide.\n:::', slide: '## Center\n\n' },
      { key: 'stat', label: 'Big number', about: 'A big number with a label under it.', source: '::: stat 88\nkeys on a standard piano.\n:::', slide: '## Big number\n\n' },
      { key: 'callout', label: 'Callout', source: '::: callout Remember\nA highlighted box with an optional title.\n:::', slide: '## Callout\n\n' },
      { key: 'cards', label: 'Cards', source: '::: cards {.steps}\n### Flour {icon=wheat}\nProteins that become gluten.\n\n+++\n\n### Yeast {icon=sparkles}\nA living fungus that makes gas.\n:::', slide: '## Cards\n\n', caption: STEPS },
      { key: 'timeline', label: 'Timeline', source: '::: timeline {.steps}\n- 1857: Pasteur publishes his work on fermentation\n- 1928: sliced bread goes on sale\n- 1961: the Chorleywood process\n:::', slide: '## Timeline\n\n', caption: STEPS },
      { key: 'steps', label: 'Steps of a process', source: '::: steps\n- Mix: flour, water, yeast, salt\n- Knead: ten minutes\n- Bake: hot oven\n:::', slide: '## Steps\n\n' },
      { key: 'kpis', label: 'Key figures', about: 'A row of figures from "value: label" items. Numbers count up when they appear.', source: '::: kpis\n- 215 min: from flour to bread\n- 4: ingredients\n- 1: oven\n:::', slide: '## Key figures\n\n' },
      { key: 'compare', label: 'Compare', source: '::: compare {vs="or"}\n### Fresh\nCrisp crust.\n\n+++\n\n### Sliced\nLasts longer.\n:::', slide: '## Compare\n\n' },
      { key: 'style', label: 'Style', about: 'CSS for one slide only. Rules apply inside the slide; bare declarations apply to the slide itself.', source: '## A slide with its own style\n\n::: style\nh2 { color: var(--accent); letter-spacing: 0.04em; }\n:::' },
      { key: 'notes', label: 'Speaker notes', about: 'Notes only the presenter sees, in the panel. The audience never gets them.', source: '## What the room sees\n\nThe notes below are only for you.\n\n::: notes\nSay this out loud. The audience never sees it.\n:::', caption: 'The notes are not in the slide: they show in the presenter panel.', noplay: true },
    ],
  },
  {
    id: 'layouts',
    title: 'Layouts',
    intro: 'A layout is one line at the top of a slide: <code>&lt;!-- layout: split --&gt;</code>. Pictures come from the talk\'s <code>images/</code> folder.',
    items: [
      { key: 'center', label: 'center', source: '<!-- layout: center -->\n\n## Everything centred\n\nTitle, text and blocks sit in the middle.' },
      { key: 'canvas', label: 'canvas', source: '<!-- layout: canvas -->\n\n## Free positions {x=6 y=8 w=70 h=16}\n\nEvery element goes where you put it. {x=6 y=32 w=38 h=20}\n\n![A bowl of rising dough](images/dough.svg){x=52 y=30 w=40 h=62}' },
      { key: 'title', label: 'title', source: '<!-- layout: title -->\n\n# A large title\n\nA subtitle, and the author.' },
      { key: 'section', label: 'section', source: '<!-- layout: section -->\n<!-- section: Ingredients, 4 -->\n\n# What goes in' },
      { key: 'split', label: 'split', source: '<!-- layout: split -->\n\n## Yeast eats sugar\n\n![A bowl of rising dough](images/dough.svg)\n\nIt turns sugar into **carbon dioxide** and alcohol.' },
      { key: 'full', label: 'full', source: '<!-- layout: full -->\n\n![A wheat field at sunset](images/field.svg)\n\n## It starts in a field\n\nA grain of wheat is mostly starch.' },
      { key: 'statement', label: 'statement', source: '<!-- layout: statement -->\n\n## Good bread is mostly *patience*.' },
      { key: 'quote', label: 'quote', source: '<!-- layout: quote -->\n\n> Bread is the king of the table, and all else is merely the court.\n\nA saying, often quoted by bakers.' },
      { key: 'grid', label: 'grid', source: '<!-- layout: grid -->\n\n## Three loaves\n\n![A small loaf](images/loaf-1.svg)\n\n![A medium loaf](images/loaf-2.svg)\n\n![A large loaf](images/loaf-3.svg)' },
      { key: 'big-number', label: 'big-number', source: '<!-- layout: big-number -->\n\n## 215 minutes\n\nfrom flour to bread, in about three and a half hours.' },
      { key: 'compare', label: 'compare', source: '<!-- layout: compare -->\n\n## Fresh or sliced?\n\n::: columns\n### Fresh\nCrisp crust, best on the day.\n\n+++\n\n### Sliced\nLasts a week.\n:::' },
      { key: 'agenda', label: 'agenda', source: '<!-- layout: agenda -->\n\n## Today', slide: '<!-- layout: agenda -->\n<!-- section: Method, 2 -->\n\n## Today', caption: 'The sections come from the other slides of the talk (each has <!-- section: name -->).', noplay: true },
      { key: 'closing', label: 'closing', source: '<!-- layout: closing -->\n\n# Thank you\n\nNow go and bake something. :icon[croissant]' },
    ],
  },
  {
    id: 'text',
    title: 'Text, icons and code',
    intro: 'Small things you write inside a sentence or a code block. There are about 230 icons; <code>quorum schema --icons</code> lists them.',
    items: [
      { key: 'icon', label: 'Icon', about: 'An icon inside text, from the bundled Lucide set.', source: 'Ready in an hour :icon[clock] and baked with :icon[flame].', slide: '## Icons\n\n' },
      { key: 'badge', label: 'Badge', about: 'A small coloured label inside text.', source: 'The new recipe :badge[new] is lighter :badge[tested].', slide: '## Badges\n\n' },
      { key: 'highlight', label: 'Highlight', about: 'Text highlighted like a marker.', source: 'Good bread is ==mostly patience==, and a little salt.', slide: '## Highlights\n\n' },
      { key: 'code', label: 'Code', about: 'Highlighted code. With lines=, each click highlights the next range of lines.', source: '```js {lines=1-2|4-6}\nconst start = Date.now();\nconst doubled = (v) => v >= 2 * startVolume;\n\nwhile (!doubled(volume())) {\n  await wait(minutes(10));\n}\n```', slide: '## Code\n\n', caption: STEPS },
    ],
  },
  {
    id: 'charts',
    title: 'Charts',
    intro: 'A chart from <code>label: value</code> lines, in the talk\'s colours. <code>title=</code>, <code>unit=</code>, <code>max=</code> and, for pictograms, <code>icon=</code> and <code>per=</code> are options.',
    items: ['bar', 'column', 'line', 'donut', 'pictogram'].map((type) => ({
      key: `chart-${type}`,
      label: type,
      chart: type,
      source: `::: chart ${type} {unit=min title="Minutes for each step"${type === 'pictogram' ? ' icon=clock per=10' : ''}}\n${chartData}\n:::`,
      slide: `## Chart: ${type}\n\n`,
    })),
  },
  {
    id: 'looks',
    title: 'How the answers look',
    intro: 'Every interaction can draw its results in more than one way, with <code>chart=</code> on the block or <code>charts:</code> for the whole talk.',
    items: [
      ...['bars', 'columns', 'donut', 'pictogram', 'race', 'bubbles'].map((look) => ({
        key: `look-poll-${look}`, label: `poll, ${look}`, look: `poll:${look}`, source: holes(` chart=${look}`), caption: OPEN,
      })),
      ...['strip', 'histogram', 'beeswarm', 'thermometer'].map((look) => ({
        key: `look-estimate-${look}`, label: `estimate, ${look}`, look: `estimate:${look}`, source: keys(` chart=${look}`), caption: OPEN,
      })),
      { key: 'look-sentence-bars', label: 'sentence, bars', look: 'sentence:bars', source: '::: sentence {#story chart=bars} Once upon a time\nmax: 4\nstart: there | a | in\nthere: was | lived\na: dragon | robot | cat\n*: and | the\n:::', caption: OPEN },
      { key: 'look-sentence-tree', label: 'sentence, tree', look: 'sentence:tree', source: '::: sentence {#story chart=tree} Once upon a time\nmax: 4\nstart: there | a | in\nthere: was | lived\na: dragon | robot | cat\n*: and | the\n:::', caption: OPEN },
      ...['list', 'wall', 'spotlight'].map((look) => ({
        key: `look-questions-${look}`, label: `questions, ${look}`, look: `questions:${look}`, source: `::: questions {chart=${look}}\n:::`, caption: OPEN,
      })),
    ],
  },
  {
    id: 'motion',
    title: 'Steps and effects',
    intro: 'Two dashes show the next step when you click. An effect after them changes how it comes in: <code>-- fly</code>.',
    items: ['fade', 'fly', 'zoom', 'blur', 'drop', 'highlight'].map((effect) => ({
      key: `effect-${effect}`,
      label: effect,
      effect,
      source: `## One idea at a time\n\nThis shows first.\n\n-- ${effect}\n\nThis comes in with ${effect}.`,
      caption: STEPS,
    })),
  },
];

// Examples that open their own voting in the frame, so the results show.
GROUPS.forEach((g) => g.items.forEach((i) => {
  if (i.caption !== OPEN) return;
  // An estimate draws its chart when voting closes.
  const reveal = i.key.startsWith('estimate') || i.key.startsWith('look-estimate');
  i.play = reveal ? 'reveal' : true;
  if (reveal) i.caption = 'A simulated audience guesses by itself, and the chart appears when voting closes.';
  if (i.key.includes('questions')) i.caption = 'A simulated audience asks questions by itself.';
}));

// The registry names each group should cover, for the test.
export function coverage(schema) {
  const have = new Set(GROUPS.flatMap((g) => g.items.map((i) => `${g.id}:${i.key}`)));
  const lookKeys = new Set(GROUPS.flatMap((g) => g.items.filter((i) => i.look).map((i) => i.look)));
  const wanted = [];
  Object.keys(schema.blocks).forEach((b) => {
    // Charts are the charts group, and components have their own cards.
    if (b === 'component' || b === 'chart') return;
    // "quiz" is a poll with a right answer; the rest are blocks of their own.
    const group = ['poll', 'multi', 'estimate', 'rounds', 'sentence', 'questions', 'join'].includes(b) ? 'audience' : 'blocks';
    wanted.push(`${group}:${b}`);
  });
  Object.keys(schema.inline).filter((k) => !k.startsWith('{')).forEach((k) => wanted.push(`text:${k.startsWith(':') ? k.slice(1).split('[')[0] : 'highlight'}`));
  wanted.push('text:code');
  Object.keys(schema.layouts).forEach((l) => wanted.push(`layouts:${l}`));
  schema.chartTypes.forEach((c) => wanted.push(`charts:chart-${c}`));
  schema.stepEffects.forEach((e) => wanted.push(`motion:effect-${e}`));
  const looks = [];
  Object.entries(schema.resultStyles).forEach(([kind, list]) => {
    // multi and rounds draw the same looks as a poll.
    if (kind === 'multi' || kind === 'rounds') return;
    list.forEach((look) => looks.push(`${kind}:${look}`));
  });
  return { missing: wanted.filter((w) => !have.has(w)), missingLooks: looks.filter((l) => !lookKeys.has(l)) };
}
