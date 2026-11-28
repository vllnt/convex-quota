// Pure helper (no Node imports) so vitest can test it in the edge-runtime environment.

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const CODE_SPAN = /(`+)[^`]*?\1/g;
const TITLE = String.raw`(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?`;
// `[text](target "title")`, also matching images `![alt](target)`. A bare
// target may hold one level of balanced parentheses, e.g. `Foo_(bar)`.
const INLINE = new RegExp(String.raw`\]\(\s*(<[^>\n]*>|(?:[^\s()<>]|\([^\s()<>]*\))+)${TITLE}\s*\)`, "g");
// `[label]: target "title"`; `[^note]:` is a footnote, not a link.
const DEFINITION = new RegExp(String.raw`^ {0,3}\[(?!\^)[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)${TITLE}[ \t]*$`, "gm");

/** Blank out fenced code blocks and code spans so their contents are not read as links. */
function withoutCode(markdown) {
  let fence;
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const match = FENCE.exec(line);
      if (fence) {
        if (match && match[1][0] === fence[0] && match[1].length >= fence.length) fence = undefined;
        return "";
      }
      if (match) {
        fence = match[1];
        return "";
      }
      return line.replaceAll(CODE_SPAN, "");
    })
    .join("\n");
}

const unwrap = (target) => (target.startsWith("<") ? target.slice(1, -1) : target);

/**
 * Link targets in a Markdown document, in source order: inline links and images
 * (`[text](target "title")`) and reference definitions (`[label]: target "title"`).
 * Targets are returned as written, including any `#anchor`; code is ignored.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function extractLinks(markdown) {
  const text = withoutCode(markdown);
  return [...text.matchAll(INLINE), ...text.matchAll(DEFINITION)]
    .sort((a, b) => a.index - b.index)
    .map((match) => unwrap(match[1]));
}
