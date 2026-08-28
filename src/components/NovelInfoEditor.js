import React, { useState, useRef } from "react";
import { Image as ImageIcon, X, Trash2 } from "lucide-react";
import styles from "./NovelInfoEditor.module.css";

export default function NovelInfoEditor({ novel, isNew, onSave, onCancel, onDelete }) {
  const [title, setTitle] = useState(
    novel.title === "ยังไม่มีชื่อเรื่อง" ? "" : novel.title || ""
  );
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
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            {isNew ? "สร้างนิยายเรื่องใหม่" : "แก้ไขข้อมูลนิยาย"}
          </span>
          <button className={styles.closeBtn} onClick={onCancel} aria-label="ปิดหน้าต่าง">
            <X size={20} />
          </button>
        </div>

        <div className={styles.coverRow}>
          <button
            className={styles.coverPickBtn}
            onClick={() => fileRef.current?.click()}
            aria-label="เลือกภาพปกจากเครื่อง"
            style={{
              background: cover ? `url(${cover}) center/cover no-repeat` : "var(--bg-card)",
            }}
          >
            {!cover && <ImageIcon size={20} color="var(--text-muted)" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePick} style={{ display: "none" }} />
          <div className={styles.formGroup}>
            <label className={styles.label}>ชื่อเรื่อง</label>
            <input
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ตั้งชื่อนิยายของคุณ"
            />
            <div className={styles.hint}>แตะรูปเพื่อเลือกปกจากเครื่อง</div>
          </div>
        </div>

        <label className={styles.label}>หรือวางลิงก์รูปภาพ (URL)</label>
        <input
          className={styles.inputUrl}
          value={cover && typeof cover === "string" && cover.startsWith("http") ? cover : ""}
          onChange={(e) => setCover(e.target.value)}
          placeholder="https://..."
        />

        <label className={styles.label}>เรื่องย่อ</label>
        <textarea
          className={styles.textarea}
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          rows={5}
          placeholder="เกริ่นเรื่องสั้นๆ ให้ผู้อ่านอยากติดตาม..."
        />

        <div className={styles.actions}>
          {onDelete && (
            <button className={styles.deleteBtn} onClick={onDelete}>
              <Trash2 size={16} /> ลบเรื่องนี้
            </button>
          )}
          <button
            className={styles.saveBtn}
            onClick={() => onSave({ title: title.trim() || "ยังไม่มีชื่อเรื่อง", synopsis, cover })}
          >
            {isNew ? "สร้างและเริ่มเขียน" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
