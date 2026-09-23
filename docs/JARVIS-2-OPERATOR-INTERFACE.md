# Jarvis 2.0 — Operator Interface

Front door for the completed Phase 1–22 Jarvis architecture. This is a **UI transformation**, not a new brain.

## Visual architecture

- Near-black cinematic shell with restrained glass + amber core glow
- **Hero Jarvis Core** (~260–340px) with layered glow / ring / energy field / particles
- Desktop composition: conversation rail (when active) · **core center** · **contextual right panel** · command bar
- Admin chrome minimized on `/admin/jarvis` (compact navbar + icon sidebar rail)
- Contextual panel swaps by real core state (pulse / operation / approval / creating / error)
- Business Pulse uses 2-column cards or vertical list — no metric overflow
- Attention is dense (severity + title + one line + action)

## Voice status (root cause)

`Voice: DISABLED` / `Voice off` means:

`JARVIS_REALTIME_ENABLED` is **not** set to `true`.

From `src/lib/jarvis/realtime/config.ts`:

- Explicit enable flag required
- `OPENAI_API_KEY` alone does **not** turn voice on
- Text modality stays `AVAILABLE`
- UI must not fake-enable voice

Production should keep the subtle “Voice off” indicator with tooltip explaining the flag.

## Conversation / command

- Home conversation appears when there is message activity
- ⌘/Ctrl+K palette; Escape stops speech only
- Command bar: “Ask Jarvis anything…” with mic (active only when voice ready) + send
- Text chat remains independently usable

## Safety baseline

```
LIVE_META_EXECUTION_ENABLED=false
LIVE_INSTAGRAM_PUBLISHING_ENABLED=false
```

## Known limitations

- No separate EventSource ops bus — live ops = chat SSE + dashboard refresh
- Attachment control is present but disabled until backend upload path is wired in UI
- Visual QA should be re-checked after deploy at 1280 / 1440 / 1920
