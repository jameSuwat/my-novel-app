import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, ArrowRight, Plus, Pencil, Image as ImageIcon, X, Trash2, Clock, BookOpen, Search, Feather } from "lucide-react";

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const day = Math.floor(hr / 24);
  return `${day} วันที่แล้ว`;
}

function wordCount(text) {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function novelUpdatedAt(novel) {
  if (!novel.chapters.length) return novel.createdAt;
  return Math.max(novel.createdAt, ...novel.chapters.map((c) => c.updatedAt));
}

const seedNovels = [
  {
    id: "n1",
    title: "เปลี่ยนโลก",
    synopsis: "เรื่องราวของหญิงสาวผู้ต้องเลือกระหว่างความจริงกับคนที่เธอรัก เมื่อแผนที่โบราณเปิดประตูสู่ความลับที่ครอบครัวของเธอฝังไว้",
    cover: null,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    chapters: [
      { id: "c1", order: 1, title: "", content: "แสงแดดยามเช้าสาดผ่านหน้าต่างบานเก่า อารดายืนนิ่งอยู่หน้าประตูบ้านที่ไม่ได้กลับมาเยือนนานถึงสิบปี...", updatedAt: Date.now() - 1000 * 60 * 60 * 20 },
      { id: "c2", order: 2, title: "", content: "", updatedAt: Date.now() - 1000 * 60 * 60 * 10 },
    ],
  },
  {
    id: "n2",
    title: "เงาใต้แสงจันทร์",
    synopsis: "",
    cover: null,
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    chapters: [],
  },
];

const STORAGE_KEY = "novel-writer-app-data";

function loadNovels() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedNovels;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return seedNovels;
  } catch (e) {
    console.error("โหลดข้อมูลจาก localStorage ไม่สำเร็จ", e);
    return seedNovels;
  }
}

