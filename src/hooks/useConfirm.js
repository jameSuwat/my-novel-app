import { useState, useCallback, useRef } from "react";

/**
 * Hook that returns a confirm function.
 * Usage: const confirm = useConfirm();
 *   const ok = await confirm("ลบเรื่องนี้จริงหรือ?", "ลบ");
 */
export default function useConfirm() {
  const [state, setState] = useState({
    open: false,
    message: "",
    confirmLabel: "ยืนยัน",
    cancelLabel: "ยกเลิก",
    variant: "danger",
  });
  const resolveRef = useRef(null);

  const confirm = useCallback(
    (message, options = {}) => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        setState({
          open: true,
          message,
          confirmLabel: options.confirmLabel || "ยืนยัน",
          cancelLabel: options.cancelLabel || "ยกเลิก",
          variant: options.variant || "danger",
        });
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  return { ...state, confirm, handleConfirm, handleCancel };
}
