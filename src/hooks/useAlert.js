import { useState, useCallback, useRef } from "react";

/**
 * Hook that returns an alert function.
 * Usage: const showAlert = useAlert();
 *   await showAlert("บันทึกสำเร็จ!", "success");
 */
export default function useAlert() {
  const [state, setState] = useState({
    open: false,
    message: "",
    variant: "info",
  });
  const resolveRef = useRef(null);

  const showAlert = useCallback((message, variant = "info") => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ open: true, message, variant });
    });
  }, []);

  const handleClose = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  return { ...state, showAlert, handleClose };
}
