import asyncio
from backend.main import get_info, ResolveRequest

async def test():
    req = ResolveRequest(url="https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT")
    res = await get_info(req)
    print(res)

asyncio.run(test())
