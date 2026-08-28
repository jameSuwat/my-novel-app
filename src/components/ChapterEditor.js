import React, { useState, useRef, useEffect } from "react";
import {
  ChevronLeft, ArrowRight, Trash2,
} from "lucide-react";
import { escapeRegExp } from "../utils/helpers";
import { countCharacters, wordCount } from "../utils/wordCounter";
import useDebouncedValue from "../hooks/useDebouncedValue";
import {
  callGemini,
  fetchWithRetry,
  checkPronouns,
  getActiveKeyList,
  getApiKeyCount,
  getKeyFromStorage,
  saveKeyToStorage,
} from "../services/ai";
import styles from "./ChapterEditor.module.css";

const FONT_MIN = 13;
const FONT_MAX = 28;
const FONT_SIZE_KEY = "novel-writer-font-size-v2";

export default function ChapterEditor({
  chapter,
  onSave,
  onSaveAndNext,
  onCancel,
  onDelete,
  onAlert,
  onPrompt,
}) {
  const [title, setTitle] = useState(chapter.title || "");
  const [content, setContent] = useState(chapter.content || "");
  const [copied, setCopied] = useState(false);
  const [typoNotice, setTypoNotice] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const [apiKeysInput, setApiKeysInput] = useState(() => getKeyFromStorage());
  const [showKeyInput, setShowKeyInput] = useState(false);

  const [showPronounModal, setShowPronounModal] = useState(false);
  const [pronounResults, setPronounResults] = useState([]);
  const [replacementMap, setReplacementMap] = useState({});

  const [showFindReplace, setShowFindReplace] = useState(false);
  const [searchWord, setSearchWord] = useState("");
  const [replaceWord, setReplaceWord] = useState("");
  const [matchCount, setMatchCount] = useState(0);

  const [fontSize, setFontSize] = useState(() => {
    try {
      const saved = localStorage.getItem(FONT_SIZE_KEY);
      return saved ? Number(saved) : 17;
    } catch (e) {
      return 17;
    }
  });

  const contentRef = useRef(null);
  const scrollRef = useRef(null);
  const debouncedContent = useDebouncedValue(content, 300);

  useEffect(() => {
    try {
      localStorage.setItem(FONT_SIZE_KEY, fontSize);
    } catch (e) {}
  }, [fontSize]);

  useEffect(() => {
    setTitle(chapter.title || "");
    setContent(chapter.content || "");
  }, [chapter.id, chapter.order, chapter.title, chapter.content]);

  // auto-resize textarea
  useEffect(() => {
    const ta = contentRef.current;
    const container = scrollRef.current;
    if (!ta || !container) return;
    const currentScroll = container.scrollTop;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
    container.scrollTop = currentScroll;
  }, [content, fontSize]);

  useEffect(() => {
    if (!searchWord) {
      setMatchCount(0);
      return;
    }
    const regex = new RegExp(escapeRegExp(searchWord), "g");
    const matches = debouncedContent.match(regex);
    setMatchCount(matches ? matches.length : 0);
  }, [searchWord, debouncedContent]);

  const showNotice = (msg, ms = 4000) => {
    setTypoNotice(msg);
    setTimeout(() => setTypoNotice(""), ms);
  };

  const handleReplaceAll = () => {
    if (!searchWord) return;
    const regex = new RegExp(escapeRegExp(searchWord), "g");
    const found = (content.match(regex) || []).length;
    if (!found) {
      showNotice(`ไม่พบคำว่า "${searchWord}"`);
      return;
    }
    setContent(content.replace(regex, replaceWord));
    showNotice(`✨ แทนที่คำว่า "${searchWord}" เป็น "${replaceWord}" จำนวน ${found} จุดเรียบร้อย!`);
  };

  const handleFixDialogueQuotes = () => {
    if (!content) return;

    if (contentRef.current) {
      const { selectionStart, selectionEnd } = contentRef.current;
      if (selectionStart !== selectionEnd) {
        const selectedText = content.substring(selectionStart, selectionEnd);
        const wrapped =
          selectedText.startsWith('"') && selectedText.endsWith('"')
            ? selectedText.slice(1, -1)
            : `"${selectedText}"`;
        setContent(
          content.substring(0, selectionStart) + wrapped + content.substring(selectionEnd)
        );
        showNotice('✨ ใส่เครื่องหมาย "..." ครอบข้อความที่เลือกเรียบร้อย!', 3000);
        return;
      }
    }

    let fixed = content;
    let fixesCount = 0;

    const quoteStandardized = fixed.replace(/["""「」]/g, '"').replace(/['']/g, "'");
    if (quoteStandardized !== fixed) {
      fixesCount++;
      fixed = quoteStandardized;
    }

    const dialogueVerbRegex =
      /(พูดว่า|ถามว่า|ตอบว่า|บอกว่า|ตะโกนว่า|กระซิบว่า|อุทานว่า|พึมพำว่า|กระเซ้าว่า|แย้งว่า)\s*([^"\n\r]+)/g;
    fixed = fixed.replace(dialogueVerbRegex, (match, verb, speech) => {
      const trimmedSpeech = speech.trim();
      if (!trimmedSpeech || trimmedSpeech.startsWith('"')) return match;
      fixesCount++;
      return `${verb} "${trimmedSpeech}"`;
    });

    const fixedLines = fixed.split("\n").map((line) => {
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        fixesCount++;
        return line.trimEnd() + '"';
      }
      return line;
    });
    fixed = fixedLines.join("\n");

    setContent(fixed);
    showNotice(
      fixesCount > 0
        ? `✨ เติม/จัดระเบียบเครื่องหมายคำพูด "..." ให้แล้ว ${fixesCount} จุด!`
        : '✓ ไม่พบคำพูดที่ขาดเครื่องหมาย'
    );
  };

  const handleAutoIndent = () => {
    if (!content) return;
    const formatted = content
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        return "    " + trimmed;
      })
      .filter((line, index, arr) => line !== "" || (index > 0 && arr[index - 1] !== ""))
      .join("\n\n");
    setContent(formatted);
  };

  const handleKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    const ta = contentRef.current;
    if (!ta) return;
    const indent = "\n\n    ";
    let done = false;
    try {
      done = document.execCommand("insertText", false, indent);
    } catch (err) {
      done = false;
    }
    if (!done) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      setContent(content.substring(0, start) + indent + content.substring(end));
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.selectionStart = contentRef.current.selectionEnd =
            start + indent.length;
        }
      }, 0);
    }
  };

  const handleCopyContent = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const ensureKeys = async () => {
    let keyList = getActiveKeyList(apiKeysInput);
    if (keyList.length > 0) return keyList;
    const input = await onPrompt(
      "🔑 กรุณาใส่ Gemini API Key ของคุณ (หลายคีย์คั่นด้วย , หรือขึ้นบรรทัดใหม่):"
    );
    if (!input) return null;
    setApiKeysInput(input);
    saveKeyToStorage(input);
    return getActiveKeyList(input);
  };

  const handleGeminiProofread = async () => {
    if (!content.trim()) {
      await onAlert("กรุณาใส่เนื้อหานิยายก่อนกดตรวจครับ", "warning");
      return;
    }

    const keyList = await ensureKeys();
    if (!keyList) return;

    setIsAiProcessing(true);
    setProgress(0);
    setTypoNotice(`🤖 เริ่มต้นตรวจทานด้วย ${keyList.length} API Keys...`);

    try {
      const paragraphs = content.split("\n\n");
      const total = paragraphs.length;
      const fixedParagraphs = new Array(total);
      let completedCount = 0;

      for (let i = 0; i < total; i++) {
        const para = paragraphs[i] || "";
        if (!para.trim()) {
          fixedParagraphs[i] = para;
          completedCount++;
          continue;
        }
        fixedParagraphs[i] = await fetchWithRetry(para, keyList);
        completedCount++;
        const currentPercent = Math.round((completedCount / total) * 100);
        setProgress(currentPercent);
        setTypoNotice(`🤖 กำลังตรวจทาน... (${completedCount}/${total} ย่อหน้า) - ${currentPercent}%`);
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      setContent(fixedParagraphs.join("\n\n"));
      showNotice("✨ ตรวจสอบเรียบร้อยสมบูรณ์แล้ว!");
    } catch (err) {
      await onAlert("เกิดข้อผิดพลาด: " + err.message, "error");
      setTypoNotice("");
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleCheckPronouns = async () => {
    if (!content.trim()) {
      await onAlert("กรุณาใส่เนื้อหานิยายก่อนตรวจสอบสรรพนามครับ", "warning");
      return;
    }

    const keyList = await ensureKeys();
    if (!keyList) return;

    setIsAiProcessing(true);
    setTypoNotice("🔍 AI กำลังสแกนหาสรรพนาม...");

    try {
      const results = await checkPronouns(keyList, content);
      setIsAiProcessing(false);
      setTypoNotice("");
      setPronounResults(results);
      const initialMap = {};
      results.forEach((item) => {
        initialMap[item.word] = "";
      });
      setReplacementMap(initialMap);
      setShowPronounModal(true);
    } catch (err) {
      await onAlert("เกิดข้อผิดพลาดในการตรวจสอบสรรพนาม: " + (err?.message || err), "error");
      setIsAiProcessing(false);
      setTypoNotice("");
    }
  };

  const applyPronounReplacements = () => {
    let newContent = content;
    let replacedCount = 0;
    Object.entries(replacementMap).forEach(([oldWord, newWord]) => {
      if (!oldWord || !newWord || !newWord.trim()) return;
      const regex = new RegExp(escapeRegExp(oldWord), "g");
      const found = newContent.match(regex);
      if (found && found.length) {
        replacedCount += found.length;
        newContent = newContent.replace(regex, newWord.trim());
      }
    });
    setContent(newContent);
    setShowPronounModal(false);
    showNotice(`✨ เปลี่ยนคำสรรพนามเรียบร้อยแล้วทั้งหมด ${replacedCount} จุด!`);
  };

  const handleSaveKeys = (e) => {
    e.preventDefault();
    saveKeyToStorage(apiKeysInput.trim());
    setShowKeyInput(false);
    const count = getActiveKeyList(apiKeysInput).length;
    onAlert(`บันทึก Gemini API Key เรียบร้อยทั้งหมด ${count} คีย์!`, "success");
  };

  const buildPayload = () => ({
    ...chapter,
    title: title.trim(),
    content: content,
    updatedAt: Date.now(),
  });

  const triggerSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const ok = await onSave(buildPayload());
      if (ok !== false) onCancel();
    } catch (err) {
      await onAlert("เกิดข้อผิดพลาดในการบันทึก: " + err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const triggerSaveAndNext = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSaveAndNext(buildPayload());
    } catch (err) {
      await onAlert("เกิดข้อผิดพลาดในการบันทึกและสร้างตอนถัดไป: " + err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const charCountTotal = countCharacters(debouncedContent, { includeSpaces: true });
  const charCountNoSpaces = countCharacters(debouncedContent, { includeSpaces: false });
  const keyCount = getApiKeyCount(apiKeysInput);

  return (
    <div className={styles.container}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <button className={styles.closeBtn} onClick={onCancel} aria-label="ปิดโดยไม่บันทึก">
            <ChevronLeft size={18} /> ปิด
          </button>
        </div>
        <div className={styles.topBarRight}>
          <button
            className={styles.keyBtn}
            onClick={() => setShowKeyInput(!showKeyInput)}
            title="ตั้งค่า Gemini API Keys"
          >
            🔑 {keyCount > 0 ? `${keyCount} API Keys` : "API Key"}
          </button>
          {onDelete && (
            <button className={styles.deleteBtn} onClick={onDelete} aria-label="ลบตอนนี้">
              <Trash2 size={16} />
            </button>
          )}
          <button
            className={styles.saveBtn}
            onClick={triggerSave}
            disabled={isSaving}
          >
            {isSaving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>

      {/* API Key Input */}
      {showKeyInput && (
        <form onSubmit={handleSaveKeys} className={styles.keyPanel}>
          <label className={styles.keyLabel}>
            🔑 วาง Gemini API Keys หลายๆ คีย์ (แยกด้วยบรรทัดใหม่ หรือเครื่องหมาย , )
          </label>
          <textarea
            className={styles.keyTextarea}
            rows={3}
            placeholder={`AIzaSyA1...\nAIzaSyB2...\nAIzaSyC3...`}
            value={apiKeysInput}
            onChange={(e) => setApiKeysInput(e.target.value)}
          />
          <div className={styles.keyFooter}>
            <span className={styles.keyInfo}>
              ตรวจพบทั้งหมด {keyCount} คีย์ (เก็บในเครื่องคุณเท่านั้น)
            </span>
            <button type="submit" className={styles.keySaveBtn}>
              บันทึกคีย์ทั้งหมด
            </button>
          </div>
        </form>
      )}

      {/* Font size bar */}
      <div className={styles.fontBar}>
        <span className={styles.chapterLabel}>ตอนที่ {chapter.order}</span>
        <div className={styles.fontSizeControls}>
          <button
            className={styles.fontSizeBtn}
            onClick={() => setFontSize((s) => Math.max(FONT_MIN, s - 1))}
            aria-label="ลดขนาดฟอนต์"
          >
            ก-
          </button>
          <span className={styles.fontSizeValue}>{fontSize}</span>
          <button
            className={styles.fontSizeBtn}
            onClick={() => setFontSize((s) => Math.min(FONT_MAX, s + 1))}
            aria-label="เพิ่มขนาดฟอนต์"
          >
            ก+
          </button>
        </div>
      </div>

      {/* Scroll Area */}
      <div ref={scrollRef} className={styles.scrollArea}>
        <div className={styles.editorContent}>
          <input
            className={styles.chapterTitleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ชื่อตอน (ไม่บังคับ)"
            style={{ fontSize: fontSize + 4 }}
          />

          <div className={styles.tipText}>
            💡 ทิป: Enter = ย่อหน้าใหม่ · Shift+Enter = ขึ้นบรรทัดธรรมดา
          </div>

          {/* Toolbar */}
          <div className={styles.toolbar}>
            <button
              className={`${styles.toolbarBtn} ${showFindReplace ? styles.toolbarBtnActive : ""}`}
              onClick={() => setShowFindReplace(!showFindReplace)}
            >
              🔍 ค้นหา/แทนที่
            </button>
            <button className={styles.toolbarBtn} onClick={handleFixDialogueQuotes}>
              💬 ตรวจ/ใส่ "..."
            </button>
            <button
              className={styles.toolbarBtnAi}
              onClick={handleGeminiProofread}
              disabled={isAiProcessing}
            >
              {isAiProcessing ? `⏳ (${progress}%)` : `🤖 AI ตรวจสลับคีย์ (${keyCount})`}
            </button>
            <button
              className={styles.toolbarBtn}
              onClick={handleCheckPronouns}
              disabled={isAiProcessing}
            >
              👥 ตรวจสรรพนาม
            </button>
            <button
              className={`${styles.toolbarBtn} ${copied ? styles.toolbarBtnCopied : ""}`}
              onClick={handleCopyContent}
            >
              {copied ? "✓ คัดลอกแล้ว!" : "📋 คัดลอกเนื้อหา"}
            </button>
            <button className={styles.toolbarBtn} onClick={handleAutoIndent}>
              ✨ จัดย่อหน้าทั้งหมด
            </button>
          </div>

          <div className={styles.privacyNote}>
            🔒 ปุ่ม 🤖 และ 👥 จะส่งข้อความในตอนนี้ไปประมวลผลที่ Google Gemini API (คีย์ของคุณถูกเก็บไว้ในเครื่องเท่านั้น)
          </div>

          {/* Find & Replace */}
          {showFindReplace && (
            <div className={styles.findReplace}>
              <div className={styles.findReplaceRow}>
                <input
                  className={styles.findInput}
                  type="text"
                  placeholder="ค้นหาคำ..."
                  value={searchWord}
                  onChange={(e) => setSearchWord(e.target.value)}
                />
                <span className={styles.matchCount}>พบ {matchCount} คำ</span>
              </div>
              <div className={styles.findReplaceRow}>
                <input
                  className={styles.replaceInput}
                  type="text"
                  placeholder="แทนที่ด้วย..."
                  value={replaceWord}
                  onChange={(e) => setReplaceWord(e.target.value)}
                />
                <button
                  className={styles.replaceBtn}
                  onClick={handleReplaceAll}
                  disabled={matchCount === 0}
                >
                  แทนที่ทั้งหมด
                </button>
              </div>
            </div>
          )}

          {/* AI Progress */}
          {isAiProcessing && (
            <div className={styles.progressContainer}>
              <div className={styles.progressHeader}>
                <span>{typoNotice}</span>
                <span className={styles.progressPercent}>{progress}%</span>
              </div>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* AI Notice */}
          {!isAiProcessing && typoNotice && (
            <div className={styles.noticeSuccess}>{typoNotice}</div>
          )}

          {/* Content Textarea */}
          <textarea
            ref={contentRef}
            className={styles.contentTextarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="เริ่มเขียนตอนนี้..."
            style={{ fontSize }}
          />

          {/* Stats */}
          <div className={styles.statsBar}>
            <span>📝 {wordCount(debouncedContent)} คำ</span>
            <span>•</span>
            <span>🔤 {charCountTotal} ตัวอักษร</span>
            <span>•</span>
            <span>(ไม่รวมเว้นวรรค: {charCountNoSpaces})</span>
          </div>

          {/* Save & Next */}
          <button
            className={styles.saveAndNext}
            onClick={triggerSaveAndNext}
            disabled={isSaving}
          >
            {isSaving ? (
              "กำลังบันทึก…"
            ) : (
              <>
                บันทึกและสร้างตอนถัดไป <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Pronoun Modal */}
      {showPronounModal && (
        <div className={styles.pronounOverlay}>
          <div className={styles.pronounDialog}>
            <h3 className={styles.pronounTitle}>👥 ตรวจพบคำสรรพนามในเนื้อหา</h3>
            <p className={styles.pronounDesc}>
              ตรวจสอบพบคำสรรพนาม (รวมถึงคำที่อาจหลุดมาจากยุคปัจจุบัน)
              สามารถพิมพ์คำที่ต้องการเปลี่ยนแทนที่ลงในช่องขวาได้เลยครับ:
            </p>
            <div className={styles.pronounList}>
              {pronounResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "#6a5c40" }}>
                  ไม่พบคำสรรพนามในตอนนี้
                </div>
              ) : (
                pronounResults.map((item, idx) => (
                  <div key={idx} className={styles.pronounItem}>
                    <div style={{ flex: 1 }}>
                      <div>
                        <span className={styles.pronounWord}>"{item.word}"</span>{" "}
                        <span className={styles.pronounCount}>
                          (พบ {item.count} ครั้ง)
                        </span>
                      </div>
                      <div className={styles.pronounSuggestion}>
                        คำแนะนำ: {item.suggestion}
                      </div>
                    </div>
                    <input
                      className={styles.pronounInput}
                      type="text"
                      placeholder="เปลี่ยนเป็น..."
                      value={replacementMap[item.word] || ""}
                      onChange={(e) =>
                        setReplacementMap({
                          ...replacementMap,
                          [item.word]: e.target.value,
                        })
                      }
                    />
                  </div>
                ))
              )}
            </div>
            <div className={styles.pronounActions}>
              <button
                className={styles.pronounCancelBtn}
                onClick={() => setShowPronounModal(false)}
              >
                ยกเลิก
              </button>
              {pronounResults.length > 0 && (
                <button
                  className={styles.pronounApplyBtn}
                  onClick={applyPronounReplacements}
                >
                  ยืนยันเปลี่ยนคำทั้งหมด ✨
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
