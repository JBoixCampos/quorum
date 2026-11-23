// "Ask your agent": Quorum has no AI of its own. Studio saves the request in
// requests/ (so an agent that works in this folder, or on a copy of it, finds
// it with `quorum requests`) and also writes the full request as text, for an
// agent that is not looking at the folder.

import { addRequest, INSTRUCTION, requestPrompt } from '../cli/requests.js';

// Where a slide is, in words an agent can follow.
function whereIs(workspace, talk, slide) {
  const file = slide.file || workspace.file;
  return talk.split ? `the slide file ${file}` : `${file}, lines ${slide.lines[0]} to ${slide.lines[1]}`;
}

export function agentRequest(workspace, {
  kind = 'edit', slide: id, range = null, text = '', count = 3, save = true,
} = {}) {
  const talk = workspace.talk();
  const slide = workspace.slideById(talk, id);
  let part = '';
  if (Array.isArray(range)) {
    const all = workspace.parts().source.split('\n');
    part = all.slice(range[0] - 1, range[1]).join('\n').trim();
  }
  const kindName = kind === 'alternatives' ? 'alternatives' : 'edit';
  const saved = save
    ? addRequest(workspace.dir, {
      slide: slide.id, kind: kindName, wish: text, part, count, by: 'studio',
    })
    : null;
  const prompt = requestPrompt({
    title: slide.title,
    id: slide.id,
    where: whereIs(workspace, talk, slide),
    wish: text,
    part,
    kind: kindName,
    count,
    requestId: saved ? saved.id : '',
  });
  return {
    prompt, slide: slide.id, id: saved ? saved.id : '', file: saved ? saved.file : '', instruction: INSTRUCTION,
  };
}

// The full text for a request that is already saved (for an agent that is not
// looking at this folder). The slide's lines are looked up now, not when it was asked.
export function promptForRequest(workspace, request) {
  const talk = workspace.talk();
  const slide = talk.slides.find((x) => x.id === request.slide);
  if (!slide) throw new Error(`The slide "${request.slide}" no longer exists.`);
  return requestPrompt({
    title: slide.title,
    id: slide.id,
    where: whereIs(workspace, talk, slide),
    wish: request.wish,
    part: request.part,
    kind: request.kind,
    count: request.count,
    requestId: request.id,
  });
}

export { whereIs };
