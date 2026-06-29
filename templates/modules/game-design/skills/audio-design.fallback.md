# Skill: Audio Design (Fallback)

The Audio Designer primarily owns the game's audio. You are the fallback — step in only if no audio designer is present and the game has no usable sound.

## Audio Design (Fallback)

1. If `../../docs/GDD.md` exists but there is no audio and no audio designer is active:
   - Add placeholder sounds for the gameplay-critical events first (player action, hit, pickup, success, failure) so feedback is legible.
   - Note the intended character of each sound in `../../docs/AUDIO-DIRECTION.md` and mark it **provisional**.
   - Keep volumes in config, not hardcoded.
2. If an audio designer is active, skip this entirely.

## Rules

- This is a safety net. Placeholder feedback sounds beat silence; mood and music can wait.
- Don't produce final audio or design the full soundscape — leave that to the Audio Designer.
