import React from "react";
import styles from "./Modal.module.css";

const VARIANT_STYLES = {
  info: { icon: "ℹ️", btnClass: styles.btnConfirmPrimary },
  success: { icon: "✅", btnClass: styles.btnConfirmSuccess },
  error: { icon: "❌", btnClass: styles.btnConfirmDanger },
  warning: { icon: "⚠️", btnClass: styles.btnConfirmPrimary },
};

export default function AlertModal({ open, message, variant = "info", onClose }) {
  if (!open) return null;
  const v = VARIANT_STYLES[variant] || VARIANT_STYLES.info;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.message}>
          {v.icon} {message}
        </p>
        <div className={styles.buttons}>
          <button className={`${styles.btn} ${v.btnClass}`} onClick={onClose}>
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );
}
