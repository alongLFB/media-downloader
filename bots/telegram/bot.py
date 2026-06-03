import os
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.filters.command import Command
from aiogram.enums import ParseMode
import requests
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

bot = Bot(token=TELEGRAM_BOT_TOKEN)
dp = Dispatcher()

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    await message.answer("Hello! Send me a link to download media (video/audio).")

@dp.message()
async def handle_message(message: types.Message):
    url = message.text
    if not url.startswith("http"):
        await message.answer("Please send a valid URL.")
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
        
        # Simplify: just start the download for the best format immediately
        # In a real app, we'd show a keyboard with formats
        await msg.edit_text(f"Found: {title}\nStarting download...")
        
        dl_res = requests.post(f"{BACKEND_URL}/api/download", json={"url": url, "format_id": "best"})
        if dl_res.status_code != 200:
            await msg.edit_text("Failed to start download.")
            return
            
        task_id = dl_res.json().get("task_id")
        
        # Poll for completion (simple loop for demonstration)
        await msg.edit_text(f"Downloading... (Task: {task_id[:8]})")
        
        import time
        for _ in range(60): # wait up to 60*5 = 300s
            time.sleep(5)
            # check if file is ready by calling GET /api/file/{task_id} with stream=True
            check_res = requests.get(f"{BACKEND_URL}/api/file/{task_id}", stream=True)
            if check_res.status_code == 200:
                await msg.edit_text("Download complete! Uploading to Telegram...")
                # Download to temp file and upload
                temp_filename = f"{task_id}.media"
                with open(temp_filename, "wb") as f:
                    for chunk in check_res.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                # Upload
                from aiogram.types import FSInputFile
                file = FSInputFile(temp_filename)
                await message.answer_document(file)
                
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
