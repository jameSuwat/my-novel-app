export function escapeRegExp(string) {
  return String(string ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Remove invalid filename characters (Windows: \ / : * ? " < > |)
export function sanitizeFilename(name) {
  // eslint-disable-next-line no-control-regex
  return String(name || "")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function novelUpdatedAt(novel) {
  if (!novel.chapters || !novel.chapters.length) return novel.createdAt;
  return Math.max(novel.createdAt || 0, ...novel.chapters.map((c) => c.updatedAt));
}
