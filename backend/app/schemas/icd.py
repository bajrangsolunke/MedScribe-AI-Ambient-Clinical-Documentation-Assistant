from pydantic import BaseModel, ConfigDict, Field


class IcdCandidate(BaseModel):
    code: str
    description: str
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = ""


class IcdCandidates(BaseModel):
    codes: list[IcdCandidate] = Field(default_factory=list)


class IcdSuggestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    description: str
    confidence: float
    reasoning: str
    is_validated: bool
    accepted_by_user: bool | None
