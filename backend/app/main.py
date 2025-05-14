from fastapi import FastAPI, APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from bson import ObjectId
from fastapi.logger import logger

# Load environment variables
load_dotenv()
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")

# Initialize FastAPI
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MongoDB
client = AsyncIOMotorClient(MONGO_URL)
db = client.workflowDB

# ---------------------- Schemas ----------------------
class AgentConfig(BaseModel):
    provider: str
    model: str
    query: str
    mode: str
    additional_info: Optional[dict] = {}

class WorkflowCreateRequest(BaseModel):
    name: str
    agents: List[AgentConfig]

class ResumeWorkflowRequest(BaseModel):
    step_index: int
    user_input: Optional[str] = ""

class WorkflowContextRequest(BaseModel):
    user_input: Optional[str] = ""

# ---------------------- Unified Model Call ----------------------
async def call_model(agent: AgentConfig, context: dict = None):
    import openai
    import httpx
    import requests
    import os
    import json

    try:
        provider = agent.provider.lower()
        model = agent.model
        prompt = agent.query

        if context:
            user_input = context.get("user_input") or ""
            prompt = prompt.replace("{{input}}", user_input)
            if context.get('entities'):
                prompt += f"\nKnown Entities: {context['entities']}"

        # ----------- OPENAI -----------
        if provider == "openai":
            openai.api_key = agent.additional_info.get("api_key") or os.getenv("OPENAI_API_KEY")
            try:
                response = openai.ChatCompletion.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}]
                )
                result = response["choices"][0]["message"]["content"]
            except Exception as e:
                return {"status": "error", "response": f"Error calling OpenAI: {str(e)}"}

        # ----------- HUGGINGFACE -----------
        elif provider == "huggingface":
            try:
                response = requests.post(
                    f"https://api-inference.huggingface.co/models/{model}",
                    headers={"Authorization": f"Bearer {os.getenv('HUGGINGFACE_API_KEY')}"},
                    json={"inputs": prompt}
                )
                data = response.json()
                result = data.get("generated_text") or data.get("choices", [{}])[0].get("text", str(data))
            except Exception as e:
                return {"status": "error", "response": f"Error calling HuggingFace: {str(e)}"}

        # ----------- LOCAL -----------
        elif provider == "local":
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post("http://localhost:11434/api/generate", json={
                        "model": model.lower(),
                        "prompt": prompt,
                        "stream": True
                    })
                    response.raise_for_status()
                    result = ""
                    async for line in response.aiter_lines():
                        if line:
                            try:
                                json_line = json.loads(line)
                                result += json_line.get("response", "")
                            except json.JSONDecodeError:
                                continue
            except Exception as e:
                return {"status": "error", "response": f"Error calling local model: {str(e)}"}

        else:
            return {"status": "error", "response": f"Unsupported provider: {provider}"}

        # ----------- Check for user input marker -----------
        if "[USER_INPUT_REQUEST]" in result:
            return {
                "status": "need_user_input",
                "response": result.split("[USER_INPUT_REQUEST]")[-1].strip(),
                "prompt": result
            }

        return {"status": "success", "response": result.strip()}

    except Exception as e:
        return {"status": "error", "response": f"Unhandled error in call_model: {str(e)}"}

# ---------------------- Routes ----------------------
router = APIRouter()

@router.post("/workflow")
async def create_workflow(req: WorkflowCreateRequest):
    result = await db.workflows.insert_one(req.dict())
    return {"_id": str(result.inserted_id)}

@router.get("/workflow")
async def list_workflows():
    workflows = await db.workflows.find().to_list(None)
    for wf in workflows:
        wf["_id"] = str(wf["_id"])
    return workflows

