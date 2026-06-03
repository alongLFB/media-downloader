import os
import discord
from discord.ext import commands
import requests
import asyncio
from dotenv import load_dotenv

load_dotenv()

DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="/", intents=intents)

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user}')

@bot.command()
async def dl(ctx, url: str):
    msg = await ctx.send("Analyzing link...")
    
    try:
        # Call backend to get info
        res = requests.post(f"{BACKEND_URL}/api/info", json={"url": url})
        if res.status_code != 200:
            await msg.edit(content="Failed to extract info from the link.")
            return
            
        data = res.json()
        title = data.get("title", "Unknown Title")
        
        await msg.edit(content=f"Found: **{title}**\nStarting download...")
        
        dl_res = requests.post(f"{BACKEND_URL}/api/download", json={"url": url, "format_id": "best"})
        if dl_res.status_code != 200:
            await msg.edit(content="Failed to start download.")
            return
            
        task_id = dl_res.json().get("task_id")
        
        await msg.edit(content=f"Downloading... (Task: {task_id[:8]})")
        
        for _ in range(60): # poll for 5 mins
            await asyncio.sleep(5)
            check_res = requests.get(f"{BACKEND_URL}/api/file/{task_id}", stream=True)
            if check_res.status_code == 200:
                await msg.edit(content="Download complete! Uploading to Discord...")
                
                temp_filename = f"{task_id}.media"
                with open(temp_filename, "wb") as f:
                    for chunk in check_res.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                # Check file size < 25MB (Discord free limit)
                file_size = os.path.getsize(temp_filename)
                if file_size > 25 * 1024 * 1024:
                    await msg.edit(content=f"File is too large for Discord ({file_size / 1024 / 1024:.2f} MB). Limit is 25MB.")
                else:
                    await ctx.send(file=discord.File(temp_filename))
                    await msg.delete()
                    
                os.remove(temp_filename)
                return
                
        await msg.edit(content="Download timed out.")
        
    except Exception as e:
        print(f"Error: {e}")
        await msg.edit(content=f"An error occurred: {str(e)}")

if __name__ == "__main__":
    if not DISCORD_BOT_TOKEN:
        print("Error: DISCORD_BOT_TOKEN is not set in .env")
    else:
        bot.run(DISCORD_BOT_TOKEN)
