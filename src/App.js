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
  const [editingNovelInfo, setEditingNovelInfo] = useState(null); 
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

  // 🟢 ฟังก์ชันบังคับเซฟลงเครื่องทันที (Manual Save)
  const forceSaveToLocal = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(novels));
    } catch (e) {
      console.error("บังคับบันทึกข้อมูลล้มเหลว", e);
    }
  };

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
          onForceSave={forceSaveToLocal} // 🟢 ส่งฟังก์ชันไปให้ปุ่มหน้าหลัก
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

function NovelView({ novel, fileInputRef, onBack, onEditInfo, onCoverPick, onOpenChapter, onAddChapter, onForceSave }) {
  const sorted = useMemo(() => [...novel.chapters].sort((a, b) => a.order - b.order), [novel.chapters]);
  const [savedAlert, setSavedAlert] = useState(false); // 🟢 สถานะการกดเซฟหน้าหลัก

  function handleCoverPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCoverPick(reader.result);
    reader.readAsDataURL(file);
  }

  // 🟢 ฟังก์ชันเวลากดปุ่มเซฟ
  const handleManualSave = () => {
    if (onForceSave) onForceSave();
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 2000); // คืนค่าปุ่มหลัง 2 วิ
  };

  return (
    <div>
      {/* 🟢 อัปเดต Header หน้าหลัก เพิ่มปุ่มเซฟ */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#12161dee", backdropFilter: "blur(6px)", width: "100%" }}>
        <button
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#c9a15a", padding: "16px 18px", fontSize: 14, cursor: "pointer" }}
        >
          <ChevronLeft size={18} /> หิ้งนิยาย
        </button>

        <button
          onClick={handleManualSave}
          style={{
            background: savedAlert ? "#2e5b1e" : "#1b212b",
            border: `1px solid ${savedAlert ? "#b2d8a0" : "#2a3140"}`,
            color: savedAlert ? "#e2f0d9" : "#c9a15a",
            borderRadius: 8,
            padding: "6px 14px",
            marginRight: 18,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          {savedAlert ? "✓ บันทึกแล้ว" : "💾 บันทึก"}
        </button>
      </div>

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
const FONT_SIZE_KEY = "novel-writer-font-size";
const GEMINI_KEY_STORAGE = "novel-writer-gemini-keys";
const GEMINI_MODEL = "gemini-2.5-flash";

function ChapterEditor({ chapter, onSave, onSaveAndNext, onCancel, onDelete }) {
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content);
  const [copied, setCopied] = useState(false);
  const [typoNotice, setTypoNotice] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // API Keys State
  const [apiKeysInput, setApiKeysInput] = useState(() => localStorage.getItem(GEMINI_KEY_STORAGE) || "");
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Modal สรรพนามข้ามยุค
  const [showPronounModal, setShowPronounModal] = useState(false);
  const [pronounResults, setPronounResults] = useState([]);
  const [replacementMap, setReplacementMap] = useState({});

  const [fontSize, setFontSize] = useState(() => {
    try {
      const saved = localStorage.getItem(FONT_SIZE_KEY);
      return saved ? Number(saved) : 17;
    } catch (e) {
      return 17;
    }
  });
  const contentRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(FONT_SIZE_KEY, fontSize);
    } catch (e) {}
  }, [fontSize]);

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
    if (e.key === "Enter") {
      e.preventDefault();
      const { selectionStart, selectionEnd } = e.target;
      const indent = "\n\n    ";
      const newContent =
        content.substring(0, selectionStart) +
        indent +
        content.substring(selectionEnd);

      setContent(newContent);

      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.selectionStart = contentRef.current.selectionEnd =
            selectionStart + indent.length;
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

  const getActiveKeyList = () => {
    const raw = apiKeysInput || localStorage.getItem(GEMINI_KEY_STORAGE) || "";
    return raw
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  };

  // 🟢 💬 ฟังก์ชันตรวจสอบและใส่เครื่องหมาย "..." ทันที (รองรับทั้งไฮไลต์คลุมดำ หรือสแกนคำพูดพูดว่า/ถามว่า)
  const handleFixDialogueQuotes = () => {
    if (!content) return;

    if (contentRef.current) {
      const { selectionStart, selectionEnd } = contentRef.current;
      if (selectionStart !== selectionEnd) {
        const selectedText = content.substring(selectionStart, selectionEnd);
        const wrapped = (selectedText.startsWith('"') && selectedText.endsWith('"'))
          ? selectedText.slice(1, -1)
          : `"${selectedText}"`;
        const newContent = content.substring(0, selectionStart) + wrapped + content.substring(selectionEnd);
        setContent(newContent);
        setTypoNotice('✨ ใส่เครื่องหมาย "..." ครอบข้อความที่เลือกเรียบร้อย!');
        setTimeout(() => setTypoNotice(""), 3000);
        return;
      }
    }

    let fixed = content;
    let fixesCount = 0;

    const quoteStandardized = fixed.replace(/[“”「」]/g, '"').replace(/[‘’]/g, "'");
    if (quoteStandardized !== fixed) {
      fixesCount++;
      fixed = quoteStandardized;
    }

    const dialogueVerbRegex = /(พูดว่า|ถามว่า|ตอบว่า|บอกว่า|ตะโกนว่า|กระซิบว่า|อุทานว่า|พึมพำว่า|กระเซ้าว่า|แย้งว่า)\s*([^"\n\r]+)/g;
    const newFixed = fixed.replace(dialogueVerbRegex, (match, verb, speech) => {
      const trimmedSpeech = speech.trim();
      if (!trimmedSpeech || trimmedSpeech.startsWith('"')) return match;
      fixesCount++;
      return `${verb} "${trimmedSpeech}"`;
    });
    fixed = newFixed;

    const lines = fixed.split("\n");
    const fixedLines = lines.map(line => {
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        fixesCount++;
        return line.trimEnd() + '"';
      }
      return line;
    });
    fixed = fixedLines.join("\n");

    setContent(fixed);

    if (fixesCount > 0) {
      setTypoNotice(`✨ เติม/จัดระเบียบเครื่องหมายคำพูด "..." ให้แล้ว ${fixesCount} จุด!`);
    } else {
      setTypoNotice('✓ ไม่พบคำพูดที่ขาดเครื่องหมาย (หรือลองคลุมดำข้อความแล้วกดปุ่มนี้เพื่อใส่ "..." ได้ครับ)');
    }
    setTimeout(() => setTypoNotice(""), 4000);
  };

  const fetchWithRetry = async (para, key, retries = 3, delay = 2000) => {
    if (!para.trim()) return para;

    const promptText = `คุณคือบรรณาธิการตรวจทานนิยายภาษาไทย หน้าที่ของคุณคือ:
1. เติมเครื่องหมายคำพูด "..." ครอบบทสนทนาหรือคำพูดตัวละครที่ยังไม่มีให้อย่างถูกต้อง
2. แก้ไขคำพิมพ์ผิด ตัวการันต์ สระเอซ้ำ (เเ -> แ) และเว้นวรรคไม้ยมก (ๆ)
3. **ห้าม** แก้ไขเนื้อหาหรือสำนวนเด็ดขาด
4. ตอบกลับเฉพาะข้อความที่แก้ไขแล้วเท่านั้น ห้ามมีคำเกริ่นใดๆ

ข้อความ:
${para}`;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }]
            })
          }
        );

        const data = await response.json();
        if (data.error) {
          if (data.error.code === 429 && attempt < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
            continue;
          }
          throw new Error(data.error.message || "เกิดข้อผิดพลาดจาก Gemini API");
        }

        const aiFixed = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return aiFixed ? aiFixed.trim() : para;
      } catch (err) {
        if (attempt === retries - 1) throw err;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return para;
  };

  const handleGeminiProofread = async () => {
    if (!content.trim()) {
      alert("กรุณาใส่เนื้อหานิยายก่อนกดตรวจครับ");
      return;
    }

    let keyList = getActiveKeyList();

    if (keyList.length === 0) {
      const input = prompt("🔑 กรุณาใส่ Gemini API Key ของคุณ\n(หากมีหลายคีย์ ให้คั่นด้วยเครื่องหมายจุลภาค , หรือขึ้นบรรทัดใหม่):");
      if (!input) return;
      setApiKeysInput(input);
      localStorage.setItem(GEMINI_KEY_STORAGE, input);
      keyList = input.split(/[\n,]+/).map((k) => k.trim()).filter((k) => k.length > 0);
    }

    setIsAiProcessing(true);
    setProgress(0);
    setTypoNotice(`🤖 เริ่มต้นตรวจทานด้วย ${keyList.length} API Keys...`);

    try {
      const paragraphs = content.split("\n\n");
      const total = paragraphs.length;
      const fixedParagraphs = new Array(total);
      let completedCount = 0;

      for (let i = 0; i < total; i++) {
        const para = paragraphs[i];
        const currentKey = keyList[i % keyList.length];

        if (!para.trim()) {
          fixedParagraphs[i] = para;
          completedCount++;
          continue;
        }

        try {
          fixedParagraphs[i] = await fetchWithRetry(para, currentKey);
        } catch (err) {
          console.error(`Paragraph ${i} error:`, err);
          fixedParagraphs[i] = para;
        }

        completedCount++;
        const currentPercent = Math.round((completedCount / total) * 100);
        setProgress(currentPercent);
        setTypoNotice(`🤖 กำลังตรวจทาน... (${completedCount}/${total} ย่อหน้า) - ${currentPercent}%`);

        if (i < total - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      setContent(fixedParagraphs.join("\n\n"));
      setTypoNotice(`✨ ตรวจสอบเรียบร้อยสมบูรณ์แล้ว!`);
    } catch (err) {
      alert("เกิดข้อผิดพลาด: " + err.message);
      setTypoNotice("");
    } finally {
      setIsAiProcessing(false);
      setTimeout(() => setTypoNotice(""), 4000);
    }
  };

  const handleCheckPronouns = async () => {
    if (!content.trim()) {
      alert("กรุณาใส่เนื้อหานิยายก่อนตรวจสอบสรรพนามครับ");
      return;
    }

    let keyList = getActiveKeyList();
    if (keyList.length === 0) {
      const input = prompt("🔑 กรุณาใส่ Gemini API Key ก่อนใช้งานตรวจสอบสรรพนาม:");
      if (!input) return;
      setApiKeysInput(input);
      localStorage.setItem(GEMINI_KEY_STORAGE, input);
      keyList = input.split(/[\n,]+/).map((k) => k.trim()).filter((k) => k.length > 0);
    }

    setIsAiProcessing(true);
    setTypoNotice("🔍 AI กำลังสแกนหาสรรพนามยุคปัจจุบัน/ข้ามยุค...");

    try {
      const promptText = `คุณคือนักวิเคราะห์วรรณกรรม ตรวจสอบเนื้อหานิยายภาษาไทยด้านล่างนี้ ค้นหาคำสรรพนามที่มักใช้ในยุคปัจจุบัน (เช่น ฉัน, เธอ, คุณ, ผม, นาย, แก, ชั้น, เรา, ค่ะ, คะ, ครับ, จ้า) ที่อาจหลุดมาในนิยายพีเรียดหรือนิยายโบราณ 
ให้ส่งผลลัพธ์กลับมาในรูปแบบ JSON Array ของ Object โดยแต่ละ Object ต้องมีโครงสร้างดังนี้:
[
  { "word": "คำที่พบ", "count": จำนวนครั้งที่พบ, "suggestion": "คำแนะนำเบื้องต้น" }
]
*สำคัญมาก*: ตอบกลับเฉพาะ JSON แพลนๆ เท่านั้น ห้ามมีคำอธิบายหรือ Markdown อื่นห่อหุ้ม

เนื้อหา:
${content}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${keyList[0]}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsedResults = JSON.parse(cleanJson);

      setPronounResults(parsedResults);
      const initialMap = {};
      parsedResults.forEach(item => { initialMap[item.word] = ""; });
      setReplacementMap(initialMap);
      setShowPronounModal(true);
      setTypoNotice("");
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการตรวจสอบสรรพนาม: " + err.message);
      setTypoNotice("");
    } finally {
      setIsAiProcessing(false);
    }
  };

  const applyPronounReplacements = () => {
    let newContent = content;
    let replacedCount = 0;

    Object.keys(replacementMap).forEach(oldWord => {
      const newWord = replacementMap[oldWord];
      if (newWord && newWord.trim() !== "") {
        const regex = new RegExp(oldWord, "g");
        const matches = newContent.match(regex);
        if (matches) {
          replacedCount += matches.length;
          newContent = newContent.replace(regex, newWord.trim());
        }
      }
    });

    setContent(newContent);
    setShowPronounModal(false);
    setTypoNotice(`✨ เปลี่ยนคำสรรพนามเรียบร้อยแล้วทั้งหมด ${replacedCount} จุด!`);
    setTimeout(() => setTypoNotice(""), 4000);
  };

  const handleSaveKeys = (e) => {
    e.preventDefault();
    localStorage.setItem(GEMINI_KEY_STORAGE, apiKeysInput.trim());
    setShowKeyInput(false);
    const count = getActiveKeyList().length;
    alert(`บันทึก Gemini API Key เรียบร้อยทั้งหมด ${count} คีย์!`);
  };

  const charCountTotal = content ? content.length : 0;
  const charCountNoSpaces = content ? content.replace(/\s+/g, "").length : 0;
  const keyCount = getActiveKeyList().length;

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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            title="ตั้งค่า Gemini API Keys"
            style={{ background: "none", border: "1px solid #3a4454", color: "#c9a15a", cursor: "pointer", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}
          >
            🔑 {keyCount > 0 ? `${keyCount} API Keys` : "API Key"}
          </button>
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

      {showKeyInput && (
        <form onSubmit={handleSaveKeys} style={{ background: "#2a3140", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 12, color: "#c9a15a" }}>
            🔑 วาง Gemini API Keys หลายๆ คีย์ (แยกด้วยบรรทัดใหม่ หรือเครื่องหมาย , )
          </label>
          <textarea
            rows={3}
            placeholder={`AIzaSyA1...\nAIzaSyB2...\nAIzaSyC3...`}
            value={apiKeysInput}
            onChange={(e) => setApiKeysInput(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #4a5568", background: "#1a202a", color: "#fff", fontSize: 12, fontFamily: "monospace" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#9099a8" }}>ตรวจพบทั้งหมด {keyCount} คีย์</span>
            <button type="submit" style={{ background: "#c9a15a", border: "none", padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
              บันทึกคีย์ทั้งหมด
            </button>
          </div>
        </form>
      )}

      {/* Sub-bar */}
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
            style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #cabb98", background: "#f4ede0", color: "#4a3f2a", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
          >
            ก-
          </button>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8a7c5e", width: 30, textAlign: "center" }}>
            {fontSize}
          </span>
          <button
            onClick={() => setFontSize((s) => Math.min(FONT_MAX, s + 1))}
            style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #cabb98", background: "#f4ede0", color: "#4a3f2a", cursor: "pointer", fontSize: 15, fontWeight: 700 }}
          >
            ก+
          </button>
        </div>
      </div>

      {/* Writing area */}
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

          {/* โซนปุ่มเครื่องมือ */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#8a7c5e" }}>
              💡 ทิป: กด Enter เพื่อขึ้นย่อหน้าให้อัตโนมัติ
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                onClick={handleFixDialogueQuotes}
                style={{
                  background: "#efe6d3",
                  border: "1px solid #cabb98",
                  color: "#4a3f2a",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                💬 ตรวจ/ใส่ "..."
              </button>

              <button
                onClick={handleGeminiProofread}
                disabled={isAiProcessing}
                style={{
                  background: isAiProcessing ? "#d0c3a5" : "#1a202a",
                  border: "1px solid #c9a15a",
                  color: "#c9a15a",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: isAiProcessing ? "wait" : "pointer",
                  fontWeight: 600
                }}
              >
                {isAiProcessing ? `⏳ (${progress}%)` : `🤖 AI ตรวจสลับคีย์ (${keyCount})`}
              </button>

              <button
                onClick={handleCheckPronouns}
                disabled={isAiProcessing}
                style={{
                  background: "#efe6d3",
                  border: "1px solid #cabb98",
                  color: "#4a3f2a",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                👥 ตรวจสรรพนาม
              </button>

              <button
                onClick={handleCopyContent}
                style={{
                  background: copied ? "#d4edda" : "#efe6d3",
                  border: "1px solid " + (copied ? "#c3e6cb" : "#cabb98"),
                  color: copied ? "#155724" : "#4a3f2a",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.2s"
                }}
              >
                {copied ? "✓ คัดลอกแล้ว!" : "📋 คัดลอกเนื้อหา"}
              </button>

              <button
                onClick={handleAutoIndent}
                style={{
                  background: "#efe6d3",
                  border: "1px solid #cabb98",
                  color: "#4a3f2a",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                ✨ จัดย่อหน้าทั้งหมด
              </button>
            </div>
          </div>

          {/* 🟢 แถบ Progress Bar แสดงเปอร์เซ็นต์ความคืบหน้า */}
          {isAiProcessing && (
            <div style={{ marginBottom: 12, background: "#efe6d3", borderRadius: 8, padding: 8, border: "1px solid #ddd0b3" }}>
              <div style={{ fontSize: 12, color: "#4a3f2a", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                <span>{typoNotice}</span>
                <span style={{ fontWeight: 700 }}>{progress}%</span>
              </div>
              <div style={{ width: "100%", height: 8, background: "#d0c3a5", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "#c9a15a",
                    transition: "width 0.3s ease"
                  }}
                />
              </div>
            </div>
          )}

          {!isAiProcessing && typoNotice && (
            <div style={{ background: "#e2f0d9", border: "1px solid #b2d8a0", color: "#2e5b1e", padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
              {typoNotice}
            </div>
          )}

          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="เริ่มเขียนตอนนี้..."
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              resize: "none",
              fontSize: fontSize,
              lineHeight: 1.75,
              letterSpacing: "0.2px",
              color: "#2a2318",
              minHeight: "60vh",
            }}
          />

          <div style={{ marginTop: 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8a7c5e", borderTop: "1px dashed #cabb98", paddingTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>📝 {wordCount(content)} คำ</span>
            <span>•</span>
            <span>🔤 {charCountTotal} ตัวอักษร</span>
            <span>•</span>
            <span>(ไม่รวมเว้นวรรค: {charCountNoSpaces})</span>
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

      {/* Modal Popup ตรวจสอบสรรพนามข้ามยุค */}
      {showPronounModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#f4ede0", borderRadius: 12, width: "100%", maxWidth: 500, padding: 20, border: "1px solid #cabb98", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <h3 style={{ margin: "0 0 10px 0", color: "#221d14", fontSize: 18 }}>👥 ตรวจพบคำสรรพนามยุคปัจจุบัน</h3>
            <p style={{ fontSize: 13, color: "#6a5c40", margin: "0 0 14px 0" }}>
              ตรวจสอบพบคำสรรพนามที่อาจไม่เข้ากับบริบทนิยายโบราณ/พีเรียด คุณสามารถพิมพ์คำที่ต้องการเปลี่ยนแทนที่ลงในช่องขวาได้เลยครับ:
            </p>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {pronounResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "#6a5c40" }}>ยอดเยี่ยม! ไม่พบคำสรรพนามยุคปัจจุบันในตอนนี้</div>
              ) : (
                pronounResults.map((item, idx) => (
                  <div key={idx} style={{ background: "#efe6d3", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd0b3", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: "#a85a5a", fontSize: 14 }}>"{item.word}" <span style={{ fontSize: 11, color: "#8a7c5e", fontWeight: 4 }}>(พบ {item.count} ครั้ง)</span></div>
                      <div style={{ fontSize: 11, color: "#6a5c40" }}>คำแนะนำ: {item.suggestion}</div>
                    </div>
                    <div style={{ width: 120 }}>
                      <input
                        type="text"
                        placeholder="เปลี่ยนเป็น..."
                        value={replacementMap[item.word] || ""}
                        onChange={(e) => setReplacementMap({ ...replacementMap, [item.word]: e.target.value })}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #cabb98", background: "#fff", fontSize: 12 }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setShowPronounModal(false)}
                style={{ background: "#d0c3a5", border: "none", color: "#221d14", padding: "8px 16px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
              >
                ยกเลิก
              </button>
              {pronounResults.length > 0 && (
                <button
                  onClick={applyPronounReplacements}
                  style={{ background: "#1a202a", border: "none", color: "#c9a15a", padding: "8px 16px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
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
