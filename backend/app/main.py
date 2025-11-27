from fastapi import FastAPI, APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from bson import ObjectId

# Initialize FastAPI
app = FastAPI()

# Load environment variables
load_dotenv()
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")

# Initialize MongoDB
client = AsyncIOMotorClient(MONGO_URL)
db = client.workflowDB

# Allow all origins (for development); restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define schemas
class AgentConfig(BaseModel):
    provider: str  # LLM provider (e.g., OpenAI, HuggingFace, Local)
    model: str  # LLM model (e.g., GPT-4, BERT, etc.)
    query: str
    mode: str  # "local" or "api"
    additional_info: Optional[dict] = {}

class AgentRequest(BaseModel):
    agents: List[AgentConfig]

class WorkflowCreateRequest(BaseModel):
    name: str
    agents: List[AgentConfig]

class ResumeWorkflowRequest(BaseModel):
    step_index: int
    user_input: str

# Model execution functions
async def call_openai_model(model: str, prompt: str, credentials: dict):
    import openai
    openai.api_key = credentials.get("api_key") or os.getenv("OPENAI_API_KEY")
    
    try:
        response = openai.ChatCompletion.create(
            model=model,
            messages=[{"role": "user", "content": prompt}]
        )
        return response["choices"][0]["message"]["content"]
    except Exception as e:
        return f"Error: {str(e)}"

async def call_huggingface_model(model: str, prompt: str):
    import requests
    response = requests.post(
        f"https://api-inference.huggingface.co/models/{model}",
        headers={"Authorization": f"Bearer {os.getenv('HUGGINGFACE_API_KEY')}"},
        json={"inputs": prompt}
    )
    data = response.json()
    return data.get("generated_text") or data.get("choices", [{}])[0].get("text", str(data))

async def call_local_model(model: str, prompt: str):
    # Example for local models like Ollama, Mistral, etc.
    import httpx
    async with httpx.AsyncClient() as client:
        response = await client.post("http://localhost:11434/api/generate", json={
            "model": model.lower(),
            "prompt": prompt
        })
        response.raise_for_status()
        chunks = response.text.splitlines()
        result = ""
        for chunk in chunks:
            try:
                json_chunk = httpx.Response(200, content=chunk).json()
                result += json_chunk.get("response", "")
            except Exception:
                continue
        return result.strip() if result else response.text

# Dispatcher
async def call_model(agent: AgentConfig):
    if agent.provider.lower() == "openai":
        result = await call_openai_model(agent.model, agent.query, agent.additional_info)
    elif agent.provider.lower() == "huggingface":
        result = await call_huggingface_model(agent.model, agent.query)
    elif agent.provider.lower() == "local":
        result = await call_local_model(agent.model, agent.query)
    else:
        result = f"Unsupported provider: {agent.provider}"

    print(f"Provider: {agent.provider}, Model: {agent.model}, Result: {result}")

    # Detect user input prompt
    if "[USER_INPUT_REQUEST]" in result:
        prompt = result.split("[USER_INPUT_REQUEST]")[-1].strip()
        return {
            "status": "need_user_input",
            "prompt": prompt or "Please provide input:",
            "response": None
        }

    return {
        "status": "success",
        "response": result
    }

# Main handler
async def handle_model_request(req: AgentRequest):
    results = []
    for agent in req.agents:
        try:
            model_result = await call_model(agent)
        except Exception as e:
            model_result = {
                "status": "error",
                "response": f"Error: {str(e)}"
            }

        record = {
            "provider": agent.provider,
            "model": agent.model,
            "query": agent.query,
            "status": model_result.get("status"),
            "response": model_result.get("response"),
            "prompt": model_result.get("prompt"),
            "additional_info": agent.additional_info
        }

        insert_result = await db.agents.insert_one(record)
        record["_id"] = str(insert_result.inserted_id)
        results.append(record)
    return {"results": results}

# Routes
router = APIRouter()

@router.post("/ask")
async def ask_agent(req: AgentRequest):
    return await handle_model_request(req)

@router.post("/workflow")
async def create_workflow(req: WorkflowCreateRequest):
    workflow_data = req.dict()
    result = await db.workflows.insert_one(workflow_data)
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
        prompt = agent["query"].replace("{{input}}", str(input_data))  # string substitution
        agent_config = AgentConfig(**{**agent, "query": prompt})

        try:
            output = await call_model(agent_config)
        except Exception as e:
            output = {"status": "error", "response": f"Error: {str(e)}"}

        # Add to trace
        execution_trace.append({
            "step": idx + 1,
            "provider": agent["provider"],
            "model": agent["model"],
            "query": prompt,
            "status": output.get("status"),
            "response": output.get("response"),
            "prompt": output.get("prompt")
        })

        if output.get("status") == "need_user_input":
            # Stop here and ask for user input
            return {
                "status": "need_user_input",
                "step": idx,
                "prompt": output["prompt"],
                "trace": execution_trace
            }

        input_data = output.get("response", "")

    return {
        "status": "success",
        "final_output": input_data,
        "trace": execution_trace
    }

@router.post("/workflow/{workflow_id}/resume")
async def resume_workflow(workflow_id: str, req: ResumeWorkflowRequest):
    workflow = await db.workflows.find_one({"_id": ObjectId(workflow_id)})
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    input_data = req.user_input
    execution_trace = []

    agents = workflow.get("agents", [])
    for idx in range(req.step_index, len(agents)):
        agent = agents[idx]
        prompt = agent["query"].replace("{{input}}", str(input_data))
        agent_config = AgentConfig(**{**agent, "query": prompt})

        try:
            output = await call_model(agent_config)
        except Exception as e:
            output = {"status": "error", "response": f"Error: {str(e)}"}

        execution_trace.append({
            "step": idx,
            "provider": agent["provider"],
            "model": agent["model"],
            "query": prompt,
            "status": output.get("status"),
            "response": output.get("response"),
            "prompt": output.get("prompt")
        })

        if output.get("status") == "need_user_input":
            return {
                "status": "need_user_input",
                "step": idx,
                "prompt": output["prompt"],
                "trace": execution_trace
            }

        input_data = output.get("response", "")

    return {
        "status": "success",
        "final_output": input_data,
        "trace": execution_trace
    }

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
    return {"message": "Welcome to the Workflow API!"}

@app.get("/health")
async def health_check():
    try:
        client.admin.command('ping')
        return {"status": "healthy"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Database connection failed")

@app.get("/status")
async def status_check():
    try:
        client.admin.command('ping')
        return {"status": "running"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Database connection failed")

app.include_router(router)
