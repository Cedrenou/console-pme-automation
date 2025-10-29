"use client";
import React from "react";

type LogItemProps = {
  log: {
    timestamp: number;
    message: string;
  };
};

const LogItem: React.FC<LogItemProps> = ({ log }) => {
  const parts = log.message.split(' ');
  const timestamp = new Date(log.timestamp).toLocaleString();
  let level = "INFO"; // default
  let message = log.message;

  // Basic parsing of the log message
  if (parts.length > 2 && parts[2].match(/^(INFO|ERROR|WARN|DEBUG)$/)) {
    level = parts[2];
    message = parts.slice(3).join(' ');
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'text-red-400';
      case 'WARN': return 'text-yellow-400';
      case 'INFO': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="flex items-start py-1">
      <span className="text-gray-500 mr-4 w-40">{timestamp}</span>
      <span className={`font-semibold mr-4 w-16 ${getLevelColor(level)}`}>[{level}]</span>
      <span className="text-gray-300 flex-1">{message}</span>
    </div>
  );
};

export default LogItem; 