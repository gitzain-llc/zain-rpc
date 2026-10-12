"""
Zeitraffer-Reel für Instagram
=============================

Macht aus einem Ordner voller Fotos ODER aus einem langen Video ein
Zeitraffer-Video im Instagram-Reel-Format (1080x1920, 9:16, H.264, 30 fps).

So benutzt du es in VS Code:
  1. Unten bei EINSTELLUNGEN alles anpassen (Fotos-Ordner oder Video, Musik, ...)
  2. Oben rechts auf ▶ ("Run Python File") klicken
  3. Fertig: das Reel liegt als "zeitraffer_reel.mp4" neben diesem Skript

Oder im Terminal (überschreibt die Einstellungen):
  python timelapse.py fotos
  python timelapse.py mein_video.mp4 --speed 20
  python timelapse.py fotos --musik song.mp3 --fps 24
"""

import argparse
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

try:
    import imageio_ffmpeg
    from PIL import Image, ImageOps
except ImportError:
    sys.exit(
        "Es fehlen Pakete. Bitte im VS-Code-Terminal ausführen:\n"
        "    pip install -r requirements.txt"
    )

# iPhone-Fotos (.heic) unterstützen, falls "pillow-heif" installiert ist
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass


# ============================================================
#  EINSTELLUNGEN – hier kannst du alles anpassen
# ============================================================
EINGABE = "fotos"                # Ordner mit Fotos ODER ein Video, z.B. "sonnenuntergang.mp4"
AUSGABE = "zeitraffer_reel.mp4"  # Name der fertigen Datei
FPS = 30                         # Bilder pro Sekunde im Reel (24–30 sieht gut aus)
VIDEO_SPEED = 10                 # Nur bei Videos: wie viel schneller (10 = 10x so schnell)
MUSIK = None                     # Optional: Musikdatei, z.B. "musik.mp3" (None = ohne Ton)
ENTFLACKERN = True               # Gleicht Helligkeitssprünge zwischen den Bildern aus
SORTIERUNG = "name"              # Reihenfolge der Fotos: "name" oder "datum" (Aufnahmezeit)
# ============================================================
# Relative Pfade werden zuerst im aktuellen Ordner gesucht,
# danach im Ordner, in dem dieses Skript liegt.

BREITE, HOEHE = 1080, 1920       # Instagram Reel: 9:16 Hochformat
MAX_REEL_SEKUNDEN = 180          # Instagram Reels dürfen max. 3 Minuten lang sein
FOTO_ENDUNGEN = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".heic", ".heif"}
SKRIPT_ORDNER = Path(__file__).resolve().parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()  # ffmpeg kommt mit dem Paket, keine Extra-Installation


def finde_datei(pfad):
    """Sucht eine Eingabedatei im aktuellen Ordner und im Skript-Ordner."""
    pfad = Path(pfad).expanduser()
    if pfad.is_absolute() or pfad.exists():
        return pfad
    return SKRIPT_ORDNER / pfad


def natuerliche_sortierung(pfad):
    """Sortiert "IMG_2.jpg" vor "IMG_10.jpg" (statt rein alphabetisch)."""
    return [int(teil) if teil.isdigit() else teil.lower() for teil in re.split(r"(\d+)", pfad.name)]


def aufnahmezeit(pfad):
    """Liest die Aufnahmezeit aus den EXIF-Daten, sonst das Änderungsdatum der Datei."""
    try:
        with Image.open(pfad) as bild:
            exif = bild.getexif()
            zeit = exif.get_ifd(0x8769).get(36867) or exif.get(306)  # DateTimeOriginal / DateTime
            if zeit:
                return str(zeit)
    except Exception:
        pass
    return datetime.fromtimestamp(pfad.stat().st_mtime).strftime("%Y:%m:%d %H:%M:%S")


def foto_vorbereiten(pfad):
    """Lädt ein Foto, dreht es richtig und schneidet es mittig auf 9:16 zu."""
    with Image.open(pfad) as bild:
        bild.draft("RGB", (BREITE, HOEHE))   # große JPEGs schneller laden
        bild = ImageOps.exif_transpose(bild)  # Handy-Fotos richtig herum drehen
        bild = bild.convert("RGB")
        return ImageOps.fit(bild, (BREITE, HOEHE), Image.LANCZOS)


def video_dauer(pfad):
    """Liefert die Länge eines Videos in Sekunden."""
    leser = imageio_ffmpeg.read_frames(str(pfad))
    try:
        return next(leser).get("duration") or 0
    finally:
        leser.close()


def bild_filter(entflackern):
    return ["setsar=1"] + (["deflicker=mode=pm:size=10"] if entflackern else [])


def ausgabe_argumente(musik, dauer, ausgabe):
    """Gemeinsame ffmpeg-Einstellungen für Instagram (H.264 + AAC, schneller Start)."""
    if musik:
        ausblenden = max(dauer - 2, 0)  # Musik in den letzten 2 Sekunden ausblenden
        ton = ["-map", "1:a:0", "-c:a", "aac", "-b:a", "192k",
               "-af", f"afade=t=out:st={ausblenden:.2f}:d=2", "-shortest"]
    else:
        ton = ["-an"]
    return ["-map", "0:v:0", *ton,
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(ausgabe)]


def musik_eingabe(musik):
    # -stream_loop -1 wiederholt die Musik, falls sie kürzer ist als das Video
    return ["-stream_loop", "-1", "-i", str(musik)] if musik else []


