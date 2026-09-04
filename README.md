# Sequence Challenge

Live-Quiz für eine Unterrichtsstunde zum Thema **UML-Sequenzdiagramme**.

Der Host projiziert die Beameransicht, die Klasse spielt mit dem Smartphone mit — ohne
Registrierung, ohne E-Mail, ohne Passwort. Nur Raumcode und Nickname.

- **Beamer / Host**: Lobby mit QR-Code, Frage mit Countdown, Antwortzähler, Auflösung mit
  Verteilungsdiagramm und Erklärung, Rangliste.
- **Smartphone / Teilnehmer**: Frage, vier große Antwortflächen, Ergebnis mit Punkten,
  Streak und Platzierung.

Der Server ist autoritativ: Timer, Punkte und die korrekte Antwort liegen ausschließlich
serverseitig. Der Client erfährt die Lösung erst beim Reveal.

---

## Inhalt

- [Schnellstart auf dem Server](#schnellstart-auf-dem-server)
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
- [Tests](#tests)
- [Sicherheit](#sicherheit)
- [Bekannte Einschränkungen](#bekannte-einschränkungen)

---

## Schnellstart auf dem Server

```bash
git clone <REPOSITORY-URL> sequence-challenge
cd sequence-challenge
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

Steht in der `.env` noch die Platzhalter-Domain `quiz.example.de` oder gar keine, bricht
`make up` mit einem erklärenden Hinweis ab.

---

## Server-Setup

### Voraussetzungen

| Werkzeug              | Hinweis                                        |
| --------------------- | ---------------------------------------------- |
| Ubuntu                | getestet mit 22.04 / 24.04                     |
| Docker Engine         | `docker --version`                             |
| Docker Compose Plugin | `docker compose version`                       |
| make                  | `apt install make`                             |
| git                   | `apt install git`                              |
| openssl               | für die Erzeugung des `HOST_SECRET`            |

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

Erreichbar sein müssen:

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
git clone <REPOSITORY-URL> sequence-challenge
cd sequence-challenge
make up          # legt .env an, erzeugt HOST_SECRET, baut und startet
```

Aufrufen:

- Teilnehmer: <https://mycardbox.de>
- Host: <https://mycardbox.de/host>

Das erste Zertifikat kann 30–60 Sekunden dauern. Fortschritt beobachten:

```bash
make logs
```

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
3. Die App — baut daraus die Join-Adresse und den QR-Code
   (`https://mycardbox.de/join/CODE`), die in der Lobby auf dem Beamer stehen.

`ACME_EMAIL` ist bereits auf `leon.stuempeley@gmx.de` vorbelegt und muss nicht geändert
werden.

> Die `.env` ist über `.gitignore` vom Commit ausgeschlossen und enthält das Host-Secret.

---

## HOST_SECRET

Das `HOST_SECRET` ist das Passwort für die Host-Ansicht. Verhalten:

- **Automatische Erzeugung**: Ist `HOST_SECRET` in der `.env` leer, erzeugt `make up`
  automatisch einen Wert mit `openssl rand -hex 24` (48 Hex-Zeichen) und schreibt ihn in
  die `.env`.
- **Stabil**: Ein bereits gesetztes Secret wird bei weiteren `make up`-Aufrufen niemals
  überschrieben.
- **Anzeige**: `make up` gibt es am Ende aus, jederzeit abrufbar über `make secret`.
- **Ändern**: Wert in der `.env` überschreiben, dann `make reset` (oder `make up`).
  Bereits angemeldete Host-Sitzungen bleiben bis zum Neustart der App gültig, weil die
  ausgegebenen Host-Tokens im Speicher der App liegen.

Sicherheitseigenschaften:

- Das Secret verlässt **niemals** den Server. Teilnehmer bekommen es weder im HTML,
  noch im JavaScript-Bundle, noch über Socket.IO.
- Geprüft wird serverseitig unter `POST /api/health`-Nachbarroute `POST /api/host/login`
  mit einem **zeitkonstanten Vergleich** (`crypto.timingSafeEqual`).
- Bei Erfolg gibt es ein zufälliges, ablaufendes **Host-Token** (Standard: 8 Stunden).
  Jedes Host-Kommando über Socket.IO trägt dieses Token; ohne gültiges Token wird das
  Kommando abgelehnt.
- Der Login ist auf **10 Versuche pro Minute und IP** begrenzt.

---

## Ablauf einer Unterrichtsstunde

1. `https://DEINE-DOMAIN/host` öffnen, `HOST_SECRET` eingeben.
2. Anzahl Fragen (Standard 12), Timer-Preset und optional Zufallsauswahl wählen,
   **Quiz erstellen**.
3. Die Lobby auf den Beamer legen (Vollbild-Button oben rechts oder Taste `F`).
   Die Klasse scannt den QR-Code oder tippt Code und Nickname ein.
4. **Start** — die erste Frage läuft.
5. **Reveal** — Verteilung, Lösung und Erklärung erscheinen.
6. Optional **Leaderboard** — Zwischenstand.
7. **Next** — nächste Frage. Nach der letzten Runde führt **Next** zum Endstand.
8. **End Game** — bricht jederzeit ab und zeigt die finale Rangliste.

Alle Übergänge steuert der Host manuell. Automatisch passiert nur zweierlei: Der Timer
sperrt die Antworten nach Ablauf der Zeit, und die Runde wird gesperrt, sobald alle
Teilnehmer geantwortet haben. Aufgelöst wird trotzdem erst auf Knopfdruck.

### Tastenkürzel in der Beameransicht

| Taste             | Wirkung          |
| ----------------- | ---------------- |
| `S`               | Start            |
| `R`               | Reveal           |
| `L`               | Leaderboard      |
| `N` oder `Leertaste` | Next          |
| `F`               | Vollbild         |

---

## Architektur

**Ein** Repository, **ein** Anwendungscontainer, **keine** Datenbank.

```
Browser (Beamer)  ─┐
                   ├─ HTTPS + WebSocket ─→ Traefik v3 ─→ App-Container (Node 22)
Browser (Handy)   ─┘        :443/:80         (TLS,          ├─ Fastify  → REST + statische Dateien
                                              Redirect,     └─ Socket.IO → Realtime-Events
                                              Let's Encrypt)
```

- **Frontend**: Svelte 5 (Runes) + TypeScript + Vite + Tailwind CSS v4 + Lucide-Icons.
  Eigener, minimaler History-Router. Kein React, keine SSR-Schicht.
- **Backend**: Node.js 22, Fastify 5 (REST + Auslieferung des Client-Builds), Socket.IO 4
  für die Realtime-Kommunikation. Beide teilen sich denselben HTTP-Server.
- **Zustand**: ausschließlich im Prozessspeicher (`GameManager` → `Room`). Ein Neustart
  der App verwirft alle laufenden Sessions — das ist beabsichtigt.
- **Build**: Vite baut den Client nach `dist/client`, esbuild bündelt den Server zu einer
  einzelnen ESM-Datei `dist/server/index.js`. Im Produktionsbetrieb liefert Fastify den
  Client aus, inklusive SPA-Fallback auf `index.html`.
- **Geteilte Typen**: `src/shared` wird von Client und Server importiert — Events,
  Zustandstypen und der Fragenpool sind dadurch nur einmal definiert.

### Autoritativer Server

| Aufgabe                      | Wer entscheidet |
| ---------------------------- | --------------- |
| Countdown / Deadline         | Server          |
| Punkte, Zeitbonus, Streak    | Server          |
| Reihenfolge der Antworten    | Server (pro Runde neu gemischt) |
| Korrekte Antwort             | Server, wird erst beim Reveal gesendet |
| Phasenwechsel                | Server, ausgelöst durch Host-Kommandos |

Der Client sendet ausschließlich „ich wähle B“ — nie Punkte, nie Zeitstempel.

---

## Dateibaum

```
.
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
│   │   │   ├── socket.ts           Socket.IO-Client, Ack-Helfer, Host-Login
│   │   │   ├── sound.svelte.ts     WebAudio-Töne (keine externen Assets)
│   │   │   ├── storage.ts          localStorage gekapselt
│   │   │   └── components/
│   │   │       ├── AnswerOption.svelte      Antwortfläche
│   │   │       ├── Backdrop.svelte          Hintergrund (Grid, Lifelines)
│   │   │       ├── Brand.svelte             Logo und Wortmarke
│   │   │       ├── DistributionChart.svelte Antwortverteilung
│   │   │       ├── Leaderboard.svelte       Rangliste
│   │   │       ├── NoticeBar.svelte         Fehlermeldungen
│   │   │       ├── OptionGlyph.svelte       Form je Antwortoption
│   │   │       ├── QrCode.svelte            QR-Code (lokal erzeugt)
│   │   │       ├── SoundToggle.svelte       Ton an/aus
│   │   │       ├── StatTile.svelte          Kennzahl-Kachel
│   │   │       └── TimerBar.svelte          Countdown-Balken
│   │   └── routes/
│   │       ├── Landing.svelte      /
│   │       ├── Join.svelte         /join und /join/:code
│   │       ├── Play.svelte         /play
│   │       ├── HostLogin.svelte    /host
│   │       ├── HostGame.svelte     /host/game/:code
│   │       └── NotFound.svelte     404
│   ├── server/                     Backend (Node 22)
│   │   ├── index.ts                Bootstrap, Shutdown
│   │   ├── app.ts                  Fastify: API, statische Dateien, SPA-Fallback
│   │   ├── socket.ts               Socket.IO-Handler, Rate-Limits
│   │   ├── config.ts               Konfiguration aus der Umgebung
│   │   ├── hostAuth.ts             Secret-Prüfung, Host-Tokens
│   │   ├── logger.ts               Strukturiertes Logging
│   │   ├── rateLimit.ts            In-Memory Token-Bucket
│   │   └── game/
│   │       ├── GameManager.ts      Verwaltung aller Räume
│   │       ├── Room.ts             Zustandsmaschine einer Session
│   │       ├── scoring.ts          Punkte, Zeitbonus, Streak
│   │       ├── questionSelection.ts Auswahl und Mischen
│   │       ├── roomCode.ts         Raumcodes
│   │       └── nickname.ts         Normalisierung und Entschärfung
│   └── shared/                     Von Client und Server genutzt
│       ├── types.ts                Domänentypen
│       ├── events.ts               Socket.IO-Eventtypen
│       └── questions.ts            30 Fragen inklusive Erklärungen
├── tests/                          Vitest (8 Dateien, 104 Tests)
├── public/                         favicon.svg, robots.txt
├── scripts/build-server.mjs        esbuild-Bundle des Servers
├── Dockerfile                      Multi-Stage, node:22-alpine, non-root
├── docker-compose.yml              app + traefik
├── Makefile                        make up / down / logs / …
├── .env.example                    Vorlage für .env
├── index.html                      Vite-Einstiegspunkt
├── vite.config.ts
├── vitest.config.ts
├── svelte.config.js
├── eslint.config.js
├── tsconfig.json                   Client und shared
└── tsconfig.node.json              Server und Tests
```

---

## Routen

| Route              | Zweck                                                            |
| ------------------ | ---------------------------------------------------------------- |
| `/`                | Landingpage mit „Quiz beitreten“ und „Host“                       |
| `/join`            | Raumcode und Nickname eingeben                                   |
| `/join/ABC123`     | wie oben, Raumcode ist vorbelegt (Ziel des QR-Codes)             |
| `/play`            | Teilnehmeransicht während des Spiels                             |
| `/host`            | Host-Anmeldung, danach Konfiguration einer neuen Session         |
| `/host/game/:code` | Beamer- und Steuerungsansicht                                    |

### HTTP-API

| Endpunkt              | Beschreibung                                                |
| --------------------- | ----------------------------------------------------------- |
| `GET /api/health`     | `{"status":"ok"}` — auch der Docker-Healthcheck              |
| `GET /api/meta`       | Poolgröße und wählbare Fragenanzahlen                        |
| `POST /api/host/login` | Host-Secret gegen Host-Token, 10 Versuche/Minute/IP         |
| `GET /api/rooms/:code` | Existiert der Raum? Kann man noch beitreten?                |

### Socket.IO-Events

**Client → Server**: `join_room`, `reconnect_player`, `submit_answer`, `leave_room`,
`host_create_game`, `host_join_room`, `host_start_game`, `host_reveal`, `host_next`,
`host_show_leaderboard`, `host_end_game`, `host_kick_player`

**Server → Client**: `room_state`, `player_joined`, `player_left`, `question_started`,
`timer_sync`, `answer_locked`, `answer_progress`, `question_locked`, `reveal_answer`,
`personal_result`, `leaderboard`, `personal_standing`, `game_finished`, `room_closed`

Alle Events sind in `src/shared/events.ts` typisiert. Jedes Client-Event wird
serverseitig validiert und antwortet über ein Ack mit
`{ ok: true, data }` oder `{ ok: false, error: { code, message } }`.

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

| Bestandteil     | Wert                                                       |
| --------------- | ---------------------------------------------------------- |
| Basis           | 1000 Punkte für eine richtige Antwort                      |
| Zeitbonus       | 0–300 Punkte, linear nach verbleibender Zeit               |
| Streak ab 2     | × 1,05                                                     |
| Streak ab 3     | × 1,10                                                     |
| Streak ab 5     | × 1,15                                                     |
| Falsche Antwort | 0 Punkte, Streak zurück auf 0                              |

Der Multiplikator wirkt auf `Basis + Zeitbonus`. Beispiel: sofort richtig beantwortet
bei Streak 5 ⇒ `(1000 + 300) × 1,15 = 1495`. Negative Punkte gibt es nicht.

### Timer

- Standard: 20 Sekunden, schwere Fragen (`difficulty: 3`) 25 Sekunden
- Relaxed: 30 Sekunden für jede Frage
- Fast: 12 Sekunden für jede Frage

Der Server sendet den Countdown als `timer_sync`; der Client interpoliert nur zwischen
zwei Ticks und rechnet die Serverzeit gegen seine eigene Uhr auf.

### Fragen

30 Fragen in `src/shared/questions.ts`, jeweils mit vier Antworten, genau einer richtigen
Lösung, Kategorie, Schwierigkeit und fachlicher Erklärung.

Standardpartie (12 Fragen, `randomizeQuestions = false`): Fragen
`1, 2, 4, 6, 7, 8, 13, 14, 17, 19, 23, 29`.

Wählt der Host mehr Fragen als diese Liste enthält, wird duplikatfrei aus dem restlichen
Pool aufgefüllt. Mit aktivierter Zufallsauswahl zieht der Server duplikatfrei aus allen 30
Fragen. Unabhängig davon wird die **Reihenfolge der vier Antworten in jeder Runde neu
gemischt** — die Buchstaben A–D bezeichnen dabei immer die angezeigte Position.

### Reconnect

Beim Beitritt erhält jeder Teilnehmer einen zufälligen `playerToken`, der im localStorage
liegt. Nach einem Reload oder einer WLAN-Unterbrechung meldet sich der Client automatisch
mit diesem Token wieder an (`reconnection: true`, unbegrenzte Versuche, 0,6–4 s Abstand).

Wiederhergestellt werden dabei:

- Nickname, Punktestand, Streak und Platzierung
- die laufende Runde inklusive Frage, Antwortoptionen und verbleibender Zeit
- eine in dieser Runde bereits abgegebene Antwort (eine zweite ist weiterhin ausgeschlossen)
- bei laufender Auflösung das persönliche Rundenergebnis, bei Rangliste das Leaderboard

Ein getrennter Teilnehmer wird **nicht** aus dem Raum entfernt. Er bleibt mit Punktestand
in der Wertung, wird für eine verpasste Frage wie eine falsche Antwort behandelt und kann
jederzeit zurückkommen — es gibt kein Zeitlimit für den Reconnect. In der Host-Ansicht
erscheint er währenddessen ausgegraut.

Der Server bindet die aktuelle Socket-Verbindung an den Teilnehmer. Verbindet sich ein
Handy neu, bevor der Server die alte Verbindung ausgetimet hat (Ping-Timeout 25 s), wird
die verspätete Trennung des alten Sockets ignoriert — der Teilnehmer bleibt korrekt als
online geführt.

**Was ein Reconnect nicht kann**: Der Countdown des Servers läuft während des Ausfalls
weiter. Dauert die Unterbrechung länger als die Restzeit der Frage, ist die Antwortchance
für diese Runde vorbei. Ab der nächsten Frage ist der Teilnehmer wieder voll dabei.

---

## Konfiguration

`.env` (aus `.env.example` erzeugt):

| Variable      | Standard                   | Bedeutung                                     |
| ------------- | -------------------------- | --------------------------------------------- |
| `DOMAIN`      | `mycardbox.de`             | öffentliche Domain der Anwendung              |
| `ACME_EMAIL`  | `leon.stuempeley@gmx.de`   | Kontakt für Let's Encrypt                     |
| `HOST_SECRET` | leer                       | wird von `make up` erzeugt                    |
| `NODE_ENV`    | `production`               | Laufzeitmodus                                 |

Optionale Feineinstellungen (Umgebungsvariablen des App-Containers, alle mit sinnvollen
Standardwerten):

| Variable              | Standard | Bedeutung                                    |
| --------------------- | -------- | -------------------------------------------- |
| `PORT`                | `3000`   | interner Port                                |
| `HOST_BIND`           | `0.0.0.0`| Bind-Adresse                                 |
| `LOG_LEVEL`           | `info`   | `debug`, `info`, `warn`, `error`             |
| `MAX_PLAYERS`         | `300`    | Teilnehmer pro Raum                          |
| `MAX_ROOMS`           | `50`     | gleichzeitige Sessions                       |
| `ROOM_TTL_MINUTES`    | `240`    | Aufräumen inaktiver Räume                    |
| `HOST_TOKEN_TTL_MINUTES` | `480` | Gültigkeit einer Host-Anmeldung              |
| `ANSWER_GRACE_MS`     | `750`    | Kulanz für Netzwerklatenz bei der Deadline   |
| `PUBLIC_BASE_URL`     | –        | überschreibt die aus `DOMAIN` gebaute Join-URL |

---

## Make-Befehle

| Befehl         | Wirkung                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `make up`      | `.env` vorbereiten, `HOST_SECRET` erzeugen, bauen, starten, Status zeigen |
| `make down`    | Container stoppen und entfernen — **Zertifikate bleiben erhalten**       |
| `make restart` | Container neu starten                                                    |
| `make reset`   | Nur die App neu starten ⇒ alle laufenden Quiz-Sessions werden verworfen  |
| `make logs`    | Logs folgen (letzte 200 Zeilen)                                          |
| `make ps`      | Container-Status                                                         |
| `make build`   | Images neu bauen                                                         |
| `make update`  | `git pull` + Build + Neustart                                            |
| `make clean`   | Container, Image und Build-Reste entfernen — **Zertifikate bleiben**      |
| `make status`  | URLs und `HOST_SECRET` anzeigen                                          |
| `make secret`  | nur das `HOST_SECRET` ausgeben                                           |
| `make url`     | nur die öffentliche URL ausgeben                                         |

Die Let's-Encrypt-Zertifikate liegen im benannten Volume
`sequence-challenge-letsencrypt`. Weder `make down` noch `make clean` fassen dieses Volume
an — es gibt in keinem Target ein `docker compose down -v`. Das Volume müsste man von Hand
mit `docker volume rm sequence-challenge-letsencrypt` löschen.

---

## Entwicklung

Voraussetzung: Node.js 22 und npm.

```bash
npm install
npm run dev
```

`npm run dev` startet parallel:

- **Vite** auf <http://localhost:5173> mit Hot Module Replacement
- **Fastify + Socket.IO** auf Port 3000 mit `tsx watch`

Vite proxied `/api` und `/socket.io` auf den Backend-Port — im Browser wird nur
`http://localhost:5173` benötigt. Traefik ist für die Entwicklung nicht nötig.

Ist kein `HOST_SECRET` gesetzt, erzeugt der Server im Entwicklungsmodus eines und schreibt
es beim Start in die Konsole:

```
[config] Kein HOST_SECRET gesetzt. Entwicklungs-Secret: 7c6f11687e4a98f8
```

Im Produktionsmodus verweigert der Server ohne `HOST_SECRET` den Start.

### npm-Skripte

| Skript              | Wirkung                                              |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Frontend-HMR und Backend-Watch parallel              |
| `npm run build`     | Client (Vite) und Server (esbuild) bauen             |
| `npm start`         | gebauten Server starten                              |
| `npm run typecheck` | `tsc` für Server/Tests, `svelte-check` für den Client |
| `npm run lint`      | ESLint über TypeScript und Svelte                    |
| `npm test`          | Vitest                                               |
| `npm run format`    | Prettier                                             |

---

## Tests

```bash
npm test
```

104 Tests in 8 Dateien decken ab:

- **Punkteberechnung** — Basis, Grenzwerte, Ganzzahligkeit, keine negativen Punkte
- **Zeitbonus** — linear, geklemmt, robust gegen `NaN` und Dauer 0
- **Streak** — Stufen 2 / 3 / 5, Rücksetzen bei falscher Antwort
- **Nur eine Antwort pro Runde** — zweite Abgabe wird mit `ALREADY_ANSWERED` abgelehnt
- **Deadline** — Antworten nach Ablauf plus Kulanz werden abgelehnt
- **Nickname-Duplikate** — auch bei abweichender Groß-/Kleinschreibung und Leerzeichen
- **Nickname-Entschärfung** — HTML-Zeichen, Steuer- und Bidi-Zeichen werden entfernt
- **Raumcode-Erzeugung** — Länge, lesbares Alphabet, Eindeutigkeit, Normalisierung
- **Host-Autorisierung** — Secret-Vergleich, Token-Ausgabe, Ablauf, Widerruf
- **Fragenauswahl** — duplikatfrei, korrekte Anzahl, Standardliste, Mischen
- **Fragenpool-Konsistenz** — je vier Antworten, genau eine Lösung, Erklärung vorhanden
- **Reconnect** — Punkte, Streak und abgegebene Antwort überleben eine Trennung; die
  verspätete Trennung eines abgelösten Sockets schaltet den Teilnehmer nicht offline
- **Robustheit** — manipulierte Socket-Payloads führen zu Fehlerantworten, nicht zu Abstürzen

---

## Sicherheit

- **Host-Schutz serverseitig**: Secret-Prüfung mit `timingSafeEqual`, danach kurzlebige
  Host-Tokens. Jedes Host-Kommando wird erneut geprüft; ein manipulierter Client kann
  keine Session steuern.
- **Keine Lösung vor dem Reveal**: `PublicQuestion` enthält weder `correctAnswer` noch
  `explanation`. Beides wird erst mit `reveal_answer` gesendet.
- **Kein Vertrauen in Client-Werte**: Punkte, Zeit und Rang berechnet ausschließlich der
  Server. Der Client meldet nur die gewählte Option.
- **Genau eine Antwort pro Runde**, Antworten nach der Deadline werden abgelehnt.
- **Rate-Limits**: Host-Login 10/Minute/IP, Beitritt 8/Minute pro Socket zusätzlich zu
  einem groben IP-Limit, Antworten 40/Minute pro Socket, Host-Kommandos 240/Minute.
  Die engen Limits hängen bewusst an der Socket-Verbindung, nicht an der IP — eine ganze
  Schulklasse sitzt hinter derselben öffentlichen Adresse.
- **Eingabevalidierung**: Nicknames werden getrimmt, auf 2–24 Zeichen begrenzt, von
  Steuer-, Zero-Width- und Bidi-Zeichen befreit; `<` und `>` werden entfernt. Zusätzlich
  escapen die Svelte-Templates jede Ausgabe.
- **Robuste Events**: Jeder Handler validiert seine Nutzlast und ist in `try/catch`
  gekapselt. `null`, falsche Typen oder unbekannte Felder erzeugen eine Fehlerantwort.
- **Keine personenbezogenen Daten**: gespeichert werden nur der frei gewählte Nickname und
  der Punktestand — im Arbeitsspeicher, bis die Session endet oder die App neu startet.
  Keine Datenbank, keine Logdatei mit Nicknames, keine Cookies, kein Tracking.
- **Transport**: Traefik erzwingt HTTPS und leitet HTTP dauerhaft um. Das Traefik-
  Dashboard ist deaktiviert, der Docker-Socket read-only eingebunden, der App-Port nicht
  veröffentlicht.
- **Container**: läuft als `node` (UID 1000), nicht als root.

---

## Bekannte Einschränkungen

Bewusste Entscheidungen, keine offenen Baustellen:

1. **Zustand nur im Arbeitsspeicher.** Ein Neustart des App-Containers (`make reset`,
   `make restart`, `make update`) beendet alle laufenden Quiz-Sessions. Für eine
   Unterrichtsstunde ist das der richtige Kompromiss — dafür gibt es keine Datenbank und
   keine Datenhaltung.
2. **Eine Instanz.** Ohne gemeinsamen Zustand ist kein horizontales Skalieren möglich.
   Für eine Schulklasse (Limit: 300 Teilnehmer pro Raum) ist eine Instanz reichlich.
3. **Beitritt nur in der Lobby.** Wer zu spät kommt, kann der laufenden Runde nicht mehr
   beitreten — sonst wäre die Wertung nicht vergleichbar. Ein Reconnect bestehender
   Teilnehmer ist jederzeit möglich.
4. **Nickname-Kollisionen pro Raum.** Zwei Teilnehmer können nicht denselben Namen
   verwenden; die Prüfung ignoriert Groß-/Kleinschreibung und Leerzeichen.
5. **Ein Host-Secret für alle.** Es gibt keine Benutzerverwaltung und keine Rollen. Wer
   das Secret hat, kann Sessions anlegen und steuern.
6. **Host-Tokens überleben keinen Neustart.** Nach einem App-Neustart muss sich der Host
   erneut anmelden.
7. **Ergebnisse werden nicht exportiert.** Nach `End Game` steht die Rangliste auf dem
   Beamer; es gibt keinen CSV-Download und keine Historie.
8. **Sounds sind synthetisch.** Statt lizenzierter Audiodateien erzeugt die App kurze Töne
   per WebAudio. Browser starten Audio erst nach der ersten Nutzerinteraktion — auf der
   Beameransicht also nach dem ersten Klick oder Tastendruck. Abschaltbar über den
   Lautsprecher-Button.
9. **Genau eine Domain.** Der Traefik-Router ist auf `Host(DOMAIN)` gebunden, also auf
   `mycardbox.de`. `www.mycardbox.de` wird **nicht** mit ausgeliefert. Wer das möchte,
   erweitert die Router-Regel in der `docker-compose.yml` auf
   ``Host(`${DOMAIN}`) || Host(`www.${DOMAIN}`)`` — dann muss aber auch ein DNS-Record für
   `www` existieren, sonst scheitert die ACME-Challenge für diesen Namen.
10. **Kein IPv6-Zwang.** Ein AAAA-Record funktioniert, ist aber nicht erforderlich.

---

## Lizenz

Unterrichtsmaterial. Frei für den schulischen Einsatz verwendbar.
