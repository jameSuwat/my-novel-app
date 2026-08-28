export function countThaiWords(text) {
  const t = (text || "").trim();
  if (!t) return 0;

  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("th", { granularity: "word" });
      let count = 0;
      for (const part of segmenter.segment(t)) {
        if (part.isWordLike) count++;
      }
      return count;
    }
  } catch (e) {}
  return t.split(/\s+/).filter(Boolean).length;
}

export function countGraphemes(text) {
  const t = text || "";
  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
      return Array.from(segmenter.segment(t)).length;
    }
  } catch (e) {}
  return Array.from(t).length;
}

export function countCharacters(text, { includeSpaces = true } = {}) {
  const t = text || "";
  return countGraphemes(includeSpaces ? t : t.replace(/\s/g, ""));
}

export function wordCount(text) {
  return countThaiWords(text);
}
