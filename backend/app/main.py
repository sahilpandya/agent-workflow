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

DATA_CONNECTOR_URL = "http://data-connector-service:8000/data/query"
DATA_CONNECTOR_API_TOKEN = "VALID_API_TOKEN"  # Configurable per DC


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
    name: str  # Add agent name
    description: str  # Add agent description
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

        # Ensure user_input is always included in the prompt
        user_input = context.get("user_input", "")
        if "{{input}}" not in prompt:
            prompt += f"\nUser Input: {user_input}"
        else: prompt = prompt.replace("{{input}}", user_input)

        if context.get('entities'):
            prompt += f"\nKnown Entities: {context['entities']}"

        print(f"[LOG] Calling {provider} with model {model} and prompt: {prompt}")

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
    # Validate agents to ensure name and description are provided
    for agent in req.agents:
        if not agent.name or not agent.description:
            raise HTTPException(status_code=400, detail="Agent name and description are required.")
    print(f"Creating workflow: {req.dict()}")  # Debugging log
    result = await db.workflows.insert_one(req.dict())
    return {"_id": str(result.inserted_id)}

@router.get("/workflow")
async def list_workflows():
    workflows = await db.workflows.find().to_list(None)
    for wf in workflows:
        wf["_id"] = str(wf["_id"])
    print(f"Listing workflows: {workflows}")  # Debugging log
    return workflows

@router.put("/workflow/{workflow_id}")
async def update_workflow(workflow_id: str, req: WorkflowCreateRequest):
    print(f"Updating workflow {workflow_id} with data: {req.dict()}")  # Debugging log
    result = await db.workflows.update_one(
        {"_id": ObjectId(workflow_id)},
        {"$set": req.dict()}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Workflow not found or no changes made.")
    return {"detail": "Workflow updated successfully"}

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

            # Update context with the output of the current agent
            context["step_outputs"].append({
                "agent": agent["model"],
                "output": output["response"],
                "step_query": agent["query"]
            })
            context["history"].append(output["response"])
            context["user_input"] = output["response"]  # Pass the output as input to the next agent

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


@app.post("/agent/query_with_data")
def agent_query_with_data(request: dict):
    """
    MCP server receives agent request with data query requirements.
    """

    # Agent payload
    agent_input = request.get("agent_input")
    data_query_config = request.get("data_query_config")  # Passed from Agent UI

    # Validate
    if not data_query_config:
        raise HTTPException(status_code=400, detail="Missing data query config")

    # MCP Calls Data Connector Service
    try:
        response = requests.post(
            DATA_CONNECTOR_URL,
            params={"token": DATA_CONNECTOR_API_TOKEN},
            json=data_query_config
        )
        response.raise_for_status()
        data_result = response.json()
    except Exception as e:
        return {"error": f"Failed to fetch data: {str(e)}"}

    # MCP can now enrich agent input with data
    enriched_input = f"{agent_input}\nData:\n{data_result}"

    # Send to agent model (LLM or processing engine)
    result = process_agent_with_data(enriched_input)  # Example function
    return {"agent_output": result}

def process_agent_with_data(enriched_input):
    # Example mock (use your LLM, Ollama, OpenAI, etc.)
    return f"[Agent Reply based on input and data]\n{enriched_input}"

app.include_router(router)
