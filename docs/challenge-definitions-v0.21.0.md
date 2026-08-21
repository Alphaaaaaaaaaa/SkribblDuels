# Challenge definitions v0.21.0

## Ultimate Comeback v2

The join snapshot is bound to one non-null gameSessionId. At least one opponent must lead the local player by 1250 points at hydration. Completion occurs only on a local SCORE_CHANGED event where the local player becomes strict first place by overtaking the current leader, and that leader belongs to the eligible join-baseline set. GAME_ENDED, a changed gameSessionId, or any score decrease invalidates the baseline.

## Mogged v1

For one freshly observed public drawing turn, collect visible CHAT_MESSAGE_RECEIVED attempts by distinct non-self, non-drawer players. A player qualifies when at least one submitted message exactly matches the normalized official word list for the lobby language. The local CORRECT_GUESS completes at five distinct qualified players.
