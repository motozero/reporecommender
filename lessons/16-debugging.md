# Lesson 16: debugging

**What it is.** Systematic debugging beats guessing. Instrument, observe, form one hypothesis, fix the
root cause, verify, then remove the scaffolding. For harder bugs, `/investigate` runs this loop with
persistent state.

**How we used it here.** The first live recommendation returned an empty list. The symptom had several
possible causes: a failed Anthropic call, a JSON parse error, or a bad GitHub search. Rather than
guess, we added two targeted logs (the generated search query, and the candidate count), re-ran the
request, and read the dev-server output:

```
[engine] searchQuery: "language:python background jobs task queue celery rq apscheduler stars:>100"
[engine] candidates: 0 []
```

Root cause, in one line of evidence: GitHub search ANDs every word, so requiring a repo to match all
of "background jobs task queue celery rq apscheduler" returned nothing.

**Why this approach.** The log isolated the failure to the search step immediately. Guessing might
have sent us editing the prompt, the parser, or the API client first. One good observation beat three
speculative fixes.

**Result.** We fixed the cause, not the symptom: gather candidates from several short canonical queries
and rank them by stars, plus an instruction to keep each query short. Re-tested, and celery,
fastapi-celery, and flower surfaced. Then we removed the debug logs before committing.

**How to use it.**

1. Reproduce reliably.
2. Add one targeted log or assertion where the truth would show.
3. Read it. Let the evidence pick the hypothesis.
4. Fix the root cause.
5. Verify with the original repro.
6. Remove the scaffolding.

**Gotchas.**

- Do not fix symptoms. Empty results was the symptom, the over-specified query was the cause.
- Do not leave debug logging in committed code. The fix ships, the scaffolding does not.
- When the cause is not obvious after one or two logs, escalate to `/investigate` instead of piling on
  more guesses.
