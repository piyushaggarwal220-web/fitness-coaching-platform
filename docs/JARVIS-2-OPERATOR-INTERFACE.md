# Jarvis 2.0 — Operator Interface

Front door for the completed Phase 1–22 Jarvis architecture. This is a **UI transformation**, not a new brain.

## Visual architecture

- Near-black cinematic shell with subtle glass panels (`styles.ts` `j2` tokens)
- Amber/orange accent (`#FF6200`) with restrained cyan status cues
- Central **Jarvis Core** orb reflects real operator state (IDLE → LISTENING → THINKING → … → WAITING_FOR_APPROVAL → RENDERING → ERROR / PAUSED)
- No fake percentage progress; render waits say “Waiting for render provider”

## Voice architecture

- Reuses Phase 11 `/api/admin/jarvis/realtime` + `VoiceOperatorPanel`
- Push-to-talk only (no wake word, no always-on mic)
- Space/hold via mic control; **Escape** stops speech only (`jarvis:interrupt-speech`)
- Voice never auto-approves; approvals remain explicit Phase 12 cards

## Conversation

- Home conversation surface: `JarvisConversation` on `CockpitHome`
- Full chat view remains available for deep work
- Chat SSE (`POST /api/admin/jarvis/chat?stream`) remains the live operation channel
- Timeline steps use operator activity language (`humanToolLabel`); raw tool ids under “Technical details”

## Operation timeline

- Driven by real SSE `status` / `tool_start` / `tool_result` events
- `JarvisOperationTimeline` + optional `JarvisOperationCard`

## Video / ads / content / publishing

- Quick actions and ⌘K palette send natural-language prompts into the existing orchestrator
- Video result card + creative gallery render when dashboard exposes ready jobs/creatives
- Publishing UI states **PUBLISHING DISABLED** while `LIVE_INSTAGRAM_PUBLISHING_ENABLED=false`
- Live Meta creatives stay review-only while `LIVE_META_EXECUTION_ENABLED=false`

## Approval flow

- `JarvisApprovalCard` wraps existing `ApprovalCardView`
- Decide via `POST /api/admin/jarvis/approvals`
- Phase 12 policy / kill switch / dry-run / shadow unchanged

## Cost + systems

- `JarvisCostStatus` from dashboard cost fields
- Budget exhaustion → core state **PAUSED** (“Daily AI budget reached”)
- `JarvisSystemStatus` shows READ ONLY for Meta/IG when live flags are off

## Command palette

- Ctrl/⌘ K opens `JarvisCommandPalette`
- Prompts route through existing chat orchestrator; nav jumps to specialized workspaces

## Security

- Admin auth unchanged
- No provider keys in the browser
- Voice and text share the same authorization path
- Verify: `npm run verify:jarvis-operator-ui`

## Known limitations

- No separate EventSource ops bus yet — live ops = chat SSE + dashboard refresh
- Attachment upload UI is not expanded beyond existing backend-supported paths
- Specialized pages (`/admin/ai-marketing`, domain views) remain for deep work
- Visual QA on real devices should confirm reduced-motion and mobile touch targets

## Safety baseline

```
LIVE_META_EXECUTION_ENABLED=false
LIVE_INSTAGRAM_PUBLISHING_ENABLED=false
```
