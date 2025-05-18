from pymongo import MongoClient

def execute_mongo_query(connection_info: dict, query: dict):
    uri = connection_info.get("uri")
    database_name = connection_info.get("database")
    collection_name = connection_info.get("collection")

    if not uri or not database_name or not collection_name:
        return {"error": "Missing MongoDB connection details"}

    try:
        client = MongoClient(uri)
        db = client[database_name]
        collection = db[collection_name]

        # Execute query (simple find query example)
        result = list(collection.find(query, {"_id": 0}))  # Exclude _id for clean output
        client.close()
        return result
    except Exception as e:
        return {"error": str(e)}

