import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, ArrowRight, Plus, Pencil, Image as ImageIcon, X, Trash2, Clock, BookOpen, Search, Feather, GripVertical } from "lucide-react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, writeBatch } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCyZuVUuCeZ-5Fajn4P0WTWdCI2ceHG4pI",
  authDomain: "my-novel-notebook.firebaseapp.com",
  projectId: "my-novel-notebook",
  storageBucket: "my-novel-notebook.firebasestorage.app",
  messagingSenderId: "245609229910",
  appId: "1:245609229910:web:39871f779e1b9a56b215f7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ============================== Helpers ==============================

function escapeRegExp(string) {
  return String(string ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ตัดอักษรต้องห้ามของชื่อไฟล์ออก (Windows: \ / : * ? " < > |)
function sanitizeFilename(name) {
  return String(name || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "") // Windows ไม่ชอบจุด/ช่องว่างท้ายชื่อไฟล์
    .slice(0, 80);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ============================== TXT Export ==============================

// ชื่อไฟล์ = ชื่อตอนที่ผู้ใช้บันทึกไว้เท่านั้น (ไม่แทรกเลขตอนของระบบ)
function chapterFileName(ch) {
  return sanitizeFilename(ch?.title?.trim()) || `ตอนที่-${ch?.order ?? "?"}`;
}

// หัวไฟล์ = ชื่อตอนอย่างเดียว — ไม่ใส่ "ตอนที่ N —" กันเลขซ้ำ/ไม่ตรงกับที่บันทึกไว้
function chapterToTxt(ch) {
  const t = ch?.title?.trim();
  const body = ch?.content || "";
  return t ? `${t}\n\n${body}` : body;
}

// 📤 เลือก 1 ตอน → ดาวน์โหลด .txt เดี่ยว
function exportSingleChapter(chapter) {
  downloadBlob(
    new Blob(["\uFEFF" + chapterToTxt(chapter)], { type: "text/plain;charset=utf-8" }),
    `${chapterFileName(chapter)}.txt`
  );
}

// 📦 เลือกหลายตอน → zip เดียว ข้างในเป็น .txt รายตอน (ชื่อซ้ำจะเติม (2), (3) ให้เอง)
function exportChaptersAsZip(novelTitle, chapters) {
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
  downloadBlob(makeZip(files), `${sanitizeFilename(novelTitle) || "นิยาย"}.zip`);
}

// ================== ZIP Writer (ไม่ต้องพึ่ง library) ==================
// สร้างไฟล์ .zip แบบ store (ไม่บีบอัด) ถูกต้องตามสเปค เปิดได้ทุกโปรแกรม

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | (Math.floor(d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

// files = [{ name: "xxx.txt", text: "..." }] → Blob แบบ ZIP
function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = enc.encode("\uFEFF" + f.text); // BOM กันภาษาไทยเพี้ยนบน Notepad
    const crc = crc32(dataBytes);

    // Local File Header (method 0 = store)
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);       // version needed
    lh.setUint16(6, 0x0800, true);   // flag bit 11: ชื่อไฟล์เป็น UTF-8 (จำเป็นมากสำหรับชื่อตอนภาษาไทย!)
    lh.setUint16(8, 0, true);        // compression: store
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, dataBytes.length, true);
    lh.setUint32(22, dataBytes.length, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    chunks.push(lh.buffer, nameBytes, dataBytes);

    central.push({ nameBytes, crc, size: dataBytes.length, offset });
    offset += 30 + nameBytes.length + dataBytes.length;
  }

  // Central Directory
  const cdStart = offset;
  for (const e of central) {
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);   // UTF-8 flag ตรงนี้ด้วย
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, e.crc, true);
    cd.setUint32(20, e.size, true);
    cd.setUint32(24, e.size, true);
    cd.setUint16(28, e.nameBytes.length, true);
    cd.setUint32(42, e.offset, true);
    chunks.push(cd.buffer, e.nameBytes);
    offset += 46 + e.nameBytes.length;
  }

  // End of Central Directory
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, central.length, true);
  eocd.setUint16(10, central.length, true);
  eocd.setUint32(12, offset - cdStart, true);
  eocd.setUint32(16, cdStart, true);
  chunks.push(eocd.buffer);

  return new Blob(chunks, { type: "application/zip" });
}

// ============================== Utilities ==============================

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function compressImage(base64Str, maxWidth = 300, quality = 0.7) {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith("data:image")) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      // วางพื้นขาวก่อน กัน PNG โปร่งใสกลายเป็นดำตอน encode เป็น JPEG
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(base64Str);
  });
}

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

function countThaiWords(text) {
  const t = (text || "").trim();
  if (!t) return 0;

  // ใช้ Intl.Segmenter เพื่อแยกคำภาษาไทยตามคำจริง
  // fallback เป็นการนับกลุ่มอักขระ/ช่องว่าง หาก browser รุ่นเก่าไม่รองรับ
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

function countGraphemes(text) {
  const t = text || "";
  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
      return Array.from(segmenter.segment(t)).length;
    }
  } catch (e) {}
  return Array.from(t).length;
}

function countCharacters(text, { includeSpaces = true } = {}) {
  const t = text || "";
  return countGraphemes(includeSpaces ? t : t.replace(/\s/g, ""));
}

// ใช้ตัวนับเดียวกันทั้งแอป เพื่อให้ค่าที่แสดงตรงกัน
function wordCount(text) {
  return countThaiWords(text);
}

function novelUpdatedAt(novel) {
  if (!novel.chapters || !novel.chapters.length) return novel.createdAt;
  return Math.max(novel.createdAt || 0, ...novel.chapters.map((c) => c.updatedAt));
}

// ตัด chapters ออกก่อนขึ้น doc หลักเสมอ (ตอนอยู่ใน subcollection เท่านั้น)
function stripChapters(novel) {
  const { chapters, ...meta } = novel;
  return meta;
}

// ตัด cover (base64 image) ออกก่อนขึ้น Firestore — Firestore มี doc limit 1MB
// cover จะเก็บเฉพาะใน localStorage เท่านั้น เพื่อไม่ให้ document ใหญ่เกินไป
function stripCoverForCloud(novel) {
  const { cover, ...rest } = novel;
  return rest;
}

// ตัดทั้ง chapters และ cover ออกสำหรับการ sync ขึ้น cloud
// ต้องตั้ง cover: null เพื่อลบ cover เดิมที่ Firestore มีอยู่แล้ว (ไม่งั้น field เดิมจะยังอยู่)
function stripForCloud(novel) {
  const { chapters, cover, ...meta } = novel;
  return { ...meta, cover: null };
}

// ============================== Data ==============================

const seedNovels = [
  {
    id: "n1",
    title: "เปลี่ยนโลก",
    synopsis: "เรื่องราวของหญิงสาวผู้ต้องเลือกระหว่างความจริงกับคนที่เธอรัก เมื่อแผนที่โบราณเปิดประตูสู่ความลับที่ครอบครัวของเธอฝังไว้",
    cover: null,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    chapters: [
      { id: "c1", order: 1, title: "จุดเริ่มต้น", content: "แสงแดดยามเช้าสาดผ่านหน้าต่างบานเก่า อารดายืนนิ่งอยู่หน้าประตูบ้านที่ไม่ได้กลับมาเยือนนานถึงสิบปี...", updatedAt: Date.now() - 1000 * 60 * 60 * 20 },
      { id: "c2", order: 2, title: "ความลับ", content: "", updatedAt: Date.now() - 1000 * 60 * 60 * 10 },
    ],
  },
];

const STORAGE_KEY = "novel-writer-app-data";

// เขียน chapter ขึ้นคลาวด์ (ตัด field ที่ไม่จำเป็นออก)
function stripChapter(ch) {
  return { id: ch.id, order: ch.order, title: ch.title, content: ch.content, updatedAt: ch.updatedAt };
}

// เขียนขึ้นคลาวด์เป็นชุด (batch ละไม่เกิน 100 ops เพื่อไม่เกิน 5MB limit)
async function pushAllToCloud(uid, novelList) {
  const ops = [];
  for (const n of novelList) {
    ops.push({ ref: doc(db, "users", uid, "novels", n.id), data: stripForCloud(n) });
    for (const ch of n.chapters || []) {
      ops.push({ ref: doc(db, "users", uid, "novels", n.id, "chapters", ch.id), data: stripChapter(ch) });
    }
  }
  for (let i = 0; i < ops.length; i += 100) {
    const batch = writeBatch(db);
    ops.slice(i, i + 100).forEach((op) => batch.set(op.ref, op.data));
    await batch.commit();
  }
}

