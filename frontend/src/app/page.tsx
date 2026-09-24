"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  Search,
  Download,
  Play,
  Pause,
  Clock,
  FileVideo,
  FileAudio,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clipboard,
  X,
  Zap,
  Film,
  Music,
  Globe,
  Radio,
  Share2,
  Volume2,
  VolumeX,
  Disc,
  ListMusic,
  SlidersHorizontal,
} from "lucide-react";

const rawBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
const BACKEND_URL = rawBackendUrl !== undefined
  ? rawBackendUrl.trim().replace(/^["']+|["']+$/g, "")
  : "http://127.0.0.1:8000";

interface Format {
  format_id: string;
  ext: string;
  resolution: string;
  filesize: number | null;
  format_note: string;
  height?: number;
  vcodec?: string;
  acodec?: string;
  fps?: number | null;
}

interface MediaInfo {
  title: string;
  thumbnail: string;
  duration: number;
  uploader?: string;
  extractor?: string;
  view_count?: number | null;
  formats: Format[];
}

interface MusicItem {
  id: string;
  song_name: string;
  singers: string;
  album: string;
  source: string;
  source_name: string;
  source_badge: string;
  ext: string;
  file_size: string;
  file_size_bytes: number | null;
  duration: string;
  duration_s: number;
  cover_url: string;
  download_url: string;
  has_lyric: boolean;
  song_info: any;
}

interface MusicSource {
  id: string;
  name: string;
  badge: string;
  desc: string;
  color: string;
  default: boolean;
}

const SUPPORTED_VIDEO_PLATFORMS = [
  { name: "YouTube", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: "▶" },
  { name: "Bilibili", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", icon: "📺" },
  { name: "TikTok", color: "bg-pink-500/10 text-pink-400 border-pink-500/20", icon: "🎵" },
  { name: "X (Twitter)", color: "bg-slate-400/10 text-slate-300 border-slate-400/20", icon: "𝕏" },
  { name: "Instagram", color: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20", icon: "📸" },
  { name: "Spotify", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: "🎧" },
  { name: "SoundCloud", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: "☁" },
];

const DEFAULT_MUSIC_SOURCES: MusicSource[] = [
  { id: "KuwoMusicClient", name: "酷我音乐", badge: "酷我", desc: "无损FLAC / 320K MP3", color: "emerald", default: true },
  { id: "NeteaseMusicClient", name: "网易云音乐", badge: "网易云", desc: "热门单曲、原创民谣", color: "rose", default: true },
  { id: "QQMusicClient", name: "QQ音乐", badge: "QQ音乐", desc: "海量主流正版曲库", color: "amber", default: false },
  { id: "KugouMusicClient", name: "酷狗音乐", badge: "酷狗", desc: "大众热门伴奏经典", color: "blue", default: false },
  { id: "MiguMusicClient", name: "咪咕音乐", badge: "咪咕", desc: "原声高保真品质", color: "pink", default: false },
  { id: "BilibiliMusicClient", name: "B站音频", badge: "Bilibili", desc: "二次元与同人翻唱", color: "cyan", default: false },
  { id: "BodianMusicClient", name: "波点音乐", badge: "波点", desc: "个性潮流轻量曲库", color: "purple", default: false },
];

const HOT_RECOMMENDATIONS = [
  "周杰伦 晴天",
  "陈奕迅 富士山下",
  "林俊杰 交换余生",
  "告白气球",
  "Taylor Swift",
  "七里香",
  "凤凰传奇 奢香夫人",
];

export default function Home() {
  // 主功能模式: 音乐搜歌 (music) 或 视频解析 (video)
  const [activeMode, setActiveMode] = useState<"music" | "video">("music");

  // ========= 视频解析模块状态 =========
  const [videoUrl, setVideoUrl] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [videoDownloadStatus, setVideoDownloadStatus] = useState<string>("");
  const [videoActiveTab, setVideoActiveTab] = useState<"video" | "audio">("video");
  const [showAllFormats, setShowAllFormats] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);

  // ========= 音乐搜歌下载模块状态 =========
  const [musicQuery, setMusicQuery] = useState("");
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState("");
  const [musicResults, setMusicResults] = useState<MusicItem[]>([]);
  const [musicSources, setMusicSources] = useState<MusicSource[]>(DEFAULT_MUSIC_SOURCES);
  const [selectedSources, setSelectedSources] = useState<string[]>(["KuwoMusicClient", "NeteaseMusicClient"]);
  const [musicDownloadingId, setMusicDownloadingId] = useState<string | null>(null);
  const [musicDownloadStatus, setMusicDownloadStatus] = useState<string>("");

  // ========= 在线试听播放器状态 =========
  const [currentTrack, setCurrentTrack] = useState<MusicItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 获取后端可用音乐源配置
  useEffect(() => {
    axios
      .get(`${BACKEND_URL}/api/music/sources`)
      .then((res) => {
        if (res.data?.sources && Array.isArray(res.data.sources)) {
          setMusicSources(res.data.sources);
        }
      })
      .catch(() => {
        // 后端离线时使用默认配置
      });
  }, []);

  // 监听视频 URL 自动识别平台
  useEffect(() => {
    if (!videoUrl) {
      setDetectedPlatform(null);
      return;
    }
    const lower = videoUrl.toLowerCase();
    if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
      setDetectedPlatform("YouTube");
    } else if (lower.includes("bilibili.com") || lower.includes("b23.tv")) {
      setDetectedPlatform("Bilibili");
    } else if (lower.includes("tiktok.com")) {
      setDetectedPlatform("TikTok");
    } else if (lower.includes("twitter.com") || lower.includes("x.com")) {
      setDetectedPlatform("X (Twitter)");
    } else if (lower.includes("instagram.com")) {
      setDetectedPlatform("Instagram");
    } else if (lower.includes("spotify.com")) {
      setDetectedPlatform("Spotify");
    } else {
      setDetectedPlatform(null);
    }
  }, [videoUrl]);

  // 音频播放控制
  const handleTogglePlay = (track: MusicItem) => {
    if (!audioRef.current) return;

    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    } else {
      // 切换新曲目
      setCurrentTrack(track);
      const streamUrl = `${BACKEND_URL}/api/music/stream?url=${encodeURIComponent(track.download_url)}`;
      audioRef.current.src = streamUrl;
      audioRef.current.load();
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.warn("Auto-play error:", e);
          setIsPlaying(false);
        });
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioProgress(audioRef.current.currentTime);
      setAudioDuration(audioRef.current.duration || 0);
    }
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setAudioProgress(val);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setAudioVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = audioVolume || 0.8;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  // 音乐平台筛选勾选切换
  const toggleSourceSelection = (sourceId: string) => {
    if (selectedSources.includes(sourceId)) {
      if (selectedSources.length === 1) return; // 至少保留一个平台
      setSelectedSources(selectedSources.filter((s) => s !== sourceId));
    } else {
      setSelectedSources([...selectedSources, sourceId]);
    }
  };

  // 执行音乐搜索
  const handleMusicSearch = async (keywordOverride?: string) => {
    const kw = (keywordOverride !== undefined ? keywordOverride : musicQuery).trim();
    if (!kw) return;
    if (keywordOverride) setMusicQuery(kw);

    setMusicLoading(true);
    setMusicError("");
    setMusicDownloadStatus("");

    try {
      const res = await axios.post(`${BACKEND_URL}/api/music/search`, {
        keyword: kw,
        sources: selectedSources,
        count_per_source: 4,
      });

      const list: MusicItem[] = res.data?.results || [];
      setMusicResults(list);
      if (list.length === 0) {
        setMusicError(`未在选中的平台中检索到 "${kw}"，可尝试勾选其他音乐平台。`);
      }
    } catch (err: any) {
      console.error("Music search error:", err);
      const detail = err.response?.data?.detail || err.message || "音乐搜索接口异常，请稍后重试。";
      setMusicError(detail);
    } finally {
      setMusicLoading(false);
    }
  };

  // 执行音乐下载（由后端处理 ID3 标签、歌词并打包）
  const handleDownloadMusic = async (track: MusicItem) => {
    setMusicDownloadingId(track.id);
    const title = `${track.singers} - ${track.song_name}`;
    setMusicDownloadStatus(`正在提交下载并准备抓取无损音轨 (${title})...`);

    try {
      const res = await axios.post(`${BACKEND_URL}/api/music/download`, {
        song_info: track.song_info,
        format: track.ext,
        title: title,
      });

      const taskId = res.data.task_id;
      setMusicDownloadStatus("服务器正在抓取高品质音频并写入封面与 ID3 歌词标签...");
      pollForMusicFile(taskId, track.id);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "发起下载任务失败，请检查网络或稍后重试。";
      setMusicError(msg);
      setMusicDownloadingId(null);
      setMusicDownloadStatus("");
    }
  };

  const pollForMusicFile = (taskId: string, trackId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts === 3) {
        setMusicDownloadStatus("正在写入元数据、歌词与无损封面封包，即将完成...");
      } else if (attempts === 6) {
        setMusicDownloadStatus("文件处理中，较大无损 FLAC 文件需稍候几秒...");
      }

      try {
        const res = await axios.head(`${BACKEND_URL}/api/file/${taskId}`);
        if (res.status === 200) {
          clearInterval(interval);
          setMusicDownloadStatus("✅ 音频封装完成！正在启动浏览器本地下载...");
          setTimeout(() => {
            window.location.href = `${BACKEND_URL}/api/file/${taskId}`;
            setMusicDownloadingId(null);
            setMusicDownloadStatus("");
          }, 800);
        }
      } catch (err: any) {
        if (err.response?.status === 500) {
          clearInterval(interval);
          setMusicError("下载处理失败：" + (err.response?.data?.detail || "内部错误"));
          setMusicDownloadingId(null);
          setMusicDownloadStatus("");
        }
      }
    }, 2000);

    setTimeout(() => {
      clearInterval(interval);
      if (musicDownloadingId === trackId) {
        setMusicDownloadingId(null);
        setMusicDownloadStatus("");
        setMusicError("下载等待超时（超过3分钟），请检查网络或重试。");
      }
    }, 3 * 60 * 1000);
  };

  // ========= 视频解析与下载方法 =========
  const handlePasteVideo = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setVideoUrl(text.trim());
    } catch {
      // Clipboard denied
    }
  };

  const handleVideoSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;

    setVideoLoading(true);
    setVideoError("");
    setMediaInfo(null);
    setDownloadingFormat(null);
    setVideoDownloadStatus("");

    try {
      const res = await axios.post(`${BACKEND_URL}/api/info`, { url: videoUrl.trim() });
      setMediaInfo(res.data);
      const hasVideo = res.data.formats?.some((f: Format) => f.resolution !== "audio only");
      setVideoActiveTab(hasVideo ? "video" : "audio");
    } catch (err: any) {
      console.error("Fetch media info error:", err);
      const detail =
        err.response?.data?.detail ||
        (err.response?.status
          ? `接口异常 (${err.response.status}): 请确认服务正常且未被重定向`
          : (err.message || "无法解析此链接，请确认链接有效并支持公开访问。"));
      setVideoError(detail);
    } finally {
      setVideoLoading(false);
    }
  };

  const handleDownloadVideo = async (formatId: string, formatLabel?: string) => {
    setDownloadingFormat(formatId);
    setVideoDownloadStatus(`正在提交下载任务 (${formatLabel || formatId})...`);

    try {
      const res = await axios.post(`${BACKEND_URL}/api/download`, {
        url: videoUrl.trim(),
        format_id: formatId,
        title: mediaInfo?.title,
      });
      const taskId = res.data.task_id;
      setVideoDownloadStatus("服务器正在抓取媒体流与音频音轨并转码合并...");
      pollForVideoFile(taskId);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "发起下载任务失败，请检查网络或稍后重试。";
      setVideoError(msg);
      setDownloadingFormat(null);
      setVideoDownloadStatus("");
    }
  };

  const pollForVideoFile = (taskId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts === 3) {
        setVideoDownloadStatus("正在使用 FFmpeg 合成高质量 MP4/MP3，即将完成...");
      } else if (attempts === 6) {
        setVideoDownloadStatus("转码流处理中，文件较大时需额外耗时，请稍候...");
      }

      try {
        const res = await axios.head(`${BACKEND_URL}/api/file/${taskId}`);
        if (res.status === 200) {
          clearInterval(interval);
          setVideoDownloadStatus("✅ 转码合成完毕！正在启动浏览器本地下载...");
          setTimeout(() => {
            window.location.href = `${BACKEND_URL}/api/file/${taskId}`;
            setDownloadingFormat(null);
            setVideoDownloadStatus("");
          }, 800);
        }
      } catch (err: any) {
        if (err.response?.status === 500) {
          clearInterval(interval);
          setVideoError("下载处理失败：" + (err.response?.data?.detail || "内部错误"));
          setDownloadingFormat(null);
          setVideoDownloadStatus("");
        }
      }
    }, 2500);

    setTimeout(() => {
      clearInterval(interval);
      if (downloadingFormat) {
        setDownloadingFormat(null);
        setVideoDownloadStatus("");
        setVideoError("下载等待超时（超过5分钟），请尝试选择较小分辨率或稍后再试。");
      }
    }, 5 * 60 * 1000);
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes || bytes <= 0) return "自动估算";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1000) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getQualityBadge = (format: Format) => {
    const h = format.height || 0;
    if (h >= 2160) return { label: "4K UHD", bg: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
    if (h >= 1440) return { label: "2K QHD", bg: "bg-purple-500/20 text-purple-300 border-purple-500/30" };
    if (h >= 1080) return { label: "1080p FHD", bg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" };
    if (h >= 720) return { label: "720p HD", bg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" };
    if (format.format_id.includes("mp3")) return { label: "320K HQ", bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
    return { label: format.resolution || "SD", bg: "bg-slate-700/40 text-slate-300 border-slate-600/30" };
  };

  const getSourceBadgeColor = (sourceId: string) => {
    if (sourceId.includes("Kuwo")) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    if (sourceId.includes("Netease")) return "bg-rose-500/20 text-rose-300 border-rose-500/30";
    if (sourceId.includes("QQ")) return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    if (sourceId.includes("Kugou")) return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    if (sourceId.includes("Migu")) return "bg-pink-500/20 text-pink-300 border-pink-500/30";
    if (sourceId.includes("Bilibili")) return "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
    return "bg-purple-500/20 text-purple-300 border-purple-500/30";
  };

  const videoFormats = mediaInfo?.formats.filter((f) => f.resolution !== "audio only") || [];
  const audioFormats = mediaInfo?.formats.filter((f) => f.resolution === "audio only") || [];

  return (
    <div className="relative min-h-screen bg-[#040812] text-slate-100 flex flex-col justify-between overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 隐藏式原生 Audio 标签 */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleAudioTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      {/* 顶部环境光背景光晕 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[520px] pointer-events-none opacity-45 overflow-hidden">
        <div className="absolute -top-[160px] left-1/4 w-[540px] h-[540px] bg-indigo-600/35 rounded-full blur-[130px] animate-pulse-glow" />
        <div
          className="absolute -top-[120px] right-1/4 w-[500px] h-[500px] bg-cyan-500/30 rounded-full blur-[140px] animate-pulse-glow"
          style={{ animationDelay: "3.5s" }}
        />
        <div
          className="absolute top-[180px] left-1/2 -translate-x-1/2 w-[420px] h-[420px] bg-emerald-500/20 rounded-full blur-[150px] animate-pulse-glow"
          style={{ animationDelay: "5s" }}
        />
      </div>

      {/* 顶部导航 */}
      <header className="relative z-20 border-b border-white/5 backdrop-blur-xl bg-slate-950/60 sticky top-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-cyan-400 to-emerald-400 p-[1px] shadow-lg shadow-indigo-500/25">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                <Music className="w-5 h-5 text-cyan-400 animate-pulse" />
              </div>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Universal Downloader
              </span>
              <span className="ml-2 text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                PRO 3.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 border border-white/10 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>双引擎就绪 (MusicDL + yt-dlp)</span>
            </div>
          </div>
        </div>
      </header>

      {/* 主要内容区域 */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-10 flex-1 flex flex-col items-center w-full">
        {/* 顶部主模式切换按钮 (音乐搜歌 vs 视频解析) */}
        <div className="inline-flex p-1.5 rounded-2xl bg-slate-900/90 border border-slate-700/60 shadow-xl backdrop-blur-2xl mb-8">
          <button
            type="button"
            onClick={() => setActiveMode("music")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeMode === "music"
                ? "bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 text-white shadow-lg shadow-cyan-600/30 scale-102"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <Music className="w-4 h-4 text-emerald-300" />
            <span>全网音乐下载 (musicdl)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 font-mono">
              NEW
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode("video")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeMode === "video"
                ? "bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-600/30 scale-102"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <Film className="w-4 h-4 text-indigo-300" />
            <span>视频/流媒体解析</span>
          </button>
        </div>

        {/* ===================== 音乐搜索模块 ===================== */}
        {activeMode === "music" && (
          <div className="w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-400">
            {/* 标头介绍 */}
            <div className="text-center max-w-2xl mx-auto mb-8 space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/20 text-cyan-300 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                无损 FLAC 音频 • 在线极速试听 • 自动写入 ID3 与歌词封面
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
                全网高品质音乐
                <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-300 bg-clip-text text-transparent">
                  {" "}极速搜索下载
                </span>
              </h1>
              <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
                无需链接，直接输入歌名或歌手。聚合酷我、网易云、QQ音乐、酷狗、咪咕等多平台高解析音源。
              </p>
            </div>

            {/* 音乐搜索平台筛选器 */}
            <div className="w-full max-w-3xl mb-5 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                检索源平台:
              </span>
              {musicSources.map((source) => {
                const isSelected = selectedSources.includes(source.id);
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => toggleSourceSelection(source.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-cyan-500/20 text-cyan-200 border-cyan-400/50 shadow-sm shadow-cyan-500/20 scale-102"
                        : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-300 hover:border-slate-700"
                    }`}
                    title={source.desc}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-cyan-400" : "bg-slate-600"}`} />
                    <span>{source.name}</span>
                  </button>
                );
              })}
            </div>

            {/* 音乐搜索输入框 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleMusicSearch();
              }}
              className="w-full max-w-3xl relative group mb-5"
            >
              <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 rounded-2xl blur-lg opacity-35 group-hover:opacity-65 transition duration-500" />
              <div className="relative flex flex-col sm:flex-row items-center bg-slate-900/90 border border-slate-700/60 rounded-2xl p-2 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center w-full px-3 py-2 sm:py-0">
                  <div className="text-slate-400 mr-3">
                    <Search className="w-5 h-5 text-cyan-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={musicQuery}
                    onChange={(e) => setMusicQuery(e.target.value)}
                    placeholder="输入歌名、歌手或音乐关键词 (如: 周杰伦 晴天, 富士山下...)"
                    className="w-full bg-transparent text-white placeholder-slate-500 text-sm sm:text-base focus:outline-none py-2"
                  />
                  {musicQuery && (
                    <button
                      type="button"
                      onClick={() => setMusicQuery("")}
                      className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors mr-1 cursor-pointer"
                      title="清空"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={musicLoading || !musicQuery.trim()}
                  className="w-full sm:w-auto mt-2 sm:mt-0 px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 via-teal-500 to-emerald-500 hover:from-cyan-500 hover:to-emerald-400 text-white font-medium text-sm transition-all shadow-lg shadow-cyan-600/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-98"
                >
                  {musicLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      全网搜歌中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      立即搜歌
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* 热门歌曲推荐点击词条 */}
            <div className="w-full max-w-3xl flex flex-wrap items-center gap-2 mb-8 text-xs text-slate-400">
              <span className="flex items-center gap-1 text-slate-500">
                <Disc className="w-3.5 h-3.5 text-cyan-400" />
                热门搜索:
              </span>
              {HOT_RECOMMENDATIONS.map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => handleMusicSearch(kw)}
                  className="px-2.5 py-1 rounded-md bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                >
                  {kw}
                </button>
              ))}
            </div>

            {/* 错误提示 */}
            {musicError && (
              <div className="w-full max-w-3xl mb-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-medium text-rose-200">提示：</span> {musicError}
                </div>
                <button onClick={() => setMusicError("")} className="text-rose-400 hover:text-rose-200 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 下载状态横幅 */}
            {musicDownloadStatus && (
              <div className="w-full max-w-3xl mb-8 p-4 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 flex items-center gap-3 text-sm animate-in fade-in duration-300">
                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />
                <div className="flex-1 font-medium">{musicDownloadStatus}</div>
              </div>
            )}

            {/* 搜索结果展示 */}
            {musicResults.length > 0 && (
              <div className="w-full max-w-4xl space-y-4 mb-16 animate-in fade-in slide-in-from-bottom-6 duration-500">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <ListMusic className="w-5 h-5 text-cyan-400" />
                    <h2 className="text-lg font-bold text-white">搜索结果 ({musicResults.length} 首)</h2>
                  </div>
                  <span className="text-xs text-slate-400">支持直接试听与高品质一键下载</span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {musicResults.map((song) => {
                    const isCurrent = currentTrack?.id === song.id;
                    const isThisPlaying = isCurrent && isPlaying;
                    const isDownloading = musicDownloadingId === song.id;
                    const isFlac = song.ext.toLowerCase() === "flac";

                    return (
                      <div
                        key={song.id}
                        className={`p-4 rounded-2xl glass-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-300 border ${
                          isThisPlaying
                            ? "border-cyan-500/50 bg-slate-900/90 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/30"
                            : "border-white/5 hover:border-slate-700"
                        }`}
                      >
                        {/* 左侧：封面与歌曲信息 */}
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          {/* 封面 + 悬浮播放按钮 */}
                          <div
                            onClick={() => handleTogglePlay(song)}
                            className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-slate-800 shrink-0 cursor-pointer group shadow-md"
                          >
                            {song.cover_url ? (
                              <img
                                src={song.cover_url}
                                alt={song.song_name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  // 图片加载失败时隐藏并显示占位
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                            ) : null}
                            <div
                              className={`absolute inset-0 flex items-center justify-center transition-all ${
                                isThisPlaying
                                  ? "bg-cyan-950/70 opacity-100"
                                  : "bg-black/40 opacity-0 group-hover:opacity-100"
                              }`}
                            >
                              {isThisPlaying ? (
                                <Pause className="w-6 h-6 text-cyan-400 fill-cyan-400 animate-pulse" />
                              ) : (
                                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                              )}
                            </div>
                          </div>

                          {/* 歌曲详情 */}
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSourceBadgeColor(
                                  song.source
                                )}`}
                              >
                                {song.source_badge}
                              </span>

                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  isFlac
                                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                    : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                                }`}
                              >
                                {isFlac ? "FLAC 无损" : song.ext.toUpperCase()}
                              </span>

                              <span className="text-xs text-slate-400 font-mono">{song.file_size}</span>
                            </div>

                            <h3 className="font-bold text-sm sm:text-base text-white truncate" title={song.song_name}>
                              {song.song_name}
                            </h3>

                            <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
                              <span className="text-slate-300 truncate">{song.singers}</span>
                              {song.album && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-400 truncate">{song.album}</span>
                                </>
                              )}
                              {song.duration && song.duration !== "00:00" && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-0.5 text-slate-500 font-mono">
                                    <Clock className="w-3 h-3" />
                                    {song.duration}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 右侧：试听与下载操作按钮 */}
                        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                          {/* 试听按钮 */}
                          <button
                            type="button"
                            onClick={() => handleTogglePlay(song)}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              isThisPlaying
                                ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30"
                                : "bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60"
                            }`}
                          >
                            {isThisPlaying ? (
                              <>
                                <Pause className="w-3.5 h-3.5 fill-current" />
                                <span>暂停</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>试听</span>
                              </>
                            )}
                          </button>

                          {/* 下载按钮 */}
                          <button
                            type="button"
                            disabled={isDownloading || musicDownloadingId !== null}
                            onClick={() => handleDownloadMusic(song)}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95"
                          >
                            {isDownloading ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>下载中</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" />
                                <span>下载{isFlac ? "无损" : ""}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== 视频/流媒体解析模块 ===================== */}
        {activeMode === "video" && (
          <div className="w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-400">
            {/* 标头介绍 */}
            <div className="text-center max-w-2xl mx-auto mb-10 space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-indigo-500/10 to-cyan-500/10 border border-indigo-500/20 text-indigo-300 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                支持多音轨合并 • 4K 无损画质 • 320kbps MP3 提取
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
                全网多媒体
                <span className="bg-gradient-to-r from-indigo-400 via-cyan-300 to-teal-300 bg-clip-text text-transparent">
                  {" "}极速解析下载
                </span>
              </h1>
              <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
                粘贴视频、音乐或播客链接，秒级解析最高分辨率格式并直接转码保存至本地。
              </p>
            </div>

            {/* 平台标签栏 */}
            <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-3xl">
              {SUPPORTED_VIDEO_PLATFORMS.map((platform) => (
                <div
                  key={platform.name}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                    detectedPlatform === platform.name
                      ? "ring-2 ring-indigo-500 bg-indigo-500/20 text-white border-indigo-400 scale-105"
                      : platform.color
                  }`}
                >
                  <span>{platform.icon}</span>
                  <span>{platform.name}</span>
                </div>
              ))}
            </div>

            {/* 搜索与输入框表单 */}
            <form onSubmit={handleVideoSearch} className="w-full max-w-3xl relative group mb-10">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-cyan-500 to-indigo-500 rounded-2xl blur-lg opacity-30 group-hover:opacity-60 transition duration-500" />
              <div className="relative flex flex-col sm:flex-row items-center bg-slate-900/90 border border-slate-700/60 rounded-2xl p-2 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center w-full px-3 py-2 sm:py-0">
                  <div className="text-slate-400 mr-3">
                    <Search className="w-5 h-5 text-indigo-400" />
                  </div>
                  <input
                    type="url"
                    required
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="粘贴视频链接 (如 https://www.youtube.com/watch?v=... 或 Bilibili/TikTok)"
                    className="w-full bg-transparent text-white placeholder-slate-500 text-sm sm:text-base focus:outline-none py-2"
                  />
                  {videoUrl && (
                    <button
                      type="button"
                      onClick={() => setVideoUrl("")}
                      className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors mr-1 cursor-pointer"
                      title="清空"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePasteVideo}
                    className="hidden sm:flex items-center gap-1 text-xs text-indigo-300 hover:text-white bg-indigo-500/15 hover:bg-indigo-500/30 border border-indigo-500/30 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                    title="粘贴剪贴板链接"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                    粘贴
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={videoLoading || !videoUrl.trim()}
                  className="w-full sm:w-auto mt-2 sm:mt-0 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-98"
                >
                  {videoLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      正在解析...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      立即解析
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* 错误提示 */}
            {videoError && (
              <div className="w-full max-w-3xl mb-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-medium text-rose-200">解析遇到问题：</span> {videoError}
                </div>
                <button onClick={() => setVideoError("")} className="text-rose-400 hover:text-rose-200 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 正在下载状态横幅 */}
            {videoDownloadStatus && (
              <div className="w-full max-w-3xl mb-8 p-4 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 flex items-center gap-3 text-sm animate-in fade-in duration-300">
                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />
                <div className="flex-1 font-medium">{videoDownloadStatus}</div>
              </div>
            )}

            {/* 解析结果卡片 */}
            {mediaInfo && (
              <div className="w-full max-w-4xl glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/10 animate-in fade-in slide-in-from-bottom-6 duration-500 mb-12">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* 左侧：封面与媒体信息 */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-xl group">
                      {mediaInfo.thumbnail ? (
                        <img
                          src={mediaInfo.thumbnail}
                          alt={mediaInfo.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-900">
                          <Film className="w-16 h-16 opacity-30" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                        <span className="text-xs text-slate-300 font-medium line-clamp-1">
                          {mediaInfo.uploader || "Universal Stream"}
                        </span>
                      </div>
                      {mediaInfo.duration > 0 && (
                        <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-black/80 backdrop-blur-md rounded-md text-xs font-semibold flex items-center gap-1.5 text-white border border-white/10">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          {formatDuration(mediaInfo.duration)}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {mediaInfo.extractor && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {mediaInfo.extractor}
                          </span>
                        )}
                        {mediaInfo.uploader && (
                          <span className="text-xs text-slate-400 flex items-center gap-1 truncate">
                            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                            {mediaInfo.uploader}
                          </span>
                        )}
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-white leading-snug line-clamp-2" title={mediaInfo.title}>
                        {mediaInfo.title}
                      </h2>
                    </div>
                  </div>

                  {/* 右侧：下载格式选择 Tabs */}
                  <div className="lg:col-span-7 flex flex-col justify-between">
                    <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900/80 border border-slate-800 mb-6 w-fit">
                      <button
                        type="button"
                        onClick={() => setVideoActiveTab("video")}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                          videoActiveTab === "video"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <FileVideo className="w-4 h-4" />
                        视频下载 ({videoFormats.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoActiveTab("audio")}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                          videoActiveTab === "audio"
                            ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <FileAudio className="w-4 h-4" />
                        提取音频 ({audioFormats.length})
                      </button>
                    </div>

                    {/* 视频列表 */}
                    {videoActiveTab === "video" && (
                      <div className="space-y-3 flex-1">
                        {videoFormats.length === 0 ? (
                          <div className="py-12 text-center text-slate-500 text-sm">
                            未检测到单独视频流，请尝试“提取音频”选项卡。
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {(showAllFormats ? videoFormats : videoFormats.slice(0, 6)).map((format) => {
                              const badge = getQualityBadge(format);
                              const isDownloading = downloadingFormat === format.format_id;
                              return (
                                <div
                                  key={format.format_id}
                                  className="p-3 rounded-xl glass-card flex items-center justify-between transition-all group"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.bg}`}>
                                        {badge.label}
                                      </span>
                                      <span className="text-xs font-semibold text-white">
                                        {(format.ext || "mp4").toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-400">
                                      {formatSize(format.filesize)}
                                      {format.fps ? ` • ${format.fps}fps` : ""}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={downloadingFormat !== null}
                                    onClick={() => handleDownloadVideo(format.format_id, badge.label)}
                                    className="px-3.5 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
                                  >
                                    {isDownloading ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>转码中</span>
                                      </>
                                    ) : (
                                      <>
                                        <Download className="w-3.5 h-3.5" />
                                        <span>下载</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 音频列表 */}
                    {videoActiveTab === "audio" && (
                      <div className="space-y-3 flex-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {audioFormats.map((format) => {
                            const badge = getQualityBadge(format);
                            const isDownloading = downloadingFormat === format.format_id;
                            return (
                              <div
                                key={format.format_id}
                                className="p-3 rounded-xl glass-card flex items-center justify-between transition-all group"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.bg}`}>
                                      {badge.label}
                                    </span>
                                    <span className="text-xs font-semibold text-white">
                                      {(format.ext || "mp3").toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {format.format_note || "高保真音频"} • {formatSize(format.filesize)}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  disabled={downloadingFormat !== null}
                                  onClick={() => handleDownloadVideo(format.format_id, badge.label)}
                                  className="px-3.5 py-2 rounded-lg bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
                                >
                                  {isDownloading ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>提取中</span>
                                    </>
                                  ) : (
                                    <>
                                      <Music className="w-3.5 h-3.5" />
                                      <span>提取</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 展开全部格式按钮 */}
                    {videoActiveTab === "video" && videoFormats.length > 6 && (
                      <div className="mt-4 pt-4 border-t border-white/5 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowAllFormats(!showAllFormats)}
                          className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 px-4 py-1.5 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all cursor-pointer"
                        >
                          {showAllFormats ? (
                            <>
                              收起多余选项 <ChevronUp className="w-3.5 h-3.5" />
                            </>
                          ) : (
                            <>
                              展开更多分辨率 ({videoFormats.length - 6} 个选项){" "}
                              <ChevronDown className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 底部特性优势介绍 */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-white/5 mt-8">
          <div className="p-5 rounded-2xl glass-card space-y-2">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
              <Disc className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-white">MusicDL 全网音乐聚合</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              集成酷我、网易云、QQ音乐等聚合接口，一键检索并下载无损 FLAC 音频，智能嵌入 ID3 专辑图与歌词。
            </p>
          </div>

          <div className="p-5 rounded-2xl glass-card space-y-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Film className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-white">4K 原画与流媒体转码</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              支持 YouTube、Bilibili、TikTok 等全平台解析，采用多线程并发与 FFmpeg 硬件加速合成无损画质。
            </p>
          </div>

          <div className="p-5 rounded-2xl glass-card space-y-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-white">即开即听 • 隐私纯净</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              内置低延迟流式试听播放器，无需等待全量下载即可预览；文件下载后自动清理缓存，无数据留存。
            </p>
          </div>
        </div>
      </main>

      {/* 底部全局固定音频试听播放条 */}
      {currentTrack && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 bg-slate-950/90 backdrop-blur-2xl border-t border-cyan-500/30 shadow-2xl animate-in slide-in-from-bottom duration-300">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* 歌曲信息 */}
            <div className="flex items-center gap-3 w-full sm:w-1/3 min-w-0">
              <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-slate-800 shrink-0 shadow-md">
                {currentTrack.cover_url ? (
                  <img src={currentTrack.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Disc className={`w-full h-full p-2 text-cyan-400 ${isPlaying ? "animate-spin" : ""}`} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white truncate">{currentTrack.song_name}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${getSourceBadgeColor(currentTrack.source)}`}>
                    {currentTrack.source_badge}
                  </span>
                </div>
                <div className="text-xs text-slate-400 truncate">{currentTrack.singers}</div>
              </div>
            </div>

            {/* 播放与进度条 */}
            <div className="flex flex-col items-center gap-1.5 w-full sm:w-1/2">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => handleTogglePlay(currentTrack)}
                  className="w-9 h-9 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center hover:bg-cyan-400 shadow-md shadow-cyan-500/25 transition-all cursor-pointer active:scale-95"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-slate-950" />
                  ) : (
                    <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
                  )}
                </button>
              </div>

              <div className="w-full flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span>{formatDuration(Math.floor(audioProgress))}</span>
                <input
                  type="range"
                  min={0}
                  max={audioDuration || 100}
                  value={audioProgress}
                  onChange={handleAudioSeek}
                  className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <span>{formatDuration(Math.floor(audioDuration))}</span>
              </div>
            </div>

            {/* 音量与快速下载 */}
            <div className="flex items-center justify-end gap-3 w-full sm:w-1/3">
              <div className="hidden md:flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : audioVolume}
                  onChange={handleVolumeChange}
                  className="w-18 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <button
                type="button"
                disabled={musicDownloadingId !== null}
                onClick={() => handleDownloadMusic(currentTrack)}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 shadow-md shadow-emerald-600/25 transition-all cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下载</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (audioRef.current) audioRef.current.pause();
                  setIsPlaying(false);
                  setCurrentTrack(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="关闭播放器"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 底部版权 */}
      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-xs text-slate-500 mb-12 sm:mb-0">
        <p>© 2026 Universal Media & Music Downloader • Powered by FastAPI, Next.js & musicdl</p>
      </footer>
    </div>
  );
}
