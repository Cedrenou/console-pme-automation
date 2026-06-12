"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { FaCommentAlt, FaTimes, FaBug, FaLightbulb, FaQuestionCircle, FaImage, FaPaperclip, FaCheck } from "react-icons/fa";
import { submitFeedback, type FeedbackType, type FeedbackScreenshot } from "@/lib/api";

const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024; // 3 MB raw — tient sous la limite Lambda sync (6 MB) une fois encodé en base64.

type LocalScreenshot = FeedbackScreenshot & { dataUrl: string; sizeKb: number };

const fileToScreenshot = (file: File): Promise<LocalScreenshot> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] || "";
      resolve({
        name: file.name || "capture.png",
        contentType: file.type || "image/png",
        base64,
        dataUrl,
        sizeKb: Math.round(file.size / 1024),
      });
    };
    reader.readAsDataURL(file);
  });

const TYPES: { value: FeedbackType; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: "bug", label: "Bug", icon: <FaBug />, hint: "Quelque chose ne marche pas comme prévu" },
  { value: "evolution", label: "Évolution", icon: <FaLightbulb />, hint: "Une amélioration / nouvelle fonctionnalité" },
  { value: "question", label: "Question", icon: <FaQuestionCircle />, hint: "Une question ou une demande d'info" },
];

const FeedbackButton = () => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [screenshot, setScreenshot] = useState<LocalScreenshot | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const reset = () => {
    setType("bug");
    setTitle("");
    setDescription("");
    setUrgent(false);
    setError(null);
    setSubmitting(false);
    setScreenshot(null);
    setDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const showSuccessToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastVisible(true);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 3000);
  };

  const ingestFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Seules les images sont acceptées en pièce jointe.");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError(`Image trop lourde (${(file.size / 1024 / 1024).toFixed(1)} MB, max 3 MB).`);
      return;
    }
    try {
      const shot = await fileToScreenshot(file);
      setScreenshot(shot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lecture de l'image impossible");
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setTimeout(reset, 200);
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            void ingestFile(file);
            break;
          }
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    window.addEventListener("paste", handlePaste);
    titleInputRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("paste", handlePaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3) {
      setError("Le titre doit faire au moins 3 caractères.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitFeedback({
        type,
        title: cleanTitle,
        description: description.trim() || undefined,
        urgent,
        page: pathname || undefined,
        screenshot: screenshot
          ? { name: screenshot.name, contentType: screenshot.contentType, base64: screenshot.base64 }
          : undefined,
      });
      setOpen(false);
      setTimeout(reset, 200);
      showSuccessToast();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Signaler un problème ou faire une demande"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-blue-600/20 hover:text-blue-300 transition-colors"
      >
        <FaCommentAlt />
        Signaler / Demander
      </button>

      {mounted && open && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
          onClick={handleClose}
        >
          <div
            className="relative w-full max-w-lg rounded-xl bg-card text-fg shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-edge">
              <h2 id="feedback-title" className="text-lg font-semibold flex items-center gap-2">
                <FaCommentAlt className="text-blue-400" />
                Signaler / Demander
              </h2>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                aria-label="Fermer"
                className="p-1.5 rounded-md text-gray-400 hover:text-fg hover:bg-edge transition-colors disabled:opacity-50"
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-gray-300 mb-1">Type de demande</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setType(t.value)}
                        aria-pressed={type === t.value}
                        title={t.hint}
                        className={`flex flex-col items-center gap-1 px-3 py-3 rounded-lg border transition-colors text-sm ${
                          type === t.value
                            ? "border-blue-500 bg-blue-500/10 text-blue-300"
                            : "border-edge bg-card-2 text-gray-300 hover:border-edge-strong hover:bg-edge"
                        }`}
                      >
                        <span className="text-lg">{t.icon}</span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="feedback-title-input" className="text-sm font-medium text-gray-300">
                    Titre <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="feedback-title-input"
                    ref={titleInputRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    required
                    placeholder="Résume ta demande en une phrase"
                    className="px-3 py-2 rounded-lg bg-app border border-edge focus:border-blue-500 focus:outline-none text-sm placeholder-gray-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="feedback-desc-input" className="text-sm font-medium text-gray-300">
                    Description <span className="text-gray-500 font-normal">(optionnel)</span>
                  </label>
                  <textarea
                    id="feedback-desc-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={5000}
                    rows={5}
                    placeholder="Étapes pour reproduire, contexte, copier-coller d'erreur, etc."
                    className="px-3 py-2 rounded-lg bg-app border border-edge focus:border-blue-500 focus:outline-none text-sm placeholder-gray-500 resize-none"
                  />
                  <div className="text-xs text-gray-500 self-end">{description.length} / 5000</div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Capture d&apos;écran <span className="text-gray-500 font-normal">(optionnel)</span>
                  </label>
                  {screenshot ? (
                    <div className="relative group rounded-lg overflow-hidden border border-edge bg-app">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={screenshot.dataUrl}
                        alt="Aperçu de la capture"
                        className="w-full max-h-64 object-contain bg-black/30"
                      />
                      <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-400 border-t border-edge">
                        <span className="truncate flex items-center gap-1.5">
                          <FaPaperclip className="text-gray-500" />
                          {screenshot.name} · {screenshot.sizeKb} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => setScreenshot(null)}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                          aria-label="Retirer la capture"
                        >
                          <FaTimes />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) void ingestFile(file);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label="Glisser une image, coller depuis le presse-papier ou cliquer pour parcourir"
                      className={`flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-sm ${
                        dragActive
                          ? "border-blue-500 bg-blue-500/10 text-blue-300"
                          : "border-edge bg-card-2 text-gray-400 hover:border-edge-strong hover:bg-edge"
                      }`}
                    >
                      <FaImage className="text-2xl" />
                      <div className="text-center">
                        <div>Glisse une image, <span className="font-medium text-gray-200">colle</span> (Ctrl+V) ou clique pour parcourir</div>
                        <div className="text-xs text-gray-500 mt-0.5">PNG / JPG / GIF — max 3 MB</div>
                      </div>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void ingestFile(file);
                    }}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={urgent}
                    onChange={(e) => setUrgent(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-app accent-orange-500"
                  />
                  Marquer comme urgent
                </label>

                {error && (
                  <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-edge transition-colors disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || title.trim().length < 3}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Envoi…" : "Envoyer"}
                  </button>
                </div>
              </form>
          </div>
        </div>,
        document.body
      )}

      {mounted && createPortal(
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-6 right-6 z-[70] flex items-center gap-4 px-6 py-4 rounded-xl bg-green-600 text-white shadow-2xl ring-1 ring-green-300/40 transition-all duration-300 ${
            toastVisible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-3 scale-95 pointer-events-none"
          }`}
        >
          <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg">
            <FaCheck />
          </span>
          <div className="flex flex-col">
            <span className="text-base font-semibold leading-tight">Merci, c&apos;est envoyé !</span>
            <span className="text-sm text-green-100/90 leading-tight">Ton ticket a bien été créé.</span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default FeedbackButton;
