# Release Packaging v0.37.2

## Problem

The v0.37.1 TypeScript sources stored Unicode text correctly, but an installable
userscript downloaded through a charset-ambiguous path could be interpreted as
Windows-1252 instead of UTF-8. That corrupted visible UI text such as the middle
dot and typographic quotation marks into multi-character mojibake sequences.

The repository also intentionally ignored `dist/`, so it did not contain the
complete installable `.user.js` file even though the release source was present.

## Resolution

- The TypeScript sources remain UTF-8 and retain their readable localized text.
- The published userscript encodes every non-ASCII code point as a JavaScript
  Unicode escape. Runtime text is unchanged, while the downloadable file itself
  contains only ASCII bytes and therefore has no charset ambiguity.
- Every inspector build publishes the current complete artifact to:

  ```text
  userscript/skribbl-duels-telemetry-inspector.user.js
  ```

- The stable filename is updated in place for each version, so the repository
  keeps one current installable artifact instead of accumulating duplicate
  1.3 MB release bundles.
- The release check rejects known mojibake markers, non-ASCII output, a mismatched
  metadata version, a missing production Gateway URL, or invalid JavaScript.

The Gateway protocol, Supabase configuration, challenge rules and match behavior
are unchanged in v0.37.2.
