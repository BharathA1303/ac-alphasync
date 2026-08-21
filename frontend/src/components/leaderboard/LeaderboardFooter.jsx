import React from 'react';
import { Info } from 'lucide-react';

export default function LeaderboardFooter() {
  return (
    <div className="flex justify-center items-center py-8 w-full">
      <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-surface-800 border border-gray-200/80 dark:border-edge/20 rounded-full shadow-sm">
        {/* Flashing Green Dot */}
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        
        {/* Footer text */}
        <span className="text-xs font-semibold text-gray-800 dark:text-slate-200">Live Rankings</span>
        <span className="text-gray-300 dark:text-slate-600 text-xs">•</span>
        <span className="text-xs text-gray-500 dark:text-slate-400">Updated in real-time</span>
        
        {/* Info Icon */}
        <Info className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 cursor-pointer hover:text-gray-600 dark:hover:text-slate-300 transition-colors" />
      </div>
    </div>
  );
}
