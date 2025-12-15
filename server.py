#!/usr/bin/env python3
import asyncio
from wikipedia_mcp import create_server

async def main():
    async with create_server() as server:
        await server.run()

if __name__ == "__main__":
    asyncio.run(main())
```
4. Scroll down, click "Commit changes"

**STEP 3: Create requirements.txt**
1. Click "Add file" → "Create new file"
2. Name: `requirements.txt`
3. Paste:
```
wikipedia-mcp
mcp
```
4. Commit changes

**STEP 4: Create Procfile**
1. Click "Add file" → "Create new file"
2. Name: `Procfile`
3. Paste:
```
web: python server.py
