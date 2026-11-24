// Reading the body of a request as JSON, with a size limit in bytes.

export function readJson(req, limit, Fail = Error, messages = {}) {
  const { large = 'That is too large.', invalid = 'Not valid JSON.' } = messages;
  return new Promise((done, failed) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      if (size > limit) return;
      size += chunk.length;
      if (size > limit) {
        failed(new Fail(large));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        failed(new Fail(invalid));
      }
    });
  });
}
