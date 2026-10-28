import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CHAT_FILE_BUCKET,
  CHAT_FILE_MAX_BYTES,
  fileExtension,
  isVideoFile,
} from '@/lib/chat-file'

const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'log', 'text', 'rtf'])
const SHEET_EXT = new Set(['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'numbers'])
const ZIP_TEXT_EXT = new Set(['pptx', 'pptm', 'odt', 'odp'])

/** Pull readable text out of a document the client already uploaded. */
export async function readChatFile(
  admin: SupabaseClient,
  path: string,
  name: string
): Promise<string> {
  if (isVideoFile(name)) return 'This is a video. Smart Coach cannot watch videos.'
  const { data, error } = await admin.storage.from(CHAT_FILE_BUCKET).download(path)
  if (error || !data) return 'The file did not come through. Ask them to send it again.'
  const bytes = Buffer.from(await data.arrayBuffer())
  if (!bytes.length) return 'The file was empty.'
  if (bytes.length > CHAT_FILE_MAX_BYTES) return 'The file is too large to read. Ask for a smaller one.'
  return extractChatFileText(name, bytes)
}

export async function extractChatFileText(name: string, bytes: Buffer): Promise<string> {
  const ext = fileExtension(name)
  if (isVideoFile(name)) return 'This is a video. Smart Coach cannot watch videos.'
  try {
    if (TEXT_EXT.has(ext) || ext === '') return decodePlain(bytes, ext === 'rtf')
    if (ext === 'pdf') return readPdf(bytes)
    if (ext === 'docx') return readDocx(bytes)
    if (ext === 'doc') {
      const docx = await readDocx(bytes).catch(() => '')
      if (docx.trim()) return docx
      return 'This is an old Word file. Ask them to send it as a .docx or paste the text.'
    }
    if (SHEET_EXT.has(ext)) return readSheet(bytes)
    if (ZIP_TEXT_EXT.has(ext)) return readZipXml(bytes)
    const plain = decodePlain(bytes, false)
    if (looksLikeText(plain)) return plain
    return 'This file has no readable text. Ask them to send a PDF, Word doc, spreadsheet, or text file.'
  } catch {
    return 'This file could not be read. Ask them to send a PDF, Word doc, spreadsheet, or paste the text.'
  }
}

function decodePlain(bytes: Buffer, rtf: boolean): string {
  const text = bytes.toString('utf8').replace(/\u0000/g, '').trim()
  if (!rtf) return text
  return text
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function looksLikeText(text: string): boolean {
  if (text.length < 8) return false
  const sample = text.slice(0, 400)
  const readable = sample.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
  return readable.length / sample.length > 0.8
}

async function readPdf(bytes: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const result = await extractText(pdf, { mergePages: true })
  const text = Array.isArray(result.text) ? result.text.join('\n') : result.text
  return text.trim() || 'This PDF has no readable text. It may be a scan. Ask them to type the numbers.'
}

async function readDocx(bytes: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer: bytes })
  return result.value.trim()
}

async function readSheet(bytes: Buffer): Promise<string> {
  const XLSX = await import('xlsx')
  const book = XLSX.read(bytes, { type: 'buffer' })
  const parts = book.SheetNames.slice(0, 8).map((sheetName) => {
    const sheet = book.Sheets[sheetName]
    if (!sheet) return ''
    const csv = XLSX.utils.sheet_to_csv(sheet)
    return `${sheetName}\n${csv}`.trim()
  })
  return parts.filter(Boolean).join('\n\n')
}

async function readZipXml(bytes: Buffer): Promise<string> {
  const { unzipSync } = await import('fflate')
  const files = unzipSync(new Uint8Array(bytes))
  const chunks: string[] = []
  for (const [path, data] of Object.entries(files)) {
    if (!/slide\d+\.xml$|content\.xml$|document\.xml$/i.test(path)) continue
    const xml = Buffer.from(data).toString('utf8')
    const text = xml
      .replace(/<a:t[^>]*>/g, '')
      .replace(/<\/a:t>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) chunks.push(text)
  }
  return chunks.join('\n').trim() || 'This document has no readable text.'
}
