import { afterEach, describe, expect, it } from 'vitest';

import { GameManager } from '../src/server/game/GameManager.js';
import type { RoomEmitter } from '../src/server/game/Room.js';

const noopEmitter: RoomEmitter = {
  toRoom() {},
  toPlayer() {},
};

let managers: GameManager[] = [];

function makeManager(options: Partial<ConstructorParameters<typeof GameManager>[0]> = {}): GameManager {
  const manager = new GameManager({ emitter: noopEmitter, ...options });
  managers.push(manager);
  return manager;
}

afterEach(() => {
  for (const manager of managers) manager.destroyAll();
  managers = [];
});

describe('GameManager', () => {
  it('erzeugt Räume mit eindeutigen Codes', () => {
    const manager = makeManager({ maxRooms: 40 });
    const codes = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      const room = manager.createRoom({ questionCount: 5, randomizeQuestions: false, timerPreset: 'standard' });
      expect(codes.has(room.code)).toBe(false);
      codes.add(room.code);
    }
    expect(manager.size).toBe(30);
  });

  it('findet Räume unabhängig von der Schreibweise', () => {
    const manager = makeManager();
    const room = manager.createRoom({ questionCount: 5, randomizeQuestions: false, timerPreset: 'standard' });
    expect(manager.getRoom(room.code)?.code).toBe(room.code);
    expect(manager.getRoom(room.code.toLowerCase())?.code).toBe(room.code);
    expect(manager.getRoom(` ${room.code} `)?.code).toBe(room.code);
    expect(manager.getRoom('gibtsnicht')).toBeUndefined();
    expect(manager.getRoom(undefined)).toBeUndefined();
    expect(manager.getRoom(null)).toBeUndefined();
    expect(manager.getRoom(123)).toBeUndefined();
  });

  it('begrenzt die Anzahl gleichzeitiger Räume', () => {
    const manager = makeManager({ maxRooms: 2 });
    manager.createRoom({ questionCount: 5, randomizeQuestions: false, timerPreset: 'standard' });
    manager.createRoom({ questionCount: 5, randomizeQuestions: false, timerPreset: 'standard' });
    expect(() =>
      manager.createRoom({ questionCount: 5, randomizeQuestions: false, timerPreset: 'standard' }),
    ).toThrow();
  });

  it('schließt Räume und entfernt sie aus der Verwaltung', () => {
    const manager = makeManager();
    const room = manager.createRoom({ questionCount: 5, randomizeQuestions: false, timerPreset: 'standard' });
    expect(manager.closeRoom(room.code)).toBe(true);
    expect(manager.getRoom(room.code)).toBeUndefined();
    expect(manager.closeRoom(room.code)).toBe(false);
  });

  it('räumt inaktive Räume auf', () => {
    const manager = makeManager({ roomTtlMs: -1 });
    manager.createRoom({ questionCount: 5, randomizeQuestions: false, timerPreset: 'standard' });
    expect(manager.sweep()).toBe(1);
    expect(manager.size).toBe(0);
  });

  it('listet aktive Räume auf', () => {
    const manager = makeManager();
    const room = manager.createRoom({ questionCount: 5, randomizeQuestions: false, timerPreset: 'standard' });
    const list = manager.listRooms();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code: room.code, phase: 'LOBBY', players: 0, rounds: 5 });
  });
});
