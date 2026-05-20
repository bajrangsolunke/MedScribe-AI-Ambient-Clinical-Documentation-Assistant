from pydantic import BaseModel


class SummaryPayload(BaseModel):
    summary: str
