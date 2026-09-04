import { buildApp } from './app.js';
import { config } from './config.js';
import type { GameManager } from './game/GameManager.js';
import { HostAuth } from './hostAuth.js';
import { createLogger } from './logger.js';
import { createSocketLayer } from './socket.js';

const log = createLogger('server');

async function main(): Promise<void> {
  const hostAuth = new HostAuth(config.hostSecret, config.hostTokenTtlMs);
  hostAuth.startCleanup();

  let games: GameManager | null = null;
  const app = await buildApp({ hostAuth, getGames: () => games });

  // Fastify muss bereit sein, bevor Socket.IO sich an den HTTP-Server hängt.
  await app.ready();
  const socketLayer = createSocketLayer(app.server, hostAuth);
  games = socketLayer.games;

  await app.listen({ port: config.port, host: config.host });

  log.info('Sequence Challenge gestartet', {
    url: `http://${config.host}:${config.port}`,
    env: config.nodeEnv,
    publicBaseUrl: config.publicBaseUrl ?? '(aus Browser-Origin abgeleitet)',
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('Beende Server', { signal });
    try {
      games?.destroyAll();
      await socketLayer.io.close();
      await app.close();
      hostAuth.stopCleanup();
    } catch (error) {
      log.error('Fehler beim Herunterfahren', { error: String(error) });
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    log.error('Unbehandelte Promise-Rejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (error) => {
    log.error('Unbehandelte Ausnahme', { error: String(error) });
  });
}

main().catch((error: unknown) => {
  log.error('Serverstart fehlgeschlagen', { error: String(error) });
  process.exit(1);
});
