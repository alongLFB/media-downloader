"use client";

import { useState } from "react";
import axios from "axios";
import { Search, Download, Play, Clock, FileVideo, FileAudio, Loader2, ChevronDown, ChevronUp } from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

interface Format {
  format_id: string;
  ext: string;
  resolution: string;
  filesize: number;
  format_note: string;
}

interface MediaInfo {
  title: string;
  thumbnail: string;
  duration: number;
  formats: Format[];
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError("");
    setMediaInfo(null);

    try {
      const res = await axios.post(`${BACKEND_URL}/api/info`, { url });
      setMediaInfo(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to fetch media info. Ensure the link is valid.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (formatId: string) => {
    setDownloadingFormat(formatId);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/download`, { url, format_id: formatId, title: mediaInfo?.title });
      const taskId = res.data.task_id;
      
      // Start polling for the file
      pollForFile(taskId);
    } catch (err) {
      alert("Failed to start download.");
      setDownloadingFormat(null);
    }
  };

  const pollForFile = async (taskId: string) => {
    const checkInterval = setInterval(async () => {
      try {
        const res = await axios.head(`${BACKEND_URL}/api/file/${taskId}`);
        if (res.status === 200) {
          clearInterval(checkInterval);
          // Trigger download
          window.location.href = `${BACKEND_URL}/api/file/${taskId}`;
          setDownloadingFormat(null);
        }
      } catch (err) {
        // still downloading (404)
      }
    }, 3000);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      if (downloadingFormat) {
        setDownloadingFormat(null);
        alert("Download timed out.");
      }
    }, 5 * 60 * 1000);
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "Unknown size";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "Unknown";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Group formats by audio/video for better display
  const audioFormats = mediaInfo?.formats.filter(f => f.resolution === "audio only" && f.format_id === "bestaudio_mp3") || [];
  const videoFormats = mediaInfo?.formats.filter(f => f.resolution !== "audio only") || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20 pointer-events-none"></div>
      
      <main className="relative max-w-4xl mx-auto px-6 py-20 flex flex-col items-center">
        
        <div className="text-center mb-12 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl mb-4 text-indigo-400">
            <Download className="w-8 h-8" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            Universal Media Downloader
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Paste a link from YouTube, Twitter, TikTok, Netease Music, or any supported platform to instantly download high-quality video or audio.
          </p>
        </div>

        <form onSubmit={handleSearch} className="w-full max-w-2xl relative group animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-500"></div>
          <div className="relative flex items-center bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden focus-within:border-indigo-500/50 transition-colors">
            <div className="pl-6 text-slate-500">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="url"
              required
              placeholder="Paste your media link here..."
              className="w-full px-4 py-5 bg-transparent text-lg text-white placeholder-slate-500 focus:outline-none"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Resolve"}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center w-full max-w-2xl animate-in fade-in">
            {error}
          </div>
        )}

        {mediaInfo && (
          <div className="mt-16 w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-12 duration-700">
            
            {/* Thumbnail Column */}
            <div className="md:col-span-1 space-y-4">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl group">
                {mediaInfo.thumbnail ? (
                  <img src={mediaInfo.thumbnail} alt={mediaInfo.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700">
                    <Play className="w-12 h-12" />
                  </div>
                )}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 backdrop-blur-md rounded-md text-xs font-medium flex items-center gap-1.5 text-white">
                  <Clock className="w-3 h-3" />
                  {formatDuration(mediaInfo.duration)}
                </div>
              </div>
              <h2 className="text-xl font-semibold text-white line-clamp-2 leading-snug" title={mediaInfo.title}>
                {mediaInfo.title}
              </h2>
            </div>

            {/* Downloads Column */}
            <div className="md:col-span-2 space-y-6">
              {/* Video Formats */}
              {videoFormats.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <FileVideo className="w-4 h-4" /> Video Downloads
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(showAll ? videoFormats : videoFormats.slice(0, 6)).map((format) => (
                      <button
                        key={format.format_id}
                        onClick={() => handleDownload(format.format_id)}
                        disabled={downloadingFormat !== null}
                        className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium text-white group-hover:text-indigo-400 transition-colors">
                            {format.resolution === "audio only" ? format.format_note : format.resolution} (mp4)
                          </span>
                          <span className="text-xs text-slate-500 mt-1">
                            {formatSize(format.filesize)}
                          </span>
                        </div>
                        {downloadingFormat === format.format_id ? (
                          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                        ) : (
                          <Download className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Audio Formats */}
              {audioFormats.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-800/50">
                  <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <FileAudio className="w-4 h-4" /> Audio Downloads
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(showAll ? audioFormats : audioFormats.slice(0, 4)).map((format) => (
                      <button
                        key={format.format_id}
                        onClick={() => handleDownload(format.format_id)}
                        disabled={downloadingFormat !== null}
                        className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium text-white group-hover:text-cyan-400 transition-colors">
                            {format.ext === "mp3" ? format.format_note : `Audio ${format.format_note || 'HQ'} (${format.ext})`}
                          </span>
                          <span className="text-xs text-slate-500 mt-1">
                            {formatSize(format.filesize)}
                          </span>
                        </div>
                        {downloadingFormat === format.format_id ? (
                          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                        ) : (
                          <Download className="w-5 h-5 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Show More / Show Less Button */}
              {(videoFormats.length > 6 || audioFormats.length > 4) && (
                <div className="flex justify-center pt-4 border-t border-slate-900/50">
                  <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-slate-800 bg-slate-900/30 text-sm font-medium text-slate-400 hover:text-white hover:border-slate-700 hover:bg-slate-900/80 transition-all active:scale-95 cursor-pointer"
                  >
                    {showAll ? (
                      <>
                        Show Less <ChevronUp className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        Show More Options <ChevronDown className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
