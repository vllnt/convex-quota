import { describe, expect, test } from "vitest";

import { extractLinks } from "./markdown-links.mjs";

describe("extractLinks", () => {
  test("returns inline link and image targets, with or without a title", () => {
    const markdown = [
      "See the [API](./docs/API.md) and [changes](./CHANGELOG.md \"Changelog\").",
      "![logo](<./assets/logo file.png>) and [site](https://example.com).",
    ].join("\n");
    expect(extractLinks(markdown)).toEqual([
      "./docs/API.md",
      "./CHANGELOG.md",
      "./assets/logo file.png",
      "https://example.com",
    ]);
  });

  test("returns reference definition targets, with or without a title", () => {
    const markdown = [
      "Read the [api][] and the [log][changes].",
      "",
      "[api]: ./docs/API.md",
      "   [changes]: <./CHANGELOG.md> \"Changelog\"",
      "[readme]: ./README.md 'Readme'",
      "[license]: ./LICENSE (License)",
    ].join("\n");
    expect(extractLinks(markdown)).toEqual(["./docs/API.md", "./CHANGELOG.md", "./README.md", "./LICENSE"]);
  });

  test("keeps anchors on targets and returns anchor-only links", () => {
    const markdown = "[Top](#top), [Window](./docs/API.md#window-kinds)\n\n[ref]: ./README.md#install";
    expect(extractLinks(markdown)).toEqual(["#top", "./docs/API.md#window-kinds", "./README.md#install"]);
  });

  test("returns targets in source order across both forms", () => {
    expect(extractLinks("[a]: ./a.md\n[b](./b.md)\n[c]: ./c.md")).toEqual(["./a.md", "./b.md", "./c.md"]);
  });

  test("ignores code spans, fenced code blocks and footnotes", () => {
    const markdown = [
      "Use `[x](./span.md)` literally.",
      "```md",
      "[fenced](./fenced.md)",
      "[def]: ./fenced-def.md",
      "````",
      "~~~",
      "[tilde](./tilde.md)",
      "~~~",
      "[^note]: A footnote, not a link.",
      "    [indented]: ./indented-code.md",
      "[after](./after.md)",
    ].join("\n");
    expect(extractLinks(markdown)).toEqual(["./after.md"]);
  });

  test("returns nothing for text without links", () => {
    expect(extractLinks("Plain [brackets] and (parens).")).toEqual([]);
  });
});
