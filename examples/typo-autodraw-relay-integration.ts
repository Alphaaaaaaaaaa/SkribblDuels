/*
  Optional direct Typo relay for ToolbarImageLabFeature.
  Skribbl Duels v0.31.0 also contains a fallback that reads selected .skd files
  and matches their exact command sequence against outgoing Skribbl draw packets.
*/

function skdCommandSignature(command: unknown): string | null {
  if (!Array.isArray(command)) return null;
  return JSON.stringify(command.map(value => typeof value === 'number' && Object.is(value, -0) ? 0 : value));
}

function skdFingerprint(commands: readonly unknown[]): string {
  const value = commands
    .map(skdCommandSignature)
    .filter((signature): signature is string => signature !== null)
    .join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `skd-${commands.length}-${hash.toString(16).padStart(8, '0')}`;
}

/* Add this field to ToolbarImageLabFeature. */
private readonly _loadedSkdFingerprints = new Map<string, string>();

/* Replace the existing commands.forEach(...) inside addDrawCommandsFromFile(). */
commands.forEach(c => {
  this._drawCommandsService.saveDrawCommands(c.name, c.commands);
  const fingerprint = skdFingerprint(c.commands);
  this._loadedSkdFingerprints.set(fingerprint, c.name);
  window.dispatchEvent(new CustomEvent('skribbl-duels:typo-skd-loaded', {
    detail: {
      fileName: c.name,
      fingerprint,
      commandCount: c.commands.length,
      commands: c.commands,
      loadedFromFile: true
    }
  }));
});

/* Add this immediately after the awaited paste in pasteDrawCommands(). */
const fingerprint = skdFingerprint(commands.commands);
const loadedFileName = this._loadedSkdFingerprints.get(fingerprint);
if (loadedFileName !== undefined) {
  window.dispatchEvent(new CustomEvent('skribbl-duels:typo-skd-pasted', {
    detail: {
      fileName: loadedFileName,
      fingerprint,
      commandCount: commands.commands.length,
      commands: commands.commands,
      loadedFromFile: true,
      clearBeforePaste: this.clearBeforePaste,
      pasteInstant: this.pasteInstant
    }
  }));
}
