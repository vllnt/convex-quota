import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import process from "node:process";

import { codeBlocks, tsExamples } from "./doc-examples.mjs";
import { extractLinks } from "./markdown-links.mjs";

/**
 * Checks that the agent-facing docs match the package; runs in `pnpm lint`.
 *
 * README: the description under the title, required sections in order, a short
 * "For coding agents" note, install and the first Quick start example in the
 * first 40 lines, badges after the Quick start, the exact Links section and
 * footer, the peer range and Node engines under Compatibility, a table row for
 * every public export and method, every error code in the Errors table, and
 * Related packages limited to real dependencies.
 * Code blocks: tagged, TypeScript instead of JavaScript, no "..." gaps, and
 * every TypeScript example starts with its file path (`pnpm check:pack`
 * compiles them against the packed package).
 * Shipped docs: relative links and #anchors resolve to packed files and
 * headings, docs/API.md names every export and error code, llms.txt holds the
 * summary, a When to use section, the peer range, the coding-agent note and
 * the docs links and ends with the Ecosystem block, and the retired
 * vllnt ".ai" domain appears nowhere.
 * Sources: every export and method has a TSDoc summary, and the main entry
 * carries the package-page `@see` line.
 */

const NAME = "convex-quota";
const PACKAGE = `@vllnt/${NAME}`;
const PAGE = `https://oss.vllnt.com/packages/${NAME}`;

const SECTIONS = [
  "For coding agents",
  "When to use",
  "Install",
  "Quick start",
  "API",
  "Common tasks",
  "Errors and fixes",
  "Limits and gotchas",
  "Compatibility",
  "Testing",
  "Security",
  "Related packages",
  "Contributing",
  "Links",
  "License",
];

const FOOTER = [
  "---",
  "",
  `Part of [vllnt open source](https://oss.vllnt.com) · [Package page](${PAGE}) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](https://bntvllnt.com)`,
];

const LINKS = [
  "## Links",
  "",
  `- Docs and changelog: [oss.vllnt.com/packages/${NAME}](${PAGE}) · [release feed](${PAGE}/rss.xml)`,
  "- All @vllnt packages: [oss.vllnt.com](https://oss.vllnt.com) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)",
  `- Source and issues: [GitHub](https://github.com/vllnt/${NAME}) · [issues](https://github.com/vllnt/${NAME}/issues) · [npm](https://www.npmjs.com/package/${PACKAGE})`,
  "- Questions and updates: [Discord](https://bntvllnt.com/discord) · [X @bntvllnt](https://x.com/bntvllnt)",
  "- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](https://bntvllnt.com) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)",
  "- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)",
];

const LLMS_ECOSYSTEM = [
  "## Ecosystem",
  "",
  `- [Package page](${PAGE})`,
  `- [Release feed](${PAGE}/rss.xml)`,
  "- [All @vllnt packages](https://oss.vllnt.com/llms.txt)",
  "- [Search vllnt packages and docs](https://index.vllnt.com)",
  "- [vllnt](https://vllnt.com/llms.txt)",
  "- [Author](https://bntvllnt.com)",
];

const SHIPPED_DOCS = ["README.md", "docs/API.md", "CHANGELOG.md", "llms.txt"];
const AGENT_NOTE_FILES = ["README.md", "CHANGELOG.md", "llms.txt", "docs/API.md"];
const JS_LANGS = new Set(["js", "javascript", "jsx"]);

/** @type {string[]} */
const problems = [];
const fail = (message) => problems.push(message);
const read = (path) => readFileSync(path, "utf8");

/** GitHub's heading anchor: lowercase, drop punctuation, spaces to hyphens. */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Markdown text with fenced code blocks blanked out (keeps line numbers). */
function prose(text) {
  return text.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "));
}

function headings(text) {
  return [...prose(text).matchAll(/^(#{1,6}) (.+)$/gm)].map((match) => ({
    level: match[1].length,
    text: match[2].trim(),
    index: match.index,
  }));
}

