from pydantic import BaseModel


class ChunkUploadResponse(BaseModel):
    sequence: int
    text: str
    transcript_so_far: str
