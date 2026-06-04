import yt_dlp
ydl_opts = {
    'outtmpl': 'test_download.%(ext)s',
    'format': '137+140',
    'merge_output_format': 'mp4'
}
with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download(['https://www.youtube.com/watch?v=BaW_jenozKc'])
