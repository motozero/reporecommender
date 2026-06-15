// Unit tests for the engine's deterministic logic. These run offline, with no
// Anthropic or GitHub calls: the LLM ranking is what the eval harness measures
// (see lessons/18-evals.md), and a unit test cannot assert on a model's output.
// What a unit test is good for is the boring, exact, easy-to-break plumbing:
// parsing, classification, clamping, JSON extraction. Get these wrong and the
// product fails in ways no eval would flag clearly.
//
// Run: npm test

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRepo } from "../src/github.ts";
import { extractJson } from "../src/claude.ts";
import { looksLikeUrl, normalizeUrl, htmlToText, clamp, ecosystemLanguages, looksLikeNonTool } from "../src/engine.ts";

describe("parseRepo", () => {
  it("parses a full GitHub URL", () => {
    assert.deepEqual(parseRepo("https://github.com/honojs/hono"), { owner: "honojs", repo: "hono" });
  });

  it("ignores trailing path, query, and fragment", () => {
    // A user pasting a deep link (a file, a PR, an anchor) should still resolve
    // to the repo. The repo segment must stop at /, ?, or #.
    for (const url of [
      "https://github.com/honojs/hono/tree/main/src",
      "https://github.com/honojs/hono?tab=readme-ov-file",
      "https://github.com/honojs/hono#installation",
      "https://github.com/honojs/hono/",
    ]) {
      assert.deepEqual(parseRepo(url), { owner: "honojs", repo: "hono" }, url);
    }
  });

  it("strips a .git suffix from both URL and shorthand forms", () => {
    assert.deepEqual(parseRepo("https://github.com/honojs/hono.git"), { owner: "honojs", repo: "hono" });
    assert.deepEqual(parseRepo("honojs/hono.git"), { owner: "honojs", repo: "hono" });
  });

  it("accepts bare owner/repo shorthand", () => {
    assert.deepEqual(parseRepo("honojs/hono"), { owner: "honojs", repo: "hono" });
  });

  it("trims surrounding whitespace", () => {
    assert.deepEqual(parseRepo("  honojs/hono  "), { owner: "honojs", repo: "hono" });
  });

  it("preserves owner/repo casing (GitHub is case-insensitive but we do not mangle input)", () => {
    assert.deepEqual(parseRepo("github.com/Microsoft/TypeScript"), { owner: "Microsoft", repo: "TypeScript" });
  });

  it("returns null for things that are not a repo", () => {
    for (const bad of ["fastapi", "", "   ", "https://gitlab.com/owner/repo", "owner/repo/extra"]) {
      assert.equal(parseRepo(bad), null, JSON.stringify(bad));
    }
  });
});

describe("ecosystemLanguages", () => {
  // This backs the ecosystem-leak fix (a TypeScript app cannot npm install a Rust
  // crate). The most important property: TypeScript and JavaScript share one
  // ecosystem, so a fix that searches only one tag must not exclude the other.
  it("groups TypeScript and JavaScript together, both directions", () => {
    for (const lang of ["TypeScript", "JavaScript"]) {
      const set = ecosystemLanguages(lang);
      assert.ok(set, lang);
      assert.equal(set!.size, 2);
      assert.ok(set!.has("typescript") && set!.has("javascript"), lang);
    }
  });

  it("is case-insensitive", () => {
    assert.deepEqual([...ecosystemLanguages("PYTHON")!], ["python"]);
  });

  it("treats single-language ecosystems as a singleton set", () => {
    for (const [lang, expected] of [["Python", "python"], ["Go", "go"], ["Rust", "rust"]] as const) {
      assert.deepEqual([...ecosystemLanguages(lang)!], [expected]);
    }
  });

  it("falls back to the language itself for an unknown language", () => {
    // An unmapped language still constrains to itself, never to everything.
    assert.deepEqual([...ecosystemLanguages("Haskell")!], ["haskell"]);
  });

  it("returns null for an unknown source (no constraint)", () => {
    // null means "do not filter", which is correct for a website with no language.
    assert.equal(ecosystemLanguages(null), null);
    assert.equal(ecosystemLanguages(undefined), null);
    assert.equal(ecosystemLanguages(""), null);
  });
});

