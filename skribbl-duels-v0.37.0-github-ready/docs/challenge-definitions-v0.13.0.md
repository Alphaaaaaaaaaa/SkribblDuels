# Challenge definitions v0.13.0

## Time Waste

A foreign public-lobby drawing turn qualifies when the telemetry core confirms that the canvas remained continuously white for at least 60 seconds. Any non-white draw command invalidates the current interval. Canvas clear starts a new interval; drawer departure and round/lobby end cancel it.

## Ultimate Comeback

At `LOBBY_HYDRATED`, the definition captures the local score and every opponent whose score is at least 1250 points higher. The target set is fixed for that lobby-entry opportunity. Later joiners are never added. Departed baseline targets are marked unavailable. Completion requires the local score to become strictly greater than at least one still-present target's current score.
