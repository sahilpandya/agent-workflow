import sqlalchemy

def execute_sql_query(connection_info: dict, query: str):
    url = connection_info.get("url")
    if not url:
        return {"error": "Missing DB URL"}

    try:
        engine = sqlalchemy.create_engine(url)
        with engine.connect() as conn:
            result = conn.execute(sqlalchemy.text(query))
            rows = [dict(row) for row in result]
        return rows
    except Exception as e:
        return {"error": str(e)}

