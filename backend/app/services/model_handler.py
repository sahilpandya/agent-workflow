async def handle_model_request(req):
    # Simulate basic model logic
    results = []
    for agent in req.agents:
        results.append({
            "model": agent.model,
            "query": agent.query,
            "response": f"Simulated response for {agent.query} using {agent.model}"
        })
    return {"results": results}
