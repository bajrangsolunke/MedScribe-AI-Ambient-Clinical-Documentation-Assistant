from pydantic import BaseModel


class SoapPayload(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str
