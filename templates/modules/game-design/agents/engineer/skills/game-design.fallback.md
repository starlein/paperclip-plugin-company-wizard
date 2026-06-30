# Skill: Game Design (Engineer Fallback)

The Game Designer primarily owns the game design. You are the engineering fallback: define enough structure for implementation to move without pretending the design is final.

## Game Design (Fallback)

1. If no `../../docs/GDD.md` exists and no Game Designer is active:
   - Write a minimal Game Design Document covering concept, core mechanic, game loop, platform, controls, and technical constraints.
   - Identify implementation risks: physics, input, asset pipeline, save state, performance, and browser/device support.
   - Mark open design questions explicitly so a Game Designer or CEO can resolve them later.
2. If a Game Designer is active, do not overwrite their design direction. Add implementation notes or feasibility concerns as comments/issues.

## Rules

- This is a safety net. Keep the GDD implementable and provisional.
- Do not over-spec detailed balance, progression, or narrative unless required to unblock engineering.
- Convert unclear design risks into small prototype or research issues.
