# MedScribe AI — Demo Scripts

These three scripts are **synthetic** clinical encounters. They contain no
real patient information and are safe to read aloud while recording the
demo video. Each runs about 60–90 seconds.

**How to use them**

1. Click **New session** in the UI.
2. Pick a non-PHI label (e.g., `Patient #1`).
3. Click **Start recording** and read one script aloud at a natural pace.
4. Click **Stop**. The pipeline strip should animate through transcribe →
   SOAP → ICD → validate → summary in roughly 10–20 seconds.
5. Review, edit a SOAP field, accept the ICD code, then **Download PDF**.

If you change any prompt under `backend/app/prompts/`, regenerate the
golden outputs in `golden-outputs/` so you can spot regressions later.

---

## Script 1 — Chest pain (musculoskeletal flavor)

> Patient is a 47-year-old male who comes in reporting sharp pain on the
> left side of his chest, started about two days ago after he helped his
> neighbor move some furniture. He says the pain is worse when he twists
> or takes a deep breath, but it does not radiate down his arm. No
> shortness of breath, no nausea, no sweating. He has no history of heart
> disease and his father is alive at 78. He took ibuprofen yesterday and
> says it helped a little. On exam, vital signs are normal. There is
> tenderness over the left costochondral junction. Lungs clear, heart
> regular rate and rhythm. ECG done in clinic is unremarkable. Likely
> musculoskeletal chest pain. Plan: NSAIDs as needed, avoid lifting for
> one week, return immediately if pain worsens, becomes pressure-like,
> radiates, or is associated with shortness of breath or sweating.

**Expected ICD candidates**: `R07.89` Other chest pain, possibly `M79.1` Myalgia.

---

## Script 2 — Migraine follow-up

> This is a 32-year-old woman returning for follow-up on her migraines.
> Since starting topiramate 25 milligrams nightly three months ago, her
> headache frequency has dropped from about three episodes a week to one
> every two weeks. The headaches are still throbbing on the right side
> with photophobia, but they're much shorter — about an hour instead of
> a day. She has had no significant side effects, just mild tingling in
> her fingers. No new neurological symptoms, no visual changes other
> than her usual aura. She works as a software engineer and her sleep
> has improved. Vitals normal. Neuro exam non-focal. Plan: continue
> topiramate at current dose, follow up in three months, sumatriptan as
> abortive for breakthrough episodes.

**Expected ICD candidates**: `G43.109` Migraine with aura, not intractable, without status migrainosus.

---

## Script 3 — Diabetes check-in

> Patient is a 58-year-old man with type 2 diabetes, here for his
> quarterly visit. His most recent A1c is 7.8, which is up from 7.2 three
> months ago. He admits he hasn't been as careful about his diet over the
> holidays and has been skipping his evening walks since the weather got
> cold. No symptoms of hypoglycemia. No numbness or tingling in his feet.
> He is on metformin 1000 milligrams twice daily and lisinopril 10
> milligrams once daily for blood pressure. Today his BP is 132 over 84,
> weight is up four pounds. Feet exam shows no ulcers, monofilament
> sensation intact. Plan: reinforce diet and exercise counseling, refer
> to diabetes educator, add an additional 5 milligrams of glipizide in
> the morning, recheck A1c in three months. Continue lisinopril.

**Expected ICD candidates**: `E11.65` Type 2 diabetes mellitus with hyperglycemia, `I10` Essential hypertension.

---

## Tips for the demo video

- Use a quiet room; webm/opus on Chromium handles voice well but
  background noise hurts the transcript quality.
- Keep the speaking pace natural — pretend you're documenting in the
  exam room.
- Pause briefly between sentences for cleaner punctuation.
- For the recording, screen-share the workspace; do **not** show your
  real Groq key or any `.env` file contents.
