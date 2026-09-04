# Sequence Challenge -- Betrieb auf einem Ubuntu-Server
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
LE_VOLUME := sequence-challenge-letsencrypt

.PHONY: help up down restart logs ps build update clean reset env status secret url check-tools

## help: Verfuegbare Befehle anzeigen
help:
	@echo ""
	@echo "  Sequence Challenge -- Live-Quiz zu UML-Sequenzdiagrammen"
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
	@echo ""

check-tools:
	@for tool in docker openssl; do \
	        command -v $$tool >/dev/null 2>&1 || { echo "FEHLER: '$$tool' ist nicht installiert."; exit 1; }; \
	done
	@docker compose version >/dev/null 2>&1 || { echo "FEHLER: 'docker compose' (Compose-Plugin) fehlt."; exit 1; }

## env: .env anlegen und HOST_SECRET erzeugen, Domain pruefen
env: check-tools
	@set -e
	if [ ! -f "$(ENV_FILE)" ]; then \
	        cp "$(ENV_EXAMPLE)" "$(ENV_FILE)"; \
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
	CURRENT_DOMAIN=$$(grep -E '^DOMAIN=' "$(ENV_FILE)" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs || true); \
	if [ -z "$$CURRENT_DOMAIN" ] || [ "$$CURRENT_DOMAIN" = "quiz.example.de" ]; then \
	        echo ""; \
	        echo "=============================================================="; \
	        echo " Bitte DOMAIN in .env auf deine echte Domain setzen."; \
	        echo "=============================================================="; \
	        echo ""; \
	        echo " Die Datei .env wurde angelegt, enthaelt aber noch die"; \
	        echo " Beispiel-Domain 'quiz.example.de'."; \
	        echo ""; \
	        echo " 1) nano .env"; \
	        echo " 2) DOMAIN=quiz.example.de  ->  DOMAIN=deine-domain.de"; \
	        echo " 3) A/AAAA-Record der Domain muss auf diesen Server zeigen"; \
	        echo " 4) TCP 80 und 443 muessen erreichbar sein"; \
	        echo " 5) danach erneut:  make up"; \
	        echo ""; \
	        exit 1; \
	fi
	@echo ">> Konfiguration ok."

## up: Stack bauen und starten
up: env
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
	echo " Sequence Challenge laeuft"; \
	echo "=============================================================="; \
	echo " Teilnehmer : https://$$DOMAIN"; \
	echo " Beitreten  : https://$$DOMAIN/join"; \
	echo " Host       : https://$$DOMAIN/host"; \
	echo ""; \
	echo " HOST_SECRET: $$SECRET"; \
	echo ""; \
	echo " Hinweis: Das erste Zertifikat kann 30-60 Sekunden dauern."; \
	echo "=============================================================="

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
	$(COMPOSE) build
	$(COMPOSE) up -d
	@echo ">> Update abgeschlossen."
	@$(MAKE) --no-print-directory status

## clean: Container und Build-Reste entfernen -- Zertifikate bleiben erhalten
clean:
	@set -e
	$(COMPOSE) down --remove-orphans
	docker image rm sequence-challenge:latest >/dev/null 2>&1 || true
	docker builder prune -f || true
	rm -rf dist
	@echo ""
	@echo ">> Aufgeraeumt. Das Volume '$(LE_VOLUME)' mit den Let's-Encrypt-"
	@echo ">> Zertifikaten wurde bewusst NICHT geloescht."