// ย้ายข้อมูลจาก UID เก่า (Anonymous) มาใส่ UID ใหม่ (Google)
async function migrateFromOldAccount(oldUid, newUid, onProgress) {
  const novelsRef = collection(db, "users", oldUid, "novels");
  const novelsSnap = await getDocs(novelsRef);
  
  if (novelsSnap.empty) {
    throw new Error("ไม่พบข้อมูลในบัญชีเก่า (UID: " + oldUid + ")");
  }
  
  let totalDocs = 0;
  let migratedDocs = 0;
  const allOps = [];
  
  // อ่าน novel ทั้งหมด + chapters
  for (const novelDoc of novelsSnap.docs) {
    const novelData = { id: novelDoc.id, ...novelDoc.data() };
    allOps.push({ ref: doc(db, "users", newUid, "novels", novelDoc.id), data: { ...novelData, cover: null } });
    totalDocs++;
    
    // อ่าน chapters ของ novel นี้
    const chaptersRef = collection(db, "users", oldUid, "novels", novelDoc.id, "chapters");
    const chaptersSnap = await getDocs(chaptersRef);
    for (const chDoc of chaptersSnap.docs) {
      allOps.push({ ref: doc(db, "users", newUid, "novels", novelDoc.id, "chapters", chDoc.id), data: chDoc.data() });
      totalDocs++;
    }
  }
  
  // เขียนทั้งหมดลง UID ใหม่
  for (let i = 0; i < allOps.length; i += 400) {
    const batch = writeBatch(db);
    allOps.slice(i, i + 400).forEach((op) => batch.set(op.ref, op.data));
    await batch.commit();
    migratedDocs += allOps.slice(i, i + 400).length;
    if (onProgress) onProgress(migratedDocs, totalDocs);
  }
  
  return { novelsCount: novelsSnap.docs.length, docsCount: totalDocs };
}

// สแกนหา UID ที่มีข้อมูลนิยายใน Firestore
async function scanUsersWithData() {
  const usersRef = collection(db, "users");
  const usersSnap = await getDocs(usersRef);
  const results = [];
  
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const novelsRef = collection(db, "users", uid, "novels");
    const novelsSnap = await getDocs(novelsRef);
    if (!novelsSnap.empty) {
      // ดึงชื่อนิยายเรื่องแรกเป็นตัวอย่าง
      const firstNovel = novelsSnap.docs[0]?.data();
      results.push({
        uid,
        novelsCount: novelsSnap.docs.length,
        firstTitle: firstNovel?.title || "(ไม่มีชื่อ)",
      });
    }
  }
  return results;
}

// ============================== Main Component ==============================

