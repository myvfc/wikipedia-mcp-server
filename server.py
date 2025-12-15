#!/usr/bin/env python3
import asyncio
from wikipedia_mcp import create_server

async def main():
    async with create_server() as server:
        await server.run()

if __name__ == "__main__":
    asyncio.run(main())
