from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp
import os
import uuid
import subprocess
import json
import sys
from typing import Optional, List
import time
import requests
import shutil

from musicdl.musicdl import MusicClient
from musicdl.modules.utils.data import SongInfo

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

# 支持的音乐平台列表定义
AVAILABLE_MUSIC_SOURCES = [
    {
        "id": "KuwoMusicClient",
        "name": "酷我音乐",
        "badge": "酷我",
        "desc": "无损FLAC / 320K MP3，高命中率",
        "color": "emerald",
        "default": True,
    },
    {
        "id": "NeteaseMusicClient",
        "name": "网易云音乐",
        "badge": "网易云",
        "desc": "海量热门曲目，高品质音源",
        "color": "rose",
        "default": True,
    },
    {
        "id": "QQMusicClient",
        "name": "QQ音乐",
        "badge": "QQ音乐",
        "desc": "官方主流曲库，经典流行",
        "color": "amber",
        "default": False,
    },
    {
        "id": "KugouMusicClient",
        "name": "酷狗音乐",
        "badge": "酷狗",
        "desc": "海量大众伴奏与热门单曲",
        "color": "blue",
        "default": False,
    },
    {
        "id": "MiguMusicClient",
        "name": "咪咕音乐",
        "badge": "咪咕",
        "desc": "原声品质，支持部分特有版权",
        "color": "pink",
        "default": False,
    },
    {
        "id": "BilibiliMusicClient",
        "name": "B站音频",
        "badge": "Bilibili",
        "desc": "二次元、同人与独立翻唱",
        "color": "cyan",
        "default": False,
    },
    {
        "id": "BodianMusicClient",
        "name": "波点音乐",
        "badge": "波点",
        "desc": "个性潮流与轻量曲库",
        "color": "purple",
        "default": False,
    },
]

SOURCE_NAME_MAP = {s["id"]: s["name"] for s in AVAILABLE_MUSIC_SOURCES}
SOURCE_BADGE_MAP = {s["id"]: s["badge"] for s in AVAILABLE_MUSIC_SOURCES}

class MusicSearchRequest(BaseModel):
    keyword: str
    sources: Optional[List[str]] = None
    count_per_source: Optional[int] = 5

class MusicDownloadRequest(BaseModel):
    song_info: dict
    format: Optional[str] = None
    title: Optional[str] = None

@app.get("/api/music/sources")
def get_music_sources():
    return {"sources": AVAILABLE_MUSIC_SOURCES}

@app.post("/api/music/search")
def search_music(req: MusicSearchRequest):
    keyword = req.keyword.strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="搜索关键词不能为空")
        
    selected_sources = req.sources or [s["id"] for s in AVAILABLE_MUSIC_SOURCES if s["default"]]
    valid_sources = [s for s in selected_sources if s in SOURCE_NAME_MAP]
    if not valid_sources:
        valid_sources = ["KuwoMusicClient", "NeteaseMusicClient"]
        
    count = max(1, min(req.count_per_source or 5, 10))
    
    init_cfg = {
        s: {
            "work_dir": os.path.abspath(DOWNLOAD_DIR),
            "search_size_per_source": count,
            "disable_print": True
        } for s in valid_sources
    }
    
    try:
        client = MusicClient(music_sources=valid_sources, init_music_clients_cfg=init_cfg)
        raw_results = client.search(keyword)
        
        flat_results = []
        for source_id, songs in raw_results.items():
            for song in songs:
                if not isinstance(song, SongInfo):
                    continue
                song_dict = song.todict()
                song_id = f"{source_id}_{song.song_name}_{song.identifier or uuid.uuid4().hex[:8]}"
                flat_results.append({
                    "id": song_id,
                    "song_name": song.song_name or "未知歌曲",
                    "singers": song.singers or "未知歌手",
                    "album": song.album or "",
                    "source": source_id,
                    "source_name": SOURCE_NAME_MAP.get(source_id, source_id.replace("MusicClient", "")),
                    "source_badge": SOURCE_BADGE_MAP.get(source_id, source_id.replace("MusicClient", "")),
                    "ext": (song.ext or "mp3").removeprefix(".").lower(),
                    "file_size": song.file_size or "未知大小",
                    "file_size_bytes": song.file_size_bytes,
                    "duration": song.duration or "00:00",
                    "duration_s": song.duration_s or 0,
                    "cover_url": song.cover_url or "",
                    "download_url": song.download_url if isinstance(song.download_url, str) else "",
                    "has_lyric": bool(song.lyric),
                    "song_info": song_dict,
                })
                
        return {
            "keyword": keyword,
            "total": len(flat_results),
            "results": flat_results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"音乐搜索发生异常: {str(e)}")

