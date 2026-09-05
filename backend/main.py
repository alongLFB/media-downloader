from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Response
from pydantic import BaseModel
import yt_dlp
import os
import uuid
import subprocess
import json
import sys
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import time

app = FastAPI(title="Media Downloader API")

# 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

def get_cookie_file():
    candidates = [
        os.path.join(os.getcwd(), "youtube-cookies.txt"),
        os.path.join(os.path.dirname(__file__), "youtube-cookies.txt"),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "youtube-cookies.txt"),
        "youtube-cookies.txt"
    ]
    for c in candidates:
        if os.path.isfile(c) and os.path.getsize(c) > 0:
            return c
    return None

class ResolveRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = "best"
    title: Optional[str] = None
    
@app.post("/api/info")
def get_info(req: ResolveRequest):
    if "spotify.com" in req.url:
        task_id = str(uuid.uuid4())
        temp_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.spotdl")
        try:
            subprocess.run(
                [sys.executable, "-m", "spotdl", "--print-errors", "save", req.url, "--save-file", temp_path],
                check=True, capture_output=True, text=True
            )
            with open(temp_path, "r", encoding="utf-8") as f:
                spotdl_data = json.load(f)
            if not spotdl_data:
                raise Exception("Failed to extract Spotify metadata")
            song = spotdl_data[0]
            return {
                "title": f"{song.get('name', 'Unknown')} - {song.get('artist', 'Unknown')}",
                "thumbnail": song.get("cover_url", ""),
                "duration": song.get("duration", 0),
                "uploader": song.get("artist", ""),
                "extractor": "spotify",
                "formats": [
                    {
                        "format_id": "spotdl_mp3",
                        "ext": "mp3",
                        "resolution": "audio only",
                        "filesize": None,
                        "format_note": "Spotify Match (HQ MP3)",
                        "vcodec": "none",
                        "acodec": "mp3",
                        "height": 0
                    }
                ]
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Spotify parsing failed: {str(e)}")
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
    ydl_opts = {
        'quiet': True,
        'noplaylist': True,
        'js_runtimes': {'node': {}, 'deno': {}},
    }
    cookie_file = get_cookie_file()
    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=False)
            
            raw_formats = info.get("formats", [])
            video_formats = []
            audio_formats = []
            
            for f in raw_formats:
                vcodec = f.get("vcodec", "none")
                acodec = f.get("acodec", "none")
                if vcodec == "none" and acodec == "none":
                    continue
                
                res = f.get("resolution") or ""
                filesize = f.get("filesize") or f.get("filesize_approx")
                height = f.get("height") or 0
                
                fmt_data = {
                    "format_id": f.get("format_id"),
                    "ext": f.get("ext"),
                    "resolution": res,
                    "filesize": filesize,
                    "format_note": f.get("format_note") or "",
                    "height": height,
                    "vcodec": vcodec,
                    "acodec": acodec,
                    "fps": f.get("fps") or None,
                }
                
                if vcodec == "none" or res == "audio only":
                    fmt_data["resolution"] = "audio only"
                    audio_formats.append(fmt_data)
                else:
                    video_formats.append(fmt_data)
            
            # 排序：视频按高度和大小，音频按大小
            video_formats.sort(key=lambda x: (x["height"], x["filesize"] or 0), reverse=True)
            audio_formats.sort(key=lambda x: x["filesize"] or 0, reverse=True)
            
            # 去重（按 resolution 或 height）
            seen_video = set()
            unique_video_formats = []
            for vf in video_formats:
                key = (vf["height"], vf["ext"]) if vf["height"] > 0 else (vf["resolution"], vf["ext"])
                if key not in seen_video:
                    seen_video.add(key)
                    unique_video_formats.append(vf)
            
            seen_audio = set()
            unique_audio_formats = []
            for af in audio_formats:
                key = (af["format_note"], af["ext"])
                if key not in seen_audio:
                    seen_audio.add(key)
                    unique_audio_formats.append(af)
            
            # 虚拟最高品质 320kbps MP3 格式
            mp3_format = {
                "format_id": "bestaudio_mp3",
                "ext": "mp3",
                "resolution": "audio only",
                "filesize": None,
                "format_note": "320kbps (HQ MP3)",
                "height": 0,
                "vcodec": "none",
                "acodec": "mp3",
                "fps": None,
            }
            unique_audio_formats.insert(0, mp3_format)
            
            final_formats = unique_video_formats + unique_audio_formats
            
            return {
                "title": info.get("title") or "Unknown Media",
                "thumbnail": info.get("thumbnail") or "",
                "duration": info.get("duration") or 0,
                "uploader": info.get("uploader") or info.get("channel") or info.get("uploader_id") or "",
                "extractor": info.get("extractor_key") or "generic",
                "view_count": info.get("view_count") or None,
                "formats": final_formats
            }
    except Exception as e:
        err_msg = str(e)
        if "The page needs to be reloaded" in err_msg:
            err_msg = "YouTube 请求触发风控，请确保系统已安装最新 yt-dlp 与 challenge 求解器并配置有效 cookies。"
        raise HTTPException(status_code=400, detail=err_msg)

