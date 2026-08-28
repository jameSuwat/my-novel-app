import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { auth } from "./services/firebase";
import {
  pushAllToCloud,
  saveNovelDoc,
  saveChapterDoc,
  deleteChapterDoc,
  deleteNovelAndChapters,
  loadAllNovels,
  stripChapters,
} from "./services/firestore";
import {
  getItem,
  setItem,
  migrateFromLocalStorage,
} from "./services/storage";
import { compressImage } from "./utils/imageCompress";
import { wordCount } from "./utils/wordCounter";
import { timeAgo } from "./utils/timeAgo";
import { novelUpdatedAt } from "./utils/helpers";
import useTheme from "./hooks/useTheme";
import useConfirm from "./hooks/useConfirm";
import useAlert from "./hooks/useAlert";
import LibraryView from "./components/LibraryView";
import NovelView from "./components/NovelView";
import NovelInfoEditor from "./components/NovelInfoEditor";
import ChapterEditor from "./components/ChapterEditor";
import ConfirmModal from "./components/ConfirmModal";
import AlertModal from "./components/AlertModal";
import PromptModal from "./components/PromptModal";
import "./styles/global.css";
import styles from "./App.module.css";

const STORAGE_KEY = "novel-writer-app-data";

const seedNovels = [
  {
    id: "n1",
    title: "เปลี่ยนโลก",
    synopsis: "เรื่องราวของหญิงสาวผู้ต้องเลือกระหว่างความจริงกับคนที่เธอรัก เมื่อแผนที่โบราณเปิดประตูสู่ความลับที่ครอบครัวของเธอฝังไว้",
    cover: null,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    chapters: [
      {
        id: "c1",
        order: 1,
        title: "จุดเริ่มต้น",
        content: "แสงแดดยามเช้าสาดผ่านหน้าต่างบานเก่า อารดายืนนิ่งอยู่หน้าประตูบ้านที่ไม่ได้กลับมาเยือนนานถึงสิบปี...",
        updatedAt: Date.now() - 1000 * 60 * 60 * 20,
      },
      {
        id: "c2",
        order: 2,
        title: "ความลับ",
        content: "",
        updatedAt: Date.now() - 1000 * 60 * 60 * 10,
      },
    ],
  },
];

// ============================== Main Component ==============================

