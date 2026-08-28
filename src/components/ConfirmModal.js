import React from "react";
import styles from "./Modal.module.css";

export default function ConfirmModal({
  open,
  message,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  variant = "danger",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const confirmClass =
    variant === "primary"
      ? styles.btnConfirmPrimary
      : variant === "success"
        ? styles.btnConfirmSuccess
        : styles.btnConfirmDanger;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.message}>{message}</p>
        <div className={styles.buttons}>
          <button className={`${styles.btn} ${styles.btnCancel}`} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={confirmClass} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