@app.post("/api/music/download")
async def download_music(req: MusicDownloadRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    song_dict = req.song_info
    
    title = req.title
    if not title:
        song_name = song_dict.get("song_name") or "Track"
        singers = song_dict.get("singers") or ""
        title = f"{singers} - {song_name}" if singers else song_name
        
    with open(os.path.join(DOWNLOAD_DIR, f"{task_id}.title"), "w", encoding="utf-8") as f:
        f.write(title)
        
    def music_download_task():
        try:
            song_obj = SongInfo.fromdict(song_dict)
            source = song_obj.source or "KuwoMusicClient"
            ext = (song_obj.ext or "mp3").removeprefix(".")
            
            target_path = os.path.abspath(os.path.join(DOWNLOAD_DIR, f"{task_id}.{ext}"))
            song_obj._save_path = target_path
            song_obj.work_dir = os.path.abspath(DOWNLOAD_DIR)
            
            init_cfg = {
                source: {
                    "work_dir": os.path.abspath(DOWNLOAD_DIR),
                    "disable_print": True
                }
            }
            client = MusicClient(music_sources=[source], init_music_clients_cfg=init_cfg)
            dl_res = client.download([song_obj])
            
            # 容错：如果保存路径与预期稍有差异，自动修正并移动
            if not os.path.exists(target_path) and dl_res:
                actual_path = dl_res[0].save_path
                if os.path.exists(actual_path):
                    shutil.move(actual_path, target_path)
                    
            if not os.path.exists(target_path):
                # 再次扫描 downloads 文件夹看是否有以此 task_id 命名的文件
                for f in os.listdir(DOWNLOAD_DIR):
                    if f.startswith(task_id) and not f.endswith((".done", ".title", ".error", ".lrc")):
                        shutil.move(os.path.join(DOWNLOAD_DIR, f), target_path)
                        break
                        
            if not os.path.exists(target_path):
                raise Exception("音乐下载执行完成，但目标音频文件未在预期位置找到")
                
            open(os.path.join(DOWNLOAD_DIR, f"{task_id}.done"), "w").close()
            print(f"MusicDL 下载任务成功完成: {task_id} -> {target_path}")
        except Exception as e:
            print(f"MusicDL 下载任务异常: {e}")
            with open(os.path.join(DOWNLOAD_DIR, f"{task_id}.error"), "w", encoding="utf-8") as ef:
                ef.write(str(e))
                
    cleanup_old_files()
    background_tasks.add_task(music_download_task)
    return {"task_id": task_id, "status": "started"}

@app.get("/api/music/stream")
def stream_music(url: str, request: Request):
    if not url or not url.startswith("http"):
        raise HTTPException(status_code=400, detail="无效的音频流播放地址")
        
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    if "kuwo.cn" in url:
        req_headers["Referer"] = "http://www.kuwo.cn"
    elif "163.com" in url or "126.net" in url:
        req_headers["Referer"] = "https://music.163.com/"
    elif "qq.com" in url:
        req_headers["Referer"] = "https://y.qq.com/"
        
    range_header = request.headers.get("range")
    if range_header:
        req_headers["Range"] = range_header
        
    try:
        resp = requests.get(url, headers=req_headers, stream=True, timeout=15)
        
        response_headers = {
            "Content-Type": resp.headers.get("Content-Type", "audio/mpeg"),
            "Accept-Ranges": "bytes",
        }
        if "Content-Length" in resp.headers:
            response_headers["Content-Length"] = resp.headers["Content-Length"]
        if "Content-Range" in resp.headers:
            response_headers["Content-Range"] = resp.headers["Content-Range"]
            
        def iter_stream():
            for chunk in resp.iter_content(chunk_size=64 * 1024):
                if chunk:
                    yield chunk

        status_code = resp.status_code if resp.status_code in [200, 206] else 200
        return StreamingResponse(iter_stream(), status_code=status_code, headers=response_headers)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"试听音频流转发失败: {str(e)}")

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

    # 尝试使用 musicdl 解析音乐链接（支持网易云、QQ音乐、酷我、酷狗等链接）
    music_domains = ["music.163.com", "y.qq.com", "kuwo.cn", "kugou.com", "bodian.kuwo.cn"]
    if any(domain in req.url for domain in music_domains):
        try:
            init_cfg = {s["id"]: {"work_dir": os.path.abspath(DOWNLOAD_DIR), "disable_print": True} for s in AVAILABLE_MUSIC_SOURCES}
            client = MusicClient(init_music_clients_cfg=init_cfg)
            
            # 1. 尝试歌单解析
            song_infos = client.parseplaylist(req.url)
            if song_infos:
                song = song_infos[0]
                ext = (song.ext or "flac").removeprefix(".").lower()
                formats = [{
                    "format_id": f"musicdl_{song.source}_{ext}",
                    "ext": ext,
                    "resolution": "audio only",
                    "filesize": song.file_size_bytes,
                    "format_note": f"{song.source.replace('MusicClient', '')} ({ext.upper()} {song.file_size or ''})",
                    "vcodec": "none",
                    "acodec": ext,
                    "height": 0
                }]
                return {
                    "title": f"{song.song_name} - {song.singers}",
                    "thumbnail": song.cover_url or "",
                    "duration": song.duration_s or 0,
                    "uploader": song.singers or "",
                    "extractor": song.source.replace("MusicClient", "").lower(),
                    "formats": formats
                }

            # 2. 尝试单曲链接识别并精准检索 (网易云 & QQ音乐)
            song_query = None
            if "music.163.com" in req.url:
                import re
                match = re.search(r"id=(\d+)", req.url)
                if match:
                    song_id = match.group(1)
                    r = requests.get(f"https://music.163.com/api/song/detail/?id={song_id}&ids=[{song_id}]", headers={"User-Agent": "Mozilla/5.0"}, timeout=5).json()
                    if r.get("songs"):
                        s = r["songs"][0]
                        singers = ", ".join([a.get("name", "") for a in s.get("artists", [])])
                        song_query = f"{s.get('name', '')} {singers}".strip()
            elif "y.qq.com" in req.url:
                import re
                match = re.search(r"songDetail/([a-zA-Z0-9]+)", req.url)
                if match:
                    mid = match.group(1)
                    r = requests.get(f"https://u.y.qq.com/cgi-bin/musicu.fcg?data=%7B%22songinfo%22%3A%7B%22method%22%3A%22get_song_detail_yqq%22%2C%22param%22%3A%7B%22song_mid%22%3A%22{mid}%22%7D%2C%22module%22%3A%22music.pf_song_detail_svr%22%7D%7D", headers={"User-Agent": "Mozilla/5.0"}, timeout=5).json()
                    track = r.get("songinfo", {}).get("data", {}).get("track_info", {})
                    if track.get("name"):
                        singers = ", ".join([s.get("name", "") for s in track.get("singer", [])])
                        song_query = f"{track.get('name')} {singers}".strip()

            if song_query:
                res = client.search(song_query)
                all_found = []
                for ms in ["KuwoMusicClient", "NeteaseMusicClient"]:
                    all_found.extend(res.get(ms, []))
                if all_found:
                    best = all_found[0]
                    ext = (best.ext or "flac").removeprefix(".").lower()
                    return {
                        "title": f"{best.song_name} - {best.singers}",
                        "thumbnail": best.cover_url or "",
                        "duration": best.duration_s or 0,
                        "uploader": best.singers or "",
                        "extractor": best.source.replace("MusicClient", "").lower(),
                        "formats": [{
                            "format_id": f"musicdl_{best.source}_{ext}",
                            "ext": ext,
                            "resolution": "audio only",
                            "filesize": best.file_size_bytes,
                            "format_note": f"{best.source.replace('MusicClient', '')} ({ext.upper()} {best.file_size or ''})",
                            "vcodec": "none",
                            "acodec": ext,
                            "height": 0
                        }]
                    }
        except Exception:
            pass  # 若解析失败，则回退到 yt-dlp
                
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
            # 特殊情况 1：如果是 musicdl 链接下载
            if req.format_id.startswith("musicdl_"):
                init_cfg = {s["id"]: {"work_dir": os.path.abspath(DOWNLOAD_DIR), "disable_print": True} for s in AVAILABLE_MUSIC_SOURCES}
                client = MusicClient(init_music_clients_cfg=init_cfg)
                song_infos = client.parseplaylist(req.url)
                if song_infos:
                    song = song_infos[0]
                    ext = (song.ext or "flac").removeprefix(".")
                    target_path = os.path.abspath(os.path.join(DOWNLOAD_DIR, f"{task_id}.{ext}"))
                    song._save_path = target_path
                    song.work_dir = os.path.abspath(DOWNLOAD_DIR)
                    client.download([song])
                    if not os.path.exists(target_path):
                        for f in os.listdir(DOWNLOAD_DIR):
                            if f.startswith(task_id) and not f.endswith((".done", ".title", ".error", ".lrc")):
                                shutil.move(os.path.join(DOWNLOAD_DIR, f), target_path)
                                break
                    open(os.path.join(DOWNLOAD_DIR, f"{task_id}.done"), 'w').close()
                    print(f"MusicDL URL 异步下载完成: {task_id}")
                    return

            # 特殊情况 2：如果是 Spotify
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
            
            # 特殊情况 3：如果是高音质 MP3 请求
            if req.format_id == "bestaudio_mp3":
                ydl_opts['format'] = 'bestaudio/best'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '320',
                }]
            
            # 特殊情况 4：常规视频下载（强制将选中视频格式 + 最佳音频组合下载并转码为通用 mp4）
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
        
    # 精确匹配最终生成的媒体文件（包含无损 FLAC、WAV 等）
    file_path = None
    filename = None
    for ext in [".mp4", ".mp3", ".flac", ".wav", ".webm", ".m4a", ".aac", ".ogg"]:
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