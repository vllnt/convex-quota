// Pure helpers (no Node imports) shared by check-docs.mjs and check-pack.mjs.

const TS_LANGS = new Set(["ts", "typescript", "tsx"]);
const FILE_PATH = /^\/\/ (convex\/[\w./-]+\.tsx?)$/;

/**
 * Fenced code blocks opened with three backticks, in source order.
 *
 * @param {string} markdown
 * @returns {{ lang: string, body: string, line: number }[]} `line` is the 1-based line of the opening fence
 */
export function codeBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const open = /^```(\S*)\s*$/.exec(lines[index]);
    if (!open) continue;
    const start = index;
    const body = [];
    for (index++; index < lines.length && lines[index] !== "```"; index++) body.push(lines[index]);
    blocks.push({ lang: open[1], body: body.join("\n"), line: start + 1 });
  }
  return blocks;
}

/**
 * TypeScript blocks of the given docs, split into app files and type shapes.
 * An app file starts with its path comment (`// convex/plays.ts`). A type
 * shape has no path and no imports: it only declares `type X = ...` to show an
 * exported type. Anything else is a problem the caller reports.
 *
 * Every `convex/convex.config.ts` variant is kept (nothing imports it), under
 * `convex/convex.config.N.ts` after the first; other paths must not repeat with
 * different code.
 *
 * @param {{ doc: string, text: string }[]} docs
 */
export function tsExamples(docs) {
  /** @type {Map<string, { body: string, doc: string, line: number }>} */
  const files = new Map();
  /** @type {{ body: string, doc: string, line: number, names: string[] }[]} */
  const shapes = [];
  /** @type {string[]} */
  const problems = [];
  let configs = 0;
  for (const { doc, text } of docs) {
    for (const block of codeBlocks(text)) {
      if (!TS_LANGS.has(block.lang)) continue;
      const where = { body: block.body, doc, line: block.line };
      const path = FILE_PATH.exec(block.body.split("\n")[0])?.[1];
      if (path === undefined) {
        const names = [...block.body.matchAll(/^type (\w+)/gm)].map((match) => match[1]);
        if (names.length > 0 && !/^\s*import\b/m.test(block.body)) {
          shapes.push({ ...where, names });
        } else {
          problems.push(`${doc}:${block.line}: a TypeScript example must start with its file path, e.g. "// convex/plays.ts" (only blocks that just declare \`type X = ...\` may omit it)`);
        }
        continue;
      }
      if (path === "convex/convex.config.ts") {
        configs++;
        files.set(configs === 1 ? path : `convex/convex.config.${configs}.ts`, where);
        continue;
      }
      const seen = files.get(path);
      if (seen !== undefined && seen.body !== block.body) {
        problems.push(`${doc}:${block.line}: ${path} is also the path of ${seen.doc}:${seen.line} with different code; give each example its own file path`);
        continue;
      }
      files.set(path, where);
    }
  }
  return { files, problems, shapes };
}
