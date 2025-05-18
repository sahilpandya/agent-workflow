import requests

def call_api(connection_info: dict, query: dict):
    api_url = connection_info.get("api_url")
    headers = connection_info.get("headers", {})

    try:
        response = requests.post(api_url, json=query, headers=headers)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e)}

