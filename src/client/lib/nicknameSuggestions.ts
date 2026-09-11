/**
 * Vorschläge für das Nickname-Feld. Jeder Name spielt auf ein Element von
 * Sequenzdiagrammen an -- Lebenslinie, Fragment, Nachrichtenart, Zerstörungskreuz.
 *
 * Zwei Regeln, damit die Namen auch wirklich durchgehen:
 * die Länge bleibt unter {@link NICKNAME_MAX_LENGTH}, und nach der Entschärfung
 * auf dem Server muss exakt derselbe Text herauskommen. Der Test
 * `tests/nicknameSuggestions.test.ts` prüft beides.
 */
export const NICKNAME_SUGGESTIONS = [
  'LifelineLisa',
  'ReturnRudolf',
  'AsyncAnnika',
  'SyncSimon',
  'LoopLuca',
  'AltAlina',
  'OptOlaf',
  'ParPaula',
  'BreakBenny',
  'RefRobin',
  'GuardGustav',
  'CreateChiara',
  'DestroyDoris',
  'KreuzKarl',
  'NachrichtNadine',
  'AktorAnton',
  'InstanzIngo',
  'ObjektOlga',
  'BalkenBerta',
  'CallbackKarla',
  'TimeoutTina',
  'StackSteffi',
  'TriggerTrudi',
  'SelfcallSelma',
  'LostLotta',
  'FoundFranka',
  'GateGerd',
  'FragmentFritz',
  'SequenzSiggi',
  'BlockingBjörn',
  'LebenslinieLena',
  'PfeilspitzePia',
  'DeadlockDetlef',
  'KonstruktorKonrad',
  'DestruktorDieter',
  'ZeitachseZoe',
  'StereotypStefan',
  'NotationNorbert',
  'SzenarioSandra',
  'InteraktionIda',
  'WächterWanda',
  'NebenläufigNele',
  'RückgabeRegina',
  'AntwortAnke',
  'AufrufArno',
  'OperandOtto',
  'FrameFranz',
  'CoregionCarla',
  'RekursionRita',
  'SignalSilke',
] as const;

/**
 * Ein zufälliger Vorschlag. `exclude` verhindert, dass zweimal hintereinander
 * derselbe Name erscheint -- sonst wirkt der Würfel kaputt.
 */
export function randomNickname(exclude?: string): string {
  const pool = NICKNAME_SUGGESTIONS.filter((name) => name !== exclude);
  const candidates = pool.length > 0 ? pool : NICKNAME_SUGGESTIONS;
  return candidates[Math.floor(Math.random() * candidates.length)] as string;
}