/** The `## name` section of a markdown file, heading included; "" if absent. */
function section(text, name) {
  const all = headings(text);
  const at = all.findIndex((heading) => heading.level === 2 && heading.text === name);
  if (at === -1) return "";
  const end = all.slice(at + 1).find((heading) => heading.level <= 2);
  return text.slice(all[at].index, end?.index ?? text.length);
}

/** True when `before` ends with a TSDoc block: a comment opened with "/**". */
function endsWithTsdoc(before) {
  return /\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*$/.test(before);
}

const manifest = JSON.parse(read("package.json"));
const readme = read("README.md");
const api = read("docs/API.md");
const llms = read("llms.txt");
const readmeLines = readme.split("\n");

// README title, description and layout.
if (readmeLines[0] !== `# ${PACKAGE}`) fail(`README must start with "# ${PACKAGE}"`);
if (readmeLines[1] !== "" || readmeLines[2] !== manifest.description) {
  fail(`README line 3 must be the package.json description, exactly: ${manifest.description}`);
}
const h2 = headings(readme)
  .filter((heading) => heading.level === 2)
  .map((heading) => heading.text);
if (JSON.stringify(h2) !== JSON.stringify(SECTIONS)) {
  fail(`README "##" sections must be, in this order: ${SECTIONS.join(" | ")}; found: ${h2.join(" | ")}. Rename, add or move sections to match`);
}
const agents = section(readme, "For coding agents")
  .split("\n")
  .slice(1)
  .map((line) => line.trim())
  .filter(Boolean);
if (agents.length === 0 || agents.length > 3) fail('README "For coding agents" must hold 1 to 3 lines; shorten it');
for (const file of [`node_modules/${PACKAGE}/`, ...AGENT_NOTE_FILES]) {
  if (!agents.join(" ").includes(file)) fail(`README "For coding agents" must name \`${file}\` (version-matched docs ship in the package)`);
}
const [useWhen = "", avoidWhen = ""] = section(readme, "When to use").split(/^Do not use it when:$/m);
const bullets = (text) => (text.match(/^- /gm) ?? []).length;
if (bullets(useWhen) < 2 || bullets(useWhen) > 4) fail('README "When to use" needs 2 to 4 bullets under "Use it when:"');
if (bullets(avoidWhen) < 1 || bullets(avoidWhen) > 3) fail('README "When to use" needs 1 to 3 bullets under a "Do not use it when:" line');

const installLine = readmeLines.findIndex((line) => line === `pnpm add ${PACKAGE}`);
if (installLine === -1 || installLine >= 40) {
  fail(`README: put "pnpm add ${PACKAGE}" in a bash block within the first 40 lines (found on line ${installLine + 1}); shorten the text above ## Install`);
}
const quickStartLine = readmeLines.indexOf("## Quick start");
const apiLine = readmeLines.indexOf("## API");
const quickStartBlocks = codeBlocks(readme).filter((block) => block.line > quickStartLine && block.line < apiLine + 1);
const firstEnd = quickStartBlocks[0] ? quickStartBlocks[0].line + quickStartBlocks[0].body.split("\n").length : -1;
if (quickStartLine === -1 || firstEnd === -1 || firstEnd >= 40) {
  fail("README: the first Quick start code block must close within the first 40 lines; shorten the text above it");
}
const lastQuickStart = quickStartBlocks.at(-1);
const lastQuickStartEnd = lastQuickStart ? lastQuickStart.line + lastQuickStart.body.split("\n").length : -1;
const firstBadge = prose(readme)
  .split("\n")
  .findIndex((line) => line.includes("![") || /<img\b/i.test(line));
