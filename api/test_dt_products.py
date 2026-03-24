import asyncio
import os
import httpx

# Load env manually
with open(".env") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ[key] = val

from app.adapters.datatree import DataTreeClient, DataTreeConfig

async def main():
    config = DataTreeConfig(
        client_id=os.getenv("DATATREE_CLIENT_ID"),
        client_secret=os.getenv("DATATREE_CLIENT_SECRET"),
        base_url=os.getenv("DATATREE_BASE_URL"),
        timeout=30,
    )
    
    client = DataTreeClient(config)
    
    print("Base URL:", config.base_url)
    
    # Test auth
    token = await client.authenticate()
    print("Auth OK")
    print()
    
    # Try GetReport with detailed response inspection
    address_detail = {
        "StreetNumber": "1640",
        "StreetName": "Riverside",
        "StreetType": "Dr",
        "City": "Los Angeles",
        "State": "CA",
        "ZipCode": "90031",
        "StateFips": 6,
        "CountyFips": 6037,
    }
    
    body = {
        "ProductNames": ["Property AVM"],
        "SearchType": 2,
        "AddressDetail": address_detail,
        "ReferenceId": "test123",
        "ResponseType": "JSON",
    }
    
    print("Request body:")
    import json
    print(json.dumps(body, indent=2))
    print()
    
    async with httpx.AsyncClient(timeout=30) as http:
        resp = await http.post(
            f"{config.base_url}/api/Report/GetReport",
            json=body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
        )
        print(f"Status: {resp.status_code}")
        print(f"Response body:")
        print(resp.text)

asyncio.run(main())
