# Quiz App -- Betrieb auf einem Ubuntu-Server
#
#   make up       Erstkonfiguration, Build und Start
#   make down     Container stoppen (Zertifikate bleiben erhalten)
#   make logs     Logs folgen
#
# Wichtig: "down" und "clean" entfernen NIEMALS das Let's-Encrypt-Volume.

SHELL := /bin/bash
.ONESHELL:
.DEFAULT_GOAL := help

COMPOSE  := docker compose
ENV_FILE := .env
ENV_EXAMPLE := .env.example
PW_FILE := .pw
LE_VOLUME := quiz-app-letsencrypt

.PHONY: help up down restart logs ps build update clean reset env status secret url check-tools doctor legacy-cleanup

## help: Verfuegbare Befehle anzeigen
help:
	@echo ""
	@echo "  Quiz App -- Live-Quiz zu UML-Sequenzdiagrammen"
	@echo ""
	@echo "  make up        .env vorbereiten, Images bauen, Stack starten"
	@echo "  make down      Container stoppen und entfernen (Zertifikate bleiben)"
	@echo "  make restart   Container neu starten"
	@echo "  make reset     App neu starten -> alle laufenden Quiz-Sessions verwerfen"
	@echo "  make logs      Logs folgen (letzte 200 Zeilen)"
	@echo "  make ps        Container-Status"
	@echo "  make build     Images neu bauen"
	@echo "  make update    git pull + Build + Neustart"
	@echo "  make clean     Container und Build-Reste entfernen (Zertifikate bleiben)"
	@echo "  make status    URLs und HOST_SECRET anzeigen"
	@echo "  make secret    Nur das HOST_SECRET ausgeben"
	@echo "  make doctor    Deployment pruefen (DNS, Ports, Router, Zertifikat)"
	@echo ""

check-tools:
	@for tool in docker openssl; do \
	        command -v $$tool >/dev/null 2>&1 || { echo "FEHLER: '$$tool' ist nicht installiert."; exit 1; }; \
	done
	@docker compose version >/dev/null 2>&1 || { echo "FEHLER: 'docker compose' (Compose-Plugin) fehlt."; exit 1; }

## env: .env anlegen und HOST_SECRET erzeugen, Domain pruefen
env: check-tools
	@set -e
	ENV_CREATED=0
	if [ ! -f "$(ENV_FILE)" ]; then \
	        cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; \
	        ENV_CREATED=1; \
	        echo ">> $(ENV_FILE) wurde aus $(ENV_EXAMPLE) erstellt."; \
	fi
	CURRENT_SECRET=$$(grep -E '^HOST_SECRET=' "$(ENV_FILE)" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || true); \
	if [ -z "$$CURRENT_SECRET" ]; then \
	        NEW_SECRET=$$(openssl rand -hex 24); \
	        if grep -qE '^HOST_SECRET=' "$(ENV_FILE)"; then \
	                sed -i.bak "s|^HOST_SECRET=.*|HOST_SECRET=$$NEW_SECRET|" "$(ENV_FILE)" && rm -f "$(ENV_FILE).bak"; \
	        else \
	                printf '\nHOST_SECRET=%s\n' "$$NEW_SECRET" >> "$(ENV_FILE)"; \
	        fi; \
	        echo ">> HOST_SECRET wurde automatisch erzeugt."; \
	fi
	CURRENT_DOMAIN=$$(grep -E '^DOMAIN=' "$(ENV_FILE)" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || true)
	EXAMPLE_DOMAIN=$$(grep -E '^DOMAIN=' "$(ENV_EXAMPLE)" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || true)
	if [ -z "$$CURRENT_DOMAIN" ] || [ "$$CURRENT_DOMAIN" = "quiz.example.de" ]; then \
	        echo ""; \
	        echo "=============================================================="; \
	        echo " DOMAIN in $(ENV_FILE) ist noch nicht gesetzt"; \
	        echo "=============================================================="; \
	        echo ""; \
	        echo "   aktuell in $(ENV_FILE)        : $${CURRENT_DOMAIN:-(leer)}"; \
	        echo "   hinterlegt in $(ENV_EXAMPLE) : $${EXAMPLE_DOMAIN:-(leer)}"; \
	        echo ""; \
	        if [ "$$ENV_CREATED" = "1" ]; then \
	                echo " Die Datei $(ENV_FILE) wurde soeben aus $(ENV_EXAMPLE) erstellt und"; \
	                echo " enthaelt noch die Platzhalter-Domain."; \
	        else \
	                echo " Die Datei $(ENV_FILE) existierte bereits und wurde deshalb NICHT"; \
	                echo " ueberschrieben -- sie enthaelt dein HOST_SECRET. Stammt sie noch"; \
	                echo " von einem frueheren Start, traegst du die Domain einmalig nach."; \
	        fi; \
	        echo ""; \
	        if [ -n "$$EXAMPLE_DOMAIN" ] && [ "$$EXAMPLE_DOMAIN" != "quiz.example.de" ]; then \
	                echo " Schnellster Weg:"; \
	                echo ""; \
	                echo "   sed -i 's|^DOMAIN=.*|DOMAIN=$$EXAMPLE_DOMAIN|' $(ENV_FILE) && make up"; \
	                echo ""; \
	                echo " Oder von Hand:  nano $(ENV_FILE)"; \
	        else \
	                echo " nano $(ENV_FILE)  und dort DOMAIN auf deine echte Domain setzen,"; \
	                echo " danach erneut:  make up"; \
	        fi; \
	        echo ""; \
	        echo " Ausserdem noetig:"; \
	        echo "   - A/AAAA-Record der Domain zeigt auf diesen Server"; \
	        echo "   - TCP 80 und 443 sind von aussen erreichbar"; \
	        echo ""; \
	        exit 1; \
	fi
	DOMAIN_NOW=$$(grep -E '^DOMAIN=' "$(ENV_FILE)" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs)
	SECRET_NOW=$$(grep -E '^HOST_SECRET=' "$(ENV_FILE)" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs)
	printf '%s\n' "Quiz App -- Host-Zugang" "" "Host-Ansicht : https://$$DOMAIN_NOW/host" "Passwort     : $$SECRET_NOW" "" "Diese Datei erzeugt 'make up'. Sie liegt NICHT im Git." "Passwort aendern: HOST_SECRET in .env setzen, dann 'make up'." > "$(PW_FILE)"
	chmod 600 "$(PW_FILE)" 2>/dev/null || true
	@echo ">> Konfiguration ok. Host-Passwort steht in $(PW_FILE) (und in $(ENV_FILE))."

