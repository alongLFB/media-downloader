import yt_dlp
import os
import uuid

url = "https://youtu.be/i_yLpCLMaKk?si=-ZQxdqsbA7CzEoeR"
DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
task_id = str(uuid.uuid4())
output_template = os.path.join(DOWNLOAD_DIR, f"{task_id}.%(ext)s")

# Let's simulate downloading 1080p mp4 (format 137)
format_id = "137"

try:
    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        formats = info.get("formats", [])
        selected_format = next((f for f in formats if f.get("format_id") == format_id), None)
        
        if selected_format:
            vcodec = selected_format.get("vcodec", "none")
            acodec = selected_format.get("acodec", "none")
            ext = selected_format.get("ext", "")
            
            format_spec = format_id
            merge_format = None
            
            if vcodec != "none" and acodec == "none":
                if ext == "mp4":
                    format_spec = f"{format_id}+bestaudio[ext=m4a]/bestaudio/best"
                    merge_format = "mp4"
                else:
                    format_spec = f"{format_id}+bestaudio/best"
                    merge_format = ext or "mkv"
            
            print(f"Format Spec: {format_spec}")
            print(f"Merge Format: {merge_format}")
            
            ydl_opts = {
                'format': format_spec,
                'outtmpl': output_template,
                'quiet': False,
                'noplaylist': True,
            }
            if merge_format:
                ydl_opts['merge_output_format'] = merge_format
                
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
                
            # Check final files
            for filename in os.listdir(DOWNLOAD_DIR):
                if filename.startswith(task_id):
                    print(f"Resulting file in downloads directory: {filename}")
                    # Clean up
                    os.remove(os.path.join(DOWNLOAD_DIR, filename))
                    
except Exception as e:
    print("Error:", str(e))
