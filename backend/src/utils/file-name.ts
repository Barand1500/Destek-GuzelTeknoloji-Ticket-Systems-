// Multipart filenames can arrive as UTF-8 bytes interpreted as Latin-1/Windows-1252.
// Decode only valid UTF-8 sequences that reduce those encoding artifacts.
export function displayFileName(value: string): string {
  const windows1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
  let name = value;
  for (let round = 0; round < 2 && /[ÃÂÄÅ]/.test(name); round++) {
    const bytes: number[] = [];
    for (const char of name) {
      const code = char.charCodeAt(0);
      const mapped = windows1252.indexOf(char);
      if (code <= 255) bytes.push(code);
      else if (mapped >= 0) bytes.push(128 + mapped);
      else return name;
    }
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
      if ((decoded.match(/[ÃÂÄÅ]/g)?.length ?? 0) >= (name.match(/[ÃÂÄÅ]/g)?.length ?? 0)) break;
      name = decoded;
    } catch { break; }
  }
  return name;
}
