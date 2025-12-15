#!/usr/bin/env python3
import asyncio
from wikipedia_mcp import create_server

async def main():
    async with create_server() as server:
        await server.run()

if __name__ == "__main__":
    asyncio.run(main())
```

2. Click File → Save As
3. Navigate to your `wikipedia-mcp-server` folder
4. **In "File name" box, type:** `server.py` (with quotes!)
5. **In "Save as type" dropdown:** Select "All Files (*.*)"
6. Click Save

**WINDOW 2 - Create requirements.txt:**
1. Copy/paste:
```
wikipedia-mcp
mcp
```

2. File → Save As
3. **File name:** `requirements.txt` (with quotes!)
4. **Save as type:** "All Files (*.*)"
5. Save

**WINDOW 3 - Create Procfile:**
1. Copy/paste:
```
web: python server.py
