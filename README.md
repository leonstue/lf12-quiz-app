# Quiz App

Live-Quiz für den Unterricht. Der Host wählt ein Quiz, projiziert die Beameransicht und
steuert das Spiel; die Klasse spielt mit dem Smartphone mit — ohne Registrierung, ohne
E-Mail, ohne Passwort. Nur Raumcode und Nickname.

Die Quizze liegen als **JSON-Dateien** im Ordner [`quizzes/`](quizzes/). Jede Datei ist ein
Quiz; neue Dateien erscheinen ohne Neustart in der Auswahl.

- **Beamer / Host**: Lobby mit QR-Code, Frage mit Countdown, Antwortzähler, Auflösung mit
  Verteilungsdiagramm, Erklärung und Antwortdetails, Rangliste, Endkarte mit Auswertung.
- **Smartphone / Teilnehmer**: Frage, vier große Antwortflächen, Ergebnis mit Punkten,
  Streak und Platzierung.

Der Server ist autoritativ: Timer, Punkte und die korrekte Antwort liegen ausschließlich
serverseitig. Der Client erfährt die Lösung erst beim Reveal.

---

## Inhalt

- [Schnellstart auf dem Server](#schnellstart-auf-dem-server)
- [Quizze anlegen](#quizze-anlegen)
- [Eigene Quizze im Browser](#eigene-quizze-im-browser)
- [Server-Setup](#server-setup)
- [Welche Domain muss ich eintragen?](#welche-domain-muss-ich-eintragen)
- [HOST_SECRET](#host_secret)
- [Ablauf einer Unterrichtsstunde](#ablauf-einer-unterrichtsstunde)
- [Architektur](#architektur)
- [Dateibaum](#dateibaum)
- [Routen](#routen)
- [Spielmechanik](#spielmechanik)
- [Konfiguration](#konfiguration)
- [Make-Befehle](#make-befehle)
- [Entwicklung](#entwicklung)
- [Fehlersuche](#fehlersuche)
- [Tests](#tests)
- [Sicherheit](#sicherheit)
- [Bekannte Einschränkungen](#bekannte-einschränkungen)

---

## Schnellstart auf dem Server

```bash
git clone <REPOSITORY-URL> quiz-app
cd quiz-app
make up
```

Beim ersten Aufruf legt `make up` die `.env` aus `.env.example` an, erzeugt ein
`HOST_SECRET` und startet durch — die Domain **mycardbox.de** ist bereits hinterlegt.

Danach läuft alles unter <https://mycardbox.de>. `make up` gibt am Ende die öffentliche
URL, die Host-URL und das `HOST_SECRET` aus.

Soll eine andere Domain verwendet werden, vor dem ersten `make up`:

```bash
nano .env       # DOMAIN=mycardbox.de  ->  DOMAIN=deine-domain.de
make up
```

---

## Quizze anlegen

Ein Quiz ist **eine JSON-Datei** in [`quizzes/`](quizzes/). Der Dateiname ist frei, die
Endung muss `.json` sein. Als Vorlage dient
[`quizzes/beispiel-quiz.json`](quizzes/beispiel-quiz.json).

```jsonc
{
  "id": "mein-quiz",                    // optional, sonst der Dateiname
  "name": "Mein Quiz",                  // Anzeigename in der Auswahl und auf dem Beamer
  "description": "Worum es geht.",      // optional
  "subject": "Fachbereich",             // optional
  "defaultQuestionIds": ["1", "2"],     // optional: kuratierte Reihenfolge
  "questions": [
    {
      "id": "1",                        // optional, sonst die Position
      "category": "Grundlagen",         // Thema -- Basis der Auswertung am Ende
      "difficulty": 1,                  // 1, 2 oder 3
      "durationSeconds": 20,            // optional: sonst 20 s, bei difficulty 3 25 s
      "question": "Die Frage?",
      "image": "diagramm.svg",          // optional, relativ zu quizzes/media/
      "imageAlt": "Was zu sehen ist.",  // optional, fuer Screenreader
      "answers": [
        { "id": "A", "text": "Antwort A" },
        { "id": "B", "text": "Antwort B" },
        { "id": "C", "text": "Antwort C" },
        { "id": "D", "text": "Antwort D" }
      ],
      "correctAnswer": "A",
      "explanation": "Warum A richtig ist. Erscheint bei der Auflösung."
    }
  ]
}
```

### Regeln

- **Zwei bis sechs Antworten** je Frage, mit den ids `A`, `B`, `C`, ... in dieser
  Reihenfolge. Zwei Antworten ergeben eine Wahr/Falsch-Frage, sechs passen fuer
  Aufzaehlungen. Angezeigt wird pro Runde eine neu gemischte Reihenfolge.
- **Genau eine** `correctAnswer`, und die Antworttexte einer Frage müssen sich unterscheiden.
- `question` und `explanation` sind Pflicht. Die Erklärung erscheint bei der Auflösung —
  auf dem Beamer und auf jedem Smartphone.
- `category` ist die Grundlage der Themenauswertung auf der Endkarte. Fehlt sie, gilt
  „Allgemein“ — dann ist die Auswertung entsprechend grob.
- `defaultQuestionIds` bestimmt die Reihenfolge, wenn der Host *nicht* zufällig mischen
  lässt. Wählt der Host mehr Fragen, wird duplikatfrei aus dem Rest aufgefüllt.
- Alle Frage-ids müssen innerhalb der Datei eindeutig sein; die Quiz-`id` muss über alle
  Dateien hinweg eindeutig sein.

### Bilder zu Fragen

Bilder liegen in `quizzes/media/` und werden über `"image"` relativ dazu referenziert —
Unterordner sind erlaubt. Unterstützt werden `.png`, `.jpg`, `.gif`, `.webp`, `.avif` und
`.svg`.

```jsonc
"image": "diagramme/ticketkauf.svg",
"imageAlt": "Sequenzdiagramm eines Ticketkaufs mit alt-Fragment."
```

Das Bild erscheint über den Antworten, bei der Auflösung erneut. Bild und Fragetext
ergänzen sich — die Frage steht immer darüber.

**Während einer laufenden Frage muss niemand scrollen.** Die Ansicht ist auf Bildschirmhöhe
festgenagelt; das Bild nimmt genau den Platz, der nach Frage, Timer und Antwortflächen
übrig bleibt, und gibt ihn auf kleinen Geräten wieder her. Antippen öffnet es
formatfüllend (Schließen mit Tippen oder Escape) — auf einem 320 px breiten Gerät ist ein
Diagramm sonst nicht lesbar. Geprüft auf 320×568, 390×844 und 412×915 mit 2, 4 und 6
Antworten, mit und ohne Bild.

Der Pfad wird streng geprüft: keine absoluten Pfade, kein `..`, nur harmlose Zeichen. Ein
fehlendes Bild lässt die Frage normal laufen; angezeigt wird ein dezenter Hinweis statt
eines kaputten Bildes. `quizzes/media/ticketkauf-sequenzdiagramm.svg` ist ein
vollständiges Beispiel (Frage 7 im Beispiel-Quiz).

### Wirksam werden

Der Ordner ist als Volume eingebunden (`./quizzes:/app/quizzes:ro`). Eine neue Datei ist
deshalb **ohne Rebuild** verfügbar — die Auswahlliste wird bei jedem Aufruf frisch gelesen
(mit fünf Sekunden Zwischenspeicher). Auf dem Server genügt:

```bash
nano quizzes/mein-quiz.json
# Host-Seite neu laden -- fertig
```

Eine fehlerhafte Datei blockiert nie den Start: Sie wird übersprungen, der Grund landet im
Log **und** sichtbar in der Host-Auswahl.

```bash
make logs | grep quiz
```

### Eigene Quizze im Browser

Unter **Host → Quizze verwalten und erstellen** (`/host/quizzes`) gibt es einen Editor:

- **Erstellen und bearbeiten**: Fragen anlegen, sortieren, duplizieren, Antworten
  hinzufügen oder entfernen (2 bis 6), die richtige markieren, Bild auswählen, Erklärung
  schreiben. Fehler werden sofort angezeigt — solange etwas fehlt, bleiben die Buttons aus.
- **Als JSON herunterladen**: erzeugt die fertige Datei. Wer sie dauerhaft behalten will,
  legt sie in den Ordner `quizzes/` — dort überlebt sie jeden Neustart.
- **Übernehmen / JSON hochladen**: Der Server prüft die Datei mit denselben Regeln wie eine
  Datei aus dem Ordner. Ist sie in Ordnung, ist das Quiz sofort spielbar.
- **Entfernen**: Hochgeladene Quizze lassen sich wieder löschen. Quizze aus dem Ordner
  `quizzes/` können über die Oberfläche **nicht** gelöscht werden.

> Hochgeladene Quizze liegen ausschließlich im **Arbeitsspeicher**. Der Server schreibt
> nichts auf die Platte; nach einem Neustart sind sie weg. Deshalb: Datei herunterladen und
> bei Bedarf in `quizzes/` ablegen. Grenzen: 20 Uploads gleichzeitig, 200 Fragen je Quiz,
> 512 kB je Datei.

**Bilder hochladen**: Im Editor lädt der Button *Bild hochladen* eine Datei direkt zur
Frage hoch; daneben steht sofort eine Vorschau. Hochgeladene Bilder landen unter
`uploads/<name>` und liegen — wie hochgeladene Quizze — nur im Arbeitsspeicher. Grenzen:
2 MB je Bild, 24 MB insgesamt, 40 Dateien.

Erlaubt sind **PNG, JPG, GIF, WebP und AVIF**. Geprüft wird der Dateianfang, nicht die
Endung — eine als `.png` benannte HTML-Datei wird abgelehnt. **SVG lässt sich nicht
hochladen**: Eine SVG-Datei darf Skripte enthalten und würde vom selben Ursprung
ausgeliefert. SVGs im Ordner `quizzes/media/` sind dagegen in Ordnung — die stammen aus dem
Repository.

Für dauerhafte Bilder die Datei in `quizzes/media/` legen; der Editor bietet sie dann
neben den Uploads zur Auswahl an.

---

## Server-Setup

### Voraussetzungen

| Werkzeug              | Hinweis                             |
| --------------------- | ----------------------------------- |
| Ubuntu                | getestet mit 22.04 / 24.04          |
| Docker Engine         | `docker --version`                  |
| Docker Compose Plugin | `docker compose version`            |
| make                  | `apt install make`                  |
| git                   | `apt install git`                   |
| openssl               | für die Erzeugung des `HOST_SECRET` |

Installation auf einem frischen Ubuntu:

```bash
sudo apt update
sudo apt install -y git make openssl ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # danach neu anmelden
```

### DNS

Ein **A-Record** (und bei IPv6 zusätzlich ein **AAAA-Record**) der Domain muss auf die
öffentliche IP des Servers zeigen. Ohne korrektes DNS schlägt die Let's-Encrypt-
HTTP-01-Challenge fehl und es gibt kein Zertifikat.

```bash
dig +short mycardbox.de
```

### Firewall

- **TCP 80** — HTTP, wird auf HTTPS umgeleitet und für die ACME-Challenge gebraucht
- **TCP 443** — HTTPS und WebSocket

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Der App-Port 3000 wird **nicht** nach außen veröffentlicht — die App ist ausschließlich
über Traefik erreichbar.

### Ablauf

```bash
git clone <REPOSITORY-URL> quiz-app
cd quiz-app
make up          # legt .env an, erzeugt HOST_SECRET, baut und startet
```

Aufrufen:

- Teilnehmer: <https://mycardbox.de>
- Host: <https://mycardbox.de/host>

Das erste Zertifikat kann 30–60 Sekunden dauern. Fortschritt mit `make logs` beobachten.

> **Umbenennung von „Sequence Challenge" zu „Quiz App"**: Compose-Projekt, Container,
> Netzwerk und Image heißen jetzt `quiz-app`. `make up` entfernt Container des alten
> Projekts automatisch, damit die Ports 80 und 443 frei werden. Das alte Volume
> `sequence-challenge-letsencrypt` bleibt unangetastet liegen und lässt sich bei Bedarf mit
> `docker volume rm sequence-challenge-letsencrypt` entfernen.

---

## Welche Domain muss ich eintragen?

Standardmäßig **keine** — `.env.example` enthält bereits `mycardbox.de`, und `make up`
kopiert die Datei beim ersten Start nach `.env`.

Für eine andere Domain: `DOMAIN` in der Datei `.env` im Projektverzeichnis.

```dotenv
DOMAIN=mycardbox.de     # <- hier gegebenenfalls anpassen
```

Diese Variable wird an drei Stellen verwendet:

1. Traefik-Router-Regel `Host(...)` — bestimmt, für welchen Hostnamen ausgeliefert wird.
2. Let's Encrypt — für welchen Namen das Zertifikat ausgestellt wird.
3. Die App — baut daraus die Join-Adresse und den QR-Code (`https://mycardbox.de/join/CODE`),
   die in der Lobby auf dem Beamer stehen.

> Die `.env` ist über `.gitignore` vom Commit ausgeschlossen und enthält das Host-Secret.

---

## HOST_SECRET

Das `HOST_SECRET` ist das Passwort für die Host-Ansicht.

- **Automatische Erzeugung**: Ist `HOST_SECRET` in der `.env` leer, erzeugt `make up` einen
  Wert mit `openssl rand -hex 24` (48 Hex-Zeichen).
- **Stabil**: Ein bereits gesetztes Secret wird niemals überschrieben.
- **Eigene Wahl**: Ein manuell gesetztes Secret wird ab **einem Zeichen** akzeptiert. Unter
  acht Zeichen warnt der Server beim Start im Log. Gegen Erraten schützt vor allem das
  Rate-Limit von 10 Login-Versuchen pro Minute und IP.
- **Ablage**: in der `.env` und zusätzlich im Klartext in `.pw` (Rechte 600). Beide sind
  über `.gitignore` ausgeschlossen. Beides sind Punktdateien — `ls` zeigt sie nur mit
  `ls -a`.
- **Anzeige**: `make secret`, oder am Ende von `make up`.
- **Ändern**: Wert in der `.env` setzen, dann `make reset`.

Sicherheitseigenschaften:

- Das Secret verlässt **niemals** den Server. Teilnehmer bekommen es weder im HTML, noch im
  JavaScript-Bundle, noch über Socket.IO.
- Geprüft wird serverseitig unter `POST /api/host/login` mit einem **zeitkonstanten
  Vergleich** (`crypto.timingSafeEqual`).
- Bei Erfolg gibt es ein zufälliges, ablaufendes **Host-Token** (Standard: 8 Stunden). Jedes
  Host-Kommando trägt dieses Token; ohne gültiges Token wird es abgelehnt.

---

## Ablauf einer Unterrichtsstunde

1. `https://DEINE-DOMAIN/host` öffnen, `HOST_SECRET` eingeben.
2. **Quiz auswählen**, Anzahl Fragen und Timer-Preset wählen, dazu die drei Schalter
   (Zufallsauswahl, automatisches Weiterschalten, Antwortdetails). Dann **Quiz erstellen**.
3. Die Lobby auf den Beamer legen (Vollbild-Button oben rechts oder Taste `F`).
   Die Klasse scannt den QR-Code oder tippt Code und Nickname ein.
4. **Start** — die erste Frage läuft.
5. **Reveal** — Verteilung, Lösung und Erklärung erscheinen.
6. Optional **Leaderboard** — Zwischenstand.
7. **Next** — nächste Frage. Nach der letzten Runde führt **Next** zum Endstand.
8. **End Game** — bricht jederzeit ab und zeigt die Endkarte.

Standardmäßig steuert der Host alle Übergänge manuell. Von selbst passiert nur zweierlei:
Der Timer sperrt die Antworten nach Ablauf der Zeit, und die Runde wird gesperrt, sobald
alle Teilnehmer geantwortet haben. Aufgelöst wird trotzdem erst auf Knopfdruck.

### Automatisch weiterschalten

Ist die Option beim Erstellen aktiviert, übernimmt der Server die Übergänge:

| Auslöser                           | Wartezeit | Nächster Schritt             |
| ---------------------------------- | --------- | ---------------------------- |
| Zeit abgelaufen / alle geantwortet | 1,5 s     | Auflösung                    |
| Auflösung sichtbar                 | 10 s      | nächste Frage bzw. Abschluss |

Die Steuerleiste zeigt laufend, was als Nächstes passiert und in wie vielen Sekunden.
Zwei Dinge bleiben immer möglich:

- **Eingreifen**: Jeder Klick auf Reveal, Next, Leaderboard oder End Game verwirft den
  geplanten Schritt und gilt sofort.
- **Anhalten**: *Automatik anhalten* stoppt die Uhr, etwa für eine Zwischenfrage aus der
  Klasse. *Automatik fortsetzen* plant den passenden Schritt neu.

### Antwortdetails je Runde

Auf dem Auflösungs-Screen lässt sich einblenden, **wer was geantwortet hat** — jeweils mit
der benötigten Zeit in Sekunden, nach Schnelligkeit sortiert, richtig und falsch getrennt
markiert (Symbol *und* Farbe, nicht nur Farbe).

Der Schalter **Antwortdetails automatisch zeigen** entscheidet, wann das passiert:

- **an**: Die Liste erscheint direkt mit der Auflösung.
- **aus** (Standard): Auf dem Auflösungs-Screen steht der Button *Wer hat was geantwortet?*
  — praktisch, wenn erst die Klasse raten soll.

Die Daten verlassen den Server erst nach der Auflösung und gehen ausschließlich an den
authentifizierten Host, nie an die Teilnehmergeräte.

### Endkarte mit Auswertung

Nach **End Game** bzw. der letzten Runde zeigt dieselbe Ansicht eine Endkarte: links die
finale Rangliste, rechts die vollständige Auswertung — ohne Seitenwechsel.

Die Auswertung zeigt pro Teilnehmer und Runde die gewählte Antwort, ob sie richtig war und
**wie schnell** geantwortet wurde, dazu je Runde die Lösung, die Trefferquote, die mittlere
Antwortzeit und die schnellste richtige Antwort. Über **CSV** landet alles als
Semikolon-Datei (Excel-tauglich, mit BOM) auf der Platte.

Unter der Rangliste steht die **Auswertung nach Themen**: je `category` ein Balken mit der
Trefferquote, absteigend sortiert, dazu eine Zeile mit den drei schwächsten Themen. Rot
unter 60 %, gelb bis 80 %, grün darüber. Bezugsgröße sind abgegebene Antworten — wer gar
nicht antwortet, drückt die Quote also nicht künstlich.

### Tastenkürzel in der Beameransicht

| Taste                | Wirkung     |
| -------------------- | ----------- |
| `S`                  | Start       |
| `R`                  | Reveal      |
| `L`                  | Leaderboard |
| `N` oder `Leertaste` | Next        |
| `F`                  | Vollbild    |

---

## Architektur

**Ein** Repository, **ein** Anwendungscontainer, **keine** Datenbank.

```
Browser (Beamer)  ─┐
                   ├─ HTTPS + WebSocket ─→ Traefik v3 ─→ App-Container (Node 22)
Browser (Handy)   ─┘        :443/:80         (TLS,          ├─ Fastify   → REST + statische Dateien
                                              Redirect,     ├─ Socket.IO → Realtime-Events
                                              Let's Encrypt) └─ quizzes/  → JSON-Fragenpools
```

- **Frontend**: Svelte 5 (Runes), TypeScript, Vite, Tailwind CSS v4, Lucide-Icons, eigener
  History-Router. Keine React-Abhängigkeit.
- **Backend**: Node.js 22, Fastify 5 (REST + Auslieferung des Client-Builds), Socket.IO 4.
  Beide teilen sich denselben HTTP-Server.
- **Quizze**: JSON-Dateien werden beim Start und danach bei Bedarf gelesen, streng
  validiert und in einer `QuizRegistry` gehalten.
- **Zustand**: ausschließlich im Prozessspeicher (`GameManager` → `Room`). Ein Neustart
  verwirft alle laufenden Sessions — das ist beabsichtigt.
- **Build**: Vite baut den Client nach `dist/client`, esbuild bündelt den Server zu einer
  einzelnen ESM-Datei `dist/server/index.js`.

### Autoritativer Server

| Aufgabe                   | Wer entscheidet                        |
| ------------------------- | -------------------------------------- |
| Countdown / Deadline      | Server                                 |
| Punkte, Zeitbonus, Streak | Server                                 |
| Reihenfolge der Antworten | Server (pro Runde neu gemischt)        |
| Korrekte Antwort          | Server, wird erst beim Reveal gesendet |
| Phasenwechsel             | Server, ausgelöst durch Host-Kommandos |

Der Client sendet ausschließlich „ich wähle B" — nie Punkte, nie Zeitstempel.

---

## Dateibaum

```
.
├── quizzes/                        Ein Quiz je JSON-Datei
│   ├── media/                      Bilder zu Fragen
│   │   └── ticketkauf-sequenzdiagramm.svg
│   ├── beispiel-quiz.json          Vorlage: Bildfrage, 2 und 6 Antworten (9 Fragen)
│   └── uml-sequenzdiagramme.json   30 Fragen zu UML-Sequenzdiagrammen
├── src/
│   ├── client/                     Frontend (Svelte 5)
│   │   ├── App.svelte              Router-Outlet
│   │   ├── main.ts                 Mount
│   │   ├── app.css                 Design-Tokens, Basis, Komponentenklassen
│   │   ├── lib/
│   │   │   ├── clock.svelte.ts     Countdown, folgt der Serverzeit
│   │   │   ├── hostGame.svelte.ts  Host-Zustand und Kommandos
│   │   │   ├── playerGame.svelte.ts Teilnehmer-Zustand, Reconnect
│   │   │   ├── options.ts          Farb- und Formzuordnung A/B/C/D
│   │   │   ├── router.svelte.ts    History-Router
│   │   │   ├── socket.ts           Socket.IO-Client, Host-Login, Quizliste
│   │   │   ├── sound.svelte.ts     WebAudio-Töne (keine externen Assets)
│   │   │   ├── storage.ts          localStorage gekapselt
│   │   │   └── components/
│   │   │       ├── AnswerOption.svelte      Antwortfläche
│   │   │       ├── Backdrop.svelte          Hintergrund
│   │   │       ├── Brand.svelte             Logo und Wortmarke
│   │   │       ├── CategoryStats.svelte     Trefferquote je Thema
│   │   │       ├── Credit.svelte            Herstellerhinweis
│   │   │       ├── DistributionChart.svelte Antwortverteilung
│   │   │       ├── Leaderboard.svelte       Rangliste
│   │   │       ├── NoticeBar.svelte         Fehlermeldungen
│   │   │       ├── OptionGlyph.svelte       Form je Antwortoption
│   │   │       ├── QrCode.svelte            QR-Code (lokal erzeugt)
│   │   │       ├── QuestionImage.svelte     Bild zur Frage
│   │   │       ├── ReviewMatrix.svelte      Auswertung inkl. CSV-Export
│   │   │       ├── RoundAnswers.svelte      Antwortdetails einer Runde
│   │   │       ├── SoundToggle.svelte       Ton an/aus
│   │   │       ├── StatTile.svelte          Kennzahl-Kachel
│   │   │       └── TimerBar.svelte          Countdown-Balken
│   │   └── routes/                 Landing, Join, Play, HostLogin, HostGame,
│   │                               QuizEditor, NotFound
│   ├── server/                     Backend (Node 22)
│   │   ├── index.ts                Bootstrap, Shutdown
│   │   ├── app.ts                  Fastify: API, statische Dateien, SPA-Fallback
│   │   ├── socket.ts               Socket.IO-Handler, Rate-Limits
│   │   ├── config.ts               Konfiguration aus der Umgebung
│   │   ├── hostAuth.ts             Secret-Prüfung, Host-Tokens
│   │   ├── logger.ts               Strukturiertes Logging
│   │   ├── rateLimit.ts            In-Memory Token-Bucket
│   │   ├── quiz/loader.ts          JSON einlesen, validieren, Registry
│   │   └── game/
│   │       ├── GameManager.ts      Verwaltung aller Räume
│   │       ├── Room.ts             Zustandsmaschine einer Session
│   │       ├── scoring.ts          Punkte, Zeitbonus, Streak
│   │       ├── questionSelection.ts Auswahl und Mischen
│   │       ├── roomCode.ts         Raumcodes
│   │       └── nickname.ts         Normalisierung und Entschärfung
│   └── shared/                     Von Client und Server genutzt
│       ├── types.ts                Domänentypen
│       └── events.ts               Socket.IO-Eventtypen
├── tests/                          Vitest (13 Dateien, 192 Tests)
├── public/                         favicon.svg, robots.txt
├── scripts/build-server.mjs        esbuild-Bundle des Servers
├── Dockerfile                      Multi-Stage, node:22-alpine, non-root
├── docker-compose.yml              app + traefik
├── Makefile                        make up / down / logs / doctor …
├── .env.example                    Vorlage für .env
└── index.html                      Vite-Einstiegspunkt
```

---

## Routen

| Route              | Zweck                                                |
| ------------------ | ---------------------------------------------------- |
| `/`                | Landingpage mit „Quiz beitreten" und „Host"           |
| `/join`            | Raumcode und Nickname eingeben                       |
| `/join/ABC123`     | wie oben, Raumcode ist vorbelegt (Ziel des QR-Codes) |
| `/play`            | Teilnehmeransicht während des Spiels                 |
| `/host`            | Host-Anmeldung, danach Quizauswahl und Konfiguration |
| `/host/game/:code` | Beamer- und Steuerungsansicht                        |

### HTTP-API

| Endpunkt               | Beschreibung                                        |
| ---------------------- | --------------------------------------------------- |
| `GET /api/health`      | `{"status":"ok"}` — auch der Docker-Healthcheck      |
| `GET /api/meta`        | Anzahl Quizze, Auswahlgrößen, öffentliche Basis-URL |
| `GET /api/quizzes`     | Auswahlliste **ohne Fragen und ohne Lösungen**      |
| `POST /api/host/login` | Host-Secret gegen Host-Token, 10 Versuche/Minute/IP |
| `GET /api/rooms/:code` | Existiert der Raum? Kann man noch beitreten?        |
| `GET /quiz-media/*`    | Bilder aus `quizzes/media/`                         |

Nur mit gültigem Host-Token (`Authorization: Bearer ...`):

| Endpunkt                    | Beschreibung                                          |
| --------------------------- | ----------------------------------------------------- |
| `GET /api/host/quizzes`     | alle Quizze samt Herkunft, Bilderliste, Upload-Grenzen |
| `POST /api/host/quizzes`    | Quiz prüfen und in den Arbeitsspeicher aufnehmen       |
| `DELETE /api/host/quizzes/:id` | hochgeladenes Quiz entfernen                       |
| `POST /api/host/media`      | Bild hochladen (roher Byte-Strom, Name in `x-filename`) |
| `DELETE /api/host/media/*`  | hochgeladenes Bild entfernen                           |

### Socket.IO-Events

**Client → Server**: `join_room`, `reconnect_player`, `submit_answer`, `leave_room`,
`host_create_game`, `host_join_room`, `host_start_game`, `host_reveal`, `host_next`,
`host_show_leaderboard`, `host_end_game`, `host_kick_player`, `host_set_auto`,
`host_get_review`

**Server → Client**: `room_state`, `player_joined`, `player_left`, `question_started`,
`timer_sync`, `answer_locked`, `answer_progress`, `question_locked`, `reveal_answer`,
`personal_result`, `leaderboard`, `personal_standing`, `game_finished`, `room_closed`

Alle Events sind in `src/shared/events.ts` typisiert. Jedes Client-Event wird serverseitig
validiert und antwortet über ein Ack mit `{ ok: true, data }` oder
`{ ok: false, error: { code, message } }`.

---

## Spielmechanik

### Zustandsmaschine

```
LOBBY ──Start──→ QUESTION ──Zeit abgelaufen / alle geantwortet──→ LOCKED
                     │                                              │
                     └──────────────── Reveal ──────────────────────┤
                                                                    ▼
                                                                 REVEAL
                                                                    │
                                              ┌──── Leaderboard ────┤
                                              ▼                     │
                                         LEADERBOARD ───── Next ────┤
                                                                    ▼
                                              (nächste Runde) ── QUESTION
                                                                    │
                                              letzte Runde / End Game
                                                                    ▼
                                                                 FINISHED
```

### Punkte

| Bestandteil     | Wert                                         |
| --------------- | -------------------------------------------- |
| Basis           | 1000 Punkte für eine richtige Antwort        |
| Zeitbonus       | 0–300 Punkte, linear nach verbleibender Zeit |
| Streak ab 2     | × 1,05                                       |
| Streak ab 3     | × 1,10                                       |
| Streak ab 5     | × 1,15                                       |
| Falsche Antwort | 0 Punkte, Streak zurück auf 0                |

Der Multiplikator wirkt auf `Basis + Zeitbonus`. Beispiel: sofort richtig bei Streak 5 ⇒
`(1000 + 300) × 1,15 = 1495`. Negative Punkte gibt es nicht.

### Timer

- **Standard**: die in der Frage hinterlegte Dauer (20 s, bei `difficulty: 3` 25 s)
- **Relaxed**: 30 Sekunden für jede Frage
- **Fast**: 12 Sekunden für jede Frage

Der Server sendet den Countdown als `timer_sync`; der Client interpoliert nur zwischen zwei
Ticks und rechnet die Serverzeit gegen seine eigene Uhr auf.

### Reconnect

Beim Beitritt erhält jeder Teilnehmer einen zufälligen `playerToken` im localStorage. Nach
einem Reload oder einer WLAN-Unterbrechung meldet sich der Client automatisch wieder an
(unbegrenzte Versuche, 0,6–4 s Abstand).

Wiederhergestellt werden Nickname, Punktestand, Streak und Platzierung, die laufende Runde
inklusive verbleibender Zeit, eine bereits abgegebene Antwort sowie das Rundenergebnis bzw.
die Rangliste.

Ein getrennter Teilnehmer wird **nicht** aus dem Raum entfernt: Er bleibt in der Wertung,
eine verpasste Frage zählt wie eine falsche Antwort, und er kann ohne Zeitlimit
zurückkommen. Verbindet sich ein Gerät neu, bevor der Server die alte Verbindung ausgetimet
hat, wird die verspätete Trennung des alten Sockets ignoriert.

**Was ein Reconnect nicht kann**: Der Countdown läuft während des Ausfalls weiter. Dauert
die Unterbrechung länger als die Restzeit, ist die Antwortchance für diese Runde vorbei.

---

## Konfiguration

`.env` (aus `.env.example` erzeugt):

| Variable      | Standard                 | Bedeutung                  |
| ------------- | ------------------------ | -------------------------- |
| `DOMAIN`      | `mycardbox.de`           | öffentliche Domain         |
| `ACME_EMAIL`  | `leon.stuempeley@gmx.de` | Kontakt für Let's Encrypt  |
| `HOST_SECRET` | leer                     | wird von `make up` erzeugt |
| `NODE_ENV`    | `production`             | Laufzeitmodus              |

Optionale Feineinstellungen (Umgebungsvariablen des App-Containers):

| Variable                 | Standard  | Bedeutung                                  |
| ------------------------ | --------- | ------------------------------------------ |
| `PORT`                   | `3000`    | interner Port                              |
| `HOST_BIND`              | `0.0.0.0` | Bind-Adresse                               |
| `QUIZZES_DIR`            | `quizzes` | Verzeichnis mit den Quiz-Dateien           |
| `LOG_LEVEL`              | `info`    | `debug`, `info`, `warn`, `error`           |
| `MAX_PLAYERS`            | `300`     | Teilnehmer pro Raum                        |
| `MAX_ROOMS`              | `50`      | gleichzeitige Sessions                     |
| `ROOM_TTL_MINUTES`       | `240`     | Aufräumen inaktiver Räume                  |
| `HOST_TOKEN_TTL_MINUTES` | `480`     | Gültigkeit einer Host-Anmeldung            |
| `ANSWER_GRACE_MS`        | `750`     | Kulanz für Netzwerklatenz bei der Deadline |
| `PUBLIC_BASE_URL`        | –         | überschreibt die aus `DOMAIN` gebaute URL  |

Zusätzlich für Traefik (ebenfalls in der `.env` setzbar):

| Variable        | Standard       | Bedeutung                                                           |
| --------------- | -------------- | ------------------------------------------------------------------- |
| `TRAEFIK_IMAGE` | `traefik:v3.6` | Traefik-Image; **mindestens 3.6.1** wegen der Docker-API-Aushandlung |

---

## Make-Befehle

| Befehl         | Wirkung                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `make up`      | `.env` vorbereiten, `HOST_SECRET` erzeugen, bauen, starten, Status zeigen |
| `make down`    | Container stoppen und entfernen — **Zertifikate bleiben erhalten**        |
| `make restart` | Container neu starten                                                    |
| `make reset`   | Nur die App neu starten ⇒ laufende Quiz-Sessions werden verworfen         |
| `make logs`    | Logs folgen (letzte 200 Zeilen)                                          |
| `make ps`      | Container-Status                                                         |
| `make build`   | Images neu bauen                                                         |
| `make update`  | `git pull` + Konfigurationsprüfung + Build + Neustart                    |
| `make clean`   | Container, Image und Build-Reste entfernen — **Zertifikate bleiben**      |
| `make doctor`  | Deployment diagnostizieren: DNS, Ports, Router, Zertifikat, Logs         |
| `make status`  | URLs und `HOST_SECRET` anzeigen                                          |
| `make secret`  | nur das `HOST_SECRET` ausgeben                                           |
| `make url`     | nur die öffentliche URL ausgeben                                         |

Die Let's-Encrypt-Zertifikate liegen im benannten Volume `quiz-app-letsencrypt`. Weder
`make down` noch `make clean` fassen dieses Volume an — es gibt in keinem Target ein
`docker compose down -v`.

---

## Entwicklung

Voraussetzung: Node.js 22 und npm.

```bash
npm install
npm run dev
```

`npm run dev` startet parallel **Vite** auf <http://localhost:5173> mit Hot Module
Replacement und **Fastify + Socket.IO** auf Port 3000 mit `tsx watch`. Vite proxied `/api`
und `/socket.io` auf den Backend-Port; im Browser wird nur Port 5173 benötigt.

Ist kein `HOST_SECRET` gesetzt, erzeugt der Server im Entwicklungsmodus eines und schreibt
es beim Start in die Konsole. Im Produktionsmodus verweigert er ohne Secret den Start.

### npm-Skripte

| Skript              | Wirkung                                               |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Frontend-HMR und Backend-Watch parallel               |
| `npm run build`     | Client (Vite) und Server (esbuild) bauen              |
| `npm start`         | gebauten Server starten                               |
| `npm run typecheck` | `tsc` für Server/Tests, `svelte-check` für den Client |
| `npm run lint`      | ESLint über TypeScript und Svelte                     |
| `npm test`          | Vitest                                                |
| `npm run format`    | Prettier                                              |

---

## Fehlersuche

Erste Anlaufstelle bei jedem Problem:

```bash
make doctor
```

Das prüft in einem Durchgang: laufende und beendete Container, Docker-API- und
Traefik-Version, die Traefik-Labels am App-Container, den A-Record gegen die eigene
öffentliche IP, belegte Ports, die Erreichbarkeit von HTTP/HTTPS und des ACME-Pfads, das
ausgelieferte Zertifikat, `acme.json`, die ACME-Zeilen aus dem Traefik-Log sowie Images,
Arbeitsspeicher und Plattenplatz.

### Es wird nur „TRAEFIK DEFAULT CERT" ausgeliefert

Das heißt: Für diesen Hostnamen greift **kein Router** oder es existiert **noch kein
Zertifikat**. Die häufigsten Ursachen:

1. **Traefik kann die Docker-API nicht sprechen.** Im Log steht dann
   `client version 1.24 is too old. Minimum supported API version is 1.40`. Traefik liest
   dann überhaupt keine Container-Labels — es entsteht kein einziger Router, und jede
   Anfrage landet beim Default-Zertifikat.

   Ursache: Traefik **vor 3.6.1** pinnt die Docker-API hart auf Version 1.24; Docker Engine
   29 hat die unterstützte Mindestversion angehoben. `DOCKER_API_VERSION` hilft **nicht** —
   Traefik ignoriert die Variable. Deshalb verwendet die `docker-compose.yml`
   `traefik:v3.6`. Eine andere Version über die `.env`:

   ```dotenv
   TRAEFIK_IMAGE=traefik:v3.6.25
   ```

   Wer Traefik nicht aktualisieren kann, senkt alternativ die Mindestversion des Daemons in
   `/etc/docker/daemon.json` und startet Docker neu:

   ```json
   { "min-api-version": "1.24" }
   ```

2. **DNS zeigt nicht auf diesen Server.** `make doctor` vergleicht den A-Record mit der
   öffentlichen IP.
3. **Port 80 ist von außen nicht erreichbar.** Die Challenge läuft ausschließlich über HTTP.
4. **Ein anderer Dienst belegt bereits 80/443.** `make doctor` listet die Belegung.
5. **Es ist noch zu früh.** Das erste Zertifikat braucht typischerweise 30–60 Sekunden.

> Let's Encrypt begrenzt fehlgeschlagene Validierungen (5 pro Hostname und Stunde).

### Der Host sieht kein Quiz zur Auswahl

`make logs | grep quiz` zeigt, welche Dateien gelesen und welche wegen eines Fehlers
übersprungen wurden. Die Fehlermeldung steht auch direkt in der Host-Auswahl.

---

## Tests

```bash
npm test
```

192 Tests in 13 Dateien decken ab:

- **Bilder** — Pfadprüfung gegen Verzeichniswechsel und absolute Pfade, erlaubte Formate,
  vorhandene Dateien in den ausgelieferten Quizzen
- **Variable Antwortanzahl** — 2 bis 6 Optionen, Ablehnung von Buchstaben außerhalb der
  Runde, Verteilung und Wertung bei zwei und sechs Antworten
- **Themenauswertung** — Summen passen zu den Runden, Sortierung, keine Division durch null
- **Bild-Uploads** — Formaterkennung am Dateianfang, getarnte Inhalte und SVG abgelehnt,
  Namen entschärft, Grenzen für Größe, Gesamtvolumen und Anzahl, Pfadprüfung
- **Upload und Entfernen** — gültige Uploads werden spielbar, ungültige abgelehnt,
  Kollision mit einer Datei verhindert, Grenzen für Anzahl und Fragen, Dateien lassen sich
  nicht über den Upload-Weg löschen
- **Quiz-Dateien** — Schema-Validierung, fehlende Pflichtfelder, falsche Antwort-ids,
  doppelte Texte, ungültige `correctAnswer`, defekte JSON-Dateien, doppelte Quiz-ids,
  Nachladen ohne Neustart; zusätzlich werden alle ausgelieferten Quizze geprüft
- **Punkteberechnung** — Basis, Grenzwerte, Ganzzahligkeit, keine negativen Punkte
- **Zeitbonus** — linear, geklemmt, robust gegen `NaN` und Dauer 0
- **Streak** — Stufen 2 / 3 / 5, Rücksetzen bei falscher Antwort
- **Nur eine Antwort pro Runde** — zweite Abgabe wird abgelehnt
- **Deadline** — Antworten nach Ablauf plus Kulanz werden abgelehnt
- **Nickname-Duplikate** — auch bei abweichender Schreibweise
- **Nickname-Entschärfung** — HTML-, Steuer- und Bidi-Zeichen werden entfernt
- **Raumcode-Erzeugung** — Länge, lesbares Alphabet, Eindeutigkeit
- **Host-Autorisierung** — Secret-Vergleich, Token-Ausgabe, Ablauf, Widerruf
- **Fragenauswahl** — duplikatfrei, korrekte Anzahl, Standardliste, Mischen
- **Reconnect** — Punkte und Antwort überleben eine Trennung
- **Automatik** — geplante Schritte, manuelle Aktionen gewinnen, Anhalten und Fortsetzen
- **Auswertung** — wer hat was und wie schnell geantwortet, laufende Runde bleibt verborgen
- **Robustheit** — manipulierte Socket-Payloads führen zu Fehlerantworten, nicht zu Abstürzen

---

## Sicherheit

- **Host-Schutz serverseitig**: Secret-Prüfung mit `timingSafeEqual`, danach kurzlebige
  Host-Tokens. Jedes Host-Kommando wird erneut geprüft.
- **Keine Lösung vor dem Reveal**: Die an Clients ausgelieferte Frage enthält weder
  `correctAnswer` noch `explanation`. Beides kommt erst mit `reveal_answer`.
- **Quiz-Auswahlliste ohne Inhalte**: `GET /api/quizzes` liefert nur Name, Beschreibung,
  Fach, Kategorien und Anzahl — nie Fragen oder Lösungen.
- **Kein Vertrauen in Client-Werte**: Punkte, Zeit und Rang berechnet der Server.
- **Genau eine Antwort pro Runde**, Antworten nach der Deadline werden abgelehnt.
- **Rate-Limits**: Host-Login 10/Minute/IP, Beitritt 8/Minute pro Socket zusätzlich zu
  einem groben IP-Limit, Antworten 40/Minute pro Socket, Host-Kommandos 240/Minute. Die
  engen Limits hängen bewusst an der Socket-Verbindung, nicht an der IP — eine ganze
  Schulklasse sitzt hinter derselben öffentlichen Adresse.
- **Eingabevalidierung**: Nicknames werden getrimmt, auf 2–24 Zeichen begrenzt, von Steuer-,
  Zero-Width- und Bidi-Zeichen befreit; `<` und `>` werden entfernt. Quiz-Dateien werden
  streng validiert, Feldlängen begrenzt.
- **Bildpfade**: nur relativ, kein `..`, keine Laufwerksbuchstaben, nur zugelassene
  Endungen. Ausgeliefert wird ausschließlich aus `quizzes/media` oder aus dem Upload-Speicher.
- **Bild-Uploads**: Der Typ wird am Dateianfang erkannt, nicht am Namen; SVG ist als
  Upload gesperrt. Bilder gehen mit `X-Content-Type-Options: nosniff` und einer
  restriktiven `Content-Security-Policy` samt `sandbox` raus.
- **Robuste Events**: Jeder Handler validiert seine Nutzlast und ist in `try/catch`
  gekapselt.
- **Keine personenbezogenen Daten**: gespeichert werden nur der frei gewählte Nickname und
  der Punktestand — im Arbeitsspeicher, bis die Session endet. Keine Datenbank, keine
  Cookies, kein Tracking.
- **Transport**: Traefik erzwingt HTTPS. Das Dashboard ist deaktiviert, der Docker-Socket
  read-only eingebunden, der App-Port nicht veröffentlicht.
- **Container**: läuft als `node` (UID 1000), nicht als root. Der Quiz-Ordner ist
  schreibgeschützt eingebunden.

---

## Bekannte Einschränkungen

Bewusste Entscheidungen, keine offenen Baustellen:

1. **Zustand nur im Arbeitsspeicher.** Ein Neustart des App-Containers beendet alle
   laufenden Sessions. Für eine Unterrichtsstunde ist das der richtige Kompromiss.
2. **Eine Instanz.** Ohne gemeinsamen Zustand ist kein horizontales Skalieren möglich.
3. **Beitritt nur in der Lobby.** Wer zu spät kommt, kann der laufenden Runde nicht mehr
   beitreten. Ein Reconnect bestehender Teilnehmer ist jederzeit möglich.
4. **Nickname-Kollisionen pro Raum.** Zwei Teilnehmer können nicht denselben Namen nutzen.
5. **Ein Host-Secret für alle.** Es gibt keine Benutzerverwaltung und keine Rollen.
6. **Host-Tokens überleben keinen Neustart.** Danach muss sich der Host erneut anmelden.
7. **Ergebnisse leben nur bis zum Neustart.** Die Endkarte zeigt die vollständige
   Auswertung und bietet einen CSV-Export; eine Historie gibt es nicht.
8. **Zwei bis sechs Antworten je Frage, genau eine richtig.** Mehrfachauswahl, freie
   Texteingabe oder Zahlenschätzungen unterstützt das Schema nicht.
9. **Hochgeladene Quizze überleben keinen Neustart.** Der Editor erzeugt eine JSON-Datei
   zum Herunterladen und kann sie in den Arbeitsspeicher übernehmen; dauerhaft wird ein
   Quiz erst, wenn die Datei im Ordner `quizzes/` liegt. Der Server schreibt bewusst nie
   selbst auf die Platte.
10. **Hochgeladene Bilder überleben keinen Neustart** und können kein SVG sein. Dauerhafte
    Bilder gehören nach `quizzes/media/`.
11. **Sounds sind synthetisch.** Kurze WebAudio-Töne statt lizenzierter Dateien. Browser
    starten Audio erst nach der ersten Nutzerinteraktion. Abschaltbar.
12. **Genau eine Domain.** Der Traefik-Router ist auf `Host(DOMAIN)` gebunden; `www.` wird
    nicht mit ausgeliefert.

---

## Lizenz

Unterrichtsmaterial. Frei für den schulischen Einsatz verwendbar.

&copy; leonstue software