if (firstBadge !== -1 && firstBadge <= lastQuickStartEnd) {
  fail(`README:${firstBadge + 1}: move every badge or image below the last Quick start code block (line ${lastQuickStartEnd + 1})`);
}
for (const [, alt] of prose(readme).matchAll(/!\[([^\]]*)\]/g)) {
  if (alt.trim() === "") fail("README: every image needs alt text, e.g. ![npm version](...)");
}
if (readmeLines.slice(-4).join("\n") !== [...FOOTER, ""].join("\n")) {
  fail(`README must end with exactly these lines:\n${FOOTER.join("\n")}`);
}
if (section(readme, "Links").trimEnd() !== LINKS.join("\n")) {
  fail(`README "## Links" (right before "## License") must be exactly:\n${LINKS.join("\n")}`);
}
const peer = `convex@${manifest.peerDependencies.convex}`;
const compatibility = section(readme, "Compatibility");
if (!compatibility.includes(`\`${peer}\``)) fail(`README "## Compatibility" must name the peer range \`${peer}\` from package.json`);
if (!compatibility.includes(`\`${manifest.engines.node}\``)) {
  fail(`README "## Compatibility" must name the Node engines range \`${manifest.engines.node}\` from package.json`);
}
const dependencies = new Set(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies }));
for (const [name] of section(readme, "Related packages").matchAll(/@[\w-]+\/[\w.-]+/g)) {
  if (!dependencies.has(name)) {
    fail(`README "## Related packages" names ${name}, which package.json does not depend on; list only packages used together in code and move alternatives to "## When to use"`);
  }
}
for (const [text] of prose(readme).matchAll(/\[(?:here|click here|this|link)\]\(/gi)) {
  fail(`README: link text ${text.slice(0, -1)} does not describe its target; name the target instead`);
}

// Code blocks in shipped docs: tagged, TypeScript instead of JavaScript, no
// elided gaps. "..." is allowed only as spread syntax ("...rest", "...[", "...{", "...(").
const gap = /\.\.\.(?![\p{L}\p{N}_$[{(])|…/u;
for (const doc of SHIPPED_DOCS) {
  for (const block of codeBlocks(read(doc))) {
    if (block.lang === "") fail(`${doc}:${block.line}: code block has no language tag; open it with \`\`\`ts, \`\`\`bash or similar`);
    if (JS_LANGS.has(block.lang)) fail(`${doc}:${block.line}: \`\`\`${block.lang} block; write the example in TypeScript and open it with \`\`\`ts so check:pack compiles it`);
    const at = block.body.split("\n").findIndex((line) => gap.test(line));
    if (at !== -1) fail(`${doc}:${block.line + 1 + at}: code block has a "..." gap; write the full code ("..." is allowed only as spread syntax)`);
  }
}
for (const problem of tsExamples(["README.md", "docs/API.md"].map((doc) => ({ doc, text: read(doc) }))).problems) fail(problem);

// Links and anchors in shipped docs resolve inside the package.
const packed = new Set(
  JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    }),
  )[0].files.map((file) => file.path),
);
const anchors = (path) => new Set(headings(read(path)).map((heading) => slug(heading.text)));
for (const doc of SHIPPED_DOCS) {
  for (const link of extractLinks(read(doc))) {
    if (/^[a-z][a-z\d+.-]*:/i.test(link)) continue;
    const [path, anchor] = link.split("#");
    const target = path === "" ? doc : posix.normalize(posix.join(posix.dirname(doc), path));
    if (!packed.has(target)) {
      fail(`${doc}: link ${link} does not resolve to a file in the npm package; fix the path or use an absolute https:// URL`);
    } else if (anchor !== undefined && target.endsWith(".md") && !anchors(target).has(anchor)) {
      fail(`${doc}: link ${link} has no matching heading in ${target}; fix the #anchor or add the heading`);
    }
  }
}

// The retired vllnt ".ai" domain appears in no shipped or tracked file. It is
// built from parts so this script does not contain it either.
const retiredDomain = ["vllnt", "ai"].join(".");
const retired = new RegExp(String.raw`\b${retiredDomain.replace(".", String.raw`\.`)}\b`, "i");
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const path of new Set([...[...packed].filter((path) => !path.startsWith("dist/")), ...tracked])) {
  if (retired.test(read(path))) fail(`${path} mentions ${retiredDomain}; use vllnt.com`);
}

