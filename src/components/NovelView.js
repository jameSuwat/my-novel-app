import React, { useState, useMemo, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Image as ImageIcon,
  Clock, BookOpen,
} from "lucide-react";
import { GripVertical } from "lucide-react";
import { exportSingleChapter, exportChaptersAsZip } from "../utils/txtExport";
import styles from "./NovelView.module.css";

export default function NovelView({
  novel,
  fileInputRef,
  unsynced,
  localOnly,
  onBack,
  onEditInfo,
  onCoverPick,
  onOpenChapter,
  onAddChapter,
  onForceSave,
  onReorderChapters,
  wordCount,
  timeAgo,
}) {
  const chapters = useMemo(() => novel.chapters || [], [novel.chapters]);
  const sorted = useMemo(
    () => [...chapters].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [chapters]
  );

  const [savedAlert, setSavedAlert] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const dragItem = useRef(null);

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const allSelected = sorted.length > 0 && sorted.every((c) => selected.has(c.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(sorted.map((c) => c.id)));

  const handleExportSelected = () => {
    const chosen = sorted.filter((c) => selected.has(c.id));
    if (!chosen.length) return;
    if (chosen.length === 1) exportSingleChapter(chosen[0]);
    else exportChaptersAsZip(novel.title, chosen);
    setSelected(new Set());
  };

  function handleCoverPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCoverPick(reader.result);
    reader.readAsDataURL(file);
  }

  const handleManualSave = async () => {
    if (onForceSave) await onForceSave();
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 2000);
  };

  // ===== Drag & Drop handlers (Feature #2) =====
  const handleDragStart = useCallback((e, index) => {
    dragItem.current = sorted[index];
    setDragIdx(index);
    e.dataTransfer.effectAllowed = "move";
    // Use a transparent ghost to avoid flicker
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
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }

    // Create new order: move the dragged item
    const reordered = [...sorted];
    const [draggedItem] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, draggedItem);

    // Re-assign order numbers
    const updated = reordered.map((ch, i) => ({ ...ch, order: i + 1 }));
    onReorderChapters(updated);

    setDragIdx(null);
    setDragOverIdx(null);
    dragItem.current = null;
  }, [dragIdx, sorted, onReorderChapters]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
    dragItem.current = null;
  }, []);

  return (
    <div>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack} aria-label="กลับไปหิ้งนิยาย">
          <ChevronLeft size={18} /> หิ้งนิยาย
        </button>
        <div className={styles.topBarActions}>
          {localOnly && (
            <span className={styles.syncBadge} title="เชื่อมต่อคลาวด์ไม่ได้ ข้อมูลถูกบันทึกในเครื่องนี้">
              📴 เฉพาะเครื่องนี้
            </span>
          )}
          {!localOnly && unsynced && (
            <span className={styles.unsyncedBadge} title="มีการแก้ไขที่ส่งขึ้นคลาวด์ไม่สำเร็จ">
              ⚠️ ยังไม่ซิงค์
            </span>
          )}
          <button
            className={`${styles.saveBtn} ${savedAlert ? styles.saveBtnSuccess : ""} ${!savedAlert && unsynced ? styles.saveBtnSynced : ""}`}
            onClick={handleManualSave}
          >
            {savedAlert ? "✓ บันทึกบนคลาวด์" : "☁️ บันทึกขึ้นคลาวด์"}
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className={styles.heroBanner}>
        <div
          className={styles.heroBanner}
          style={{
            height: 180,
            background: novel.cover
              ? `linear-gradient(180deg, rgba(18,22,29,0.2), var(--bg-primary)), url(${novel.cover}) center/cover no-repeat`
              : "linear-gradient(135deg, var(--bg-card), var(--bg-primary))",
          }}
        />
      </div>

      <div className={styles.heroContent}>
        <button
          className={styles.coverImage}
          onClick={() => fileInputRef.current?.click()}
          aria-label="เปลี่ยนภาพปก"
          style={{
            background: novel.cover
              ? `url(${novel.cover}) center/cover no-repeat`
              : "var(--bg-card)",
          }}
        >
          {!novel.cover && <ImageIcon size={24} color="var(--text-muted)" />}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCoverPick} style={{ display: "none" }} />
        <div className={styles.novelInfo}>
          <div className={styles.novelInfoTop}>
            <h1 className={styles.novelTitle}>{novel.title || "ยังไม่มีชื่อเรื่อง"}</h1>
            <button className={styles.editBtn} onClick={onEditInfo} aria-label="แก้ไขข้อมูลนิยาย">
              <Pencil size={14} />
            </button>
          </div>
          <div className={styles.chapterCount}>
            <BookOpen size={12} /> {chapters.length} ตอน
          </div>
        </div>
      </div>

      <p className={styles.synopsis}>
        {novel.synopsis || "ยังไม่มีเรื่องย่อ — แตะไอคอนดินสอเพื่อเพิ่ม"}
      </p>

      {/* Chapters List */}
      <div className={styles.chaptersSection}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <span className={styles.sectionTitle}>ตอนทั้งหมด</span>
            <span className={styles.sectionCount}>{chapters.length} รายการ</span>
          </div>
          <div className={styles.toolbarRight}>
            {sorted.length > 0 && (
              <>
                <button className={styles.selectAllBtn} onClick={toggleAll}>
                  {allSelected ? "ไม่เลือกเลย" : "เลือกทั้งหมด"}
                </button>
                <button
                  className={`${styles.exportBtn} ${selected.size > 0 ? styles.exportBtnActive : styles.exportBtnDisabled}`}
                  onClick={handleExportSelected}
                  disabled={selected.size === 0}
                >
                  {selected.size === 0
                    ? "📤 ส่งออก .txt (ติ๊กเลือกตอนก่อน)"
                    : selected.size === 1
                      ? "📤 ส่งออก 1 ตอน (.txt)"
                      : `📦 ส่งออก ${selected.size} ตอน (.zip)`}
                </button>
              </>
            )}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className={styles.emptyChapters}>
            <p style={{ fontFamily: "'Noto Serif Thai', serif", fontSize: 15 }}>ยังไม่มีตอนไหนเลย</p>
            <p style={{ fontSize: 13 }}>แตะปุ่ม + เพื่อเริ่มเขียนตอนแรก</p>
          </div>
        ) : (
          sorted.map((ch, index) => (
            <div
              key={ch.id}
              className={`${styles.chapterItem} ${dragIdx === index ? styles.chapterItemDragging : ""} ${dragOverIdx === index ? styles.chapterDragOver : ""}`}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <input
                type="checkbox"
                className={styles.chapterCheckbox}
                checked={selected.has(ch.id)}
                onChange={() => toggleSelect(ch.id)}
                aria-label={`เลือกตอนที่ ${ch.order}`}
              />
              <div
                className={styles.dragHandle}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                title="ลากเพื่อจัดเรียง"
              >
                <GripVertical size={14} />
              </div>
              <button
                className={styles.chapterBtn}
                onClick={() => onOpenChapter(ch, false)}
              >
                <div className={styles.orderBadge}>{ch.order}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.chapterTitle}>
                    {ch.title && ch.title.trim() !== ""
                      ? `ตอนที่ ${ch.order} — ${ch.title}`
                      : `ตอนที่ ${ch.order}`}
                  </div>
                  <div className={styles.chapterMeta}>
                    <span className={styles.metaTime}>
                      <Clock size={11} /> {timeAgo(ch.updatedAt)}
                    </span>
                    <span>·</span>
                    <span>{wordCount(ch.content)} คำ</span>
                  </div>
                </div>
                <ChevronRight size={18} color="var(--text-dim)" />
              </button>
            </div>
          ))
        )}
      </div>

      <button className={styles.fab} onClick={onAddChapter} aria-label="เพิ่มตอนใหม่">
        <Plus size={24} />
      </button>
    </div>
  );
}
