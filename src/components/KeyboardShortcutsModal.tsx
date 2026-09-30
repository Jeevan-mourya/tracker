import React, { useState, useMemo } from 'react';
import {
  Keyboard,
  X,
  Search,
  Film,
  Crosshair,
  Move,
  Eye,
  Play,
  RotateCcw,
  Sparkles,
  Command,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  id: string;
  category: 'navigation' | 'tracking' | 'playback' | 'viewport' | 'tools';
  title: string;
  keys: string[];
  description: string;
  badge?: string;
}

const SHORTCUTS_DATA: ShortcutItem[] = [
  // Frame Navigation
  {
    id: 'frame-next',
    category: 'navigation',
    title: 'Step Forward 1 Frame',
    keys: ['→'],
    description: 'Advances the video clip by 1 step (respects Clip step size setting).',
    badge: 'Navigation',
  },
  {
    id: 'frame-prev',
    category: 'navigation',
    title: 'Step Backward 1 Frame',
    keys: ['←'],
    description: 'Steps back the video clip by 1 step.',
    badge: 'Navigation',
  },
  {
    id: 'frame-jump-next',
    category: 'navigation',
    title: 'Jump Forward 5 Frames',
    keys: ['Shift', '→'],
    description: 'Rapidly skips forward 5 frames for fast range footage review.',
    badge: 'Fast Scrub',
  },
  {
    id: 'frame-jump-prev',
    category: 'navigation',
    title: 'Jump Backward 5 Frames',
    keys: ['Shift', '←'],
    description: 'Rapidly skips backward 5 frames.',
    badge: 'Fast Scrub',
  },
  {
    id: 'frame-home',
    category: 'navigation',
    title: 'Jump to Start Frame',
    keys: ['Home'],
    description: 'Immediately rewinds to the first clip frame (start frame).',
  },
  {
    id: 'frame-end',
    category: 'navigation',
    title: 'Jump to End Frame',
    keys: ['End'],
    description: 'Immediately jumps to the final clip frame (end frame).',
  },

  // Point Tracking
  {
    id: 'track-mark-point',
    category: 'tracking',
    title: 'Mark Point Mass (Shift+Click)',
    keys: ['Shift', 'Left Click'],
    description: 'Marks a coordinate point at the crosshair cursor and auto-advances if enabled (Tracker OSP rule).',
    badge: 'Essential',
  },
  {
    id: 'track-undo',
    category: 'tracking',
    title: 'Undo Last Point',
    keys: ['Ctrl', 'Z'],
    description: 'Removes the most recently marked point step on the active track (or ⌘+Z on Mac).',
    badge: 'Undo',
  },
  {
    id: 'track-delete-point',
    category: 'tracking',
    title: 'Delete Point at Current Frame',
    keys: ['Delete'],
    description: 'Deletes the point mass coordinate registered on the current video frame (Backspace also works).',
    badge: 'Delete',
  },
  {
    id: 'track-clear-all',
    category: 'tracking',
    title: 'Clear All Points on Active Track',
    keys: ['Ctrl', 'Shift', 'Delete'],
    description: 'Wipes all recorded coordinate points for the selected mass while preserving track metadata.',
  },
  {
    id: 'track-switch',
    category: 'tracking',
    title: 'Switch Active Track',
    keys: ['Tab'],
    description: 'Cycles to the next Point Mass track (or Shift+Tab for previous track).',
  },

  // Playback Controls
  {
    id: 'play-toggle',
    category: 'playback',
    title: 'Play / Pause Video',
    keys: ['Space'],
    description: 'Toggles video playback at current playback speed (0.1× to 2.0×).',
    badge: 'Playback',
  },
  {
    id: 'play-forward',
    category: 'playback',
    title: 'Shuttle Forward',
    keys: ['L'],
    description: 'Industry-standard shuttle forward / speed-up hotkey.',
  },
  {
    id: 'play-pause',
    category: 'playback',
    title: 'Pause Playback',
    keys: ['K'],
    description: 'Pauses playback immediately.',
  },
  {
    id: 'play-reverse',
    category: 'playback',
    title: 'Shuttle Reverse',
    keys: ['J'],
    description: 'Shuttles backwards frame-by-frame.',
  },

  // Viewport & Zoom Navigation
  {
    id: 'view-scroll-zoom',
    category: 'viewport',
    title: 'Mouse Wheel Zoom (20% – 1600%)',
    keys: ['Mouse Wheel'],
    description: 'Smoothly zooms into the video scene centered directly at your mouse cursor for sub-pixel scrutiny.',
    badge: 'Ballistics',
  },
  {
    id: 'view-right-click-pan',
    category: 'viewport',
    title: 'Right-Click Drag (Pan Scene)',
    keys: ['Right Click + Drag'],
    description: 'Moves/pans the video scene freely across the viewport without opening the browser context menu.',
    badge: 'Pan',
  },
  {
    id: 'view-space-drag',
    category: 'viewport',
    title: 'Spacebar Drag (Pan Alternate)',
    keys: ['Space + Drag'],
    description: 'Hold Space and drag with left mouse button to pan (standard CAD / Photoshop hotkey).',
  },
  {
    id: 'view-fit',
    category: 'viewport',
    title: 'Fit Video to Viewport',
    keys: ['F'],
    description: 'Automatically centers and scales the video to fit snugly within the workspace container.',
  },

  // Tools & Overlays
  {
    id: 'tool-loupe',
    category: 'tools',
    title: 'Toggle Magnifier Loupe (4×)',
    keys: ['M'],
    description: 'Toggles the 4× Optical Loupe showing the underlying raw video frame with dual-contrast reticle.',
    badge: 'Optical',
  },
  {
    id: 'tool-axes',
    category: 'tools',
    title: 'Toggle Coordinate Axes',
    keys: ['A'],
    description: 'Toggles Cartesian coordinate axes origin (0, 0) and rotation angle handle.',
  },
  {
    id: 'tool-calibration',
    category: 'tools',
    title: 'Toggle Calibration Stick',
    keys: ['C'],
    description: 'Toggles the 2-point physical calibration reference stick ($L = 1.0\\text{ m}$).',
  },
  {
    id: 'tool-vectors',
    category: 'tools',
    title: 'Toggle Kinematic Vectors',
    keys: ['V'],
    description: 'Toggles dynamic Velocity ($\\vec{v}$) and Acceleration ($\\vec{a}$) vector arrows on marked steps.',
  },
  {
    id: 'tool-trails',
    category: 'tools',
    title: 'Toggle Trajectory Trails',
    keys: ['T'],
    description: 'Toggles the continuous path line connecting consecutive recorded point positions.',
  },
  {
    id: 'tool-help',
    category: 'tools',
    title: 'Show Keyboard Shortcuts Modal',
    keys: ['?'],
    description: 'Opens this shortcuts overview cheat sheet anytime (F1 also works).',
    badge: 'Help',
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Shortcuts' },
  { id: 'navigation', label: 'Frame Navigation', icon: Film },
  { id: 'tracking', label: 'Point Tracking', icon: Crosshair },
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'viewport', label: 'Zoom & Pan', icon: Move },
  { id: 'tools', label: 'Tools & Overlays', icon: Eye },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredShortcuts = useMemo(() => {
    return SHORTCUTS_DATA.filter((item) => {
      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keys.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-5 backdrop-blur-[2px] select-none"
    >
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[4px] max-w-3xl w-full max-h-[92vh] flex flex-col text-black shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#d4d0c8] border-b border-[#808080] shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-[3px] bg-[#1e3a5f] text-white">
              <Keyboard className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3
                id="shortcuts-modal-title"
                className="font-bold text-sm text-black flex items-center gap-2"
              >
                <span>Overview of Keyboard Shortcuts</span>
                <span className="px-1.5 py-0.2 bg-[#1e3a5f] text-white rounded text-[10px] font-mono">
                  {SHORTCUTS_DATA.length} Hotkeys
                </span>
              </h3>
              <p className="text-[11px] text-[#444444]">
                High-speed video tracking &bull; Sub-pixel marking &bull; Frame-by-frame navigation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[2px] text-black hover:bg-[#c0bcb4] transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Category Filter Toolbar */}
        <div className="px-4 py-2.5 bg-[#e0ded8] border-b border-[#808080] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          {/* Search Box */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#666666] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcut (e.g. frame, undo, zoom)..."
              className="w-full pl-8 pr-3 py-1 bg-white border border-[#808080] rounded-[2px] text-xs text-black placeholder:text-[#888888] outline-none focus:border-[#1e3a5f]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666666] hover:text-black text-xs cursor-pointer"
              >
                &times;
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2 py-1 rounded-[2px] text-[11px] font-semibold transition-colors shrink-0 cursor-pointer border ${
                  selectedCategory === cat.id
                    ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-xs'
                    : 'bg-[#efefef] hover:bg-[#dcdcdc] text-black border-[#808080]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Shortcuts Table / Card List */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#f4f2ee] space-y-2">
          {filteredShortcuts.length === 0 ? (
            <div className="text-center py-10 text-[#666666] space-y-1">
              <Keyboard className="w-8 h-8 mx-auto text-[#999999] opacity-60 mb-2" />
              <p className="font-bold text-xs text-black">No shortcuts matched &ldquo;{searchQuery}&rdquo;</p>
              <p className="text-[11px]">Try searching for &ldquo;frame&rdquo;, &ldquo;undo&rdquo;, or &ldquo;zoom&rdquo;</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {filteredShortcuts.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-[#808080] rounded-[3px] p-2.5 shadow-xs flex flex-col justify-between hover:border-[#1e3a5f] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="space-y-0.5">
                      <span className="font-bold text-xs text-black block leading-tight">
                        {item.title}
                      </span>
                      <p className="text-[11px] text-[#555555] leading-snug">
                        {item.description}
                      </p>
                    </div>
                    {item.badge && (
                      <span className="px-1.5 py-0.2 bg-[#f0f4f8] text-[#1e3a5f] border border-[#cbd5e1] rounded text-[9px] font-bold shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </div>

                  {/* Key Combo Badges */}
                  <div className="flex items-center gap-1 pt-1.5 border-t border-[#f0f0f0]">
                    {item.keys.map((k, idx) => (
                      <React.Fragment key={idx}>
                        <kbd className="px-2 py-0.5 bg-[#f0ede6] hover:bg-[#e4e0d7] border border-[#a09c94] border-b-2 rounded-[3px] text-[11px] font-mono font-bold text-black shadow-xs tracking-wide">
                          {k}
                        </kbd>
                        {idx < item.keys.length - 1 && (
                          <span className="text-[#888888] font-bold text-xs">+</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Tips Footer */}
        <div className="px-4 py-2.5 bg-[#d4d0c8] border-t border-[#808080] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shrink-0 text-[11px] text-[#444444]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>
              <strong>Tip:</strong> Press <kbd className="px-1.5 py-0.2 bg-white border border-[#808080] rounded text-[10px] font-mono font-bold text-black">?</kbd> anywhere to toggle this shortcuts reference.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black font-bold text-xs rounded-[2px] transition-colors cursor-pointer self-end sm:self-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