## legacy-cleanup: Container des frueheren Projektnamens entfernen
legacy-cleanup:
	@if [ -n "$$(docker ps -aq --filter 'name=sequence-challenge-' 2>/dev/null)" ]; then \
	  echo ">> Alte Container aus dem Projekt 'sequence-challenge' werden entfernt,"; \
	  echo "   damit die Ports 80/443 frei werden. Zertifikate bleiben erhalten."; \
	  docker compose -p sequence-challenge down --remove-orphans >/dev/null 2>&1 || true; \
	  docker rm -f $$(docker ps -aq --filter 'name=sequence-challenge-') >/dev/null 2>&1 || true; \
	fi

## up: Stack bauen und starten
up: env legacy-cleanup
	@set -e
	$(COMPOSE) up -d --build
	@echo ""
	@$(MAKE) --no-print-directory status

## status: Container-Status, URLs und HOST_SECRET
status:
	@set -e
	DOMAIN=$$(grep -E '^DOMAIN=' "$(ENV_FILE)" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs); \
	SECRET=$$(grep -E '^HOST_SECRET=' "$(ENV_FILE)" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs); \
	$(COMPOSE) ps; \
	echo ""; \
	echo "=============================================================="; \
	echo " Quiz App laeuft"; \
	echo "=============================================================="; \
	echo " Teilnehmer : https://$$DOMAIN"; \
	echo " Beitreten  : https://$$DOMAIN/join"; \
	echo " Host       : https://$$DOMAIN/host"; \
	echo ""; \
	echo " HOST_SECRET: $$SECRET"; \
	echo ""; \
	echo " Hinweis: Das erste Zertifikat kann 30-60 Sekunden dauern."; \
	echo "=============================================================="