export default function NovelLibraryApp() {
  const [novels, setNovels] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [userId, setUserId] = useState(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [unsynced, setUnsynced] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [query, setQuery] = useState("");
  const [editingNovelInfo, setEditingNovelInfo] = useState(null);
  const [openChapter, setOpenChapter] = useState(null);
  const [isNewChapter, setIsNewChapter] = useState(false);
  const fileInputRef = useRef(null);

  // Prompt modal state
  const [promptState, setPromptState] = useState({
    open: false,
    message: "",
  });
  const promptResolveRef = useRef(null);

  const novelsRef = useRef([]);
  useEffect(() => {
    novelsRef.current = novels;
  }, [novels]);

  const markSyncFailed = useCallback(() => setUnsynced(true), []);

  const { theme, toggleTheme } = useTheme();
  const confirm = useConfirm();
  const { showAlert, ...alertState } = useAlert();

  // Custom prompt function
  const showPrompt = useCallback((message) => {
    return new Promise((resolve) => {
      promptResolveRef.current = resolve;
      setPromptState({ open: true, message });
    });
  }, []);

  const handlePromptConfirm = useCallback((value) => {
    setPromptState({ open: false, message: "" });
    promptResolveRef.current?.(value);
    promptResolveRef.current = null;
  }, []);

  const handlePromptCancel = useCallback(() => {
    setPromptState({ open: false, message: "" });
    promptResolveRef.current?.(null);
    promptResolveRef.current = null;
  }, []);

  // ---------- Auth + Load Data ----------
  useEffect(() => {
    let cancelled = false;

    const loadLocalFallback = async () => {
      // Try IndexedDB first, then try migrating from localStorage (Feature #4)
      let initial = await getItem(STORAGE_KEY);
      if (!initial) {
        initial = await migrateFromLocalStorage(STORAGE_KEY);
      }
      setNovels(initial || seedNovels);
    };

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || cancelled) return;
      setUserId(user.uid);
      setLocalOnly(false);
      try {
        const loaded = await loadAllNovels(user.uid);
        if (loaded.length > 0) {
          setNovels(loaded);
        } else {
          let initial = await getItem(STORAGE_KEY);
          if (!initial) {
            initial = await migrateFromLocalStorage(STORAGE_KEY);
          }
          if (!initial) initial = seedNovels;
          setNovels(initial);
          await pushAllToCloud(user.uid, initial);
        }
      } catch (e) {
        console.error("โหลดข้อมูลจาก Firebase ล้มเหลว", e);
        setLocalOnly(true);
        await loadLocalFallback();
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    });

    signInAnonymously(auth).catch((err) => {
      console.error("Anonymous sign-in failed:", err);
      if (cancelled) return;
      setLocalOnly(true);
      loadLocalFallback().then(() => {
        if (!cancelled) setIsLoaded(true);
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // ---------- Mirror to IndexedDB (Feature #4) ----------
  useEffect(() => {
    if (isLoaded) {
      setItem(STORAGE_KEY, novels).catch(() => {});
    }
  }, [novels, isLoaded]);

  // ---------- Cloud Save ----------
  const forceSaveToCloud = useCallback(async () => {
    if (!userId) {
      showAlert("📴 ยังเชื่อมต่อคลาวด์ไม่ได้ — ข้อมูลถูกบันทึกในเครื่องนี้แล้ว", "warning");
      return;
    }
    try {
      await pushAllToCloud(userId, novels);
      setUnsynced(false);
      showAlert("✅ บันทึกขึ้นคลาวด์สำเร็จ!", "success");
    } catch (e) {
      console.error("Cloud save failed:", e);
      setUnsynced(true);
      showAlert(`❌ บันทึกไม่สำเร็จ: ${e?.message || "เกิดข้อผิดพลาดในการบันทึก"}`, "error");
    }
  }, [userId, novels, showAlert]);

  const current = useMemo(
    () => novels.find((n) => n.id === currentId) || null,
    [novels, currentId]
  );

  const filteredNovels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...novels]
      .filter((n) => !q || (n.title && n.title.toLowerCase().includes(q)))
      .sort((a, b) => novelUpdatedAt(b) - novelUpdatedAt(a));
  }, [novels, query]);

  // ---------- Novel CRUD ----------
  const updateNovel = useCallback(
    async (id, patch) => {
      let processedPatch = { ...patch };
      if (processedPatch.cover) {
        processedPatch.cover = await compressImage(processedPatch.cover);
      }
      const target = novelsRef.current.find((n) => n.id === id);
      const merged = target ? { ...target, ...processedPatch } : null;

      setNovels((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...processedPatch } : n))
      );

      if (merged && userId) {
        try {
          await saveNovelDoc(userId, merged);
        } catch (err) {
          console.error("Sync error:", err);
          markSyncFailed();
        }
      }
    },
    [userId, markSyncFailed]
  );

  const saveNovelInfo = useCallback(
    async (data) => {
      let processedData = { ...data };
      if (processedData.cover) {
        processedData.cover = await compressImage(processedData.cover);
      }
      processedData.title = processedData.title?.trim() || "ยังไม่มีชื่อเรื่อง";

      if (editingNovelInfo === "new") {
        const id = `n-${Date.now()}`;
        const newNovel = {
          id,
          createdAt: Date.now(),
          chapters: [],
          ...processedData,
        };
        setNovels((prev) => [...prev, newNovel]);
        setCurrentId(id);
        if (userId) {
          try {
            await saveNovelDoc(userId, newNovel);
          } catch (e) {
            console.error(e);
            markSyncFailed();
          }
        }
      } else {
        await updateNovel(editingNovelInfo.id, processedData);
      }
      setEditingNovelInfo(null);
    },
    [editingNovelInfo, userId, markSyncFailed, updateNovel]
  );

  const deleteNovel = useCallback(
    async (id) => {
      const ok = await confirm("ลบนิยายเรื่องนี้พร้อมทุกตอนอย่างถาวร? ย้อนกลับไม่ได้", {
        confirmLabel: "ลบเลย",
        variant: "danger",
      });
      if (!ok) return;

      setNovels((prev) => prev.filter((n) => n.id !== id));
      setEditingNovelInfo(null);
      if (currentId === id) setCurrentId(null);

      if (!userId) return;
      try {
        await deleteNovelAndChapters(userId, id);
      } catch (e) {
        console.error(e);
        markSyncFailed();
      }
    },
    [userId, currentId, confirm, markSyncFailed]
  );

  // ---------- Chapter CRUD ----------
  const addChapter = useCallback(() => {
    if (!current) return;
    const chapters = current.chapters || [];
    const nextOrder = chapters.length
      ? Math.max(...chapters.map((c) => c.order)) + 1
      : 1;
    setOpenChapter({
      id: null,
      order: nextOrder,
      title: "",
      content: "",
      updatedAt: Date.now(),
    });
    setIsNewChapter(true);
  }, [current]);

  const persistChapterDoc = useCallback(
    async (novelId, chapter) => {
      if (userId) {
        await saveChapterDoc(userId, novelId, chapter);
      }
    },
    [userId]
  );

  const saveChapter = useCallback(
    async (ch) => {
      if (!current) return false;
      const chapter = {
        ...ch,
        id: isNewChapter ? `c-${Date.now()}` : ch.id,
        updatedAt: Date.now(),
      };
      try {
        await persistChapterDoc(current.id, chapter);
        setNovels((prev) =>
          prev.map((n) => {
            if (n.id !== current.id) return n;
            const chapters = n.chapters || [];
            const exists = chapters.some((c) => c.id === chapter.id);
            return {
              ...n,
              chapters: exists
                ? chapters.map((c) => (c.id === chapter.id ? chapter : c))
                : [...chapters, chapter],
            };
          })
        );
        setOpenChapter(null);
        setIsNewChapter(false);
        return true;
      } catch (e) {
        console.error("Chapter save failed:", e);
        markSyncFailed();
        showAlert(
          `❌ บันทึกตอนไม่สำเร็จ: ${e?.message || "เกิดข้อผิดพลาด"}\n(ข้อความยังอยู่ในหน้าเขียน ไม่ได้หายไป)`,
          "error"
        );
        return false;
      }
    },
    [current, isNewChapter, persistChapterDoc, markSyncFailed, showAlert]
  );

  const saveChapterAndNext = useCallback(
    async (ch) => {
      if (!current) return false;
      const chapter = {
        ...ch,
        id: isNewChapter ? `c-${Date.now()}` : ch.id,
        updatedAt: Date.now(),
      };
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
            return {
              ...n,
              chapters: ex
                ? cs.map((c) => (c.id === chapter.id ? chapter : c))
                : [...cs, chapter],
            };
          })
        );

        const nextOrder =
          Math.max(0, ...nextChapters.map((c) => c.order || 0)) + 1;
        setOpenChapter({
          id: null,
          order: nextOrder,
          title: "",
          content: "",
          updatedAt: Date.now(),
        });
        setIsNewChapter(true);
        return true;
      } catch (e) {
        console.error("Chapter save failed:", e);
        markSyncFailed();
        showAlert(
          `❌ บันทึกตอนไม่สำเร็จ: ${e?.message || "เกิดข้อผิดพลาด"}\n(ข้อความยังอยู่ในหน้าเขียน ไม่ได้หายไป)`,
          "error"
        );
        return false;
      }
    },
    [current, isNewChapter, persistChapterDoc, markSyncFailed, showAlert]
  );

  const deleteChapter = useCallback(
    async (id) => {
      if (!current) return;
      const ch = (current.chapters || []).find((c) => c.id === id);
      const label = ch?.title?.trim()
        ? `"${ch.title.trim()}"`
        : `ตอนที่ ${ch?.order ?? ""}`;
      const ok = await confirm(`ลบ${label}ถาวร? ย้อนกลับไม่ได้`, {
        confirmLabel: "ลบเลย",
        variant: "danger",
      });
      if (!ok) return;

      setNovels((prev) =>
        prev.map((n) =>
          n.id === current.id
            ? { ...n, chapters: (n.chapters || []).filter((c) => c.id !== id) }
            : n
        )
      );
      setOpenChapter(null);

      if (!userId) return;
      try {
        await deleteChapterDoc(userId, current.id, id);
      } catch (e) {
        console.error("Chapter delete failed:", e);
        markSyncFailed();
      }
    },
    [current, userId, confirm, markSyncFailed]
  );

  // ---------- Drag & Drop Reorder (Feature #2) ----------
  const reorderChapters = useCallback(
    async (updatedChapters) => {
      // Update local state
      setNovels((prev) =>
        prev.map((n) => {
          if (n.id !== currentId) return n;
          return { ...n, chapters: updatedChapters };
        })
      );

      // Persist to cloud
      if (userId && currentId) {
        try {
          for (const ch of updatedChapters) {
            await saveChapterDoc(userId, currentId, ch);
          }
        } catch (e) {
          console.error("Reorder sync failed:", e);
          markSyncFailed();
        }
      }
    },
    [currentId, userId, markSyncFailed]
  );

  if (!isLoaded) {
    return (
      <div className={styles.loading}>
        <h3>กำลังเชื่อมต่อคลาวด์... ☁️</h3>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      {!current ? (
        <LibraryView
          novels={filteredNovels}
          query={query}
          setQuery={setQuery}
          onOpen={(id) => setCurrentId(id)}
          onCreate={() => setEditingNovelInfo("new")}
          theme={theme}
          onToggleTheme={toggleTheme}
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
          onForceSave={forceSaveToCloud}
          onReorderChapters={reorderChapters}
          wordCount={wordCount}
          timeAgo={timeAgo}
        />
      )}

      {editingNovelInfo && (
        <NovelInfoEditor
          novel={
            editingNovelInfo === "new"
              ? { title: "", synopsis: "", cover: null }
              : editingNovelInfo
          }
          isNew={editingNovelInfo === "new"}
          onSave={saveNovelInfo}
          onCancel={() => setEditingNovelInfo(null)}
          onDelete={
            editingNovelInfo !== "new"
              ? () => deleteNovel(editingNovelInfo.id)
              : null
          }
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
          onAlert={showAlert}
          onPrompt={showPrompt}
        />
      )}

      {/* Global Modals (Fix #7) */}
      <ConfirmModal
        open={confirm.open}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        cancelLabel={confirm.cancelLabel}
        variant={confirm.variant}
        onConfirm={confirm.handleConfirm}
        onCancel={confirm.handleCancel}
      />

      <AlertModal
        open={alertState.open}
        message={alertState.message}
        variant={alertState.variant}
        onClose={alertState.handleClose}
      />

      <PromptModal
        open={promptState.open}
        message={promptState.message}
        onConfirm={handlePromptConfirm}
        onCancel={handlePromptCancel}
      />
    </div>
  );
}
