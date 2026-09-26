import zlib from 'node:zlib';

/**
 * DocumentExtractionAdapter (demo provider). Extracts candidate dates / reference numbers / names from digital PDFs and
 * plain text. Scanned images return no fields (OCR is optional and not bundled) so the UI must offer manual entry.
 * Extraction never authenticates a document.
 */
export interface ExtractedField<T = string> { value: T; confidence: number; source: string }
export interface ExtractionResult {
  provider: 'demo';
  textFound: boolean;
  text: string;                 // extracted text (may be empty)
  dates: ExtractedField[];      // ISO dates
  fromDate?: ExtractedField;
  toDate?: ExtractedField;
  reference?: ExtractedField;
  patientName?: ExtractedField;
  issuer?: ExtractedField;
  note: string;
}

function pdfText(buf: Buffer): string {
  const out: string[] = [];
  const raw = buf.toString('latin1');
  const streams: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const chunk = Buffer.from(m[1], 'latin1');
    let s = m[1];
    try {
      s = zlib.inflateSync(chunk).toString('latin1');
    } catch {
      /* not compressed */
    }
    streams.push(s);
  }
  for (const s of streams) {
    const tj = /\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ/g;
    let t: RegExpExecArray | null;
    while ((t = tj.exec(s))) {
      const parts = t[0].match(/\((?:\\.|[^\\)])*\)/g) ?? [];
      out.push(parts.map((p) => p.slice(1, -1).replace(/\\\)/g, ')').replace(/\\\(/g, '(').replace(/\\\\/g, '\\')).join(''));
    }
  }
  return out.join('\n');
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

export function findDates(text: string): ExtractedField[] {
  const found: ExtractedField[] = [];
  const push = (y: number, mo: number, d: number, src: string, conf: number) => {
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return;
    const iso = `${y}-${pad(mo)}-${pad(d)}`;
    if (!found.some((f) => f.value === iso)) found.push({ value: iso, confidence: conf, source: src });
  };
  for (const m of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) push(+m[1], +m[2], +m[3], m[0], 0.95);
  for (const m of text.matchAll(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/g)) push(+m[3], +m[2], +m[1], m[0], 0.8);
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/g)) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) push(+m[3], mo, +m[1], m[0], 0.85); }
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/g)) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) push(+m[3], mo, +m[2], m[0], 0.85); }
  return found;
}

export function extractFromBuffer(mime: string, buf: Buffer): ExtractionResult {
  let text = '';
  if (mime === 'application/pdf') text = pdfText(buf);
  else if (mime === 'text/plain') text = buf.toString('utf8');
  const result: ExtractionResult = { provider: 'demo', textFound: text.trim().length > 0, text: text.slice(0, 4000), dates: [], note: '' };
  if (!result.textFound) {
    result.note = mime.startsWith('image/') ? 'Image uploaded: no OCR configured. Enter the dates and reference manually.' : 'No text layer found. Enter the fields manually.';
    return result;
  }
  const dates = findDates(text);
  result.dates = dates;
  // Sick-leave style "from ... to ..." ranges
  const range = text.match(/from\s*[:\-]?\s*([^\n]+?)\s+(?:to|until|till|through)\s*[:\-]?\s*([^\n]+)/i);
  if (range) {
    const a = findDates(range[1])[0], b = findDates(range[2])[0];
    if (a) result.fromDate = { ...a, confidence: 0.9, source: range[0] };
    if (b) result.toDate = { ...b, confidence: 0.9, source: range[0] };
  }
  if (!result.fromDate && dates.length) result.fromDate = { ...dates[0], confidence: Math.min(0.6, dates[0].confidence) };
  if (!result.toDate && dates.length > 1) result.toDate = { ...dates[1], confidence: 0.5 };
  const ref = text.match(/(?:reference|ref\.?|report\s*(?:no|number|id)|leave\s*(?:no|number|id)|certificate\s*(?:no|number)|invitation\s*(?:no|id)|رقم\s*التقرير)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-\/]{4,})/i);
  if (ref) result.reference = { value: ref[1], confidence: 0.85, source: ref[0] };
  const name = text.match(/(?:patient|name|student)\s*(?:name)?\s*[:\-]\s*([A-Za-z][A-Za-z .'\-]{2,60})/i);
  if (name) result.patientName = { value: name[1].trim(), confidence: 0.7, source: name[0] };
  const issuer = text.match(/(?:issued by|hospital|clinic|organizer|organiser|issuer)\s*[:\-]?\s*([A-Za-z][A-Za-z .&'\-]{2,60})/i);
  if (issuer) result.issuer = { value: issuer[1].trim(), confidence: 0.6, source: issuer[0] };
  result.note = 'Fields extracted from the document text layer. Review and edit before submitting. Extraction does not verify authenticity.';
  return result;
}
