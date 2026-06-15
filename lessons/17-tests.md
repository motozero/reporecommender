# Lesson 17: owning your tests

**What it is.** A unit test suite for the engine's deterministic logic. `npm test` runs 31 tests across
seven areas (repo parsing, ecosystem grouping, non-tool filtering, JSON extraction, rating clamping,
input classification, HTML to text) in about 60 milliseconds, with no Anthropic or GitHub calls.

**The dividing line that matters.** This engine is two things bolted together: deterministic plumbing
and model judgment. Each needs a different kind of test, and using the wrong one is the classic mistake.

- **Plumbing is unit-tested here.** `parseRepo("github.com/honojs/hono/tree/main")` must always return
  `honojs/hono`. `clamp(6)` must always return 5. `ecosystemLanguages("TypeScript")` must always include
  JavaScript. These have one right answer, so a unit test asserts equality and fails loudly on
  regression.
- **Judgment is eval-tested, not unit-tested.** "Are these good recommendations?" has no single right
  answer and changes run to run. That is what the eval harness measures (see
  [lesson 18](./18-evals.md)). Writing an `assert.equal` on a model's ranking would be flaky and
  meaningless.

`ecosystemLanguages` is the clean illustration: the *function* is unit-tested (TypeScript and
JavaScript share an ecosystem, Python stands alone), while whether the resulting recommendations
actually help is left to the eval. Same feature, two tools, picked by whether the answer is exact or
graded.

**Know your tests better than Claude.** Claude can generate a hundred tests in a minute. That is the
trap. A test you do not understand is worse than no test, because a green suite that asserts nothing
real is false confidence. So every test here encodes a product invariant I can say out loud:

- Ratings are integers 1 to 5, always, even when the model returns `"high"` or `null` (`clamp` defaults
  to a neutral 3 rather than rendering `NaN` on a card).
- A pasted deep link (a file, a PR, an anchor) still resolves to the repo (`parseRepo` stops at `/`,
  `?`, `#`).
- A model that ignores "JSON only" and wraps its answer in prose or fences still parses (`extractJson`).
- TypeScript and JavaScript are one ecosystem, so the leak fix cannot silently exclude half of it. This
  test directly guards the change from lesson 18.

I wrote the cases and the reasons; Claude is welcome to help fill in the assertions. The ownership of
"what must be true" stays with me.

**How it runs.** `tests/engine.test.ts` uses the built-in `node:test` runner and `node:assert`, no
framework. Node 25 runs TypeScript directly, but the engine's imports are extensionless, so `npm test`
bundles the test with esbuild first (the same one-line reason the eval runner does), then runs
`node --test`. The pure helpers are exported from `engine.ts` purely so they can be tested in isolation.

**Why this is worth it.** The plumbing is exactly the code that breaks quietly. A model ranking that
gets slightly worse is visible in the eval scorecard. A `parseRepo` that suddenly drops the `.git`
suffix, or a `clamp` that lets a 7 through, fails silently in a corner until a user hits it. Sixty
milliseconds of deterministic tests is the cheapest insurance in the project, and it pairs with the
eval harness to cover both halves of the system: exact where the answer is exact, graded where it is
graded.

**Gotchas.**

- Do not unit-test the model. If an assertion can flake when the model rewords an answer, it belongs in
  the eval harness, not here.
- Test behaviour and invariants, not implementation. The tests check what `parseRepo` returns, not which
  regex it uses, so a refactor that keeps the contract keeps the tests green.
- A passing suite proves nothing if the cases are trivial. The value is in the edge cases (deep links,
  prose-wrapped JSON, the JS/TS split), which is exactly the part Claude cannot judge the importance of
  for you.
