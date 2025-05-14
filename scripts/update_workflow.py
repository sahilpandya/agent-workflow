from pymongo import MongoClient
from bson import ObjectId

# MongoDB connection
MONGO_URL = "mongodb://localhost:27017"
client = MongoClient(MONGO_URL)
db = client.workflowDB

# Workflow ID to update
workflow_id = "681c9817acf85040b91d51c3"

# Fetch the workflow to inspect its current state
workflow = db.workflows.find_one({"_id": ObjectId(workflow_id)})
if not workflow:
    print(f"Workflow with ID {workflow_id} not found.")
else:
    print(f"Current workflow: {workflow}")

# Add the missing 'provider' field to the first agent
result = db.workflows.update_one(
    {"_id": ObjectId(workflow_id)},
    {
        "$set": {
            "agents.0.provider": "local"  # Add the missing 'provider' field
        }
    }
)

if result.modified_count > 0:
    print(f"Workflow {workflow_id} updated successfully.")
else:
    print(f"No changes made to workflow {workflow_id}.")
