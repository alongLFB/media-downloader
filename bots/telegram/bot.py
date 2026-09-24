import os
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.filters.command import Command
import requests
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

bot = Bot(token=TELEGRAM_BOT_TOKEN)
dp = Dispatcher()

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    await message.answer(
        "👋 Welcome to Media & Music Downloader!\n\n"
        "• Send any video/audio URL (YouTube, Bilibili, TikTok, Spotify, etc.) to download media.\n"
        "• Or send `/music <song name>` to search and download high-quality/lossless FLAC/MP3 songs from NetEase, Kuwo, QQ, etc.!\n"
        "Example: `/music 周杰伦 晴天`"
    )

@dp.message(Command("music"))
async def cmd_music(message: types.Message):
    query = message.text.replace("/music", "").strip()
    if not query:
        await message.answer("Please specify a song name or artist. Example: `/music 周杰伦 晴天`")
        return

    msg = await message.answer(f"🔍 Searching music for: **{query}**...")

    try:
        search_res = requests.post(
            f"{BACKEND_URL}/api/music/search",
            json={"keyword": query, "count_per_source": 3},
            timeout=60
        )
        if search_res.status_code != 200 or not search_res.json().get("results"):
            await msg.edit_text(f"No music found for: {query}")
            return

        results = search_res.json()["results"]
        top_song = results[0]
        title = f"{top_song.get('singers')} - {top_song.get('song_name')}"
        source_name = top_song.get("source_name", "Music")
        ext = top_song.get("ext", "mp3")
        file_size = top_song.get("file_size", "")

        await msg.edit_text(f"🎵 Found: **{title}** ({source_name} • {ext.upper()} {file_size})\nStarting high-quality download...")

        dl_res = requests.post(
            f"{BACKEND_URL}/api/music/download",
            json={"song_info": top_song["song_info"], "title": title},
            timeout=10
        )
        if dl_res.status_code != 200:
            await msg.edit_text("Failed to initiate music download.")
            return

        task_id = dl_res.json().get("task_id")
        await msg.edit_text(f"⏳ Downloading and embedding ID3 tags/lyrics... (Task: {task_id[:8]})")

        for _ in range(60):
            await asyncio.sleep(4)
            check_res = requests.get(f"{BACKEND_URL}/api/file/{task_id}", stream=True)
            if check_res.status_code == 200:
                await msg.edit_text("✅ Download complete! Uploading audio to Telegram...")
                temp_filename = f"{task_id}.{ext}"
                with open(temp_filename, "wb") as f:
                    for chunk in check_res.iter_content(chunk_size=8192):
                        f.write(chunk)

                from aiogram.types import FSInputFile
                file = FSInputFile(temp_filename, filename=f"{title}.{ext}")
                await message.answer_audio(file, title=top_song.get("song_name"), performer=top_song.get("singers"))
                
                if os.path.exists(temp_filename):
                    os.remove(temp_filename)
                await msg.delete()
                return

        await msg.edit_text("Download timed out.")
    except Exception as e:
        print(f"Music error: {e}")
        await msg.edit_text(f"An error occurred: {str(e)}")

@dp.message()
async def handle_message(message: types.Message):
    url = message.text.strip()
    if not url.startswith("http"):
        await message.answer("Please send a valid media URL, or use `/music <song name>` to download music!")
        return

    msg = await message.answer("Analyzing link...")
    
    try:
        # Call backend to get info
        res = requests.post(f"{BACKEND_URL}/api/info", json={"url": url})
        if res.status_code != 200:
            await msg.edit_text("Failed to extract info from the link.")
            return
            
        data = res.json()
        title = data.get("title", "Unknown Title")
        formats = data.get("formats", [])
        best_format_id = formats[0].get("format_id", "best") if formats else "best"
        
        await msg.edit_text(f"Found: {title}\nStarting download...")
        
        dl_res = requests.post(f"{BACKEND_URL}/api/download", json={"url": url, "format_id": best_format_id, "title": title})
        if dl_res.status_code != 200:
            await msg.edit_text("Failed to start download.")
            return
            
        task_id = dl_res.json().get("task_id")
        await msg.edit_text(f"Downloading... (Task: {task_id[:8]})")
        
        for _ in range(60):
            await asyncio.sleep(5)
            check_res = requests.get(f"{BACKEND_URL}/api/file/{task_id}", stream=True)
            if check_res.status_code == 200:
                await msg.edit_text("Download complete! Uploading to Telegram...")
                temp_filename = f"{task_id}.media"
                with open(temp_filename, "wb") as f:
                    for chunk in check_res.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                from aiogram.types import FSInputFile
                file = FSInputFile(temp_filename)
                await message.answer_document(file)
                
                if os.path.exists(temp_filename):
                    os.remove(temp_filename)
                return
        
        await msg.edit_text("Download timed out.")
        
    except Exception as e:
        print(f"Error: {e}")
        await msg.edit_text(f"An error occurred: {str(e)}")

async def main():
    if not TELEGRAM_BOT_TOKEN:
        print("Error: TELEGRAM_BOT_TOKEN is not set in .env")
        return
    print("Starting Telegram Bot...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
