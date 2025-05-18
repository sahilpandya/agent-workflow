from pydantic import BaseModel
from typing import List, Optional

class AgentConfig(BaseModel):
    model: str
    query: str
    additional_info: Optional[dict] = {}
    name: str
    description: str
    provider: str
    mode: str

class AgentRequest(BaseModel):
    agents: List[AgentConfig]  # for workflows
