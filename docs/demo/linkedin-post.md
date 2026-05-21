# LinkedIn Post

> Two variants. Pick whichever feels more like you — the second is
> more story-driven, the first is more "shipped & specs". Strip / add
> hashtags as fits your network.

---

## Variant A — "Shipped this"

🩺 Just shipped **MedScribe AI** — an ambient clinical documentation app I built end-to-end.

A doctor talks. The transcript appears in the browser within ~4 seconds. They click Stop. A SOAP note, ICD-10 codes (validated against the official CMS catalog so the AI can't invent codes), and a patient summary populate in another ~10 seconds. PDF download. Done.

What I learned building it:

🎙 Real-time AI is mostly engineering — chunked audio over HTTP, Server-Sent Events for transcript fragments, a clean state machine for the recording → finalising → completed flow
🧠 Structured generation with LLMs is unreliable without guardrails — every ICD-10 code the model suggests gets looked up in a local catalog; unknowns are kept but flagged
🔐 OAuth 2.0 + email/password fallback with account-linking on email match — Google ID tokens verified server-side
🧪 36 backend tests, all with mocked Groq so CI never hits the real API
📦 SQLite + SQLAlchemy + Alembic — boring tech that just works

Stack: React 19 · TypeScript · Vite · Tailwind v4 · FastAPI · SQLAlchemy 2 · Groq (Whisper + Llama 3.3 70B) · SSE · google-auth · ReportLab

This is a portfolio prototype, not a clinical product — real adoption would need HIPAA-grade infra, EHR integration, and clinical validation. But it was a great way to exercise the full stack of building real-world AI: speech, streaming, structured extraction, orchestration, and a UX clinicians could actually use.

▶ Demo video: REPLACE_WITH_DEMO_VIDEO_URL
💻 Code: REPLACE_WITH_GITHUB_URL

Would love feedback from anyone working on healthcare AI or ambient scribes — what would you build next?

#AI #GenAI #FullStack #FastAPI #React #TypeScript #HealthcareAI #BuildingInPublic #PortfolioProject

---

## Variant B — "The problem" hook

Clinicians spend **1–2 hours every day** typing SOAP notes after patient visits. It's the #1 driver of physician burnout.

For the last few weekends I've been building a working prototype that tries to compress that time: **MedScribe AI**.

The flow:
→ Doctor records the consultation in the browser
→ Audio streams in 4-second chunks to my FastAPI backend
→ Groq Whisper transcribes each chunk; transcript appears live via Server-Sent Events
→ On Stop, Llama 3.3 70B generates a SOAP note and ICD-10 codes
→ Every suggested ICD code is **validated against the real CMS catalog** — hallucinated codes get flagged, not silently passed through
→ Doctor reviews, edits, accepts, downloads PDF

Engineering things I'm proud of:
✅ Live audio waveform driven by the actual mic stream (Web Audio API)
✅ Catalog-validated structured generation — the "AI doesn't lie" story is visible in the UI
✅ Stop-restart MediaRecorder for live chunks without WebSockets
✅ OAuth 2.0 (Google) alongside JWT/bcrypt email-password, account-linking on email
✅ Sub-project decomposition: brainstorm → spec → plan → ship, committed to git as I went

It's a portfolio piece — not a real clinical product (HIPAA, EHR integration, and clinical validation are out of scope). But it was a chance to build the full stack of modern AI engineering: speech recognition, real-time streaming, structured extraction with guardrails, and a UX that doesn't feel like a science project.

Built with: React + TypeScript + Vite + Tailwind + FastAPI + SQLAlchemy + Groq + SSE + ReportLab.

▶ Demo: REPLACE_WITH_DEMO_VIDEO_URL
💻 GitHub: REPLACE_WITH_GITHUB_URL

Open to feedback — what would you add to make this more clinically useful?

#GenAI #HealthcareAI #FullStack #FastAPI #React #SoftwareEngineering #BuildingInPublic

---

## Tips for actually posting this

- LinkedIn favours posts with **line breaks** (which this has). Don't paste it as one block.
- The first 2 lines are what shows above the "see more" fold — keep the hook tight.
- Post **with the video uploaded directly to LinkedIn** (native video) rather than a YouTube link — LinkedIn's algorithm strongly favours native uploads.
- If you have a Loom video, you can also screen-grab a short MP4 and upload that as the LinkedIn post media.
- Best time to post: **Tuesday – Thursday, 8–10 AM** in your timezone.
- Tag the relevant people / companies: Anthropic, Groq, anyone who reviewed your code.
- After posting, comment on it within an hour to boost reach — share one specific thing you learned that didn't fit in the post.
