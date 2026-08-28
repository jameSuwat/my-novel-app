import React, { useState, useEffect, useRef } from "react";
import styles from "./Modal.module.css";

export default function PromptModal({
  open,
  message,
  defaultValue = "",
  confirmLabel = "ตกลง",
  cancelLabel = "ยกเลิก",
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, defaultValue]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.message}>{message}</p>
        <input
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm(value);
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className={styles.buttons}>
          <button className={`${styles.btn} ${styles.btnCancel}`} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`${styles.btn} ${styles.btnConfirmPrimary}`}
            onClick={() => onConfirm(value)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
