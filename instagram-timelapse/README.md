# Zeitraffer-Reel für Instagram 🎬

Ein Python-Skript, das aus **vielen Fotos** oder aus **einem langen Video** ein
Zeitraffer-Video macht, das direkt als Instagram-Reel hochgeladen werden kann:

- 1080 × 1920 Pixel (9:16 Hochformat), 30 fps, H.264 + AAC
- Fotos werden automatisch richtig gedreht und mittig auf 9:16 zugeschnitten
- Entflackern gegen Helligkeitssprünge zwischen den Fotos
- Optional mit Musik (wird am Ende sanft ausgeblendet)

## Einmalig einrichten

1. **Python** installieren: <https://www.python.org/downloads/>
   (Windows: beim Installieren das Häkchen **„Add python.exe to PATH“** setzen)
2. **VS Code** installieren und darin die Erweiterung **„Python“** (von Microsoft) installieren
3. In VS Code **Datei → Ordner öffnen…** und diesen Ordner `instagram-timelapse` wählen
4. Terminal öffnen (**Terminal → Neues Terminal**) und eingeben:

   ```bash
   pip install -r requirements.txt
   ```

   (Falls `pip` nicht gefunden wird: `python -m pip install -r requirements.txt`,
   auf dem Mac `python3 -m pip install -r requirements.txt`)

## Zeitraffer aus Fotos

1. Alle Fotos in den Ordner `fotos` kopieren
2. `timelapse.py` öffnen
3. Oben rechts auf **▶ (Run Python File)** klicken
4. Fertig – `zeitraffer_reel.mp4` liegt im selben Ordner

Faustregel: **30 Fotos = 1 Sekunde Reel.** Für ein 15-Sekunden-Reel brauchst du
also ca. 450 Fotos (z. B. 1 Foto alle 5 Sekunden über ~40 Minuten).

## Zeitraffer aus einem Video

In `timelapse.py` oben bei den Einstellungen ändern:

```python
EINGABE = "mein_video.mp4"   # dein Video in diesen Ordner legen
VIDEO_SPEED = 20             # 20x schneller: 10 Minuten Video → 30 Sekunden Reel
```

Dann wieder auf ▶ klicken.

## Einstellungen

| Einstellung   | Bedeutung                                                         |
|---------------|-------------------------------------------------------------------|
| `EINGABE`     | Ordner mit Fotos **oder** eine Videodatei                         |
| `AUSGABE`     | Name der fertigen Datei                                           |
| `FPS`         | Bilder pro Sekunde (weniger = langsamer/länger, mehr = schneller) |
| `VIDEO_SPEED` | Nur bei Video: wie viel schneller es abgespielt wird              |
| `MUSIK`       | z. B. `"musik.mp3"` – oder `None` für ohne Ton                     |
| `ENTFLACKERN` | `True`/`False` – gleicht Helligkeitsschwankungen aus              |
| `SORTIERUNG`  | `"name"` (Dateiname) oder `"datum"` (Aufnahmezeit aus dem Foto)   |

## Im Terminal (für Fortgeschrittene)

```bash
python timelapse.py fotos
python timelapse.py fotos --fps 24 --musik musik.mp3
python timelapse.py mein_video.mp4 --speed 30 -o reel.mp4
python timelapse.py --help
```

## Aufs Handy & zu Instagram

Die MP4-Datei z. B. per AirDrop, Google Drive oder USB-Kabel aufs Handy schicken,
dann in Instagram **+ → Reel** wählen und das Video auswählen.
Musik kannst du auch direkt in Instagram hinzufügen (dann `MUSIK = None` lassen).

## Probleme?

- **„Es fehlen Pakete“** → Schritt 4 von „Einmalig einrichten“ ausführen.
  Wenn es dann immer noch kommt: in VS Code unten rechts auf die Python-Version
  klicken und dieselbe Python-Installation wählen, in die du installiert hast.
- **iPhone-Fotos (.heic) werden übersprungen** → `pip install pillow-heif`
- **Reel zu kurz/lang** → `FPS` bzw. `VIDEO_SPEED` anpassen; das Skript zeigt
  vor dem Rendern an, wie lang das Reel wird (Instagram erlaubt max. 3 Minuten).
- **Farben bei iPhone-Videos blass** → das Video ist in HDR aufgenommen.
  Für Zeitraffer in den iPhone-Kamera-Einstellungen „HDR-Video“ ausschalten.