describe("looksLikeNonTool", () => {
  // Guards the canonical-ranking fix: star-sorted search floats learning material
  // and lists to the top (an interview-questions repo can outrank a real tool), so
  // we drop them before ranking. Must catch the junk without flagging real tools.
  it("flags learning material and curated lists", () => {
    const junk = [
      { fullName: "h5bp/Front-end-Developer-Interview-Questions", description: "A list of helpful questions" },
      { fullName: "sindresorhus/awesome", description: "Awesome lists about all kinds of topics" },
      { fullName: "goldbergyoni/javascript-testing-best-practices", description: "best practices" },
      { fullName: "SimulatedGREG/electron-vue", description: "An Electron and Vue.js quick start boilerplate" },
      { fullName: "someone/react-tutorial", description: "Learn React step by step" },
      { fullName: "user/python-cheatsheet", description: "Comprehensive Python cheatsheet" },
    ];
    for (const r of junk) assert.equal(looksLikeNonTool(r), true, r.fullName);
  });

  it("does not flag real tools", () => {
    // High-precision matters: a false positive silently drops a correct answer.
    const tools = [
      { fullName: "celery/celery", description: "Distributed Task Queue" },
      { fullName: "microsoft/playwright", description: "A framework for Web Testing and Automation" },
      { fullName: "sqlalchemy/sqlalchemy", description: "The Database Toolkit for Python" },
      { fullName: "pmndrs/zustand", description: "Bear necessities for state management in React" },
      { fullName: "huggingface/transformers", description: "State-of-the-art Machine Learning library" },
    ];
    for (const r of tools) assert.equal(looksLikeNonTool(r), false, r.fullName);
  });

  it("tolerates a missing description", () => {
    assert.equal(looksLikeNonTool({ fullName: "owner/some-tool" }), false);
    assert.equal(looksLikeNonTool({ fullName: "owner/awesome-go", description: null }), true);
  });
});

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  });

  it("unwraps a ```json fenced block", () => {
    assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  });

  it("unwraps an unlabelled fence", () => {
    assert.deepEqual(extractJson('```\n{"a":1}\n```'), { a: 1 });
  });

  it("tolerates prose around the JSON", () => {
    // Models sometimes ignore "JSON only". We should still recover the payload.
    assert.deepEqual(extractJson('Sure, here you go: {"a":1} hope that helps'), { a: 1 });
  });

  it("handles nested objects and arrays of objects", () => {
    assert.deepEqual(extractJson('{"a":{"b":2}}'), { a: { b: 2 } });
    assert.deepEqual(extractJson('[{"a":1},{"b":2}]'), [{ a: 1 }, { b: 2 }]);
  });

  it("throws when there is no JSON to find", () => {
    assert.throws(() => extractJson("no json here"), /no JSON found/);
  });
});

describe("clamp (ratings are integers 1..5)", () => {
  it("passes through in-range integers", () => {
    assert.equal(clamp(1), 1);
    assert.equal(clamp(5), 5);
  });

  it("bounds out-of-range values", () => {
    assert.equal(clamp(0), 1);
    assert.equal(clamp(-3), 1);
    assert.equal(clamp(6), 5);
    assert.equal(clamp(99), 5);
  });

  it("rounds fractional values to the nearest integer", () => {
    assert.equal(clamp(3.4), 3);
    assert.equal(clamp(3.6), 4);
  });

  it("defaults a non-number or NaN to the neutral 3", () => {
    // A model returning "high" or null for a rating must not produce NaN on a card.
    assert.equal(clamp(NaN), 3);
    assert.equal(clamp("high" as unknown as number), 3);
    assert.equal(clamp(undefined as unknown as number), 3);
  });
});

describe("looksLikeUrl / normalizeUrl (input classification)", () => {
  it("recognises URLs and bare domains", () => {
    for (const s of ["https://svelte.dev", "http://example.com", "svelte.dev", "example.com/path", "sub.domain.co.uk"]) {
      assert.equal(looksLikeUrl(s), true, s);
    }
  });

  it("does not mistake a repo shorthand or a plain word for a URL", () => {
    // "honojs/hono" must route to the repo path, not the website path.
    for (const s of ["honojs/hono", "fastapi", "FastAPI", "just words"]) {
      assert.equal(looksLikeUrl(s), false, s);
    }
  });

  it("adds https:// only when missing", () => {
    assert.equal(normalizeUrl("svelte.dev"), "https://svelte.dev");
    assert.equal(normalizeUrl("http://x.com"), "http://x.com");
    assert.equal(normalizeUrl("  svelte.dev  "), "https://svelte.dev");
  });
});

describe("htmlToText", () => {
  it("strips tags and keeps text", () => {
    assert.equal(htmlToText("<p>Hello <b>world</b></p>"), "Hello world");
  });

  it("drops script and style contents entirely", () => {
    // Otherwise JS/CSS source leaks into the text we send to the model.
    assert.equal(htmlToText("<script>alert(1)</script>Hi"), "Hi");
    assert.equal(htmlToText("<style>.a{color:red}</style>Text"), "Text");
  });

  it("decodes the common entities and collapses whitespace", () => {
    assert.equal(htmlToText("a&nbsp;&amp;&nbsp;b"), "a & b");
    assert.equal(htmlToText("&lt;tag&gt;"), "<tag>");
    assert.equal(htmlToText("a\n\n   b"), "a b");
  });
});
