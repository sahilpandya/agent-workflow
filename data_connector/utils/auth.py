from fastapi import HTTPException

def verify_token(token: str):
    if token != "VALID_API_TOKEN":
        raise HTTPException(status_code=401, detail="Invalid token")
    return "Agent123"

