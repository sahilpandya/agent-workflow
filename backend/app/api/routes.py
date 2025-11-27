from fastapi import APIRouter
from app.models.schemas import AgentRequest
from app.services.model_handler import handle_model_request

router = APIRouter()

@router.post("/ask")
async def ask_agent(req: AgentRequest):
    response = await handle_model_request(req)
    return response

@app.get("/workflows")
async def get_workflows():
    workflows = await db.workflows.find().to_list(100)
    return workflows