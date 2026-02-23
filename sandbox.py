import asyncio
from microsandbox import PythonSandbox

async def main():
    async with PythonSandbox.create(name="wjnejkwnfwkefnjwekfnk") as sb:
        exec = await sb.run("2+2")
        print(await exec.output())

asyncio.run(main())