// "Ask your agent": Quorum has no AI of its own. Studio writes the request
// for the person's agent (Claude Code, Codex, Cursor, an agent in the cloud)
// with everything it needs: which file, which lines, what to do, how to check
// it and how to hand back alternatives so they appear in Studio.

const DIRECTIONS = ['data first: numbers and a chart', 'one picture and one sentence', 'playful', 'minimal: as few words as possible'];

export function agentRequest(workspace, { kind = 'edit', slide: id, range = null, text = '', count = 3 } = {}) {
  const talk = workspace.talk();
  const slide = workspace.slideById(talk, id);
  const file = slide.file || workspace.file;
  const where = talk.split
    ? `the slide file ${file}`
    : `${file}, lines ${slide.lines[0]} to ${slide.lines[1]}`;
  let part = '';
  if (Array.isArray(range)) {
    const all = workspace.parts().source.split('\n');
    const quoted = all.slice(range[0] - 1, range[1]).join('\n').trim();
    if (quoted) part = `The part to change:\n\n${quoted.split('\n').map((l) => `    ${l}`).join('\n')}\n`;
  }
  const lines = [];
  if (kind === 'alternatives') {
    const n = Math.max(1, Math.min(6, Number(count) || 3));
    const wanted = String(text || '').trim();
    lines.push(
      `In this Quorum talk, write ${n} alternative versions of the slide "${slide.title}" (id: ${slide.id}), in ${where}.`,
      wanted ? `What I want from them: ${wanted}` : `Give each a different direction, for example: ${DIRECTIONS.slice(0, n).join('; ')}.`,
      '',
      'Keep the content and the talk\'s theme. Use Quorum\'s layouts and blocks (`quorum schema` lists them). Each alternative is exactly one slide: no line that is only "---".',
      `Save each one as a variant, without changing the slide itself:`,
      `  quorum variant add ${slide.id} --by <your name> --direction "<what it tries>" < alternative.md`,
      'Run `quorum check` on the talk afterwards. The alternatives appear in Quorum Studio, where I will choose one.',
    );
  } else {
    const wanted = String(text || '').trim() || 'Improve it.';
    lines.push(
      `In this Quorum talk, change the slide "${slide.title}" (id: ${slide.id}), in ${where}.`,
      ...(part ? [part] : []),
      `What I want: ${wanted}`,
      '',
      'Edit the Markdown in place and leave the other slides alone. Use Quorum\'s layouts and blocks (`quorum schema` lists them).',
      'Run `quorum check --json` and fix any warning on this slide. Quorum Studio shows the change as soon as the file is saved.',
    );
  }
  lines.push('', 'If you work on a copy of the repository (in the cloud), commit and push to a branch so I can pull it.');
  return { prompt: lines.join('\n'), slide: slide.id };
}