def pruefe_laenge(dauer):
    print(f"Dein Reel wird ca. {dauer:.1f} Sekunden lang.")
    if dauer < 1:
        print("  Hinweis: Das ist sehr kurz – mehr Fotos, kleinere FPS oder kleinerer Speed helfen.")
    elif dauer > MAX_REEL_SEKUNDEN:
        print(f"  Achtung: Reels dürfen max. {MAX_REEL_SEKUNDEN} s lang sein – "
              "erhöhe FPS bzw. VIDEO_SPEED.")


def fotos_zu_reel(ordner, ausgabe, fps, musik, entflackern, sortierung):
    fotos = [p for p in ordner.iterdir() if p.suffix.lower() in FOTO_ENDUNGEN]
    if not fotos:
        sys.exit(f"Keine Fotos in '{ordner}' gefunden. Lege dort deine Bilder ab (.jpg, .png, ...).")
    fotos.sort(key=aufnahmezeit if sortierung == "datum" else natuerliche_sortierung)

    dauer = len(fotos) / fps
    print(f"{len(fotos)} Fotos gefunden.")
    pruefe_laenge(dauer)

    befehl = [FFMPEG, "-y", "-loglevel", "error",
              "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{BREITE}x{HOEHE}",
              "-framerate", str(fps), "-i", "-", *musik_eingabe(musik),
              "-vf", ",".join(bild_filter(entflackern)),
              *ausgabe_argumente(musik, dauer, ausgabe)]

    ffmpeg = subprocess.Popen(befehl, stdin=subprocess.PIPE)
    try:
        for nummer, foto in enumerate(fotos, 1):
            try:
                bild = foto_vorbereiten(foto)
            except Exception as fehler:
                print(f"\n  Überspringe {foto.name}: {fehler}")
                continue
            ffmpeg.stdin.write(bild.tobytes())
            print(f"\r  Bild {nummer}/{len(fotos)}", end="", flush=True)
        print()
    except BrokenPipeError:
        pass  # ffmpeg ist abgestürzt, die Fehlermeldung steht schon im Terminal
    finally:
        try:
            ffmpeg.stdin.close()
        except BrokenPipeError:
            pass
    return ffmpeg.wait()


def video_zu_reel(video, ausgabe, fps, speed, musik, entflackern):
    dauer = video_dauer(video) / speed
    print(f"Video wird {speed}x schneller abgespielt.")
    pruefe_laenge(dauer)

    filter_liste = [
        f"setpts=PTS/{speed}",  # schneller abspielen
        f"fps={fps}",           # überflüssige Bilder weglassen
        f"scale={BREITE}:{HOEHE}:force_original_aspect_ratio=increase",
        f"crop={BREITE}:{HOEHE}",  # mittig auf 9:16 zuschneiden
        *bild_filter(entflackern),
    ]
    befehl = [FFMPEG, "-y", "-loglevel", "error", "-stats",
              "-i", str(video), *musik_eingabe(musik),
              "-vf", ",".join(filter_liste),
              *ausgabe_argumente(musik, dauer, ausgabe)]
    return subprocess.run(befehl).returncode


def main():
    parser = argparse.ArgumentParser(description="Zeitraffer-Reel für Instagram erstellen")
    parser.add_argument("eingabe", nargs="?", default=EINGABE, help="Fotos-Ordner oder Video")
    parser.add_argument("-o", "--ausgabe", default=AUSGABE, help="Name der fertigen MP4-Datei")
    parser.add_argument("--fps", type=int, default=FPS, help="Bilder pro Sekunde (Standard: %(default)s)")
    parser.add_argument("--speed", type=float, default=VIDEO_SPEED, help="Nur Video: x-fach schneller")
    parser.add_argument("--musik", default=MUSIK, help="Optionale Musikdatei (mp3, m4a, wav, ...)")
    parser.add_argument("--sortierung", choices=["name", "datum"], default=SORTIERUNG)
    parser.add_argument("--kein-entflackern", action="store_true", help="Entflackern ausschalten")
    args = parser.parse_args()

    if args.fps <= 0 or args.speed <= 0:
        sys.exit("--fps und --speed müssen größer als 0 sein.")

    eingabe = finde_datei(args.eingabe)
    ausgabe = Path(args.ausgabe).expanduser()
    if not ausgabe.is_absolute():
        ausgabe = SKRIPT_ORDNER / ausgabe
    musik = finde_datei(args.musik) if args.musik else None
    entflackern = ENTFLACKERN and not args.kein_entflackern

    if not eingabe.exists():
        sys.exit(f"'{args.eingabe}' wurde nicht gefunden. Prüfe EINGABE in den Einstellungen.")
    if musik and not musik.exists():
        sys.exit(f"Musikdatei '{args.musik}' wurde nicht gefunden.")

    if eingabe.is_dir():
        fehler = fotos_zu_reel(eingabe, ausgabe, args.fps, musik, entflackern, args.sortierung)
    else:
        fehler = video_zu_reel(eingabe, ausgabe, args.fps, args.speed, musik, entflackern)

    if fehler:
        sys.exit("Da ist leider etwas schiefgelaufen (siehe Meldung oben).")
    print(f"Fertig! Dein Reel: {ausgabe}")


if __name__ == "__main__":
    main()
