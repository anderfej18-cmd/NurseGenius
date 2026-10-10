# ADR-0003: Where the intelligence engines have seams, and where they do not

## Status

Accepted

## Date

2026-10-06

## Decision Drivers

- The product owner requires `ReviewScheduler` and `RecommendationStrategy` to be replaceable (a later AI strategy must plug in without rewriting the system), and AI is out of scope now.
- The Dev skills say a seam with one implementation is hypothetical ("one adapter means a hypothetical seam, two means a real one") and to avoid named ports by default.
- Project instructions and the user's explicit requirements outrank the skill's default.

## Considered Options

1. Interfaces for every engine.
2. Interfaces only where replacement is a stated requirement; everything else is a concrete class or a pure function.
3. No interfaces; replace code when needed.

## Decision Outcome

**Chosen option**: 2.

| Module | Seam | Reason |
|---|---|---|
| `ReviewScheduler` | interface, `Sm2ReviewScheduler` is the only implementation | explicit requirement; the algorithm is expected to change |
| `RecommendationStrategy` | interface, `DeterministicRecommendationStrategy` is the only implementation | explicit requirement; the AI seam |
| Mastery, confidence, time analytics, adaptive scoring, similar-question ranking, readiness | none: pure functions/classes taking a typed config | tuned by configuration, not replaced |
| Services that need data | a narrow dependency type declared next to the consumer; tests pass plain fakes, or run on PGlite where SQL matters | concrete dependencies by default |

There is no `FakeAIRecommendationStrategy`: the interface is the seam, nothing more.

### Positive Consequences

- The two required extension points exist and are tested through their interfaces.
- No other speculative abstraction is added.

### Negative Consequences

- Two interfaces have a single production implementation until AI or a second algorithm arrives.

## Validation

- Tests exercise the strategy and scheduler through their interfaces, including a second test-only implementation to prove substitution.
- Revisit if a second real implementation is added (promote the seam to a documented port) or if neither interface gains one within two releases (collapse it).

## Update, 2026-10-09

AI is no longer out of scope, but it did not become a `RecommendationStrategy`. ADR-0011 puts AI in a separate seam (`InsightNarrator`) that phrases what the deterministic engines measured, so `DeterministicRecommendationStrategy` stays the only implementation and the test that enforces it still holds.
