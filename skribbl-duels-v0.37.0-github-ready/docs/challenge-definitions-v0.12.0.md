# Challenge definitions v0.12.0

## Is ThAT a MoD?

Click one of the eight avatars beneath the homepage logo. A result counts only when the clicked avatar exposes a visible `.special` sprite and its complete visual fingerprint remains unchanged for at least 1000 ms. Further clicks reset the timer.

Telemetry evidence: `LOGO_AVATAR_CLICKED` followed by matching `SPECIAL_AVATAR_FOUND`.

## Bloodline

Click the homepage `/credits` link and allow the credits page to load fully. The click is persisted through the page navigation in `sessionStorage`; a direct URL visit or refresh produces `CREDITS_OPENED` with `linkClickObserved: false` and does not qualify.
