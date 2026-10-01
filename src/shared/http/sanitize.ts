const HTML_TAGS = /<[^>]*>/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeText(input: string): string {
  return input
    .normalize('NFC')
    .replace(HTML_TAGS, '')
    .replace(CONTROL_CHARS, '')
    .trim();
}
