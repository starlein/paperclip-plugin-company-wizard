## Game Design — Done Bar

**Done:**
- `../../docs/GDD.md` (Game Design Document) exists and covers all required sections: Overview, Core Loop, Game Mechanics, Progression System, Technical Constraints, and Art Direction.
- Tuning parameters are externalized: every balance-critical value (player speed, damage, cooldown, score multipliers) is defined as a named parameter with its default value and valid range documented in the GDD (format: `parameter_name: default (range: min–max)`). No magic numbers hardcoded in engine scripts without a GDD reference.
- A playtest loop is defined: the GDD specifies at minimum one measurable success criterion per core loop iteration (e.g., "average session length > 8 minutes", "level 1 completion rate > 70%").
- Art and audio direction are present: the GDD includes a visual style reference (mood board description or reference images) and an audio/music direction note.

**Not done:**
- Tuning values are hardcoded in source files with no GDD parameter reference.
- The core game loop has no session-level layer (the player has no reason to return after one play session).
- Art or audio direction is absent ("TBD" does not count).
- The GDD exists but is a skeleton with no actual design decisions filled in.
