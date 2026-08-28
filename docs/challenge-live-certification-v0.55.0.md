# Challenge live certification and balancing telemetry — v0.55.0

## Certification path

The Gateway is the authority for both the accepted telemetry cursor and the
Challenge Engine. After a valid `TELEMETRY_BATCH`, it now awards every new
`completion-pending` result immediately. A separate browser
`CLAIM_CANDIDATE` is retained only as an idempotent compatibility fallback.

This removes the failure mode in which the browser reached completion but the
second Claim command was lost during navigation, reload, reconnect or match
conclusion.

The Hub exposes a compact live pipeline:

- locally observed telemetry events;
- events forwarded into the durable Gateway client;
- last server-acknowledged telemetry sequence;
- queued/in-flight events;
- pending fallback candidates;
- the most recent accepted or rejected certification and its reason.

The operations endpoint exposes the corresponding aggregate counters:

- `skribbl_duels_gateway_telemetry_batches_total{outcome}`;
- `skribbl_duels_gateway_telemetry_events_total{outcome}`;
- `skribbl_duels_gateway_claim_candidates_total{outcome,challenge}`;
- `skribbl_duels_gateway_claim_resolutions_total{challenge,outcome,reason,source}`.

No account ID, Discord ID, message, word or evidence-event ID is used as a
metric label.

## Corrected definitions

| Challenge | Definition | Live-certification requirement |
| --- | --- | --- |
| Bloodline v4 | Complete on the observed homepage `/credits` link click. | Flush the click event immediately before navigation unloads the page. OAuth redirect allow-lists are unrelated. |
| Autodraw detected | Recognize the complete command sequence of a loaded `.skd` file while the player is drawing in a public lobby. | Observe Typo relay events, outgoing draw batches or nested `performDrawCommand` details dispatched on `window`/`document`. |
| Blind/Drunk/Deaf Guess v4 | Effect must already be active before `ROUND_STARTED`, remain active during the guessing turn, and the successful attempt must be First Guesser. | A mid-turn activation, any observed disable/re-enable, own drawing or non-first correct guess is invalid. |
| Deserved? v4 | Reach positive first place, ties included, without being First Guesser since joining the current game. | Keep the full roster across partial result packets and never treat a round score reset as a new game. |
| Sniper v4 | First Guesser on the first attempt in three consecutive eligible drawing turns. | A non-first correct guess, wrong attempt, missed turn or unanswered turn resets the streak; own/interrupted drawing turns are skipped. |

## Live balancing protocol

A definition can become Ranked-eligible only after all of the following are
available:

1. a deterministic client and Gateway replay fixture;
2. a positive runtime test and at least one false-positive regression;
3. accepted-telemetry and accepted-claim metrics in a real two-client Duel;
4. no unknown rejection reason during the certification window;
5. enough observations to estimate completion rate by format without using
   personal metric labels.

Recommended initial certification window: at least 100 eligible challenge
exposures and 20 genuine completions per definition. Until then, balancing
changes stay Casual-only or disabled in the draft manifest.

## TL;DR v2 — implemented in v0.56.0

The existing length-only rule is too easy to satisfy with random characters.
The replacement remains fully offline and deterministic—no AI request and no
token usage.

Qualification:

- at least 50 visible characters and eight lexical tokens;
- Unicode-aware tokenization for all 28 Skribbl language IDs and NFKC/case normalization;
- URLs, mentions, emoji-only tokens and numbers do not count as words;
- at least 90% of lexical tokens must be found in the language dictionary;
- a token of five or more characters may use Damerau–Levenshtein distance 1
  to tolerate a normal typo;
- repeated copies of one word may not exceed 40% of the lexical tokens;
- the client and Gateway must use the same versioned dictionary digest.

The Skribbl prompt lists are not suitable dictionaries for normal prose. TL;DR
v2 therefore ships build-generated Bloom filters for the top 5,000 entries of
each Hermit Dave FrequencyWords language. Its MIT license, source URLs and
per-language build-time digests are committed. Client and Gateway import the
same generated module, with no runtime network or AI dependency.

## Candidate challenges

| Candidate | Deterministic rule | Required telemetry work | Initial eligibility |
| --- | --- | --- | --- |
| Drop Streak | Catch five consecutive spawned Typo drops. | Add versioned `TYPO_DROP_SPAWNED`, `TYPO_DROP_MISSED` and claimed correlation; claimed events alone cannot prove that no drop was missed. | Casual experiment |
| Transcended | Lead every active opponent by at least 2,000 points with a positive score. | v1 definition and deterministic positive/solo-opponent regressions are implemented. v0.55.1 expands the Casual pool with it; Ranked stays disabled until live exposure is certified. v0.56.0 reserves `challenge-icons/transcended.gif` and uses the normal fallback until artwork is supplied. | Casual live certification |
| Ate and left no crumbs | Earn positive points in every fully observed round of one game. | `GAME_STARTING`, every `ROUND_RESULTS_AVAILABLE`, `GAME_ENDED`; define zero/missing score and drawer-left handling. | Casual after fixture |
| GuessingOAT | Be First Guesser in every eligible, fully observed guessing turn of one game. | Full game boundary plus round IDs; own and interrupted drawing turns are skipped. | Casual after fixture |
| Internet Explorer | First Guesser with measured typing speed below 10 WPM. | Add local input-start/duration telemetry and paste/composition flags. | Disabled until WPM adapter is certified |
| WPMaster | Correctly guess ten words at 150+ WPM. | Same WPM telemetry, distinct round IDs and First Guesser policy decision. | Disabled until WPM adapter is certified |
| TypeRacer | Correctly guess one word at 250+ WPM. | Same WPM telemetry and anti-paste evidence. | Disabled until WPM adapter is certified |

WPM should use `characters / 5 / minutes`, measured from the first user edit of
the current non-empty input to submission. Programmatic value changes, paste,
autofill and IME composition must be represented explicitly so the Gateway can
apply one versioned rule rather than trusting a browser-computed WPM value.
