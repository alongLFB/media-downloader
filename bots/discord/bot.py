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
async def music(ctx, *, query: str):
    """Search and download music across NetEase, Kuwo, QQ, etc."""
    if not query.strip():
        await ctx.send("Please specify a song name or artist. Example: `/music 周杰伦 晴天`")
        return
        
    msg = await ctx.send(f"🔍 Searching music for: **{query}**...")
    
    try:
        search_res = requests.post(
            f"{BACKEND_URL}/api/music/search",
            json={"keyword": query, "count_per_source": 3},
            timeout=60
        )
        if search_res.status_code != 200 or not search_res.json().get("results"):
            await msg.edit(content=f"No music found for: **{query}**")
            return
            
        results = search_res.json()["results"]
        top_song = results[0]
        title = f"{top_song.get('singers')} - {top_song.get('song_name')}"
        source_name = top_song.get("source_name", "Music")
        ext = top_song.get("ext", "mp3")
        file_size = top_song.get("file_size", "")
        
        await msg.edit(content=f"🎵 Found: **{title}** ({source_name} • {ext.upper()} {file_size})\nStarting high-quality download...")
        
        dl_res = requests.post(
            f"{BACKEND_URL}/api/music/download",
            json={"song_info": top_song["song_info"], "title": title},
            timeout=10
        )
        if dl_res.status_code != 200:
            await msg.edit(content="Failed to initiate music download.")
            return
            
        task_id = dl_res.json().get("task_id")
        await msg.edit(content=f"⏳ Downloading and embedding ID3 tags/lyrics... (Task: {task_id[:8]})")
        
        for _ in range(60):
            await asyncio.sleep(4)
            check_res = requests.get(f"{BACKEND_URL}/api/file/{task_id}", stream=True)
            if check_res.status_code == 200:
                await msg.edit(content="✅ Download complete! Uploading audio to Discord...")
                temp_filename = f"{task_id}.{ext}"
                with open(temp_filename, "wb") as f:
                    for chunk in check_res.iter_content(chunk_size=8192):
                        f.write(chunk)
                        
                file_size_bytes = os.path.getsize(temp_filename)
                if file_size_bytes > 25 * 1024 * 1024:
                    await msg.edit(content=f"File exceeds Discord's 25MB free limit ({file_size_bytes / 1024 / 1024:.2f} MB). You can download it directly from Web UI.")
                else:
                    await ctx.send(file=discord.File(temp_filename, filename=f"{title}.{ext}"))
                    await msg.delete()
                    
                if os.path.exists(temp_filename):
                    os.remove(temp_filename)
                return
                
        await msg.edit(content="Download timed out.")
    except Exception as e:
        print(f"Music error: {e}")
        await msg.edit(content=f"An error occurred: {str(e)}")

@bot.command()
async def dl(ctx, url: str):
    """Download video or audio from a URL."""
    msg = await ctx.send("Analyzing link...")
    
    try:
        # Call backend to get info
        res = requests.post(f"{BACKEND_URL}/api/info", json={"url": url})
        if res.status_code != 200:
            await msg.edit(content="Failed to extract info from the link.")
            return
            
        data = res.json()
        title = data.get("title", "Unknown Title")
        formats = data.get("formats", [])
        best_format_id = formats[0].get("format_id", "best") if formats else "best"
        
        await msg.edit(content=f"Found: **{title}**\nStarting download...")
        
        dl_res = requests.post(f"{BACKEND_URL}/api/download", json={"url": url, "format_id": best_format_id, "title": title})
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
                    
                if os.path.exists(temp_filename):
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
