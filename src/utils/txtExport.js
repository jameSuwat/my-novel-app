import { sanitizeFilename, downloadBlob } from "./helpers";
import { makeZip } from "./zipWriter";

// Chapter filename = saved title only (no system order number)
function chapterFileName(ch) {
  return sanitizeFilename(ch?.title?.trim()) || `ตอนที่-${ch?.order ?? "?"}`;
}

// File header = chapter title only — no "ตอนที่ N —" to avoid duplicate/conflicting numbers
function chapterToTxt(ch) {
  const t = ch?.title?.trim();
  const body = ch?.content || "";
  return t ? `${t}\n\n${body}` : body;
}

// Export single chapter → download .txt
export function exportSingleChapter(chapter) {
  downloadBlob(
    new Blob(["\uFEFF" + chapterToTxt(chapter)], {
      type: "text/plain;charset=utf-8",
    }),
    `${chapterFileName(chapter)}.txt`
  );
}

// Export multiple chapters → single zip with per-chapter .txt files
export function exportChaptersAsZip(novelTitle, chapters) {
  const used = new Set();
  const files = chapters.map((ch) => {
    const base = chapterFileName(ch);
    let name = `${base}.txt`;
    let i = 2;
    while (used.has(name)) {
      name = `${base} (${i}).txt`;
      i++;
    }
    used.add(name);
    return { name, text: chapterToTxt(ch) };
  });
  downloadBlob(
    makeZip(files),
    `${sanitizeFilename(novelTitle) || "นิยาย"}.zip`
  );
}
