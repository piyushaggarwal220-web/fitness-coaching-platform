# Jarvis Realtime Voice (Phase 11)

Interface layer only. Business decisions stay in the existing Jarvis orchestrator.

## Enable

```
JARVIS_REALTIME_ENABLED=true
JARVIS_REALTIME_PROVIDER=openai
OPENAI_API_KEY=...
```

`OPENAI_API_KEY` alone does **not** enable voice.

## Local / tests

```
JARVIS_REALTIME_ENABLED=true
JARVIS_REALTIME_PROVIDER=mock
```

```bash
npm run verify:jarvis-realtime
```

## Behavior

1. Hold to Talk captures microphone (permission on user gesture only).
2. Audio is sent to `/api/admin/jarvis/realtime` (multipart) — **not stored**.
3. Server STT (Whisper or mock) → text intent.
4. Same `runJarvisTurn` path as typed chat (tools → risk → approval → action → verify).
5. Optional TTS for spoken replies.
6. **Stop** interrupts speech only — does not cancel running business actions.

## Safety

- No wake word / always-listening
- No raw audio retention
- No live Meta / Instagram publish unlock via voice
- Ambiguous “haan” / “ok” never auto-approves
