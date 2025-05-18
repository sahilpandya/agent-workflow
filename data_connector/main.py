from fastapi import FastAPI, Depends, HTTPException, Request
from connectors.sql_connector import execute_sql_query
from connectors.api_connector import call_api
from utils.auth import verify_token

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/data/query")
def query_data(request: Request, 
               data: dict, 
               token: str = Depends(verify_token)):
    data_source_type = data.get("source_type")
    connection_info = data.get("connection")
    query = data.get("query")

    if data_source_type == "sql":
        result = execute_sql_query(connection_info, query)
    elif data_source_type == "api":
        result = call_api(connection_info, query)
    elif data_source_type == "mongo":
        result = execute_mongo_query(connection_info, query)
    else:
        raise HTTPException(status_code=400, detail="Unsupported data source type")

    print(f"[LOG] User:{token} accessed {data_source_type}")
    return {"result": result}

