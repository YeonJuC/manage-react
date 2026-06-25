export type SaveToastType = "success" | "warning" | "error";

export type SaveToastState = {
  type: SaveToastType;
  text: string;
} | null;

export default function SaveToast({ toast }: { toast: SaveToastState }) {
  if (!toast) return null;

  const icon = toast.type === "success" ? "✓" : toast.type === "warning" ? "!" : "×";

  return (
    <div className={`saveToast saveToast--${toast.type}`} role="status" aria-live="polite">
      <span className="saveToast__icon">{icon}</span>
      <span className="saveToast__text">{toast.text}</span>
    </div>
  );
}
