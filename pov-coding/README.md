# POV: Ich code meine eigene Film-App 🎬

Code zum Abtippen in VS Code, mit Endergebnis für ein Instagram-Reel.

**[`film-app/index.html`](film-app/index.html):** eine Film-App mit echten Filmplakaten,
im Cevio-Design (dunkel, Lila-Akzent #8a67ff, Schriften Syne + Outfit, großer
CEVIO-Schriftzug im Hintergrund).

- **Entdecken:** Galerie mit 48 beliebten Filmen (von „The Godfather“ bis zu den neuesten
  Kinofilmen), neueste zuerst, jeweils mit Plakat und Jahr
- **Suche:** Titel eintippen, die App sucht live bei Wikipedia und zeigt passende Filme
  mit Plakat (z. B. „Batman“, „Harry Potter“). Feld leeren → wieder die Galerie
- **+ Merken** legt einen Film auf „Will ich sehen“, **Gesehen** direkt auf „Gesehen“
- Oben die Tabs **Entdecken / Will ich sehen / Gesehen** mit lila Zählern.
  In den Listen: **Gesehen** bzw. **Nochmal** verschiebt, **×** löscht
- Alles bleibt gespeichert, auch nach dem Schließen des Browsers
- Plakate, Titel und Jahr kommen kostenlos von Wikipedia, ohne Anmeldung und ohne
  API-Schlüssel. Der PC braucht dafür Internet. Fehlt ein Bild, gibt es ein lila
  Plakat mit dem Anfangsbuchstaben.
- Die Suche versteht **deutsche und englische Titel**: „Fluch der Karibik“ findet die
  Pirates-of-the-Caribbean-Filme, „Die Eiskönigin“ findet „Frozen“. Dafür fragt die App
  zusätzlich die deutsche Wikipedia und folgt dem Link zum englischen Artikel.
  Angezeigt wird der englische Titel (so heißt der Film auf dem Plakat).
- Die Galerie kannst du ganz einfach ändern: in der Liste `POPULAR` im Code
  Filme dazuschreiben oder löschen (so wie sie auf Wikipedia heißen).

Weitere Projekte im selben Stil:
[`todo-liste/index.html`](todo-liste/index.html) (To-Do-App im Cevio-Design) und
[`galaxie/index.html`](galaxie/index.html) (leuchtende Galaxie, rein zum Anschauen).

## Ablauf

1. Auf dem Desktop einen Ordner anlegen, z. B. `film-app`
2. VS Code → **Datei → Ordner öffnen…** → den Ordner wählen
3. Neue Datei `index.html` anlegen
4. Den Code aus [`film-app/index.html`](film-app/index.html) abtippen und mit
   **Strg+S** (Mac: Cmd+S) speichern
5. Ergebnis öffnen: Rechtsklick auf `index.html` → **„Im Datei-Explorer anzeigen“**
   (Mac: „Im Finder anzeigen“) → Doppelklick auf die Datei
6. Im Browser **F11** drücken (Mac: Ctrl+Cmd+F) für Vollbild

## Tipps zum Abtippen

- Tippe am Anfang nur `!` und drücke **Tab**. VS Code schreibt dann das
  HTML-Grundgerüst von selbst (sieht im Zeitraffer cool aus).
- Klammern auf der deutschen Tastatur:
  `{ }` = AltGr+7 / AltGr+0, `[ ]` = AltGr+8 / AltGr+9
  (Mac: `{ }` = Alt+8 / Alt+9, `[ ]` = Alt+5 / Alt+6)
- Funktioniert etwas nicht (z. B. passiert beim Klick auf „Hinzufügen“ nichts),
  ist irgendwo ein Tippfehler. Im Browser **F12** drücken und auf „Console“
  klicken, dort steht die Zeile mit dem Fehler.

## Tipps für das POV-Video

- Handy hochkant hinter dir oder über der Schulter auf ein Stativ stellen und
  den Kamera-Modus **Zeitraffer** nehmen.
- In VS Code mit **Strg +** die Schrift größer machen, damit man den Code im
  Video erkennt. Dunkles Theme sieht am besten aus.
- Das Ende **nicht im Zeitraffer**, sondern als normales Video filmen: App
  öffnen, Vollbild, durch die Galerie scrollen, ein paar Filme merken, etwas
  suchen und die Tabs zeigen. In Instagram beide Clips hintereinander setzen.
- Der Wow-Moment ist das Öffnen der App: die Plakate fliegen nacheinander rein.
- Flimmern oder Streifen beim Filmen vom Bildschirm: etwas weiter weg gehen
  oder das Handy leicht schräg halten und auf den Bildschirm scharf tippen.
