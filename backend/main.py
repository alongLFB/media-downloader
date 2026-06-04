from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Response
from pydantic import BaseModel
import yt_dlp
import os
import uuid
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

class ResolveRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = "best"
    title: Optional[str] = None
    
@app.post("/api/info")
async def get_info(req: ResolveRequest):
    ydl_opts = {
        'quiet': True,
        'noplaylist': True,
    }
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
                
                fmt_data = {
                    "format_id": f.get("format_id"),
                    "ext": f.get("ext"),
                    "resolution": res,
                    "filesize": filesize,
                    "format_note": f.get("format_note") or "",
                    "height": f.get("height") or 0,
                    "vcodec": vcodec,
                    "acodec": acodec,
                }
                
                if vcodec == "none" or res == "audio only":
                    fmt_data["resolution"] = "audio only"
                    audio_formats.append(fmt_data)
                else:
                    video_formats.append(fmt_data)
            
            # 排序：视频按高度和大小，音频按大小
            video_formats.sort(key=lambda x: (x["height"], x["filesize"] or 0), reverse=True)
            audio_formats.sort(key=lambda x: x["filesize"] or 0, reverse=True)
            
            # 去重
            seen_video = set()
            unique_video_formats = []
            for vf in video_formats:
                key = (vf["resolution"], vf["ext"])
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
            
            # 虚拟 MP3 格式
            mp3_format = {
                "format_id": "bestaudio_mp3",
                "ext": "mp3",
                "resolution": "audio only",
                "filesize": None,
                "format_note": "320kbps (HQ MP3)",
                "height": 0,
                "vcodec": "none",
                "acodec": "none",
            }
            unique_audio_formats.insert(0, mp3_format)
            
            final_formats = unique_video_formats + unique_audio_formats
            
            return {
                "title": info.get("title"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration"),
                "formats": final_formats
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/download")
async def download_media(req: DownloadRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    
    if req.title:
        with open(os.path.join(DOWNLOAD_DIR, f"{task_id}.title"), "w", encoding="utf-8") as f:
            f.write(req.title)
    # 恢复为 %(ext)s，让 yt-dlp 自动处理后缀替换（mp3或mp4），避免出现 .mp3.mp3
    output_template = os.path.join(DOWNLOAD_DIR, f"{task_id}.%(ext)s")
    
    def download_task():
        try:
            ydl_opts = {
                'outtmpl': output_template,
                'quiet': True,
                'noplaylist': True,
            }
            
            # 情况一：如果是高音质 MP3 请求
            if req.format_id == "bestaudio_mp3":
                ydl_opts['format'] = 'bestaudio/best'
                # 去除强制指定 .mp3 outtmpl，依靠 postprocessor 自动改后缀
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '320',
                }]
            
            # 情况二：常规视频下载（强制将选中视频格式 + 最佳音频组合下载并转码）
            else:
                # 组合语法：选中的视频 + 最佳音频
                ydl_opts['format'] = f"{req.format_id}+bestaudio/best"
                # 强制最终合并格式为 mp4
                ydl_opts['merge_output_format'] = 'mp4'
                # 核心修复：强制 FFmpeg 转换为 H.264(视频) + AAC(音频)，确保证浏览器能无缝播放
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
            
    # 每次下载前，自动清理一下 15 分钟以前的过期缓存
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
    
    # 状态检查：.done 标记不存在说明还在下载中
    if not os.path.exists(done_file):
        if request.method == "HEAD":
            return Response(status_code=202)
        raise HTTPException(status_code=404, detail="File not found or still downloading")
        
    # 精确匹配最终生成的 .mp4 或 .mp3 媒体文件
    file_path = None
    filename = None
    for ext in [".mp4", ".mp3"]:
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
                        safe_title = title.replace("/", "_").replace("\\", "_")
                        filename = f"{safe_title}{ext}"
            except Exception:
                pass
                
        # 如果是 HEAD 请求（前端用来轮询状态），只返回 200，先不执行删除
        if request.method == "GET":
            # 即用即焚机制：当文件开始流式传输给浏览器后，后台任务会在发送完自动干掉它们
            background_tasks.add_task(remove_file, file_path)
            background_tasks.add_task(remove_file, done_file)
            background_tasks.add_task(remove_file, title_file)
        return FileResponse(path=file_path, filename=filename)
            
    raise HTTPException(status_code=404, detail="File not found")