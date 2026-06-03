import yt_dlp
import json

url = "https://youtu.be/xXr4Z7HAZCE?si=zpMM7203OEvnEPJE"
ydl_opts = {
    'quiet': False,
    'extract_flat': True,
    'noplaylist': True,
}

try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        print("Success!")
except Exception as e:
    print("Error:", str(e))
