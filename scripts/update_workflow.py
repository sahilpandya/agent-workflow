from pymongo import MongoClient
from bson import ObjectId

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
client = MongoClient(MONGO_URL)
db = client.workflowDB

# Workflow ID to update
workflow_id = "681b4655841b3c76a1859d7f"

# Fetch the workflow to inspect its current state
workflow = db.workflows.find_one({"_id": ObjectId(workflow_id)})
if not workflow:
    print(f"Workflow with ID {workflow_id} not found.")
else:
    print(f"Current workflow: {workflow}")

# Add missing 'name' and 'description' fields to all agents
updated_agents = []
for idx, agent in enumerate(workflow.get("agents", [])):
    agent["name"] = agent.get("name", f"Agent {idx + 1}")  # Default name if missing
    agent["description"] = agent.get("description", f"Description for Agent {idx + 1}")  # Default description if missing
    updated_agents.append(agent)

# Update the workflow in the database
result = db.workflows.update_one(
    {"_id": ObjectId(workflow_id)},
    {"$set": {"agents": updated_agents}}
)

if result.modified_count > 0:
    print(f"Workflow {workflow_id} updated successfully.")
else:
    print(f"No changes made to workflow {workflow_id}.")