// llms.txt: the same summary, when to use, peer range, coding-agent note and
// relative links, ending with the Ecosystem block.
if (!llms.startsWith(`# ${PACKAGE}\n\n> ${manifest.description}\n`)) {
  fail(`llms.txt must start with "# ${PACKAGE}", a blank line and "> " plus the package.json description`);
}
if (!llms.includes("\n## When to use\n")) fail('llms.txt lacks "## When to use"; add the same use / do-not-use bullets as the README');
if (!llms.includes(peer)) fail(`llms.txt must name the peer range \`${peer}\` from package.json; add it to the summary paragraph`);
if (!llms.includes(`node_modules/${PACKAGE}/`)) fail(`llms.txt lacks the coding-agent note naming node_modules/${PACKAGE}/`);
for (const link of ["](./docs/API.md)", "](./docs/API.md#error-codes)", "](./README.md#errors-and-fixes)", "](./CHANGELOG.md)"]) {
  if (!llms.includes(link)) fail(`llms.txt lacks the link ${link.slice(2, -1)}; add it under "## Docs"`);
}
if (!llms.trimEnd().endsWith(`\n${LLMS_ECOSYSTEM.join("\n")}`)) fail(`llms.txt must end with exactly this block:\n${LLMS_ECOSYSTEM.join("\n")}`);
if (llms.split("https://oss.vllnt.com/llms.txt").length !== 2) {
  fail("llms.txt must link https://oss.vllnt.com/llms.txt exactly once, in the Ecosystem block; remove the other links");
}

