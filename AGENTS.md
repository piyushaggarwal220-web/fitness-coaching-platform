<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Check-in invariants

1. A mid-week check-in never creates a plan or plan draft. Its summary belongs in coach chat, and the coach completes it by replying in that chat (text, voice, or photo).
2. When a mid-week or weekly check-in becomes due, show a prominent dashboard prompt and enqueue one in-app and web push reminder for that coaching week and check-in type.
