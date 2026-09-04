import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';

import { QUESTION_COUNT_OPTIONS } from '../shared/types.js';
import { config } from './config.js';
import type { GameManager } from './game/GameManager.js';
import { normalizeRoomCode } from './game/roomCode.js';
import type { HostAuth } from './hostAuth.js';
import { createLogger } from './logger.js';
import type { QuizRegistry } from './quiz/loader.js';

const log = createLogger('http');

const currentDir = dirname(fileURLToPath(import.meta.url));

/** Verzeichnis mit dem gebauten Client (dist/client). */
function resolveClientDir(): string | null {
  const candidates = [
    process.env.CLIENT_DIR,
    resolve(currentDir, '../client'),
    resolve(process.cwd(), 'dist/client'),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

export interface BuildAppOptions {
  hostAuth: HostAuth;
  quizzes: QuizRegistry;
  /** Wird erst nach dem Aufbau des Socket-Layers gesetzt. */
  getGames: () => GameManager | null;
}

export async function buildApp({ hostAuth, quizzes, getGames }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: 16 * 1024,
  });

  // Kein globales Limit: Eine Schulklasse laedt die Seite gleichzeitig ueber
  // dieselbe oeffentliche IP. Limitiert wird gezielt pro sicherheitsrelevanter Route.
  await app.register(rateLimit, {
    global: false,
    timeWindow: '1 minute',
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/meta', async () => ({
    quizCount: quizzes.size,
    questionCountOptions: QUESTION_COUNT_OPTIONS,
    publicBaseUrl: config.publicBaseUrl,
  }));

  /**
   * Auswahlliste der Quizze -- ohne Fragen und ohne Lösungen.
   * Wird bei jedem Aufruf frisch gelesen, damit neue Dateien ohne Neustart wirken.
   */
  app.get('/api/quizzes', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async () => ({
    quizzes: quizzes.summaries(),
    errors: quizzes.loadErrors.map((error) => ({ file: error.file, message: error.message })),
  }));

  app.post<{ Body: { secret?: unknown } }>(
    '/api/host/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['secret'],
          properties: { secret: { type: 'string', minLength: 1, maxLength: 256 } },
        },
      },
    },
    async (request, reply) => {
      const secret = (request.body as { secret?: unknown } | undefined)?.secret;
      if (!hostAuth.verifySecret(secret)) {
        log.warn('Fehlgeschlagener Host-Login', { ip: request.ip });
        return reply.code(401).send({ ok: false, error: 'Ungültiges Host-Secret.' });
      }
      log.info('Host angemeldet', { ip: request.ip });
      return reply.send({ ok: true, hostToken: hostAuth.issueToken() });
    },
  );

  app.get<{ Params: { code: string } }>(
    '/api/rooms/:code',
    { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const games = getGames();
      const code = normalizeRoomCode(request.params.code);
      const room = games?.getRoom(code);
      if (!room) {
        return reply.code(404).send({ exists: false });
      }
      return reply.send({
        exists: true,
        code: room.code,
        phase: room.phase,
        playerCount: room.playerCount,
        joinable: room.phase === 'LOBBY',
      });
    },
  );

  // Bilder der Quizze. Eigener Prefix, damit sie nicht mit dem Client-Build
  // kollidieren; ausgeliefert wird ausschliesslich aus quizzes/media.
  const mediaDir = join(config.quizzesDir, 'media');
  if (existsSync(mediaDir)) {
    await app.register(fastifyStatic, {
      root: mediaDir,
      prefix: '/quiz-media/',
      decorateReply: false,
      index: false,
      cacheControl: true,
      maxAge: '1h',
    });
    log.info('Quiz-Bilder werden ausgeliefert', { dir: mediaDir });
  } else {
    log.info('Kein Bildordner vorhanden -- Fragen ohne Bild funktionieren normal', { dir: mediaDir });
  }

  const clientDir = resolveClientDir();
  if (clientDir) {
    // wildcard: true registriert GET /* -- notwendig, damit auch verschachtelte
    // Pfade wie /assets/index-<hash>.js ausgeliefert werden. Fehlt eine Datei,
    // ruft @fastify/static den NotFound-Handler auf (SPA-Fallback unten).
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: '/',
      index: ['index.html'],
      wildcard: true,
      cacheControl: true,
      maxAge: '1h',
      immutable: false,
    });

    // SPA-Fallback: alles, was keine API- und keine Asset-Route ist, liefert index.html.
    app.setNotFoundHandler((request, reply) => {
      const isApi =
        request.url.startsWith('/api/') ||
        request.url.startsWith('/socket.io') ||
        request.url.startsWith('/quiz-media/');
      // Fehlende Assets bewusst als 404 melden statt HTML auszuliefern --
      // sonst scheitert der Modul-Import im Browser an der falschen MIME-Type.
      const isAsset = /\.[a-z0-9]{2,5}(\?|$)/i.test(request.url);
      if (request.method !== 'GET' || isApi || isAsset) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
    log.info('Statische Dateien werden ausgeliefert', { dir: clientDir });
  } else {
    app.setNotFoundHandler((_request, reply) =>
      reply.code(404).send({
        error: 'Not Found',
        hint: 'Kein Client-Build gefunden. Im Dev-Modus läuft das Frontend unter http://localhost:5173.',
      }),
    );
    log.warn('Kein Client-Build gefunden -- es werden nur API-Routen bedient.');
  }

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      log.error('Unbehandelter HTTP-Fehler', { url: request.url, error: error.message });
    }
    void reply.code(status).send({ error: status >= 500 ? 'Internal Server Error' : error.message });
  });

  return app;
}
