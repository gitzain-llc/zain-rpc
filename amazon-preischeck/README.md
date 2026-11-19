# 🏷️ Preis-Check für Amazon – Black-Friday-Fake-Rabatt-Detektor

Browser-Extension (Chrome, Edge, Brave, Opera), die Amazon-Angebote mit **echten Vorpreisen** vergleicht, statt mit
aufgeblasenen UVPs. Sie zeigt direkt unter dem Preis an, ob ein „Black Friday Angebot“ wirklich günstig ist.

## Was die Extension macht

**Auf jeder Produktseite** erscheint unter dem Preis eine Karte mit einer Ampel-Bewertung:

| Bewertung | Bedeutung |
| --- | --- |
| 🟢 **Echtes Angebot** | deutlich unter dem 30-Tage-Tiefstpreis bzw. tiefster Preis seit du den Artikel verfolgst |
| 🟡 **Mittelmäßig** | Rabatt nur gegenüber der UVP oder nur wenige Prozent echter Rabatt |
| 🔴 **Kein echtes Schnäppchen** | gleich teuer oder teurer als vor Kurzem, Preis wurde vorher angehoben (Preisanker) |

Verglichen wird mit:

1. **Niedrigster Preis der letzten 30 Tage**: muss Amazon in der EU bei Rabatten angeben (Preisangabenverordnung).
   Das ist der wichtigste Vergleichswert.
2. **Durchgestrichener Preis**: UVP, „Typischer Preis“ usw. Die Extension zeigt an, worauf sich Amazons
   „−38 %“ eigentlich bezieht.
3. **Dein eigener Preisverlauf**: Jeder Preis, den du auf Amazon siehst (Produktseiten, Suchergebnisse,
   Angebotsseiten), wird lokal gespeichert. So erkennst du, ob der Preis vor Black Friday angehoben wurde.
4. **Keepa-Preisverlauf**: Chart der letzten 30 / 90 / 180 / 365 Tage direkt auf der Seite.
5. **Links** zu Keepa, CamelCamelCamel, idealo, Geizhals und Google Shopping für den Preisvergleich mit anderen Shops.

**In Suchergebnissen und auf Angebotsseiten** gibt es kleine Badges wie
`⚠ War schon 39,99 € (09.11.2026)` oder `✓ Tiefstpreis seit 30.10.2026`.

**Merkliste mit Preisalarm:** Klicke in der Karte auf „🔔 Preis beobachten“ und gib optional einen Zielpreis an.
Die Extension prüft die Preise im Hintergrund (standardmäßig alle 12 Stunden) und meldet sich, wenn der Preis sinkt
oder dein Zielpreis erreicht ist.

> **Tipp:** Füge interessante Produkte schon **vor** Black Friday zur Merkliste hinzu. Dann hast du eigene Preisdaten
> und erkennst sofort, ob der „Deal“ nur der alte Normalpreis ist.

## Installation (2 Minuten)

1. Ordner `amazon-preischeck` herunterladen (oder das ZIP `preischeck-extension.zip` entpacken).
2. In Chrome `chrome://extensions` öffnen (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Oben rechts den **Entwicklermodus** einschalten.
4. **„Entpackte Erweiterung laden“** klicken und den Ordner auswählen, in dem die `manifest.json` liegt.
5. Optional: Die Extension über das Puzzle-Symbol an die Symbolleiste anheften.

Danach einfach eine Amazon-Produktseite öffnen.

## Unterstützte Shops

amazon.de, .fr, .it, .es, .nl, .com.be, .pl, .se, .co.uk, .com, .ca.
Keepa-Charts und CamelCamelCamel gibt es nur für die Shops, die diese Dienste abdecken (u. a. DE, FR, IT, ES, UK, US, CA).

## Datenschutz

- Alle Preisdaten bleiben **lokal in deinem Browser** (`chrome.storage.local`). Es gibt keinen eigenen Server und kein Tracking.
- Externe Anfragen: Der Keepa-Chart wird von `graph.keepa.com` geladen (dabei wird nur die ASIN übertragen). Das lässt
  sich in den Einstellungen abschalten. Dann wird der Chart erst nach Klick geladen.
- Für die Merkliste ruft die Extension die Amazon-Produktseiten der beobachteten Artikel im Hintergrund ab.
- In den Einstellungen kannst du alle Daten exportieren, importieren oder löschen.

## Grenzen

- Amazon ändert sein Seitenlayout regelmäßig. Die Extension nutzt mehrere Fallback-Selektoren, trotzdem kann ein
  Preis gelegentlich nicht erkannt werden.
- Der eigene Preisverlauf beginnt erst, wenn die Extension installiert ist. Für die Zeit davor ist der Keepa-Chart da.
- Wenn Amazon bei der Hintergrundprüfung einen Robot-Check zeigt, erscheint das in der Merkliste. Die Produktseite
  dann einmal normal im Browser öffnen.
- Firefox wird aktuell nicht unterstützt (benötigt `chrome.offscreen`).

## Entwicklung

```bash
npm test          # Unit-Tests (Preisparser, Bewertungslogik)
npm run e2e       # lädt die Extension in Chromium (Playwright) und testet mit Amazon-ähnlichen Fixture-Seiten
npm run package   # erzeugt dist/preischeck-extension.zip
```

Aufbau:

```
manifest.json
src/shared/config.js    Marktplätze, Vergleichs-Links, Keepa-Chart-URL
src/shared/price.js     Preis-Parser (1.299,99 € / $1,299.99 / 1 299,99 zł …)
src/shared/extract.js   liest Preis, durchgestrichene Preise, 30-Tage-Tief, Deal-Badge aus der Seite
src/shared/analyze.js   Bewertung (echter Rabatt vs. Fake-Rabatt)
src/shared/store.js     Preisverlauf & Merkliste (chrome.storage.local)
src/content/content.js  Karte auf Produktseiten, Badges in Suchergebnissen
src/background.js       Merkliste prüfen, Benachrichtigungen
src/offscreen/          HTML-Parser für die Hintergrundprüfung
src/popup/, src/options/
```