export default function NovelLibraryApp() {
  const [novels, setNovels] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [userId, setUserId] = useState(null);
  const [localOnly, setLocalOnly] = useState(false);   // เชื่อมคลาวด์ไม่ได้ → เซฟเครื่องเดียว
  const [unsynced, setUnsynced] = useState(false);     // มีแก้ไขที่ขึ้นคลาวด์ไม่สำเร็จ
  const [currentId, setCurrentId] = useState(null);
  const [query, setQuery] = useState("");
  const [editingNovelInfo, setEditingNovelInfo] = useState(null);
  const [openChapter, setOpenChapter] = useState(null);
  const [isNewChapter, setIsNewChapter] = useState(false);
  const [showLogin, setShowLogin] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showMigrate, setShowMigrate] = useState(false);
  const [migrateOldUid, setMigrateOldUid] = useState("");
  const [migrateStatus, setMigrateStatus] = useState(null); // null | 'loading' | 'done' | 'error'
  const [migrateResult, setMigrateResult] = useState(null);
  const [scanStatus, setScanStatus] = useState(null); // null | 'loading' | 'done' | 'error'
  const [scanResults, setScanResults] = useState(null);
  const fileInputRef = useRef(null);

  // ========== Theme (Dark/Light) ==========
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("novel-writer-theme");
      if (saved === "dark" || saved === "light") return saved;
    } catch (e) {}
    return "dark";
  });
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("novel-writer-theme", theme); } catch (e) {}
  }, [theme]);

  // ========== Drag & Drop Reorder ==========
  const reorderChapters = async (updatedChapters) => {
    setNovels((prev) => prev.map((n) => n.id === currentId ? { ...n, chapters: updatedChapters } : n));
    if (userId && currentId) {
      try {
        for (const ch of updatedChapters) {
          await setDoc(doc(db, "users", userId, "novels", currentId, "chapters", ch.id), stripChapter(ch));
        }
      } catch (e) { console.error("Reorder sync failed:", e); markSyncFailed(); }
    }
  };

  // mirror ล่าสุดของ novels สำหรับอ่านค่า merged ตอน sync (ไม่ทำ side-effect ใน setState)
  const novelsRef = useRef([]);
  useEffect(() => { novelsRef.current = novels; }, [novels]);

  const markSyncFailed = () => setUnsynced(true);

  // ---------- Auth + โหลดข้อมูล ----------
  useEffect(() => {
    let cancelled = false;

    const loadLocalFallback = () => {
      let initial = null;
      try {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length) initial = parsed;
        }
      } catch (e) {}
      setNovels(initial || seedNovels);
    };

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || cancelled) return;
      setUserId(user.uid);
      setUserEmail(user.email || null);
      setLocalOnly(false);
      setShowLogin(false); // มี session อยู่แล้ว → ข้ามหน้าล็อกอิน
      try {
        const snap = await getDocs(collection(db, "users", user.uid, "novels"));
        const loaded = [];
        for (const nSnap of snap.docs) {
          const meta = nSnap.data();
          const chSnap = await getDocs(collection(db, "users", user.uid, "novels", nSnap.id, "chapters"));
          const chapters = chSnap.docs
            .map((d) => d.data())
            .sort((a, b) => (a.order || 0) - (b.order || 0));
          loaded.push({ ...meta, id: nSnap.id, chapters });
        }

        if (loaded.length > 0) {
          setNovels(loaded);
        } else {
          // คลังฝั่งผู้ใช้ยังว่าง → ย้ายข้อมูลจาก localStorage เครื่องนี้ขึ้นคลาวด์ส่วนตัว
          // (ทำงานครั้งเดียวตอนเปิดแอปครั้งแรกหลังอัปเดต ถ้าไม่มีก็ seed ใหม่)
          let initial = null;
          try {
            const local = localStorage.getItem(STORAGE_KEY);
            if (local) {
              const parsed = JSON.parse(local);
              if (Array.isArray(parsed) && parsed.length) initial = parsed;
            }
          } catch (e) {}
          if (!initial) initial = seedNovels;
          setNovels(initial);
          await pushAllToCloud(user.uid, initial);
        }
      } catch (e) {
        console.error("โหลดข้อมูลจาก Firebase ล้มเหลว", e);
        setLocalOnly(true);
        loadLocalFallback();
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    });

    // ถ้า onAuthStateChanged ไม่ทำงานเลย (ไม่มี session)
    // → แสดงหน้าล็อกอินหลัง 2 วินาที
    const loginTimeout = setTimeout(() => {
      if (!cancelled && !auth.currentUser) {
        setIsLoaded(true);
      }
    }, 2000);

    return () => { cancelled = true; clearTimeout(loginTimeout); unsub(); };
  }, []);

  // ---------- Mirror ลง localStorage กันข้อมูลหาย ----------
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(novels));
      } catch (e) {}
    }
  }, [novels, isLoaded]);

  const forceSaveToCloud = async () => {
    if (!userId) {
      setTimeout(() => {
        alert("📴 ยังเชื่อมต่อคลาวด์ไม่ได้ — ข้อมูลถูกบันทึกในเครื่องนี้แล้ว");
      }, 50);
      return;
    }
    try {
      await pushAllToCloud(userId, novels);
      setUnsynced(false);
      setTimeout(() => {
        alert("✅ บันทึกขึ้นคลาวด์สำเร็จ!");
      }, 50);
    } catch (e) {
      console.error("Cloud save failed:", e);
      setUnsynced(true);
      setTimeout(() => {
        alert(`❌ บันทึกไม่สำเร็จ: ${e?.message || "เกิดข้อผิดพลาดในการบันทึก"}`);
      }, 50);
    }
  };

  // ========== Google Sign-In ==========
  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setShowLogin(false);
    } catch (err) {
      console.error("Google sign-in failed:", err);
      alert("เข้าสู่ระบบไม่สำเร็จ: " + err.message);
    }
  };

  const handleAnonymousSignIn = async () => {
    try {
      await signInAnonymously(auth);
      setShowLogin(false);
    } catch (err) {
      console.error("Anonymous sign-in failed:", err);
      alert("เข้าสู่ระบบไม่สำเร็จ: " + err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUserId(null);
      setUserEmail(null);
      setNovels(seedNovels);
      setShowLogin(true);
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  const handleMigrate = async () => {
    if (!migrateOldUid.trim()) {
      alert("กรุณาเลือก UID ที่ต้องการย้ายก่อน");
      return;
    }
    if (!userId) {
      alert("กรุณาล็อกอินด้วย Google ก่อน แล้วค่อยกดย้ายข้อมูล");
      return;
    }
    setMigrateStatus("loading");
    try {
      const result = await migrateFromOldAccount(migrateOldUid.trim(), userId, (done, total) => {
        setMigrateResult({ done, total });
      });
      setMigrateStatus("done");
      setMigrateResult(result);
    } catch (err) {
      console.error("Migration failed:", err);
      setMigrateStatus("error");
      setMigrateResult({ error: err.message });
    }
  };

  const handleScan = async () => {
    setScanStatus("loading");
    try {
      const results = await scanUsersWithData();
      setScanResults(results);
      setScanStatus("done");
    } catch (err) {
      console.error("Scan failed:", err);
      setScanStatus("error");
      setScanResults(null);
    }
  };

  const current = novels.find((n) => n.id === currentId) || null;

  const filteredNovels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...novels]
      .filter((n) => !q || (n.title && n.title.toLowerCase().includes(q)))
      .sort((a, b) => novelUpdatedAt(b) - novelUpdatedAt(a));
  }, [novels, query]);

  async function updateNovel(id, patch) {
    let processedPatch = { ...patch };
    if (processedPatch.cover) {
      processedPatch.cover = await compressImage(processedPatch.cover);
    }

    // คำนวณ merged doc จาก snapshot ล่าสุด แล้วค่อยอัปเดต state
    const target = novelsRef.current.find((n) => n.id === id);
    const merged = target ? { ...target, ...processedPatch } : null;

    setNovels((prev) => prev.map((n) => (n.id === id ? { ...n, ...processedPatch } : n)));

    if (merged && userId) {
      try {
        await setDoc(doc(db, "users", userId, "novels", id), stripForCloud(merged));
      } catch (err) {
        console.error("Sync error:", err);
        markSyncFailed();
      }
    }
  }

  async function saveNovelInfo(data) {
    let processedData = { ...data };
    if (processedData.cover) {
      processedData.cover = await compressImage(processedData.cover);
    }
    processedData.title = processedData.title?.trim() || "ยังไม่มีชื่อเรื่อง";

    if (editingNovelInfo === "new") {
      const id = `n-${Date.now()}`;
      const newNovel = { id, createdAt: Date.now(), chapters: [], ...processedData };
      setNovels((prev) => [...prev, newNovel]);
      setCurrentId(id);
      if (userId) {
        try {
          // ขึ้น doc หลักเฉพาะ meta — ไม่ส่ง chapters: [] ขึ้นไป
          await setDoc(doc(db, "users", userId, "novels", id), stripForCloud(newNovel));
        } catch (e) {
          console.error(e);
          markSyncFailed();
        }
      }
    } else {
      await updateNovel(editingNovelInfo.id, processedData);
    }
    setEditingNovelInfo(null);
  }

  async function deleteNovel(id) {
    if (!window.confirm("ลบนิยายเรื่องนี้พร้อมทุกตอนอย่างถาวร? ย้อนกลับไม่ได้")) return;

    setNovels((prev) => prev.filter((n) => n.id !== id));
    setEditingNovelInfo(null);
    if (currentId === id) setCurrentId(null);

    if (!userId) return;
    try {
      // Firestore ไม่มี cascade delete → ลบตอนใน subcollection ก่อนแล้วค่อยลบเรื่อง
      const chSnap = await getDocs(collection(db, "users", userId, "novels", id, "chapters"));
      const refs = [...chSnap.docs.map((d) => d.ref), doc(db, "users", userId, "novels", id)];
      for (let i = 0; i < refs.length; i += 400) {
        const batch = writeBatch(db);
        refs.slice(i, i + 400).forEach((r) => batch.delete(r));
        await batch.commit();
      }
    } catch (e) {
      console.error(e);
      markSyncFailed();
    }
  }

  function addChapter() {
    if (!current) return;
    const chapters = current.chapters || [];
    const nextOrder = chapters.length ? Math.max(...chapters.map((c) => c.order)) + 1 : 1;
    setOpenChapter({ id: null, order: nextOrder, title: "", content: "", updatedAt: Date.now() });
    setIsNewChapter(true);
  }

  async function importTxtFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !current) return;
    const chapters = current.chapters || [];
    let nextOrder = chapters.length ? Math.max(...chapters.map((c) => c.order)) + 1 : 1;
    const newChapters = [];
    for (const file of files) {
      const content = await file.text();
      const title = file.name.replace(/\.txt$/i, "");
      const ch = { id: `c-${Date.now()}-${nextOrder}`, order: nextOrder, title, content, updatedAt: Date.now() };
      newChapters.push(ch);
      await persistChapterDoc(current.id, ch);
      nextOrder++;
    }
    setNovels((prev) =>
      prev.map((n) => n.id === current.id ? { ...n, chapters: [...(n.chapters || []), ...newChapters] } : n)
    );
    e.target.value = ""; // reset input
  }

  async function persistChapterDoc(novelId, chapter) {
    if (userId) {
      await setDoc(doc(db, "users", userId, "novels", novelId, "chapters", chapter.id), stripChapter(chapter));
    }
  }

  // return true = สำเร็จ, false = ล้มเหลว (editor จะไม่ปิด ข้อความยังอยู่ครบ)
  async function saveChapter(ch) {
    if (!current) return false;
    const chapter = { ...ch, id: isNewChapter ? `c-${Date.now()}` : ch.id, updatedAt: Date.now() };
    try {
      await persistChapterDoc(current.id, chapter);
      setNovels((prev) =>
        prev.map((n) => {
          if (n.id !== current.id) return n;
          const chapters = n.chapters || [];
          const exists = chapters.some((c) => c.id === chapter.id);
          return { ...n, chapters: exists ? chapters.map((c) => (c.id === chapter.id ? chapter : c)) : [...chapters, chapter] };
        })
      );
      setOpenChapter(null);
      setIsNewChapter(false);
      return true;
    } catch (e) {
      console.error("Chapter save failed:", e);
      markSyncFailed();
      alert(`❌ บันทึกตอนไม่สำเร็จ: ${e?.message || "เกิดข้อผิดพลาด"}\n(ข้อความยังอยู่ในหน้าเขียน ไม่ได้หายไป)`);
      return false;
    }
  }

  async function saveChapterAndNext(ch) {
    if (!current) return false;
    const chapter = { ...ch, id: isNewChapter ? `c-${Date.now()}` : ch.id, updatedAt: Date.now() };
    try {
      await persistChapterDoc(current.id, chapter);

      const chapters = current.chapters || [];
      const exists = chapters.some((c) => c.id === chapter.id);
      const nextChapters = exists
        ? chapters.map((c) => (c.id === chapter.id ? chapter : c))
        : [...chapters, chapter];

      setNovels((prev) =>
        prev.map((n) => {
          if (n.id !== current.id) return n;
          const cs = n.chapters || [];
          const ex = cs.some((c) => c.id === chapter.id);
          return { ...n, chapters: ex ? cs.map((c) => (c.id === chapter.id ? chapter : c)) : [...cs, chapter] };
        })
      );

      const nextOrder = Math.max(0, ...nextChapters.map((c) => c.order || 0)) + 1;
      setOpenChapter({ id: null, order: nextOrder, title: "", content: "", updatedAt: Date.now() });
      setIsNewChapter(true);
      return true;
    } catch (e) {
      console.error("Chapter save failed:", e);
      markSyncFailed();
      alert(`❌ บันทึกตอนไม่สำเร็จ: ${e?.message || "เกิดข้อผิดพลาด"}\n(ข้อความยังอยู่ในหน้าเขียน ไม่ได้หายไป)`);
      return false;
    }
  }

  async function deleteChapter(id) {
    if (!current) return;
    const ch = (current.chapters || []).find((c) => c.id === id);
    const label = ch?.title?.trim() ? `"${ch.title.trim()}"` : `ตอนที่ ${ch?.order ?? ""}`;
    if (!window.confirm(`ลบ${label}ถาวร? ย้อนกลับไม่ได้`)) return;

    setNovels((prev) =>
      prev.map((n) => (n.id === current.id ? { ...n, chapters: (n.chapters || []).filter((c) => c.id !== id) } : n))
    );
    setOpenChapter(null);

    if (!userId) return;
    try {
      await deleteDoc(doc(db, "users", userId, "novels", current.id, "chapters", id));
    } catch (e) {
      console.error("Chapter delete failed:", e);
      markSyncFailed();
    }
  }

  if (!isLoaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#12161d", color: "#c9a15a", fontFamily: "'Sarabun', sans-serif" }}>
        <h3>กำลังเชื่อมต่อคลาวด์... ☁️</h3>
      </div>
    );
  }

  // แสดงหน้าล็อกอินเมื่อ user ยังไม่ได้เลือกวิธีเข้าสู่ระบบ
  // (showLogin = true เสมอตอนเปิดแอป, จะเป็น false ก็ต่อเมื่อกดล็อกอินแล้ว)
  if (showLogin) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#12161d", color: "#e8e3d8", fontFamily: "'Sarabun', sans-serif", padding: 20 }}>
        <Feather size={40} color="#c9a15a" style={{ marginBottom: 20 }} />
        <h1 style={{ fontFamily: "'Noto Serif Thai', serif", fontWeight: 700, fontSize: 24, marginBottom: 8, color: "#c9a15a" }}>หิ้งนิยายของฉัน</h1>
        <p style={{ fontSize: 14, color: "#8b93a3", marginBottom: 30, textAlign: "center" }}>เข้าสู่ระบบเพื่อบันทึกข้อมูลขึ้นคลาวด์