// Public exports, read from the sources the build compiles. Each one has a
// README API table row, is named in docs/API.md, and has a TSDoc summary.
const clientSource = read("src/client/index.ts");
/** @type {Map<string, string>} export name to the source file that declares it */
const exported = new Map();
const declares = (file, name) => new RegExp(String.raw`^export (?:declare )?(?:class|type|function|const) ${name}\b`, "m").test(read(file));
for (const [file, text] of [["src/client/index.ts", clientSource], ["src/test.ts", read("src/test.ts")], ["src/component/_generated/component.ts", read("src/component/_generated/component.ts")]]) {
  for (const [, name] of text.matchAll(/^export (?:declare )?(?:class|type|function|const) (\w+)/gm)) exported.set(name, file);
}
for (const [, list] of clientSource.matchAll(/^export \{([^}]+)\} from/gm)) {
  for (const name of list.split(",").map((part) => part.replace(/^\s*type\s+/, "").trim()).filter(Boolean)) {
    const file = ["src/client/types.ts", "src/shared.ts"].find((candidate) => declares(candidate, name));
    if (file === undefined) fail(`src/client/index.ts re-exports ${name}, but neither src/client/types.ts nor src/shared.ts declares it`);
    else exported.set(name, file);
  }
}
const apiTable = section(readme, "API");
const hasApiRow = (name) => new RegExp(String.raw`^\| \[\`${name}\`\]\(\./docs/API\.md#`, "m").test(apiTable);
for (const [name, file] of exported) {
  if (!hasApiRow(name)) fail(`README "## API" has no row for \`${name}\`; add a row starting with | [\`${name}\`](./docs/API.md#...)`);
  if (!api.includes(`\`${name}\``)) fail(`docs/API.md does not name \`${name}\` in backticks; document it there`);
  const text = read(file);
  const at = text.search(new RegExp(String.raw`^export (?:declare )?(?:class|type|function|const) ${name}\b`, "m"));
  if (!endsWithTsdoc(text.slice(0, at))) fail(`${file}: ${name} has no TSDoc summary; put a /** ... */ comment (not // or /* */) directly above it`);
}
const methods = [...clientSource.matchAll(/^ {2}(\w+)\(/gm)].map((match) => match[1]).filter((name) => name !== "constructor");
if (methods.length === 0) fail("src/client/index.ts: no public Quota methods found; keep them as two-space-indented `name(` lines");
for (const method of methods) {
  if (!hasApiRow(method)) fail(`README "## API" has no row for the method \`${method}\`; add a row starting with | [\`${method}\`](./docs/API.md#...)`);
  if (!api.includes(`### \`${method}\``)) fail(`docs/API.md has no "### \`${method}\`" heading; add one with its signature`);
  const at = clientSource.search(new RegExp(String.raw`^ {2}${method}\(`, "m"));
  if (!endsWithTsdoc(clientSource.slice(0, at))) fail(`src/client/index.ts: method ${method} has no TSDoc summary; add a /** ... */ comment above it`);
}
if (!/^\| \[`convex\.config` default\]\(\.\/docs\/API\.md#/m.test(apiTable)) {
  fail('README "## API" has no row for the convex.config default export; add a row starting with | [`convex.config` default](./docs/API.md#...)');
}
const config = read("src/component/convex.config.ts");
if (!endsWithTsdoc(config.slice(0, config.search(/^const component/m)))) {
  fail("src/component/convex.config.ts: the component definition has no TSDoc summary; add a /** ... */ comment above `const component`");
}
const classDoc = clientSource.match(/\/\*\*((?:(?!\*\/)[^])*)\*\/\s*export class Quota\b/);
if (!classDoc?.[1].includes(`@see ${PAGE}`)) fail(`the Quota class TSDoc in src/client/index.ts lacks the line "@see ${PAGE}"; add it`);

// Every error code in src (an all-caps string literal such as "INVALID_REF")
// has a row in the README Errors table and in docs/API.md "## Error codes".
const sources = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "_generated") walk(path);
    else if (entry.isFile() && path.endsWith(".ts") && !/\.(?:test|spec)\.ts$/.test(path)) sources.push(path);
  }
};
walk("src");
const codes = new Set(sources.flatMap((path) => [...read(path).matchAll(/"([A-Z]+(?:_[A-Z]+)+)"/g)].map((match) => match[1])));
const errorRow = (text, code) => text.split("\n").some((line) => line.startsWith(`| \`${code}\``));
for (const code of codes) {
  if (!errorRow(section(readme, "Errors and fixes"), code)) fail(`README "## Errors and fixes" lacks a row starting with | \`${code}\`; add its message, cause and fix`);
  if (!errorRow(section(api, "Error codes"), code)) fail(`docs/API.md "## Error codes" lacks a row starting with | \`${code}\`; add its message and the methods that throw it`);
}
// Literal messages ("CODE", "message") and requirePositiveInt(value, "name", "CODE") appear verbatim.
const messages = sources.flatMap((path) => {
  const text = read(path);
  return [
    ...[...text.matchAll(/"([A-Z]+(?:_[A-Z]+)+)",\s*"([^"\\]+)"/g)].map(([, code, message]) => ({ code, message })),
    ...[...text.matchAll(/requirePositiveInt\([^,]+,\s*"(\w+)",\s*"([A-Z_]+)"\)/g)].map(([, name, code]) => ({ code, message: `${name} must be a positive safe integer` })),
  ];
});
for (const { code, message } of messages) {
  for (const [doc, table] of [["README \"## Errors and fixes\"", section(readme, "Errors and fixes")], ["docs/API.md \"## Error codes\"", section(api, "Error codes")]]) {
    if (!table.split("\n").some((line) => line.startsWith(`| \`${code}\``) && line.includes(`\`${message}\``))) {
      fail(`${doc} has no \`${code}\` row with the exact message \`${message}\` from src; copy the message verbatim`);
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exit(1);
}
console.log(`PASS docs: ${SECTIONS.length} sections, ${exported.size} exports, ${methods.length} methods, ${codes.size} error codes, ${messages.length} error messages`);
