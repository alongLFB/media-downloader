from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
import yt_dlp
import os
import uuid
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
import subprocess

app = FastAPI(title="Media Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

class ResolveRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = "best"
    
@app.post("/api/info")
async def get_info(req: ResolveRequest):
    # Try yt-dlp first
    ydl_opts = {
        'quiet': True,
        'noplaylist': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
            
            return {
                "title": info.get("title"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration"),
                "formats": [
                    {
                        "format_id": f.get("format_id"),
                        "ext": f.get("ext"),
                        "resolution": f.get("resolution"),
                        "filesize": f.get("filesize"),
                        "format_note": f.get("format_note"),
                    } for f in info.get("formats", []) if f.get("vcodec") != "none" or f.get("acodec") != "none"
                ]
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/download")
async def download_media(req: DownloadRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    output_template = os.path.join(DOWNLOAD_DIR, f"{task_id}.%(ext)s")
    
    def download_task():
        ydl_opts = {
            'format': req.format_id,
            'outtmpl': output_template,
            'quiet': True,
            'noplaylist': True,
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([req.url])
        except Exception as e:
            print(f"Download failed: {e}")
            
    background_tasks.add_task(download_task)
    return {"task_id": task_id, "status": "started"}

@app.get("/api/file/{task_id}")
async def get_file(task_id: str):
    # Find the file with the matching task_id
    for filename in os.listdir(DOWNLOAD_DIR):
        if filename.startswith(task_id):
            file_path = os.path.join(DOWNLOAD_DIR, filename)
            return FileResponse(path=file_path, filename=filename)
    raise HTTPException(status_code=404, detail="File not found or still downloading")
