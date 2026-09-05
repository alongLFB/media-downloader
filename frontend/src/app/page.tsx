"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import {
  Search,
  Download,
  Play,
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
} from "lucide-react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL !== undefined
    ? process.env.NEXT_PUBLIC_BACKEND_URL
    : typeof window !== "undefined"
    ? ""
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

const SUPPORTED_PLATFORMS = [
  { name: "YouTube", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: "▶" },
  { name: "Bilibili", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", icon: "📺" },
  { name: "TikTok", color: "bg-pink-500/10 text-pink-400 border-pink-500/20", icon: "🎵" },
  { name: "X (Twitter)", color: "bg-slate-400/10 text-slate-300 border-slate-400/20", icon: "𝕏" },
  { name: "Instagram", color: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20", icon: "📸" },
  { name: "Spotify", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: "🎧" },
  { name: "SoundCloud", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: "☁" },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"video" | "audio">("video");
  const [showAllFormats, setShowAllFormats] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // 监听 URL 变化自动识别平台
  useEffect(() => {
    if (!url) {
      setDetectedPlatform(null);
      return;
    }
    const lower = url.toLowerCase();
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
  }, [url]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
      }
    } catch {
      // Clipboard permissions denied
    }
  };

  const handleClear = () => {
    setUrl("");
    setError("");
    setMediaInfo(null);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");
    setMediaInfo(null);
    setDownloadingFormat(null);
    setDownloadStatus("");

    try {
      const res = await axios.post(`${BACKEND_URL}/api/info`, { url: url.trim() });
      setMediaInfo(res.data);
      // 如果解析出的是纯音频（如 Spotify），默认切到音频选项卡
      const hasVideo = res.data.formats?.some((f: Format) => f.resolution !== "audio only");
      setActiveTab(hasVideo ? "video" : "audio");
    } catch (err: any) {
      const detail = err.response?.data?.detail || "无法解析此链接，请确认链接有效并支持公开访问。";
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (formatId: string, formatLabel?: string) => {
    setDownloadingFormat(formatId);
    setDownloadStatus(`正在提交下载任务 (${formatLabel || formatId})...`);

    try {
      const res = await axios.post(`${BACKEND_URL}/api/download`, {
        url: url.trim(),
        format_id: formatId,
        title: mediaInfo?.title,
      });
      const taskId = res.data.task_id;
      setDownloadStatus("服务器正在抓取媒体流与音频音轨并转码合并...");
      pollForFile(taskId);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "发起下载任务失败，请检查网络或稍后重试。";
      setError(msg);
      setDownloadingFormat(null);
      setDownloadStatus("");
    }
  };

  const pollForFile = (taskId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts === 3) {
        setDownloadStatus("正在使用 FFmpeg 合成高质量 MP4/MP3，即将完成...");
      } else if (attempts === 6) {
        setDownloadStatus("转码流处理中，文件较大时需额外耗时，请稍候...");
      }

      try {
        const res = await axios.head(`${BACKEND_URL}/api/file/${taskId}`);
        if (res.status === 200) {
          clearInterval(interval);
          setDownloadStatus("✅ 转码合成完毕！正在启动浏览器本地下载...");
          setTimeout(() => {
            window.location.href = `${BACKEND_URL}/api/file/${taskId}`;
            setDownloadingFormat(null);
            setDownloadStatus("");
          }, 800);
        }
      } catch (err: any) {
        if (err.response?.status === 500) {
          clearInterval(interval);
          setError("下载处理失败：" + (err.response?.data?.detail || "内部错误"));
          setDownloadingFormat(null);
          setDownloadStatus("");
        }
      }
    }, 2500);

    setTimeout(() => {
      clearInterval(interval);
      if (downloadingFormat) {
        setDownloadingFormat(null);
        setDownloadStatus("");
        setError("下载等待超时（超过5分钟），请尝试选择较小分辨率或稍后再试。");
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

  const videoFormats = mediaInfo?.formats.filter((f) => f.resolution !== "audio only") || [];
  const audioFormats = mediaInfo?.formats.filter((f) => f.resolution === "audio only") || [];

  return (
    <div className="relative min-h-screen bg-[#060a12] text-slate-100 flex flex-col justify-between overflow-x-hidden">
      {/* 顶部环境光背景光晕 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[480px] pointer-events-none opacity-40 overflow-hidden">
        <div className="absolute -top-[160px] left-1/4 w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[128px] animate-pulse-glow" />
        <div className="absolute -top-[120px] right-1/4 w-[460px] h-[460px] bg-cyan-500/25 rounded-full blur-[140px] animate-pulse-glow" style={{ animationDelay: "3s" }} />
      </div>

      {/* 顶部导航 */}
      <header className="relative z-10 border-b border-white/5 backdrop-blur-xl bg-slate-950/40 sticky top-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                <Download className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                MediaDownloader
              </span>
              <span className="ml-2 text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                v2.5 PRO
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 border border-white/5 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>高速引擎在线 (yt-dlp + FFmpeg)</span>
            </div>
          </div>
        </div>
      </header>

      {/* 主要内容区域 */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-12 flex-1 flex flex-col items-center w-full">
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
            粘贴任何视频或音频链接，秒级解析最高分辨率格式并直接转码保存至本地。
          </p>
        </div>

        {/* 平台标签栏 */}
        <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-3xl">
          {SUPPORTED_PLATFORMS.map((platform) => (
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
        <form onSubmit={handleSearch} className="w-full max-w-3xl relative group mb-10">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-cyan-500 to-indigo-500 rounded-2xl blur-lg opacity-30 group-hover:opacity-60 transition duration-500" />
          <div className="relative flex flex-col sm:flex-row items-center bg-slate-900/90 border border-slate-700/60 rounded-2xl p-2 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center w-full px-3 py-2 sm:py-0">
              <div className="text-slate-400 mr-3">
                <Search className="w-5 h-5 text-indigo-400" />
              </div>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="粘贴视频链接 (如 https://www.youtube.com/watch?v=...)"
                className="w-full bg-transparent text-white placeholder-slate-500 text-sm sm:text-base focus:outline-none py-2"
              />
              {url && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors mr-1"
                  title="清空"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePaste}
                className="hidden sm:flex items-center gap-1 text-xs text-indigo-300 hover:text-white bg-indigo-500/15 hover:bg-indigo-500/30 border border-indigo-500/30 px-2.5 py-1.5 rounded-lg transition-all"
                title="粘贴剪贴板链接"
              >
                <Clipboard className="w-3.5 h-3.5" />
                粘贴
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="w-full sm:w-auto mt-2 sm:mt-0 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-98"
            >
              {loading ? (
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
        {error && (
          <div className="w-full max-w-3xl mb-8 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-medium text-rose-200">解析遇到问题：</span> {error}
            </div>
            <button onClick={() => setError("")} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 正在下载状态横幅 */}
        {downloadStatus && (
          <div className="w-full max-w-3xl mb-8 p-4 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 flex items-center gap-3 text-sm animate-in fade-in duration-300">
            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />
            <div className="flex-1 font-medium">{downloadStatus}</div>
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
                {/* 选项卡切换按钮 */}
                <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900/80 border border-slate-800 mb-6 w-fit">
                  <button
                    type="button"
                    onClick={() => setActiveTab("video")}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                      activeTab === "video"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <FileVideo className="w-4 h-4" />
                    视频下载 ({videoFormats.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("audio")}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                      activeTab === "audio"
                        ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <FileAudio className="w-4 h-4" />
                    提取音频 ({audioFormats.length})
                  </button>
                </div>

                {/* 视频列表 */}
                {activeTab === "video" && (
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
                                onClick={() => handleDownload(format.format_id, badge.label)}
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
                {activeTab === "audio" && (
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
                              onClick={() => handleDownload(format.format_id, badge.label)}
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
                {activeTab === "video" && videoFormats.length > 6 && (
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

        {/* 底部特性优势介绍 */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-white/5">
          <div className="p-5 rounded-2xl glass-card space-y-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-white">多线程高速下载</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              内置分块多线程抓取与高速缓存架构，大文件转码合成只需几秒，无速度限制。
            </p>
          </div>

          <div className="p-5 rounded-2xl glass-card space-y-2">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
              <Film className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-white">4K 原画与纯音提取</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              支持从 360p 到 4K 2160p 原画画质无损封装，一键剥离 320kbps MP3 音乐。
            </p>
          </div>

          <div className="p-5 rounded-2xl glass-card space-y-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-white">隐私纯净 • 即用即焚</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              下载完成后自动清理服务器临时缓存，无广告植入，不存储任何用户隐私数据。
            </p>
          </div>
        </div>
      </main>

      {/* 底部版权 */}
      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-xs text-slate-500">
        <p>© 2026 Universal Media Downloader • Powered by FastAPI & Next.js</p>
      </footer>
    </div>
  );
}
