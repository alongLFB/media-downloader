# Universal Media Downloader

A unified media downloader service built with FastAPI, Next.js, aiogram (Telegram), and discord.py (Discord). It supports downloading videos and music from various platforms supported by `yt-dlp`.

## Architecture
- **Backend**: FastAPI wrapper around `yt-dlp`.
- **Frontend**: Next.js React application with Tailwind CSS.
- **Telegram Bot**: Python bot using `aiogram`.
- **Discord Bot**: Python bot using `discord.py`.

## Setup Instructions

### 1. Prerequisites
- Python 3.10+
- Node.js 18+
- FFmpeg (must be installed on your system for merging high-quality video/audio)

### 2. Environment Variables
Create a `.env` file in the root directory (you can copy `.env.example`):
```env
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
DISCORD_BOT_TOKEN="your_discord_bot_token"
BACKEND_URL="http://127.0.0.1:8000"
```

### 3. Backend (FastAPI)
Open a terminal and run:
```bash
# Activate virtual environment
source venv/bin/activate
# Run FastAPI server
uvicorn backend.main:app --reload
```
The backend will run on `http://127.0.0.1:8000`.

### 4. Frontend (Next.js)
Open a second terminal and run:
```bash
cd frontend
# Install dependencies if not already done
npm install
# Run dev server
npm run dev
```
The frontend will be available at `http://localhost:3000`.

### 5. Telegram Bot
Open a third terminal and run:
```bash
source venv/bin/activate
python bots/telegram/bot.py
```
Send a message like `/start` or paste a YouTube link to your bot on Telegram.

### 6. Discord Bot
Open a fourth terminal and run:
```bash
source venv/bin/activate
python bots/discord/bot.py
```
In your Discord server where the bot is invited, type `/dl <url>` to download media.

## Notes
- Downloaded files are temporarily stored in the `downloads/` directory. You may want to set up a cron job or background task to clean them up periodically.
- For Discord bots, the free tier file size limit is 25MB. Files larger than this will be rejected by Discord. Telegram bot limit is 50MB.
