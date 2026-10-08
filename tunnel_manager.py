import os
import sys
import re
import urllib.request
import subprocess
import time
import threading

CLOUDFLARED_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
DIR_PATH = os.path.dirname(os.path.abspath(__file__))
EXE_PATH = os.path.join(DIR_PATH, "cloudflared.exe")
URL_FILE = os.path.join(DIR_PATH, "public_url.txt")
TUNNEL_FILE = os.path.join(DIR_PATH, "tunnel_url.txt")
REDIRECT_FILE = os.path.join(DIR_PATH, "mo_seelad.html")

def copy_to_clipboard(text):
    try:
        subprocess.run(
            ["powershell", "-Command", f"Set-Clipboard -Value '{text}'"],
            capture_output=True,
            timeout=5
        )
    except Exception:
        pass

def download_cloudflared():
    if not os.path.exists(EXE_PATH):
        print("Dang tai cloudflared.exe (khoang 30MB, mien phi, khong can tai khoan)...")
        urllib.request.urlretrieve(CLOUDFLARED_URL, EXE_PATH)
        print("Tai thanh cong!")

def write_redirect_file(url):
    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0; url={url}">
    <title>Dang chuyen huong den SEE LAD...</title>
</head>
<body style="background:#090d16;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <div style="text-align:center;">
        <h2 style="color:#38e1e8;">SEE LAD Realtime Nexus</h2>
        <p>Dang chuyen huong ban den link chat hoat dong moi nhat...</p>
        <p><a href="{url}" style="color:#818cf8;font-weight:bold;text-decoration:none;">Bam vao day neu khong tu dong chuyen</a></p>
    </div>
</body>
</html>"""
    try:
        with open(REDIRECT_FILE, "w", encoding="utf-8") as f:
            f.write(html_content)
    except Exception:
        pass

def run_tunnel_instance():
    download_cloudflared()
    print("\n" + "="*65)
    print("  [SEE LAD] DANG KHOI DONG DUONG TRUYEN CLOUDFLARE 24/7...")
    print("="*65)

    proc = subprocess.Popen(
        [EXE_PATH, "tunnel", "--url", "http://localhost:3000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding='utf-8',
        errors='replace'
    )

    url_found = None
    stop_health_check = threading.Event()

    def health_checker(tunnel_url):
        time.sleep(15)
        fail_count = 0
        while not stop_health_check.is_set():
            time.sleep(25)
            if stop_health_check.is_set():
                break
            try:
                req = urllib.request.Request(
                    f"{tunnel_url}/api/public-url",
                    headers={"User-Agent": "Mozilla/5.0"}
                )
                with urllib.request.urlopen(req, timeout=12) as response:
                    if response.status == 200:
                        fail_count = 0
                    else:
                        fail_count += 1
            except Exception as e:
                fail_count += 1
                print(f"\n[WATCHDOG WARNING] Kiem tra ket noi ({fail_count}/2): {e}")

            if fail_count >= 2:
                print("\n[WATCHDOG] Duong truyen Cloudflare da bi ngat boi he thong! Dang tu dong khoi phuc link moi...")
                try:
                    proc.terminate()
                except Exception:
                    pass
                break

    for line in iter(proc.stdout.readline, ''):
        sys.stdout.write(line)
        sys.stdout.flush()

        match = re.search(r'(https://[a-zA-Z0-9\-]+\.trycloudflare\.com)', line)
        if match and not url_found:
            url_found = match.group(1)
            with open(URL_FILE, 'w', encoding='utf-8') as f:
                f.write(url_found)
            with open(TUNNEL_FILE, 'w', encoding='utf-8') as f:
                f.write(url_found)
            write_redirect_file(url_found)
            copy_to_clipboard(url_found)

            print("\n" + "="*65)
            print(">>> LINK INTERNET MOI NHAT CUA SEE LAD (CHO BAN BE / 4G):")
            print(f">>> {url_found}")
            print(">>> [DA TU DONG SAO CHEP VAO CLIPBOARD - CHI CAN CTRL+V GUI BAN BE]")
            print("="*65 + "\n")
            sys.stdout.flush()

            t = threading.Thread(target=health_checker, args=(url_found,), daemon=True)
            t.start()

    stop_health_check.set()
    try:
        proc.terminate()
    except Exception:
        pass
    proc.wait()

def main():
    while True:
        try:
            run_tunnel_instance()
        except KeyboardInterrupt:
            print("\nDa dung trinh quan ly tunnel.")
            break
        except Exception as e:
            print(f"\n[TUNNEL ERROR] {e}. Dang khoi dong lai sau 3 giay...")
        time.sleep(3)

if __name__ == '__main__':
    main()
