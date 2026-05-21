# MedScribe AI — Demo Recording Script

> **Use this** when recording your demo video. ~60 seconds of natural
> speaking. Produces a clean SOAP note plus two ICD codes that are in
> the seeded catalog (so you'll see both `✓ Verified` badges in the UI).

## Setup (30 seconds before you hit Record)

- Quiet room, laptop mic ~30 cm from your mouth
- Open Chrome / Edge / Brave (not Safari)
- Log in to MedScribe → **New session**
- Patient label: `Patient #1`
- Chief complaint: `chest pain, 2 days`
- Click **Start recording**, wait one beat, then read the script below
- Click **Stop** when finished

---

## The script (read aloud at a natural pace)

> Patient is a 47-year-old male presenting with sharp pain on the left side of his chest, started about two days ago after helping a neighbor move furniture.
>
> The pain is worse when he twists or takes a deep breath. It does not radiate down his arm. No shortness of breath, no nausea, no sweating.
>
> He has no history of heart disease. He took ibuprofen yesterday with some relief.
>
> On examination, vital signs are normal. There is tenderness over the left costochondral junction. Lungs are clear, heart has a regular rate and rhythm. ECG in clinic is unremarkable.
>
> Assessment is likely musculoskeletal chest pain.
>
> Plan: NSAIDs as needed, avoid heavy lifting for one week, and return immediately if pain worsens, becomes pressure-like, radiates, or is associated with shortness of breath or sweating.

## What the video should show

| Beat | What's on screen |
|---|---|
| 0:00 | Dashboard with stats cards |
| 0:05 | Click "New session" → form |
| 0:10 | Click "Start recording" — **dark waveform strip animates with your voice** |
| 0:15 | Live transcript starts appearing in the left panel every ~4 seconds |
| 0:55 | Click **Stop** — pipeline strip animates: ✓ transcribe → SOAP → ICD candidates → Validate → Summary |
| 1:10 | SOAP note appears on the right, ICD codes with `✓ Verified` badges and confidence meters |
| 1:20 | Edit one SOAP field to show it's interactive, accept an ICD code |
| 1:30 | Click **Download PDF** — show the generated note |
| 1:40 | Back to dashboard — show the session with `Completed` badge and new info chips (duration, words, SOAP, ICDs) |

Total video length: **~1:45**. Keep it under 2:30 — recruiters skim.

## Expected outputs

**SOAP note (approximate):**
- **S**: 47y M with sharp L-sided chest pain x 2d after lifting, worse with twisting/deep breath, no radiation/SOB/nausea/diaphoresis. ibuprofen with partial relief.
- **O**: Vitals stable. Tenderness over L costochondral junction. Lungs clear, RRR. ECG unremarkable.
- **A**: Musculoskeletal chest pain.
- **P**: NSAIDs PRN, avoid lifting x 1 wk, return precautions for worsening / pressure / radiation / SOB / diaphoresis.

**ICD-10 candidates (both seeded, both should verify):**
- `R07.89` Other chest pain — high confidence
- `M79.1` Myalgia — medium confidence (possible secondary)

If the AI returns a code that shows `Unverified` in your demo, it means it picked a real ICD-10 code that isn't in the 51-code seeded sample. That's actually a great moment to point out in the video — the catalog-validation feature is **doing its job** flagging the limit.