@router.post("/workflow/{workflow_id}/run")
async def run_workflow(workflow_id: str):
    workflow = await db.workflows.find_one({"_id": ObjectId(workflow_id)})
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    input_data = ""
    execution_trace = []

    for idx, agent in enumerate(workflow.get("agents", [])):
        prompt = agent["query"].replace("{{input}}", input_data)
        agent_config = AgentConfig(**{**agent, "query": prompt})
        output = await call_model(agent_config)

        execution_trace.append({
            "step": idx + 1,
            "provider": agent["provider"],
            "model": agent["model"],
            "query": prompt,
            "status": output["status"],
            "response": output["response"]
        })

        if output["status"] == "need_user_input":
            return {
                "status": "need_user_input",
                "step": idx,
                "prompt": output["response"],
                "trace": execution_trace
            }

        input_data = output["response"]

    return {
        "status": "success",
        "final_output": input_data,
        "trace": execution_trace
    }

@router.post("/workflow/{workflow_id}/resume")
async def resume_workflow(workflow_id: str, req: ResumeWorkflowRequest):
    try:
        workflow = await db.workflows.find_one({"_id": ObjectId(workflow_id)})
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        context = {
            "user_input": req.user_input,
            "step_outputs": [],
            "entities": {},
            "intent": None,
            "meta": {},
            "history": []
        }

        agents = workflow.get("agents", [])
        for idx in range(req.step_index, len(agents)):
            agent = agents[idx]
            agent_config = AgentConfig(**agent)
            output = await call_model(agent_config, context)

            context["step_outputs"].append({
                "agent": agent["model"],
                "output": output["response"],
                "step_query": agent["query"]
            })
            context["history"].append(output["response"])

            if output["status"] == "need_user_input":
                return {
                    "status": "need_user_input",
                    "step": idx,
                    "prompt": output["response"],
                    "context": context
                }

        return {
            "status": "success",
            "context": context,
            "final_output": context["step_outputs"][-1] if context["step_outputs"] else None
        }

    except Exception as e:
        logger.exception(f"Unhandled error in resume_workflow")
        raise HTTPException(status_code=500, detail=f"Unhandled error: {str(e)}")

@router.post("/workflow/{workflow_id}/run_contextual")
async def run_workflow_contextual(workflow_id: str, req: WorkflowContextRequest):
    try:
        user_input = req.user_input or ""
        workflow = await db.workflows.find_one({"_id": ObjectId(workflow_id)})
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        context = {
            "user_input": user_input,
            "step_outputs": [],
            "entities": {},
            "intent": None,
            "meta": {},
            "history": []
        }

        for idx, agent in enumerate(workflow["agents"]):
            agent_config = AgentConfig(**agent)
            output = await call_model(agent_config, context)

            context.setdefault("step_outputs", []).append({
                "agent": agent["model"],
                "output": output["response"],
                "step_query": agent["query"]
            })
            context.setdefault("history", []).append(output["response"])

            if output["status"] == "need_user_input":
                return {
                    "status": "need_user_input",
                    "step": idx,
                    "prompt": output["response"],
                    "context": context
                }

        return {
            "status": "success",
            "context": context,
            "final_output": context["step_outputs"][-1] if context["step_outputs"] else None
        }

    except Exception as e:
        logger.exception(f"Unhandled error in run_workflow_contextual")
        raise HTTPException(status_code=500, detail=f"Unhandled error: {str(e)}")

@router.get("/workflow/{workflow_id}")
async def get_workflow(workflow_id: str):
    workflow = await db.workflows.find_one({"_id": ObjectId(workflow_id)})
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    workflow["_id"] = str(workflow["_id"])
    return workflow

@router.delete("/workflow/{workflow_id}")
async def delete_workflow(workflow_id: str):
    result = await db.workflows.delete_one({"_id": ObjectId(workflow_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"detail": "Workflow deleted successfully"}

@app.get("/")
async def root():
    return {"message": "Welcome to the Contextual Workflow API!"}

@app.get("/health")
async def health_check():
    try:
        client.admin.command('ping')
        return {"status": "healthy"}
    except Exception:
        raise HTTPException(status_code=500, detail="Database connection failed")

app.include_router(router)
