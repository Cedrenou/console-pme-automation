"use client";
import React, { useState } from "react";
import { FaRegCopy, FaCheck } from "react-icons/fa";

export const CopyableId: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Clipboard write failed", err);
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{value}</span>
      <button
        type="button"
        onClick={handleCopy}
        className={`cursor-pointer p-1 rounded transition-colors ${
          copied ? "bg-green-500/20 text-green-400" : "text-gray-500 hover:text-blue-300 hover:bg-blue-600/15"
        }`}
        aria-label="Copier la valeur"
        title={copied ? "Copié !" : "Copier"}
      >
        {copied ? <FaCheck className="text-[11px]" /> : <FaRegCopy className="text-[11px]" />}
      </button>
    </span>
  );
};
