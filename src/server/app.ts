import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance, type preHandlerHookHandler } from 'fastify';

import { QUESTION_COUNT_OPTIONS } from '../shared/types.js';
import { config } from './config.js';
import type { GameManager } from './game/GameManager.js';
import { normalizeRoomCode } from './game/roomCode.js';
import type { HostAuth } from './hostAuth.js';
import { createLogger } from './logger.js';
import { UploadError, type QuizRegistry } from './quiz/loader.js';

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

  // Viele HTTP-Clients setzen content-type auch ohne Rumpf (etwa bei DELETE).
  // Fastify wuerde das sonst mit 400 ablehnen -- ein leerer Rumpf ist hier in Ordnung.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = typeof body === 'string' ? body.trim() : '';
    if (text.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch (error) {
      const failure = error as Error & { statusCode?: number };
      failure.statusCode = 400;
      done(failure, undefined);
    }
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

  /** Host-Token aus dem Authorization-Header. Gibt bei Fehlen `null` zurueck. */
  function hostTokenFrom(request: { headers: Record<string, unknown> }): string | null {
    const header = request.headers.authorization;
    if (typeof header !== 'string') return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1] : null;
  }

  const requireHost: preHandlerHookHandler = async (request, reply) => {
    const token = hostTokenFrom(request as unknown as { headers: Record<string, unknown> });
    if (!hostAuth.verifyToken(token)) {
      log.warn('Host-API ohne gültiges Token', { url: request.url, ip: request.ip });
      await reply.code(401).send({ error: 'Host-Sitzung abgelaufen. Bitte erneut anmelden.' });
    }
  };

  // ------------------------------------------------ Eigene Quizze (Upload)

  const uploadRoute = {
    preHandler: requireHost,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    // Ein Quiz mit 200 Fragen liegt deutlich unter 512 kB.
    bodyLimit: 512 * 1024,
  };

  app.get('/api/host/quizzes', { preHandler: requireHost }, async () => ({
    quizzes: quizzes.list().map((quiz) => ({ ...quiz, source: quizzes.sourceOf(quiz.id) })),
    errors: quizzes.loadErrors,
    media: quizzes.listMedia(),
    uploads: { count: quizzes.uploadCount, ...quizzes.uploadLimits },
  }));

  app.post<{ Body: unknown }>('/api/host/quizzes', uploadRoute, async (request, reply) => {
    try {
      const quiz = quizzes.addUpload(request.body);
      log.info('Quiz per Upload verfügbar', { id: quiz.id, ip: request.ip });
      return reply.code(201).send({ ok: true, quiz });
    } catch (error) {
      if (error instanceof UploadError) {
        const status = error.code === 'CONFLICT' ? 409 : error.code === 'LIMIT' ? 429 : 400;
        return reply.code(status).send({ ok: false, error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>(
    '/api/host/quizzes/:id',
    { preHandler: requireHost, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      try {
        quizzes.removeUpload(request.params.id);
        return reply.send({ ok: true });
      } catch (error) {
        if (error instanceof UploadError) {
          return reply.code(error.code === 'NOT_FOUND' ? 404 : 400).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

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