export default function NovelLibraryApp() {
  const [novels, setNovels] = useState(loadNovels);
  const [currentId, setCurrentId] = useState(null);
  const [query, setQuery] = useState("");
  const [editingNovelInfo, setEditingNovelInfo] = useState(null); // "new" | novel object | null
  const [openChapter, setOpenChapter] = useState(null);
  const [isNewChapter, setIsNewChapter] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(novels));
    } catch (e) {
      console.error("บันทึกข้อมูลลง localStorage ไม่สำเร็จ", e);
    }
  }, [novels]);

  const current = novels.find((n) => n.id === currentId) || null;

  const filteredNovels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...novels]
      .filter((n) => !q || n.title.toLowerCase().includes(q))
      .sort((a, b) => novelUpdatedAt(b) - novelUpdatedAt(a));
  }, [novels, query]);

  function updateNovel(id, patch) {
    setNovels((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  function saveNovelInfo(data) {
    if (editingNovelInfo === "new") {
      const id = `n-${Date.now()}`;
      setNovels((prev) => [...prev, { id, chapters: [], createdAt: Date.now(), ...data }]);
      setCurrentId(id);
    } else {
      updateNovel(editingNovelInfo.id, data);
    }
    setEditingNovelInfo(null);
  }

  function deleteNovel(id) {
    setNovels((prev) => prev.filter((n) => n.id !== id));
    setEditingNovelInfo(null);
    setCurrentId(null);
  }

  function addChapter() {
    if (!current) return;
    const nextOrder = current.chapters.length ? Math.max(...current.chapters.map((c) => c.order)) + 1 : 1;
    setOpenChapter({ id: null, order: nextOrder, title: "", content: "", updatedAt: Date.now() });
    setIsNewChapter(true);
  }

  function saveChapter(ch) {
    if (!current) return;
    let nextChapters;
    if (isNewChapter) {
      nextChapters = [...current.chapters, { ...ch, id: `c-${Date.now()}`, updatedAt: Date.now() }];
    } else {
      nextChapters = current.chapters.map((c) => (c.id === ch.id ? { ...ch, updatedAt: Date.now() } : c));
    }
    updateNovel(current.id, { chapters: nextChapters });
    setOpenChapter(null);
  }

  function saveChapterAndNext(ch) {
    if (!current) return;
    let nextChapters;
    if (isNewChapter) {
      nextChapters = [...current.chapters, { ...ch, id: `c-${Date.now()}`, updatedAt: Date.now() }];
    } else {
      nextChapters = current.chapters.map((c) => (c.id === ch.id ? { ...ch, updatedAt: Date.now() } : c));
    }
    updateNovel(current.id, { chapters: nextChapters });
    const nextOrder = Math.max(...nextChapters.map((c) => c.order)) + 1;
    setOpenChapter({ id: null, order: nextOrder, title: "", content: "", updatedAt: Date.now() });
    setIsNewChapter(true);
  }

  function deleteChapter(id) {
    if (!current) return;
    updateNovel(current.id, { chapters: current.chapters.filter((c) => c.id !== id) });
    setOpenChapter(null);
  }

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif", background: "#12161d", minHeight: "100vh", color: "#e8e3d8" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Thai:wght@500;600;700&family=Sarabun:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #3a4150; border-radius: 4px; }
        textarea, input { font-family: 'Sarabun', sans-serif; }
      `}</style>

      {!current ? (
        <LibraryView
          novels={filteredNovels}
          query={query}
          setQuery={setQuery}
          onOpen={(id) => setCurrentId(id)}
          onCreate={() => setEditingNovelInfo("new")}
        />
      ) : (
        <NovelView
          novel={current}
          fileInputRef={fileInputRef}
          onBack={() => setCurrentId(null)}
          onEditInfo={() => setEditingNovelInfo(current)}
          onCoverPick={(dataUrl) => updateNovel(current.id, { cover: dataUrl })}
          onOpenChapter={(ch, isNew) => {
            setOpenChapter(ch);
            setIsNewChapter(isNew);
          }}
          onAddChapter={addChapter}
        />
      )}

      {editingNovelInfo && (
        <NovelInfoEditor
          novel={editingNovelInfo === "new" ? { title: "", synopsis: "", cover: null } : editingNovelInfo}
          isNew={editingNovelInfo === "new"}
          onSave={saveNovelInfo}
          onCancel={() => setEditingNovelInfo(null)}
          onDelete={editingNovelInfo !== "new" ? () => deleteNovel(editingNovelInfo.id) : null}
        />
      )}

      {openChapter && (
        <ChapterEditor
          key={openChapter.id || `new-${openChapter.order}-${openChapter.updatedAt}`}
          chapter={openChapter}
          onSave={saveChapter}
          onSaveAndNext={saveChapterAndNext}
          onCancel={() => setOpenChapter(null)}
          onDelete={!isNewChapter ? () => deleteChapter(openChapter.id) : null}
        />
      )}
    </div>
  );
}

function LibraryView({ novels, query, setQuery, onOpen, onCreate }) {
  return (
    <div>
      <header style={{ padding: "28px 20px 16px", borderBottom: "1px solid #262d3a", position: "sticky", top: 0, background: "#12161dee", backdropFilter: "blur(6px)", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Feather size={22} color="#c9a15a" />
          <h1 style={{ fontFamily: "'Noto Serif Thai', serif", fontWeight: 700, fontSize: 22, margin: 0, letterSpacing: 0.3 }}>
            หิ้งนิยายของฉัน
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1b212b", border: "1px solid #2a3140", borderRadius: 10, padding: "9px 12px" }}>
          <Search size={16} color="#8b93a3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อเรื่อง..."
            style={{ background: "transparent", border: "none", outline: "none", color: "#e8e3d8", fontSize: 14, width: "100%" }}
          />
        </div>
      </header>

      <main style={{ padding: "18px 16px 100px" }}>
        {novels.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7180" }}>
            <Feather size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
            <p style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 16, margin: 0 }}>
              {query ? "ไม่พบนิยายที่ตรงกับคำค้นหา" : "หิ้งนิยายยังว่างอยู่"}
            </p>
            <p style={{ fontSize: 13, marginTop: 6 }}>
              {query ? "ลองค้นหาคำอื่น" : "แตะปุ่ม + เพื่อเริ่มเรื่องแรกของคุณ"}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 16 }}>
            {novels.map((n) => (
              <button
                key={n.id}
                onClick={() => onOpen(n.id)}
                style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "#e8e3d8", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "3/4.2",
                    borderRadius: 8,
                    background: n.cover ? `url(${n.cover}) center/cover no-repeat` : "linear-gradient(135deg, #232a36, #1a202a)",
                    border: "1px solid #2a3140",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
                  }}
                >
                  {!n.cover && <BookOpen size={26} color="#4b5162" />}
                </div>
                <div style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                  {n.title || "ยังไม่มีชื่อเรื่อง"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#7d8494" }}>
                  <BookOpen size={10} /> {n.chapters.length} ตอน
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      <button
        onClick={onCreate}
        aria-label="สร้างนิยายเรื่องใหม่"
        style={{
          position: "fixed", bottom: 24, right: 24, width: 54, height: 54, borderRadius: "50%",
          background: "#c9a15a", border: "none", color: "#1a140a", display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", boxShadow: "0 6px 20px rgba(201,161,90,0.35)",
        }}
      >
        <Plus size={24} />
      </button>
    </div>
  );
}

function NovelView({ novel, fileInputRef, onBack, onEditInfo, onCoverPick, onOpenChapter, onAddChapter }) {
  const sorted = useMemo(() => [...novel.chapters].sort((a, b) => a.order - b.order), [novel.chapters]);

  function handleCoverPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCoverPick(reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 6, background: "#12161dee", backdropFilter: "blur(6px)", border: "none", color: "#c9a15a", padding: "16px 18px", fontSize: 14, cursor: "pointer", width: "100%" }}
      >
        <ChevronLeft size={18} /> หิ้งนิยาย
      </button>

      <div style={{ position: "relative" }}>
        <div
          style={{
            height: 180,
            background: novel.cover
              ? `linear-gradient(180deg, rgba(18,22,29,0.2), #12161d), url(${novel.cover}) center/cover no-repeat`
              : "linear-gradient(135deg, #1e2530, #12161d)",
          }}
        />
        <div style={{ display: "flex", gap: 16, padding: "0 18px", marginTop: -70 }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 104, height: 148, borderRadius: 8,
              background: novel.cover ? `url(${novel.cover}) center/cover no-repeat` : "#232a36",
              border: "1px solid #333c4d", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            {!novel.cover && <ImageIcon size={24} color="#5c6372" />}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCoverPick} style={{ display: "none" }} />
          <div style={{ paddingTop: 76, flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <h1 style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 21, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
                {novel.title || "ยังไม่มีชื่อเรื่อง"}
              </h1>
              <button
                onClick={onEditInfo}
                style={{ background: "#1b212b", border: "1px solid #2a3140", borderRadius: 8, padding: 7, color: "#c9a15a", cursor: "pointer", flexShrink: 0 }}
              >
                <Pencil size={14} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "#9099a8" }}>
              <BookOpen size={12} /> {novel.chapters.length} ตอน
            </div>
          </div>
        </div>

        <p style={{ padding: "16px 18px 0", fontSize: 13.5, lineHeight: 1.8, color: "#b7bdc9", margin: 0 }}>
          {novel.synopsis || "ยังไม่มีเรื่องย่อ — แตะไอคอนดินสอเพื่อเพิ่ม"}
        </p>
      </div>

      <div style={{ padding: "22px 18px 100px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #262d3a", paddingBottom: 10, marginBottom: 4 }}>
          <span style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 15, fontWeight: 600, color: "#c9a15a" }}>ตอนทั้งหมด</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#5c6372" }}>{novel.chapters.length} รายการ</span>
        </div>

        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#6b7180" }}>
            <p style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 15 }}>ยังไม่มีตอนไหนเลย</p>
            <p style={{ fontSize: 13 }}>แตะปุ่ม + เพื่อเริ่มเขียนตอนแรก</p>
          </div>
        ) : (
          sorted.map((ch) => (
            <button
              key={ch.id}
              onClick={() => onOpenChapter(ch, false)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 4px",
                borderBottom: "1px solid #1f2530", background: "none", border: "none",
                borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "#1f2530",
                cursor: "pointer", textAlign: "left", color: "#e8e3d8",
              }}
            >
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1b212b", border: "1px solid #2a3140", color: "#c9a15a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, flexShrink: 0 }}>
                {ch.order}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 15.5, fontWeight: 600 }}>
                  {ch.title ? `ตอนที่ ${ch.order} — ${ch.title}` : `ตอนที่ ${ch.order}`}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3, fontSize: 11.5, color: "#7d8494" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                    <Clock size={11} /> {timeAgo(ch.updatedAt)}
                  </span>
                  <span>·</span>
                  <span>{wordCount(ch.content)} คำ</span>
                </div>
              </div>
              <ChevronRight size={18} color="#4b5162" />
            </button>
          ))
        )}
      </div>

      <button
        onClick={onAddChapter}
        aria-label="เพิ่มตอนใหม่"
        style={{
          position: "fixed", bottom: 24, right: 24, width: 54, height: 54, borderRadius: "50%",
          background: "#c9a15a", border: "none", color: "#1a140a", display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", boxShadow: "0 6px 20px rgba(201,161,90,0.35)",
        }}
      >
        <Plus size={24} />
      </button>
    </div>
  );
}