ข้อมูลจะไม่หายเมื่อเปลี่ยนเครื่อง</p>
        <button
          onClick={handleGoogleSignIn}
          style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "none", borderRadius: 10, padding: "14px 28px", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "#333", marginBottom: 14, width: "100%", maxWidth: 320, justifyContent: "center" }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
          เข้าสู่ระบบด้วย Google
        </button>
        <button
          onClick={handleAnonymousSignIn}
          style={{ background: "transparent", border: "1px solid #3a4150", borderRadius: 10, padding: "12px 28px", cursor: "pointer", fontSize: 14, color: "#8b93a3", width: "100%", maxWidth: 320 }}
        >
          เข้าใช้งานโดยไม่ล็อกอิน
        </button>
        <p style={{ fontSize: 11, color: "#5c6372", marginTop: 16, textAlign: "center", maxWidth: 320 }}>
          ⚠️ ถ้าไม่ล็อกอิน ข้อมูลจะเก็บเฉพาะในเครื่องนี้
          เคลียร์ cache แล้วข้อมูลจะหาย
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif", background: theme === 'dark' ? '#12161d' : '#f8f6f1', minHeight: '100vh', color: theme === 'dark' ? '#e8e3d8' : '#2a2318' }}>
      {/* แนะนำ: ย้ายการโหลดฟอนต์ไปเป็น <link> ใน index.html จะเร็วกว่า @import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Thai:wght@500;600;700&family=Sarabun:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${theme === 'dark' ? '#3a4150' : '#c0b8a8'}; border-radius: 4px; }
        textarea, input { font-family: 'Sarabun', sans-serif; }
      `}</style>

      {!current ? (
        <LibraryView
          novels={filteredNovels}
          query={query}
          setQuery={setQuery}
          onOpen={(id) => setCurrentId(id)}
          onCreate={() => setEditingNovelInfo("new")}
          theme={theme}
          onToggleTheme={toggleTheme}
          userEmail={userEmail}
          userId={userId}
          onSignOut={handleSignOut}
          onOpenSettings={() => setShowUserSettings(true)}
        />
      ) : (
        <NovelView
          novel={current}
          fileInputRef={fileInputRef}
          unsynced={unsynced}
          localOnly={localOnly}
          onBack={() => setCurrentId(null)}
          onEditInfo={() => setEditingNovelInfo(current)}
          onCoverPick={(dataUrl) => updateNovel(current.id, { cover: dataUrl })}
          onOpenChapter={(ch, isNew) => {
            setOpenChapter(ch);
            setIsNewChapter(isNew);
          }}
          onAddChapter={addChapter}
          onImportTxt={importTxtFiles}
          onForceSave={forceSaveToCloud}
          onReorderChapters={reorderChapters}
          theme={theme}
          onToggleTheme={toggleTheme}
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

      {showUserSettings && (
        <UserSettingsModal
          userEmail={userEmail}
          userId={userId}
          onSignOut={handleSignOut}
          onClose={() => setShowUserSettings(false)}
          onOpenMigrate={() => { setShowUserSettings(false); setShowMigrate(true); }}
        />
      )}
      {showMigrate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => { setShowMigrate(false); setMigrateStatus(null); setMigrateResult(null); setScanStatus(null); setScanResults(null); }}>
          <div style={{ background: "#1e2330", border: "1px solid #3a4150", borderRadius: 16, padding: 28, maxWidth: 400, width: "90%", color: "#e8e3d8", maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontFamily: "'Noto Serif Thai', serif", color: "#c9a15a" }}>📦 ย้ายข้อมูลจากบัญชีเก่า</h3>
              <button onClick={() => { setShowMigrate(false); setMigrateStatus(null); setMigrateResult(null); setScanStatus(null); setScanResults(null); }} style={{ background: "none", border: "none", color: "#8b93a3", cursor: "pointer" }}><X size={18} /></button>
            </div>
            {migrateStatus === "done" ? (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 16, color: "#4caf50", marginBottom: 8 }}>✅ ย้ายข้อมูลสำเร็จ!</p>
                <p style={{ fontSize: 13, color: "#8b93a3" }}>ย้ายนิยาย {migrateResult?.novelsCount || 0} เรื่อง 共 {migrateResult?.docsCount || 0} เอกสาร</p>
                <button onClick={() => { setShowMigrate(false); setMigrateStatus(null); setMigrateResult(null); setScanStatus(null); setScanResults(null); window.location.reload(); }} style={{ marginTop: 16, background: "#c9a15a", color: "#12161d", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontWeight: 600 }}>รีเฟรชหน้า</button>
              </div>
            ) : migrateStatus === "error" ? (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 16, color: "#ef5350", marginBottom: 8 }}>❌ ย้ายข้อมูลไม่สำเร็จ</p>
                <p style={{ fontSize: 13, color: "#8b93a3" }}>{migrateResult?.error || "ไม่พบข้อมูลในบัญชีเก่า"}</p>
                <button onClick={() => { setMigrateStatus(null); setMigrateResult(null); }} style={{ marginTop: 16, background: "#3a4150", color: "#e8e3d8", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer" }}>ลองใหม่</button>
              </div>
            ) : migrateStatus === "loading" ? (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 14, color: "#c9a15a" }}>กำลังย้ายข้อมูล... ☁️</p>
                {migrateResult && <p style={{ fontSize: 12, color: "#8b93a3" }}>{migrateResult.done}/{migrateResult.total} เอกสาร</p>}
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "#8b93a3", marginBottom: 12 }}>สแกนหาบัญชีที่มีข้อมูล แล้วเลือกย้ายมาใส่บัญชี Google ปัจจุบัน</p>
                {scanStatus === "loading" && (
                  <p style={{ fontSize: 14, color: "#c9a15a", textAlign: "center" }}>🔍 กำลังสแกน...</p>
                )}
                {scanStatus === "done" && scanResults && (
                  <div style={{ marginBottom: 16 }}>
                    {scanResults.length === 0 ? (
                      <p style={{ fontSize: 13, color: "#8b93a3", textAlign: "center" }}>ไม่พบข้อมูลนิยายใน Firestore</p>
                    ) : (
                      <>
                        <p style={{ fontSize: 12, color: "#4caf50", marginBottom: 8 }}>พบ {scanResults.length} บัญชีที่มีข้อมูล:</p>
                        {scanResults.map((r) => (
                          <div key={r.uid} onClick={() => setMigrateOldUid(r.uid)} style={{ background: migrateOldUid === r.uid ? "#2a3040" : "#12161d", border: migrateOldUid === r.uid ? "1px solid #c9a15a" : "1px solid #3a4150", borderRadius: 8, padding: "10px 12px", marginBottom: 8, cursor: "pointer" }}>
                            <div style={{ fontSize: 12, color: "#8b93a3", fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-all" }}>{r.uid}</div>
                            <div style={{ fontSize: 13, color: "#e8e3d8", marginTop: 4 }}>{r.novelsCount} เรื่อง — "{r.firstTitle}"</div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {scanStatus === "error" && (
                  <p style={{ fontSize: 13, color: "#ef5350", marginBottom: 12 }}>❌ สแกนไม่สำเร็จ กรุณาลองใหม่</p>
                )}
                <input
                  value={migrateOldUid}
                  onChange={(e) => setMigrateOldUid(e.target.value)}
                  placeholder="UID จะถูกเลือกอัตโนมัติเมื่อกดสแกน..."
                  style={{ width: "100%", background: "#12161d", border: "1px solid #3a4150", borderRadius: 8, padding: "10px 12px", color: "#e8e3d8", fontSize: 14, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleScan} style={{ flex: 1, background: "#3a4150", color: "#e8e3d8", border: "none", borderRadius: 8, padding: "12px", cursor: "pointer", fontSize: 14 }}>
                    🔍 สแกนหา UID
                  </button>
                  <button onClick={handleMigrate} disabled={!migrateOldUid.trim()} style={{ flex: 1, background: migrateOldUid.trim() ? "#c9a15a" : "#3a4150", color: migrateOldUid.trim() ? "#12161d" : "#8b93a3", border: "none", borderRadius: 8, padding: "12px", cursor: migrateOldUid.trim() ? "pointer" : "not-allowed", fontWeight: 600, fontSize: 14 }}>
                    📦 ย้ายข้อมูล
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================== Library View ==============================

function LibraryView({ novels, query, setQuery, onOpen, onCreate, theme, onToggleTheme, userEmail, userId, onSignOut, onOpenSettings }) {
  return (
    <div>
      <header style={{ padding: "28px 20px 16px", borderBottom: "1px solid #262d3a", position: "sticky", top: 0, background: "#12161dee", backdropFilter: "blur(6px)", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Feather size={22} color="#c9a15a" />
            <h1 style={{ fontFamily: "'Noto Serif Thai', serif", fontWeight: 700, fontSize: 22, margin: 0, letterSpacing: 0.3 }}>
              หิ้งนิยายของฉัน
            </h1>
          </div>
          {userId && (
            <button
              onClick={onOpenSettings}
              title="ตั้งค่าบัญชี"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#1b212b", border: "1px solid #2a3140", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#c9a15a" }}
            >
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: userEmail ? "#c9a15a" : "#5c6372", color: "#1a140a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                {userEmail ? userEmail.charAt(0).toUpperCase() : "👤"}
              </div>
              <span style={{ fontSize: 12, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail ? userEmail.split("@")[0] : "บัญชี"}</span>
            </button>
          )}
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
                  <BookOpen size={10} /> {n.chapters ? n.chapters.length : 0} ตอน
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      <button
        onClick={onToggleTheme}
        aria-label="สลับธีม"
        style={{
          position: "fixed", bottom: 24, left: 24, width: 44, height: 44, borderRadius: "50%",
          background: "#1b212b", border: "1px solid #2a3140", color: "#c9a15a",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", fontSize: 20, zIndex: 5,
        }}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
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

// ============================== Novel View ==============================

function NovelView({ novel, fileInputRef, unsynced, localOnly, onBack, onEditInfo, onCoverPick, onOpenChapter, onAddChapter, onImportTxt, onForceSave, onReorderChapters, theme, onToggleTheme }) {
  const chapters = useMemo(() => novel.chapters || [], [novel.chapters]);
  const sorted = useMemo(() => [...chapters].sort((a, b) => (a.order || 0) - (b.order || 0)), [chapters]);
  const [savedAlert, setSavedAlert] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const dragItem = useRef(null);

  // ===== Drag & Drop handlers =====
  const handleDragStart = useCallback((e, index) => {
    dragItem.current = sorted[index];
    setDragIdx(index);
    e.dataTransfer.effectAllowed = "move";
    const ghost = e.target.cloneNode(true);
    ghost.style.opacity = "0";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);
  }, [sorted]);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(index);
  }, []);

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    const dragIndex = dragIdx;
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIdx(null); setDragOverIdx(null);
      return;
    }
    const reordered = [...sorted];
    const [draggedItem] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, draggedItem);
    const updated = reordered.map((ch, i) => ({ ...ch, order: i + 1 }));
    onReorderChapters(updated);
    setDragIdx(null); setDragOverIdx(null); dragItem.current = null;
  }, [dragIdx, sorted, onReorderChapters]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null); setDragOverIdx(null); dragItem.current = null;
  }, []);

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const allSelected = sorted.length > 0 && sorted.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(sorted.map((c) => c.id)));

  // เลือก 1 ตอน = ไฟล์ .txt เดี่ยว · เลือกหลายตอน = .zip ข้างในแยก .txt รายตอน
  const handleExportSelected = () => {
    const chosen = sorted.filter((c) => selected.has(c.id));
    if (!chosen.length) return;
    if (chosen.length === 1) exportSingleChapter(chosen[0]);
    else exportChaptersAsZip(novel.title, chosen);
    setSelected(new Set()); // เคลียร์การเลือกหลังส่งออก
  };

  function handleCoverPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCoverPick(reader.result);
    reader.readAsDataURL(file);
  }

  const handleManualSave = async () => {
    if (onForceSave) {
      await onForceSave();
    }
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 2000);
  };

  return (
    <div>
      <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#12161dee", backdropFilter: "blur(6px)", width: "100%" }}>
        <button
          onClick={onBack}
          aria-label="กลับไปหิ้งนิยาย"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#c9a15a", padding: "16px 18px", fontSize: 14, cursor: "pointer" }}
        >
          <ChevronLeft size={18} /> หิ้งนิยาย
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 18 }}>
          {localOnly && (
            <span title="เชื่อมต่อคลาวด์ไม่ได้ ข้อมูลถูกบันทึกในเครื่องนี้" style={{ fontSize: 11, color: "#c9a15a", background: "#1b212b", border: "1px solid #2a3140", padding: "5px 10px", borderRadius: 8 }}>
              📴 เฉพาะเครื่องนี้
            </span>
          )}
          {!localOnly && unsynced && (
            <span title="มีการแก้ไขที่ส่งขึ้นคลาวด์ไม่สำเร็จ กดบันทึกขึ้นคลาวด์เพื่อลองใหม่" style={{ fontSize: 11, color: "#e0a05a", background: "#241c12", border: "1px solid #6b4f22", padding: "5px 10px", borderRadius: 8 }}>
              ⚠️ ยังไม่ซิงค์
            </span>
          )}
          <button
            onClick={onToggleTheme}
            aria-label="สลับธีม"
            style={{ background: "none", border: "1px solid #2a3140", borderRadius: 6, padding: "6px 8px", color: "#c9a15a", cursor: "pointer", fontSize: 16 }}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            onClick={handleManualSave}
            style={{
              background: savedAlert ? "#2e5b1e" : "#1b212b",
              border: `1px solid ${savedAlert ? "#b2d8a0" : unsynced ? "#a8813f" : "#2a3140"}`,
              color: savedAlert ? "#e2f0d9" : "#c9a15a",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            {savedAlert ? "✓ บันทึกบนคลาวด์" : "☁️ บันทึกขึ้นคลาวด์"}
          </button>
        </div>
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
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="เปลี่ยนภาพปก"
            style={{
              width: 104, height: 148, borderRadius: 8, padding: 0,
              background: novel.cover ? `url(${novel.cover}) center/cover no-repeat` : "#232a36",
              border: "1px solid #333c4d", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            {!novel.cover && <ImageIcon size={24} color="#5c6372" />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCoverPick} style={{ display: "none" }} />
          <div style={{ paddingTop: 76, flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <h1 style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 21, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
                {novel.title || "ยังไม่มีชื่อเรื่อง"}
              </h1>
              <button
                onClick={onEditInfo}
                aria-label="แก้ไขข้อมูลนิยาย"
                style={{ background: "#1b212b", border: "1px solid #2a3140", borderRadius: 8, padding: 7, color: "#c9a15a", cursor: "pointer", flexShrink: 0 }}
              >
                <Pencil size={14} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "#9099a8" }}>
              <BookOpen size={12} /> {chapters.length} ตอน
            </div>
          </div>
        </div>

        <p style={{ padding: "16px 18px 0", fontSize: 13.5, lineHeight: 1.8, color: "#b7bdc9", margin: 0 }}>
          {novel.synopsis || "ยังไม่มีเรื่องย่อ — แตะไอคอนดินสอเพื่อเพิ่ม"}
        </p>
      </div>

      <div style={{ padding: "22px 18px 100px" }}>
        {/* ===== แถวเครื่องมือส่งออก .txt ===== */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", borderBottom: "1px solid #262d3a", paddingBottom: 12, marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 15, fontWeight: 600, color: "#c9a15a" }}>ตอนทั้งหมด</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#5c6372" }}>{chapters.length} รายการ</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {sorted.length > 0 && (
              <>
                <button
                  onClick={toggleAll}
                  style={{ background: "none", border: "none", color: "#7d8494", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: "4px 2px" }}
                >
                  {allSelected ? "ไม่เลือกเลย" : "เลือกทั้งหมด"}
                </button>
                <button
                  onClick={handleExportSelected}
                  disabled={selected.size === 0}
                  title={selected.size === 1 ? "ดาวน์โหลดไฟล์ .txt เดี่ยว" : "ดาวน์โหลด .zip ข้างในแยก .txt รายตอน"}
                  style={{
                    background: selected.size > 0 ? "#c9a15a" : "#1b212b",
                    border: `1px solid ${selected.size > 0 ? "#c9a15a" : "#2a3140"}`,
                    color: selected.size > 0 ? "#1a140a" : "#5c6372",
                    borderRadius: 8,
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: selected.size > 0 ? "pointer" : "not-allowed",
                    transition: "all 0.2s",
                  }}
                >
                  {selected.size === 0
                    ? "📤 ส่งออก .txt (ติ๊กเลือกตอนก่อน)"
                    : selected.size === 1
                      ? "📤 ส่งออก 1 ตอน (.txt)"
                      : `📦 ส่งออก ${selected.size} ตอน (.zip)`}
                </button>
              </>
            )}
            <button
              onClick={() => document.getElementById('import-txt-input')?.click()}
              title="นำเข้าไฟล์ .txt เป็นตอนใหม่"
              style={{
                background: "#1b212b",
                border: "1px solid #2a3140",
                color: "#8080e0",
                borderRadius: 8,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              📥 นำเข้า .txt
            </button>
          </div>
          <input
            id="import-txt-input"
            type="file"
            accept=".txt"
            multiple
            onChange={onImportTxt}
            style={{ display: "none" }}
          />
        </div>

        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#6b7180" }}>
            <p style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 15 }}>ยังไม่มีตอนไหนเลย</p>
            <p style={{ fontSize: 13 }}>แตะปุ่ม + เพื่อเริ่มเขียนตอนแรก</p>
          </div>
        ) : (
          sorted.map((ch, index) => (
            <div
              key={ch.id}
              style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #1f2530", background: dragIdx === index ? "#1b212b" : dragOverIdx === index ? "#232a36" : "transparent", transition: "background 0.15s" }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <input
                type="checkbox"
                checked={selected.has(ch.id)}
                onChange={() => toggleSelect(ch.id)}
                aria-label={`เลือก${ch.title?.trim() ? ` "${ch.title.trim()}"` : ` ตอนที่ ${ch.order}`} เพื่อส่งออก`}
                style={{ width: 18, height: 18, accentColor: "#c9a15a", margin: "0 4px 0 4px", cursor: "pointer", flexShrink: 0 }}
              />
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                title="ลากเพื่อจัดเรียง"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, cursor: "grab", color: dragIdx === index ? "#c9a15a" : "#5c6372", flexShrink: 0, borderRadius: 4, transition: "all 0.15s" }}
              >
                <GripVertical size={14} />
              </div>
              <button
                onClick={() => onOpenChapter(ch, false)}
                style={{
                  flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 14, padding: "14px 4px",
                  background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "#e8e3d8",
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1b212b", border: "1px solid #2a3140", color: "#c9a15a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, flexShrink: 0 }}>
                  {ch.order}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 15.5, fontWeight: 600 }}>
                    {ch.title && ch.title.trim() !== "" ? `ตอนที่ ${ch.order} — ${ch.title}` : `ตอนที่ ${ch.order}`}
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
            </div>
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

// ============================== User Settings Modal ==============================

function UserSettingsModal({ userEmail, userId, onSignOut, onClose, onOpenMigrate }) {
  const handleSignOut = () => {
    if (window.confirm("ออกจากระบบ? ข้อมูลจะยังอยู่ในคลาวด์ แต่ต้องล็อกอินใหม่เพื่อเข้าถึง")) {
      onSignOut();
      onClose();
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#12161dee", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
      <div style={{ width: "100%", background: "#1a202a", borderTop: "1px solid #2a3140", borderRadius: "16px 16px 0 0", padding: 20, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 16, fontWeight: 600 }}>ตั้งค่าบัญชี</span>
          <button onClick={onClose} aria-label="ปิด" style={{ background: "none", border: "none", color: "#9099a8", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {/* User Info */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: 14, background: "#12161d", borderRadius: 10, border: "1px solid #2a3140" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #c9a15a, #a8813f)", color: "#1a140a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, fontFamily: "'Noto Serif Thai', serif", flexShrink: 0 }}>
            {userEmail ? userEmail.charAt(0).toUpperCase() : "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e8e3d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userEmail || "ผู้ใช้ไม่ระบุชื่อ"}
            </div>
            <div style={{ fontSize: 11, color: "#7d8494", marginTop: 2 }}>
              {userEmail ? "ล็อกอินด้วย Google" : "ล็อกอินแบบไม่ระบุตัวตน"}
            </div>
          </div>
        </div>

        {/* Sync Status */}
        <div style={{ padding: 12, background: userEmail ? "#1a2a1a" : "#2a1a0a", borderRadius: 8, border: `1px solid ${userEmail ? "#2a4a2a" : "#4a3a1a"}`, marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: userEmail ? "#8ac08a" : "#c0a060", display: "flex", alignItems: "center", gap: 6 }}>
            {userEmail ? "✅" : "⚠️"}
            <span>{userEmail ? "ข้อมูลจะ sync ข้ามเครื่องอัตโนมัติ" : "ข้อมูลเก็บเฉพาะในเครื่องนี้"}</span>
          </div>
          {!userEmail && (
            <div style={{ fontSize: 11, color: "#a08040", marginTop: 6 }}>
              เคลียร์ cache แล้วข้อมูลจะหาย แนะนำให้ล็อกอินด้วย Google
            </div>
          )}
        </div>

        {/* Migrate Button */}
        <button
          onClick={() => { onClose(); onOpenMigrate(); }}
          style={{ width: "100%", background: "#1a1a2a", border: "1px solid #2a2a4a", color: "#8080e0", fontWeight: 600, fontSize: 14, padding: "14px", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}
        >
          📦 ย้ายข้อมูลจากบัญชีเก่า
        </button>

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          style={{ width: "100%", background: "#2a1a1a", border: "1px solid #4a2a2a", color: "#e08080", fontWeight: 600, fontSize: 14, padding: "14px", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          ออกจากระบบ
        </button>

        <p style={{ fontSize: 11, color: "#5c6372", marginTop: 12, textAlign: "center" }}>
          ข้อมูลของคุณปลอดภัยบน Firebase Cloud
        </p>
      </div>
    </div>
  );
}

// ============================== Novel Info Editor ==============================

function NovelInfoEditor({ novel, isNew, onSave, onCancel, onDelete }) {
  const [title, setTitle] = useState(novel.title === "ยังไม่มีชื่อเรื่อง" ? "" : novel.title || "");
  const [synopsis, setSynopsis] = useState(novel.synopsis || "");
  const [cover, setCover] = useState(novel.cover || null);
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
          <button onClick={onCancel} aria-label="ปิดหน้าต่าง" style={{ background: "none", border: "none", color: "#9099a8", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="เลือกภาพปกจากเครื่อง"
            style={{
              width: 84, height: 118, borderRadius: 8, padding: 0,
              background: cover ? `url(${cover}) center/cover no-repeat` : "#232a36",
              border: "1px solid #333c4d", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, cursor: "pointer",
            }}
          >
            {!cover && <ImageIcon size={20} color="#5c6372" />}
          </button>
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
          value={cover && typeof cover === "string" && cover.startsWith("http") ? cover : ""}
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

// ============================== Chapter Editor ==============================

const FONT_MIN = 13;
const FONT_MAX = 28;
const FONT_SIZE_KEY = "novel-writer-font-size-v2";
const GEMINI_KEY_STORAGE = "novel-writer-gemini-keys-v2";
const GEMINI_MODEL = "gemini-3.1-flash-lite";

function ChapterEditor({ chapter, onSave, onSaveAndNext, onCancel, onDelete }) {
  const [title, setTitle] = useState(chapter.title || "");
  const [content, setContent] = useState(chapter.content || "");
  const [copied, setCopied] = useState(false);
  const [typoNotice, setTypoNotice] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const [apiKeysInput, setApiKeysInput] = useState(() => localStorage.getItem(GEMINI_KEY_STORAGE) || "");
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
  const scrollRef = useRef(null); // ref ตรงถึง scroll container — ไม่พึ่ง DOM structure

  // นับคำ/นับตัวอักษรจากค่า debounce เพื่อไม่ไล่ segment ทั้งเรื่องทุก keystroke
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

  // auto-resize textarea + คงตำแหน่ง scroll เดิม
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
    // Shift+Enter = ขึ้นบรรทัดธรรมดา, Enter ปกติ = ย่อหน้าใหม่
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    const ta = contentRef.current;
    if (!ta) return;
    const indent = "\n\n    ";

    // ใช้ execCommand เพื่อรักษา undo history (Ctrl+Z ย้อนได้)
    let done = false;
    try { done = document.execCommand("insertText", false, indent); } catch (err) { done = false; }
    if (!done) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      setContent(content.substring(0, start) + indent + content.substring(end));
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.selectionStart = contentRef.current.selectionEnd = start + indent.length;
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
    const raw = apiKeysInput || "";
    return raw
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  };

  const ensureKeys = async () => {
    let keyList = getActiveKeyList();
    if (keyList.length > 0) return keyList;
    const input = prompt("🔑 กรุณาใส่ Gemini API Key ของคุณ (หลายคีย์คั่นด้วย , หรือขึ้นบรรทัดใหม่):");
    if (!input) return null;
    setApiKeysInput(input);
    localStorage.setItem(GEMINI_KEY_STORAGE, input);
    return input.split(/[\n,]+/).map((k) => k.trim()).filter((k) => k.length > 0);
  };

  // เรียก Gemini API — ส่ง key ผ่าน header x-goog-api-key แทนการต่อท้าย URL
  async function callGemini(key, promptText, generationConfig) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          ...(generationConfig ? { generationConfig } : {}),
        }),
      }
    );
    const data = await response.json();
    if (data.error) throw data.error;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const handleFixDialogueQuotes = () => {
    if (!content) return;

    if (contentRef.current) {
      const { selectionStart, selectionEnd } = contentRef.current;
      if (selectionStart !== selectionEnd) {
        const selectedText = content.substring(selectionStart, selectionEnd);
        const wrapped = (selectedText.startsWith('"') && selectedText.endsWith('"'))
          ? selectedText.slice(1, -1)
          : `"${selectedText}"`;
        setContent(content.substring(0, selectionStart) + wrapped + content.substring(selectionEnd));
        showNotice('✨ ใส่เครื่องหมาย "..." ครอบข้อความที่เลือกเรียบร้อย!', 3000);
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
    showNotice(fixesCount > 0
      ? `✨ เติม/จัดระเบียบเครื่องหมายคำพูด "..." ให้แล้ว ${fixesCount} จุด!`
      : '✓ ไม่พบคำพูดที่ขาดเครื่องหมาย');
  };

  const fetchWithRetry = async (para, keyList, retries = 3) => {
    if (!para.trim()) return para;

    const promptText = `คุณคือบรรณาธิการตรวจทานนิยายภาษาไทย หน้าที่ของคุณคือ:
1. เติมเครื่องหมายคำพูด "..." ครอบบทสนทนาหรือคำพูดตัวละครที่ยังไม่มีให้อย่างถูกต้อง
2. แก้ไขคำพิมพ์ผิด ตัวการันต์ สระเอซ้ำ (เเ -> แ) และเว้นวรรคไม้ยมก (ๆ)
3. **ห้าม** แก้ไขเนื้อหาหรือสำนวนเด็ดขาด
4. ตอบกลับเฉพาะข้อความที่แก้ไขแล้วเท่านั้น ห้ามมีคำเกริ่นใดๆ

ข้อความ:
${para}`;

    for (let attempt = 0; attempt < retries; attempt++) {
      const currentKey = keyList[Math.floor(Math.random() * keyList.length)];
      try {
        const aiFixed = await callGemini(currentKey, promptText);
        return aiFixed ? aiFixed.trim() : para;
      } catch (err) {
        if (err?.code === 429 && attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
          continue;
        }
        if (attempt === retries - 1) return para; // ย่อหน้าไหนพลาด คงข้อความเดิมไว้
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return para;
  };

  const handleGeminiProofread = async () => {
    if (!content.trim()) {
      alert("กรุณาใส่เนื้อหานิยายก่อนกดตรวจครับ");
      return;
    }

    const keyList = await ensureKeys();
    if (!keyList) return;

    setIsAiProcessing(true);
    setProgress(0);
    setTypoNotice(`🤖 เริ่มต้นตรวจทานด้วย ${keyList.length} API Keys (${GEMINI_MODEL})...`);

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
      showNotice(`✨ ตรวจสอบเรียบร้อยสมบูรณ์แล้ว!`);
    } catch (err) {
      alert("เกิดข้อผิดพลาด: " + err.message);
      setTypoNotice("");
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleCheckPronouns = async () => {
    if (!content.trim()) {
      alert("กรุณาใส่เนื้อหานิยายก่อนตรวจสอบสรรพนามครับ");
      return;
    }

    const keyList = await ensureKeys();
    if (!keyList) return;

    setIsAiProcessing(true);
    setTypoNotice("🔍 AI กำลังสแกนหาสรรพนาม (ข้า, เจ้า, ฉัน, คุณ, เธอ, ฯลฯ)...");

    const promptText = `คุณคือนักวิเคราะห์วรรณกรรม ตรวจสอบเนื้อหานิยายภาษาไทยด้านล่างนี้ ค้นหาคำสรรพนามทั้งหมดที่ใช้ เช่น ข้า, เจ้า, ฉัน, คุณ, เธอ, นาง, นาย, ท่าน, ขอรับ, ครับ, ค่ะ, คะ และสรรพนามยุคปัจจุบันที่อาจหลุดมาในนิยายโบราณ/พีเรียด

เนื้อหา:
${content}`;

    // Structured Output — โมเดลบังคับให้ตอบ JSON ตาม schema นี้เสมอ
    const generationConfig = {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            word: { type: "STRING" },
            count: { type: "INTEGER" },
            suggestion: { type: "STRING" },
          },
          required: ["word", "count", "suggestion"],
        },
      },
    };

    let success = false;
    let rawText = "[]";

    for (let attempt = 0; attempt < 8; attempt++) {
      const currentKey = keyList[Math.floor(Math.random() * keyList.length)];
      try {
        rawText = (await callGemini(currentKey, promptText, generationConfig)) || "[]";
        success = true;
        break;
      } catch (err) {
        if (attempt === 7) {
          alert("เกิดข้อผิดพลาดในการตรวจสอบสรรพนาม: " + (err?.message || err));
        }
        await new Promise((resolve) => setTimeout(resolve, err?.code === 429 ? 3000 : 1200));
      }
    }

    setIsAiProcessing(false);
    setTypoNotice("");

    if (success) {
      try {
        const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsedResults = JSON.parse(cleanJson);

        setPronounResults(parsedResults);
        const initialMap = {};
        parsedResults.forEach((item) => { initialMap[item.word] = ""; });
        setReplacementMap(initialMap);
        setShowPronounModal(true);
      } catch (e) {
        alert("ไม่สามารถแปลงข้อมูลผลลัพธ์จาก AI ได้ กรุณาลองใหม่อีกครั้ง");
      }
    }
  };

  const applyPronounReplacements = () => {
    let newContent = content;
    let replacedCount = 0;

    Object.entries(replacementMap).forEach(([oldWord, newWord]) => {
      if (!oldWord || !newWord || !newWord.trim()) return;
      // escape กันคำที่ AI ส่งกลับมาอาจมีอักขระ regex แล้วทำให้แอป crash
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
    localStorage.setItem(GEMINI_KEY_STORAGE, apiKeysInput.trim());
    setShowKeyInput(false);
    const count = getActiveKeyList().length;
    alert(`บันทึก Gemini API Key เรียบร้อยทั้งหมด ${count} คีย์!`);
  };

  const buildPayload = () => ({
    ...chapter,
    title: title.trim(),
    content: content,
    updatedAt: Date.now(),
  });

  // รอบันทึกสำเร็จก่อน แล้วค่อยปิด — ถ้าล้มเหลว ข้อความยังอยู่ครบใน editor
  const triggerSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const ok = await onSave(buildPayload());
      if (ok !== false) onCancel();
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึก: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const triggerSaveAndNext = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSaveAndNext(buildPayload()); // สำเร็จ → parent เปิดตอนใหม่ให้เอง
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึกและสร้างตอนถัดไป: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const charCountTotal = countCharacters(debouncedContent, { includeSpaces: true });
  const charCountNoSpaces = countCharacters(debouncedContent, { includeSpaces: false });
  const keyCount = getActiveKeyList().length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f4ede0", zIndex: 50, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 16px", background: "#1a202a", borderBottom: "1px solid #2a3140",
        }}
      >
        <button onClick={onCancel} aria-label="ปิดโดยไม่บันทึก" style={{ background: "none", border: "none", color: "#9099a8", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
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
            <button onClick={onDelete} aria-label="ลบตอนนี้" style={{ background: "none", border: "none", color: "#a85a5a", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={triggerSave}
            disabled={isSaving}
            style={{ background: "#c9a15a", border: "none", color: "#1a140a", cursor: isSaving ? "wait" : "pointer", borderRadius: 8, padding: "8px 16px", fontWeight: 600, fontSize: 14, opacity: isSaving ? 0.75 : 1 }}
          >
            {isSaving ? "กำลังบันทึก…" : "บันทึก"}
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
            <span style={{ fontSize: 11, color: "#9099a8" }}>ตรวจพบทั้งหมด {keyCount} คีย์ (เก็บในเครื่องคุณเท่านั้น)</span>
            <button type="submit" style={{ background: "#c9a15a", border: "none", padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
              บันทึกคีย์ทั้งหมด
            </button>
          </div>
        </form>
      )}

      <div
        style={{
          flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 16px", background: "#efe6d3", borderBottom: "1px solid #ddd0b3",
        }}
      >
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#8a7c5e" }}>
          ตอนที่ {chapter.order}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={() => setFontSize((s) => Math.max(FONT_MIN, s - 1))}
            aria-label="ลดขนาดฟอนต์"
            style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #cabb98", background: "#f4ede0", color: "#4a3f2a", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
          >
            ก-
          </button>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8a7c5e", width: 30, textAlign: "center" }}>
            {fontSize}
          </span>
          <button
            onClick={() => setFontSize((s) => Math.min(FONT_MAX, s + 1))}
            aria-label="เพิ่มขนาดฟอนต์"
            style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid #cabb98", background: "#f4ede0", color: "#4a3f2a", cursor: "pointer", fontSize: 15, fontWeight: 700 }}
          >
            ก+
          </button>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", color: "#2a2318" }}>
        <div style={{ padding: "20px 18px 60px" }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ชื่อตอน (ไม่บังคับ)"
            style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontFamily: "'Noto Serif Thai', serif", fontSize: fontSize + 4, fontWeight: 700, marginBottom: 14, color: "#221d14" }}
          />

          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#8a7c5e" }}>💡 ทิป: Enter = ย่อหน้าใหม่ · Shift+Enter = ขึ้นบรรทัดธรรมดา</span>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "100%" }}>
            <button onClick={() => setShowFindReplace(!showFindReplace)} style={{ background: showFindReplace ? "#d0c3a5" : "#efe6d3", border: "1px solid #cabb98", color: "#4a3f2a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, flex: "1 1 auto" }}>
              🔍 ค้นหา/แทนที่
            </button>
            <button onClick={handleFixDialogueQuotes} style={{ background: "#efe6d3", border: "1px solid #cabb98", color: "#4a3f2a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, flex: "1 1 auto" }}>
              💬 ตรวจ/ใส่ "..."
            </button>
            <button onClick={handleGeminiProofread} disabled={isAiProcessing} style={{ background: isAiProcessing ? "#d0c3a5" : "#1a202a", border: "1px solid #c9a15a", color: "#c9a15a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: isAiProcessing ? "wait" : "pointer", fontWeight: 600, flex: "1 1 auto" }}>
              {isAiProcessing ? `⏳ (${progress}%)` : `🤖 AI ตรวจสลับคีย์ (${keyCount})`}
            </button>
            <button onClick={handleCheckPronouns} disabled={isAiProcessing} style={{ background: "#efe6d3", border: "1px solid #cabb98", color: "#4a3f2a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, flex: "1 1 auto" }}>
              👥 ตรวจสรรพนาม
            </button>
            <button onClick={handleCopyContent} style={{ background: copied ? "#d4edda" : "#efe6d3", border: "1px solid " + (copied ? "#c3e6cb" : "#cabb98"), color: copied ? "#155724" : "#4a3f2a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, flex: "1 1 auto", transition: "all 0.2s" }}>
              {copied ? "✓ คัดลอกแล้ว!" : "📋 คัดลอกเนื้อหา"}
            </button>
            <button onClick={handleAutoIndent} style={{ background: "#efe6d3", border: "1px solid #cabb98", color: "#4a3f2a", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, flex: "1 1 auto" }}>
              ✨ จัดย่อหน้าทั้งหมด
            </button>
          </div>

          <div style={{ fontSize: 10.5, color: "#a09272", margin: "6px 0 10px" }}>
            🔒 ปุ่ม 🤖 และ 👥 จะส่งข้อความในตอนนี้ไปประมวลผลที่ Google Gemini API (คีย์ของคุณถูกเก็บไว้ในเครื่องเท่านั้น)
          </div>

          {showFindReplace && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, background: "#efe6d3", padding: "12px", borderRadius: 8, border: "1px solid #ddd0b3", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <input type="text" placeholder="ค้นหาคำ..." value={searchWord} onChange={(e) => setSearchWord(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #cabb98", fontSize: 13, background: "#fff", outline: "none" }} />
                <span style={{ fontSize: 12, color: "#6a5c40", fontWeight: 600, alignSelf: "center", minWidth: 60, textAlign: "right" }}>พบ {matchCount} คำ</span>
              </div>
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <input type="text" placeholder="แทนที่ด้วย..." value={replaceWord} onChange={(e) => setReplaceWord(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #cabb98", fontSize: 13, background: "#fff", outline: "none" }} />
                <button onClick={handleReplaceAll} disabled={matchCount === 0} style={{ background: matchCount > 0 ? "#1a202a" : "#d0c3a5", border: "none", color: matchCount > 0 ? "#c9a15a" : "#8a7c5e", padding: "8px 14px", borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: matchCount > 0 ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
                  แทนที่ทั้งหมด
                </button>
              </div>
            </div>
          )}

          {isAiProcessing && (
            <div style={{ marginBottom: 12, background: "#efe6d3", borderRadius: 8, padding: 8, border: "1px solid #ddd0b3" }}>
              <div style={{ fontSize: 12, color: "#4a3f2a", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                <span>{typoNotice}</span>
                <span style={{ fontWeight: 700 }}>{progress}%</span>
              </div>
              <div style={{ width: "100%", height: 8, background: "#d0c3a5", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: "#c9a15a", transition: "width 0.3s ease" }} />
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
            style={{ width: "100%", border: "none", outline: "none", background: "transparent", resize: "none", fontSize: fontSize, lineHeight: 1.75, letterSpacing: "0.2px", color: "#2a2318", minHeight: "60vh" }}
          />

          <div style={{ marginTop: 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8a7c5e", borderTop: "1px dashed #cabb98", paddingTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>📝 {wordCount(debouncedContent)} คำ</span><span>•</span><span>🔤 {charCountTotal} ตัวอักษร</span><span>•</span><span>(ไม่รวมเว้นวรรค: {charCountNoSpaces})</span>
          </div>

          <button
            onClick={triggerSaveAndNext}
            disabled={isSaving}
            style={{ width: "100%", marginTop: 22, background: "#1a202a", border: "1px solid #c9a15a", color: "#c9a15a", fontWeight: 600, fontSize: 14.5, padding: "13px", borderRadius: 10, cursor: isSaving ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: isSaving ? 0.75 : 1 }}
          >
            {isSaving ? "กำลังบันทึก…" : <>บันทึกและสร้างตอนถัดไป <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>

      {showPronounModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#f4ede0", borderRadius: 12, width: "100%", maxWidth: 500, padding: 20, border: "1px solid #cabb98", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <h3 style={{ margin: "0 0 10px 0", color: "#221d14", fontSize: 18 }}>👥 ตรวจพบคำสรรพนามในเนื้อหา</h3>
            <p style={{ fontSize: 13, color: "#6a5c40", margin: "0 0 14px 0" }}>
              ตรวจสอบพบคำสรรพนาม (รวมถึงคำที่อาจหลุดมาจากยุคปัจจุบัน) สามารถพิมพ์คำที่ต้องการเปลี่ยนแทนที่ลงในช่องขวาได้เลยครับ:
            </p>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {pronounResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "#6a5c40" }}>ไม่พบคำสรรพนามในตอนนี้</div>
              ) : (
                pronounResults.map((item, idx) => (
                  <div key={idx} style={{ background: "#efe6d3", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd0b3", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: "#a85a5a", fontSize: 14 }}>"{item.word}" <span style={{ fontSize: 11, color: "#8a7c5e", fontWeight: 400 }}>(พบ {item.count} ครั้ง)</span></div>
                      <div style={{ fontSize: 11, color: "#6a5c40" }}>คำแนะนำ: {item.suggestion}</div>
                    </div>
                    <div style={{ width: 120 }}>
                      <input type="text" placeholder="เปลี่ยนเป็น..." value={replacementMap[item.word] || ""} onChange={(e) => setReplacementMap({ ...replacementMap, [item.word]: e.target.value })} style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #cabb98", background: "#fff", fontSize: 12 }} />
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowPronounModal(false)} style={{ background: "#d0c3a5", border: "none", color: "#221d14", padding: "8px 16px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>ยกเลิก</button>
              {pronounResults.length > 0 && <button onClick={applyPronounReplacements} style={{ background: "#1a202a", border: "none", color: "#c9a15a", padding: "8px 16px", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>ยืนยันเปลี่ยนคำทั้งหมด ✨</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