## doctor: Deployment diagnostizieren -- DNS, Ports, Traefik-Router, Zertifikat
doctor:
	@DOMAIN=$$(grep -E '^DOMAIN=' "$(ENV_FILE)" 2>/dev/null | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs)
	if [ -z "$$DOMAIN" ]; then echo "FEHLER: Keine DOMAIN in $(ENV_FILE). Zuerst 'make up' ausfuehren."; exit 1; fi
	echo ""
	echo "=============================================================="
	echo " Diagnose fuer $$DOMAIN"
	echo "=============================================================="
	echo ""
	echo "--- 1. Container ---"
	$(COMPOSE) ps -a || true
	RUNNING=$$($(COMPOSE) ps -q 2>/dev/null | wc -l | tr -d ' ')
	EXISTING=$$($(COMPOSE) ps -aq 2>/dev/null | wc -l | tr -d ' ')
	echo ""
	if [ "$$RUNNING" = "0" ]; then 	  echo "  =========================================================="; 	  if [ "$$EXISTING" = "0" ]; then 	    echo "   Es laeuft KEIN Container -- der Stack wurde nie gestartet"; 	    echo "   oder mit 'make down' beendet."; 	  else 	    echo "   Alle Container sind BEENDET. Letzte Logzeilen:"; 	  fi; 	  echo ""; 	  echo "   Naechster Schritt:   make up"; 	  echo "  =========================================================="; 	  echo ""; 	  if [ "$$EXISTING" != "0" ]; then 	    $(COMPOSE) logs --tail=25 2>/dev/null | sed 's/^/  /'; 	    echo ""; 	  fi; 	fi
	echo "--- 2. Docker-API und Traefik-Version (haeufigste Fehlerquelle) ---"
	SRV=$$(docker version --format '{{.Server.APIVersion}}' 2>/dev/null || echo '?')
	MIN=$$(docker version --format '{{.Server.MinAPIVersion}}' 2>/dev/null || echo '?')
	echo "  Daemon-API: $$SRV   Minimum: $$MIN"
	TV=$$($(COMPOSE) exec -T traefik traefik version 2>/dev/null | awk '/^Version:/{print $$2}')
	echo "  Traefik:    $${TV:-(nicht ermittelbar)}   (noetig: >= 3.6.1)"
	if $(COMPOSE) logs traefik 2>/dev/null | grep -q 'is too old'; then 	  echo ""; 	  echo "  FEHLER: Traefik kann die Docker-API nicht sprechen."; 	  echo "          Es entstehen KEINE Router -- jede Anfrage landet beim Default-Zertifikat."; 	  echo "          Traefik vor 3.6.1 pinnt die Docker-API auf 1.24; Docker Engine 29"; 	  echo "          verlangt mindestens $$MIN. DOCKER_API_VERSION hilft nicht, die"; 	  echo "          Variable wird von Traefik ignoriert."; 	  echo ""; 	  echo "          Abhilfe:  git pull && make up      (nutzt traefik:v3.6)"; 	else 	  echo "  ok: keine API-Versionsfehler im Traefik-Log"; 	fi
	echo ""
	echo "--- 3. Router-Labels am App-Container ---"
	docker inspect quiz-app-app --format '{{json .Config.Labels}}' 2>/dev/null | tr ',' '\n' | grep -i 'traefik' | sed 's/^/  /' || echo "  App-Container laeuft nicht"
	echo ""
	echo "--- 4. DNS ---"
	PUBIP=$$(curl -s --max-time 6 https://api.ipify.org || echo '?')
	DNSIP=$$(getent ahostsv4 "$$DOMAIN" 2>/dev/null | awk '{print $$1}' | sort -u | tr '\n' ' ')
	echo "  Server (oeffentlich): $$PUBIP"
	echo "  A-Record $$DOMAIN: $${DNSIP:-(keine Antwort)}"
	case " $$DNSIP " in *" $$PUBIP "*) echo "  ok: DNS zeigt auf diesen Server";; *) echo "  ACHTUNG: DNS zeigt NICHT auf diesen Server -- Let's Encrypt kann kein Zertifikat ausstellen";; esac
	echo ""
	echo "--- 5. Ports ---"
	(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E ':(80|443) ' | sed 's/^/  /' || echo "  nichts auf 80/443 gefunden"
	echo ""
	echo "--- 6. Erreichbarkeit von aussen ---"
	curl -s -o /dev/null --max-time 10 -w "  http  -> HTTP %{http_code} (Redirect: %{redirect_url})\n" "http://$$DOMAIN/" || echo "  http  -> nicht erreichbar"
	curl -sk -o /dev/null --max-time 10 -w "  https -> HTTP %{http_code}\n" "https://$$DOMAIN/" || echo "  https -> nicht erreichbar"
	curl -s -o /dev/null --max-time 10 -w "  ACME-Pfad -> HTTP %{http_code}\n" "http://$$DOMAIN/.well-known/acme-challenge/probe" || true
	echo ""
	echo "--- 7. Zertifikat ---"
	CN=$$(echo | openssl s_client -connect "$$DOMAIN:443" -servername "$$DOMAIN" 2>/dev/null | openssl x509 -noout -issuer -subject 2>/dev/null | sed 's/^/  /')
	if [ -n "$$CN" ]; then echo "$$CN"; else echo "  kein TLS-Handshake moeglich"; fi
	if echo "$$CN" | grep -qi 'TRAEFIK DEFAULT CERT'; then 	  echo "  -> Default-Zertifikat: entweder greift kein Router oder ACME ist fehlgeschlagen (siehe 2., 4. und 8.)"; 	fi
	SIZE=$$($(COMPOSE) exec -T traefik sh -c 'wc -c < /letsencrypt/acme.json' 2>/dev/null | tr -d '\r ' || echo 0)
	echo "  acme.json: $${SIZE:-0} Bytes"
	if $(COMPOSE) exec -T traefik sh -c "grep -q '$$DOMAIN' /letsencrypt/acme.json" 2>/dev/null; then 	  echo "  ok: $$DOMAIN ist im Zertifikatsspeicher"; 	else 	  echo "  $$DOMAIN noch NICHT im Zertifikatsspeicher"; 	fi
	echo ""
	echo "--- 8. Traefik-Log (ACME und Fehler) ---"
	$(COMPOSE) logs --tail=300 traefik 2>/dev/null | grep -iE 'acme|certificate|error|unable|challenge' | tail -20 | sed 's/^/  /' || echo "  keine Treffer"
	echo ""
	echo "--- 9. Images und Ressourcen ---"
	docker image ls quiz-app --format '  {{.Repository}}:{{.Tag}}  {{.Size}}  erstellt {{.CreatedSince}}' 2>/dev/null | head -3 || true
	if [ -z "$$(docker image ls -q quiz-app 2>/dev/null)" ]; then echo "  App-Image fehlt -- 'make up' baut es (dauert beim ersten Mal einige Minuten)."; fi
	echo "  Speicher: $$(free -m 2>/dev/null | awk '/^Mem:/{print $$2" MB gesamt, "$$7" MB verfuegbar"}' || echo '?')"
	echo "  Platte:   $$(df -h / 2>/dev/null | awk 'NR==2{print $$4" frei von "$$2}' || echo '?')"
	echo ""
	echo "--- 10. App ---"
	$(COMPOSE) exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(d=>console.log('  /api/health ->', JSON.stringify(d))).catch(e=>console.log('  App antwortet nicht:', e.message))" 2>/dev/null || echo "  App-Container nicht erreichbar"
	echo ""

## secret: HOST_SECRET ausgeben
secret:
	@grep -E '^HOST_SECRET=' "$(ENV_FILE)" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs

## url: Oeffentliche URL ausgeben
url:
	@DOMAIN=$$(grep -E '^DOMAIN=' "$(ENV_FILE)" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs); \
	echo "https://$$DOMAIN"

## down: Container stoppen (Volumes bleiben erhalten)
down:
	$(COMPOSE) down
	@echo ">> Container gestoppt. Let's-Encrypt-Volume '$(LE_VOLUME)' bleibt erhalten."

## restart: Container neu starten
restart:
	$(COMPOSE) restart
	@echo ">> Neu gestartet."

## reset: Nur die App neu starten -> laufende Quiz-Sessions werden verworfen
reset:
	$(COMPOSE) restart app
	@echo ">> App neu gestartet. Alle laufenden Quiz-Sessions wurden verworfen."

## logs: Logs folgen
logs:
	$(COMPOSE) logs -f --tail=200

## ps: Container-Status
ps:
	$(COMPOSE) ps

## build: Images neu bauen
build:
	$(COMPOSE) build

## update: Neue Version holen und ausrollen
update:
	@set -e
	git pull --ff-only
	@$(MAKE) --no-print-directory env
	$(COMPOSE) build
	$(COMPOSE) up -d
	@echo ">> Update abgeschlossen."
	@$(MAKE) --no-print-directory status

## clean: Container und Build-Reste entfernen -- Zertifikate bleiben erhalten
clean:
	@set -e
	$(COMPOSE) down --remove-orphans
	docker image rm quiz-app:latest >/dev/null 2>&1 || true
	docker builder prune -f || true
	rm -rf dist
	@echo ""
	@echo ">> Aufgeraeumt. Das Volume '$(LE_VOLUME)' mit den Let's-Encrypt-"
	@echo ">> Zertifikaten wurde bewusst NICHT geloescht."
