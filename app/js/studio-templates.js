// New slides for the "Add slide" menu: one per kind of slide that works
// well, written the way an agent or a person would write them.

export const TEMPLATES = [
  { name: 'Content', about: 'A title and a few points', text: '## A title\n\n- First point\n- Second point\n- Third point\n' },
  { name: 'Title', about: 'An opening slide', text: '<!-- layout: title -->\n\n# The title of the talk\n\nYour name, or a subtitle.\n' },
  { name: 'Section', about: 'A divider between parts', text: '<!-- layout: section -->\n<!-- section: New section, 5 -->\n\n# A new section\n' },
  { name: 'Statement', about: 'One sentence, very large', text: '<!-- layout: statement -->\n\n## One sentence people remember.\n' },
  { name: 'Picture and text', about: 'A picture on half the slide', text: '<!-- layout: split -->\n\n## What the picture shows\n\n![Describe the picture](images/picture.jpg)\n\nA few words next to it.\n' },
  { name: 'Quote', about: 'A quotation and who said it', text: '<!-- layout: quote -->\n\n> The quotation goes here.\n\nWho said it\n' },
  { name: 'Big number', about: 'One figure, huge', text: '<!-- layout: big-number -->\n\n## 87\n\nkeys on a standard piano\n' },
  { name: 'Cards', about: 'Three ideas side by side', text: '## Three ideas\n\n::: cards\n### First\nWhat it is.\n\n+++\n\n### Second\nWhat it does.\n\n+++\n\n### Third\nWhy it matters.\n:::\n' },
  { name: 'Steps', about: 'A process, step by step', text: '## How it works\n\n::: steps\n- First: what happens\n- Second: what happens next\n- Third: the result\n:::\n' },
  { name: 'Timeline', about: 'Things in order', text: '## What happened\n\n::: timeline\n- 2020: the start\n- 2022: the turn\n- 2024: today\n:::\n' },
  { name: 'Key figures', about: 'Three numbers that count up', text: '## The numbers\n\n::: kpis\n- 120: people\n- 4: countries\n- 98%: happy\n:::\n' },
  { name: 'Chart', about: 'A chart from your numbers', text: '## Where the time goes\n\n::: chart column {unit=min}\nMix: 10\nKnead: 10\nRise: 90\nBake: 35\n:::\n' },
  { name: 'Compare', about: 'Two sides', text: '## This or that\n\n::: compare {vs="or"}\n### This\nIts good points.\n\n+++\n\n### That\nIts good points.\n:::\n' },
  { name: 'Poll', about: 'The audience votes', text: '::: poll Which one do you prefer?\n- First option\n- Second option\n- Third option\n:::\n' },
  { name: 'Questions', about: 'The audience asks', text: '::: questions Ask me anything\n:::\n' },
  { name: 'Closing', about: 'The last slide', text: '<!-- layout: closing -->\n\n# Thank you\n\nWhere to find more.\n' },
  { name: 'Canvas', about: 'Place things freely', text: '<!-- layout: canvas -->\n\n## Place things anywhere {x=6 y=6 w=70 h=14}\n\nDrag me. {x=6 y=30 w=40 h=12}\n' },
];