function NovelInfoEditor({ novel, isNew, onSave, onCancel, onDelete }) {
  const [title, setTitle] = useState(novel.title);
  const [synopsis, setSynopsis] = useState(novel.synopsis);
  const [cover, setCover] = useState(novel.cover);
  const fileRef = useRef(null);

  function handlePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCover(reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#12161dee", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
      <div style={{ width: "100%", background: "#1a202a", borderTop: "1px solid #2a3140", borderRadius: "16px 16px 0 0", padding: 20, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 16, fontWeight: 600 }}>
            {isNew ? "สร้างนิยายเรื่องใหม่" : "แก้ไขข้อมูลนิยาย"}
          </span>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "#9099a8", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: 84, height: 118, borderRadius: 8,
              background: cover ? `url(${cover}) center/cover no-repeat` : "#232a36",
              border: "1px solid #333c4d", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, cursor: "pointer",
            }}
          >
            {!cover && <ImageIcon size={20} color="#5c6372" />}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePick} style={{ display: "none" }} />
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: "#7d8494" }}>ชื่อเรื่อง</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ตั้งชื่อนิยายของคุณ"
              style={{ width: "100%", background: "#12161d", border: "1px solid #2a3140", borderRadius: 8, padding: "10px 12px", color: "#e8e3d8", fontSize: 15, margin: "6px 0", outline: "none" }}
            />
            <div style={{ fontSize: 11, color: "#5c6372" }}>แตะรูปเพื่อเลือกปกจากเครื่อง</div>
          </div>
        </div>

        <label style={{ fontSize: 12, color: "#7d8494" }}>หรือวางลิงก์รูปภาพ (URL)</label>
        <input
          value={cover && cover.startsWith("http") ? cover : ""}
          onChange={(e) => setCover(e.target.value)}
          placeholder="https://..."
          style={{ width: "100%", background: "#12161d", border: "1px solid #2a3140", borderRadius: 8, padding: "10px 12px", color: "#e8e3d8", fontSize: 13, margin: "6px 0 16px", outline: "none", fontFamily: "'JetBrains Mono', monospace" }}
        />
        <label style={{ fontSize: 12, color: "#7d8494" }}>เรื่องย่อ</label>
        <textarea
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          rows={5}
          placeholder="เกริ่นเรื่องสั้นๆ ให้ผู้อ่านอยากติดตาม..."
          style={{ width: "100%", background: "#12161d", border: "1px solid #2a3140", borderRadius: 8, padding: "10px 12px", color: "#e8e3d8", fontSize: 14, lineHeight: 1.7, margin: "6px 0 20px", outline: "none", resize: "vertical" }}
        />

        <div style={{ display: "flex", gap: 10 }}>
          {onDelete && (
            <button
              onClick={onDelete}
              style={{ flexShrink: 0, background: "none", border: "1px solid #3a2a2a", color: "#a85a5a", borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}
            >
              <Trash2 size={16} /> ลบเรื่องนี้
            </button>
          )}
          <button
            onClick={() => onSave({ title: title.trim() || "ยังไม่มีชื่อเรื่อง", synopsis, cover })}
            style={{ flex: 1, background: "#c9a15a", border: "none", color: "#1a140a", fontWeight: 600, fontSize: 15, padding: "12px", borderRadius: 10, cursor: "pointer" }}
          >
            {isNew ? "สร้างและเริ่มเขียน" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

const FONT_MIN = 13;
const FONT_MAX = 28;

function ChapterEditor({ chapter, onSave, onSaveAndNext, onCancel, onDelete }) {
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content);
  const [fontSize, setFontSize] = useState(17);
  const contentRef = useRef(null);

  // Defensive reset: whenever we're handed a different chapter (new id, or a
  // fresh "new chapter" draft with a different order), clear the fields.
  // This covers the case even if the component instance isn't remounted.
  useEffect(() => {
    setTitle(chapter.title || "");
    setContent(chapter.content || "");
  }, [chapter.id, chapter.order]);

  useEffect(() => {
  if (contentRef.current) {
    const scrollContainer = contentRef.current.parentElement.parentElement;
    const currentScroll = scrollContainer.scrollTop;

    contentRef.current.style.height = "auto";
    contentRef.current.style.height = contentRef.current.scrollHeight + "px";

    scrollContainer.scrollTop = currentScroll;
  }
}, [content, fontSize]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f4ede0", zIndex: 50, display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 16px",
          background: "#1a202a",
          borderBottom: "1px solid #2a3140",
        }}
      >
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#9099a8", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          <ChevronLeft size={18} /> ปิด
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {onDelete && (
            <button onClick={onDelete} style={{ background: "none", border: "none", color: "#a85a5a", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={() => onSave({ ...chapter, title: title.trim(), content })}
            style={{ background: "#c9a15a", border: "none", color: "#1a140a", cursor: "pointer", borderRadius: 8, padding: "8px 16px", fontWeight: 600, fontSize: 14 }}
          >
            บันทึก
          </button>
        </div>
      </div>

      {/* Sub-bar: chapter label + font size control */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 16px",
          background: "#efe6d3",
          borderBottom: "1px solid #ddd0b3",
        }}
      >
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#8a7c5e" }}>
          ตอนที่ {chapter.order}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={() => setFontSize((s) => Math.max(FONT_MIN, s - 1))}
            aria-label="ลดขนาดตัวอักษร"
            style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #cabb98", background: "#f4ede0", color: "#4a3f2a", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
          >
            ก-
          </button>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8a7c5e", width: 30, textAlign: "center" }}>
            {fontSize}
          </span>
          <button
            onClick={() => setFontSize((s) => Math.min(FONT_MAX, s + 1))}
            aria-label="เพิ่มขนาดตัวอักษร"
            style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #cabb98", background: "#f4ede0", color: "#4a3f2a", cursor: "pointer", fontSize: 15, fontWeight: 700 }}
          >
            ก+
          </button>
        </div>
      </div>

      {/* Full-bleed writing area */}
      <div style={{ flex: 1, overflowY: "auto", color: "#2a2318" }}>
        <div style={{ padding: "20px 18px 60px" }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ชื่อตอน (ไม่บังคับ)"
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "'Noto Serif Thai', serif",
              fontSize: fontSize + 4,
              fontWeight: 700,
              marginBottom: 14,
              color: "#221d14",
            }}
          />
          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="เริ่มเขียนตอนนี้..."
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              resize: "none",
              fontSize: fontSize,
              lineHeight: 1.9,
              color: "#2a2318",
              minHeight: "60vh",
            }}
          />
          <div style={{ marginTop: 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8a7c5e", borderTop: "1px dashed #cabb98", paddingTop: 8 }}>
            {wordCount(content)} คำ
          </div>

          <button
            onClick={() => onSaveAndNext({ ...chapter, title: title.trim(), content })}
            style={{
              width: "100%",
              marginTop: 22,
              background: "#1a202a",
              border: "1px solid #c9a15a",
              color: "#c9a15a",
              fontWeight: 600,
              fontSize: 14.5,
              padding: "13px",
              borderRadius: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            บันทึกและสร้างตอนถัดไป <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
