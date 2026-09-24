# Universal Media & Music Downloader

A unified media and lossless music downloader service built with FastAPI, Next.js, aiogram (Telegram), discord.py (Discord), and [musicdl](https://github.com/CharlesPikachu/musicdl).

## ✨ Features
- **🎬 视频与全网流媒体解析 (yt-dlp + FFmpeg)**:
  - 支持 YouTube、Bilibili、TikTok、X (Twitter)、Instagram 等海量视频网站。
  - 支持高达 4K 2160p UHD 原画解析与多音轨合并。
  - 一键提取 320kbps 高品质 MP3。
- **🎵 全网高品质音乐点歌与无损下载 (musicdl)**:
  - 聚合多大音乐平台：酷我音乐、网易云音乐、QQ音乐、酷狗音乐、咪咕音乐、B站音频、波点音乐等。
  - 无需链接，输入歌名、歌手或关键词即搜即下。
  - 支持最高 **FLAC 无损音频** / 320K HQ MP3 下载。
  - 自动内嵌标准 ID3 标签、专辑封面及 LRC 歌词。
  - **内置低延迟音频流预览播放器**：支持在线试听、切歌、快进拖拽与音量调节。
- **🤖 Telegram & Discord 机器人集成**:
  - 发送媒体链接直接下载。
  - 发送 `/music <歌名>` 快速搜索并自动回传音频文件！

## Architecture
- **Backend**: FastAPI 驱动，融合 `yt-dlp`、`spotdl` 与 `musicdl` 聚合引擎。
- **Frontend**: Next.js 16 + React 19 + Tailwind CSS，现代暗黑玻璃拟物风格（Glassmorphism）。
- **Telegram Bot**: Python 异步机器人，基于 `aiogram`。
- **Discord Bot**: Python 异步机器人，基于 `discord.py`。

## Docker Compose Setup (Recommended)

1. 克隆代码库并进入目录。
2. 配置 `.env` 环境变量文件：
```bash
cp .env.example .env
```
3. 启动全栈服务：
```bash
docker compose up -d
```
所有服务（后端、前端、Telegram Bot、Discord Bot）将自动在后台启动。

## Manual Setup Instructions

### 1. Prerequisites
- Python 3.10+
- Node.js 18+
- FFmpeg (用于音视频合并与转码)

### 2. Environment Variables
在根目录配置 `.env` 文件：
```env
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
DISCORD_BOT_TOKEN="your_discord_bot_token"
BACKEND_URL="http://127.0.0.1:8000"
```

### 3. Backend (FastAPI)
```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload
```
后端接口运行在 `http://127.0.0.1:8000`，可访问 `/docs` 查看 Swagger API 文档。

### 4. Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
前端界面访问地址：`http://localhost:3000`。

### 5. Telegram Bot
```bash
python bots/telegram/bot.py
```
- 发送视频链接下载视频。
- 发送 `/music 晴天 周杰伦` 自动搜索并回传高品质音乐文件。

### 6. Discord Bot
```bash
python bots/discord/bot.py
```
- 发送 `/dl <url>` 下载视频。
- 发送 `/music 晴天 周杰伦` 搜索并下载音乐。

## API Endpoints Overview
| 路径 | 方法 | 说明 |
| :--- | :---: | :--- |
| `/api/music/sources` | GET | 获取支持的音乐源平台列表 |
| `/api/music/search` | POST | 跨平台搜索音乐（关键词、源筛选） |
| `/api/music/download` | POST | 提交音乐下载任务（自动补全 ID3/封面/歌词） |
| `/api/music/stream` | GET | 音乐流媒体反向代理，用于浏览器端低延迟在线试听 |
| `/api/info` | POST | 解析多媒体链接详情（支持视频与音乐分享链接） |
| `/api/download` | POST | 提交视频/音频提取转码任务 |
| `/api/file/{task_id}` | GET/HEAD | 轮询与下载处理完毕的媒体文件 |