@app.post("/api/download")
async def download_media(req: DownloadRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    
    if req.title:
        with open(os.path.join(DOWNLOAD_DIR, f"{task_id}.title"), "w", encoding="utf-8") as f:
            f.write(req.title)
            
    output_template = os.path.join(DOWNLOAD_DIR, f"{task_id}.%(ext)s")
    
    def download_task():
        try:
            if req.format_id == "spotdl_mp3":
                output_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.{{output-ext}}")
                subprocess.run(
                    [sys.executable, "-m", "spotdl", "--print-errors", req.url, "--output", output_path],
                    check=True, capture_output=True, text=True
                )
                open(os.path.join(DOWNLOAD_DIR, f"{task_id}.done"), 'w').close()
                print(f"Spotify 异步下载任务完成: {task_id}")
                return
                
            ydl_opts = {
                'outtmpl': output_template,
                'quiet': True,
                'noplaylist': True,
                'js_runtimes': {'node': {}, 'deno': {}},
            }
            cookie_file = get_cookie_file()
            if cookie_file:
                ydl_opts['cookiefile'] = cookie_file
            
            # 情况一：如果是高音质 MP3 请求
            if req.format_id == "bestaudio_mp3":
                ydl_opts['format'] = 'bestaudio/best'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '320',
                }]
            
            # 情况二：常规视频下载（强制将选中视频格式 + 最佳音频组合下载并转码为通用 mp4）
            else:
                ydl_opts['format'] = f"{req.format_id}+bestaudio/best" if req.format_id != "best" else "bestvideo+bestaudio/best"
                ydl_opts['merge_output_format'] = 'mp4'
                ydl_opts['postprocessor_args'] = {
                    'video_convertor': ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac']
                }
            
            # 执行下载任务
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([req.url])
                
            # 成功下载合并后，创建完毕标记文件
            open(os.path.join(DOWNLOAD_DIR, f"{task_id}.done"), 'w').close()
            print(f"异步下载任务完成: {task_id}")
            
        except Exception as e:
            print(f"异步下载任务失败: {e}")
            with open(os.path.join(DOWNLOAD_DIR, f"{task_id}.error"), 'w', encoding="utf-8") as f:
                f.write(str(e))
            
    cleanup_old_files()
    background_tasks.add_task(download_task)
    return {"task_id": task_id, "status": "started"}

def remove_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
            print(f"成功删除临时缓存文件: {path}")
    except Exception as e:
        print(f"删除临时文件失败 {path}: {e}")

def cleanup_old_files():
    try:
        now = time.time()
        for filename in os.listdir(DOWNLOAD_DIR):
            file_path = os.path.join(DOWNLOAD_DIR, filename)
            if os.path.isfile(file_path):
                # 自动清理 15 分钟（900秒）未被领走的陈旧文件
                if now - os.path.getmtime(file_path) > 900:
                    os.remove(file_path)
                    print(f"自动清理超时过期文件: {file_path}")
    except Exception as e:
        print(f"执行自动清理时发生异常: {e}")

@app.api_route("/api/file/{task_id}", methods=["GET", "HEAD"])
async def get_file(task_id: str, background_tasks: BackgroundTasks, request: Request):
    done_file = os.path.join(DOWNLOAD_DIR, f"{task_id}.done")
    error_file = os.path.join(DOWNLOAD_DIR, f"{task_id}.error")
    
    if os.path.exists(error_file):
        err_text = "Download processing error"
        try:
            with open(error_file, "r", encoding="utf-8") as ef:
                err_text = ef.read().strip()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=err_text)

    # 状态检查：.done 标记不存在说明还在下载中
    if not os.path.exists(done_file):
        if request.method == "HEAD":
            return Response(status_code=202)
        raise HTTPException(status_code=202, detail="Downloading and processing...")
        
    # 精确匹配最终生成的 .mp4 或 .mp3 媒体文件
    file_path = None
    filename = None
    for ext in [".mp4", ".mp3", ".webm", ".m4a"]:
        target_path = os.path.join(DOWNLOAD_DIR, f"{task_id}{ext}")
        if os.path.exists(target_path):
            file_path = target_path
            filename = f"download_{task_id}{ext}"
            break
            
    if file_path and os.path.exists(file_path):
        title_file = os.path.join(DOWNLOAD_DIR, f"{task_id}.title")
        if os.path.exists(title_file):
            try:
                with open(title_file, "r", encoding="utf-8") as f:
                    title = f.read().strip()
                    if title:
                        safe_title = "".join([c for c in title if c.isalnum() or c in " ._-()"]).strip()
                        if safe_title:
                            filename = f"{safe_title}{os.path.splitext(file_path)[1]}"
            except Exception:
                pass
                
        if request.method == "GET":
            background_tasks.add_task(remove_file, file_path)
            background_tasks.add_task(remove_file, done_file)
            if os.path.exists(title_file):
                background_tasks.add_task(remove_file, title_file)
        return FileResponse(path=file_path, filename=filename)
            
    raise HTTPException(status_code=404, detail="File not found")