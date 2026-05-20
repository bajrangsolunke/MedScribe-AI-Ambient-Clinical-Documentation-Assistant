SUMMARY_PROMPT = """Write a 2-3 sentence patient-friendly summary of this clinical
encounter. Plain language, no medical jargon. No identifiers.

Return a JSON object:
{{
  "summary": "..."
}}

Transcript:
{transcript}

SOAP Note:
{soap}
"""
