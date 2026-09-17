import React, { useState } from 'react';
import { Track, TrackFootprint } from '../types';
import { Settings2, Plus, Trash2, X } from 'lucide-react';

interface TrackManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  activeTrackId: string;
  onAddTrack: (name: string, color: string, mass: number) => void;
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void;
  onDeleteTrack: (trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
}

const PRESET_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
];

export const TrackManagerModal: React.FC<TrackManagerModalProps> = ({
  isOpen,
  onClose,
  tracks,
  activeTrackId,
  onAddTrack,
  onUpdateTrack,
  onDeleteTrack,
  onSelectTrack,
}) => {
  const [newTrackName, setNewTrackName] = useState('');
  const [newTrackColor, setNewTrackColor] = useState(PRESET_COLORS[0]);
  const [newTrackMass, setNewTrackMass] = useState('0.1');

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrackName.trim()) return;
    onAddTrack(newTrackName.trim(), newTrackColor, parseFloat(newTrackMass) || 0.1);
    setNewTrackName('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[3px] max-w-md w-full p-4 text-black">
        <div className="flex items-center justify-between pb-2 border-b border-[#808080]">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-black" />
            <h3 className="font-bold text-sm text-black">Point Mass / Track Manager</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[2px] text-black hover:bg-[#c0bcb4] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Existing Tracks List */}
        <div className="mt-4 space-y-2 max-h-56 overflow-y-auto pr-1">
          {tracks.map((track) => {
            const isActive = track.id === activeTrackId;
            return (
              <div
                key={track.id}
                className={`flex items-center justify-between p-2 rounded-[2px] border text-xs transition-colors ${
                  isActive
                    ? 'bg-[#1e3a5f] text-white border-[#0f1d30]'
                    : 'bg-white text-black border-[#808080]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="color"
                    value={track.color}
                    onChange={(e) => onUpdateTrack(track.id, { color: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                    title="Change Track Color"
                  />
                  <div>
                    <div className={`font-bold ${isActive ? 'text-white' : 'text-black'}`}>{track.name}</div>
                    <div className={`text-[11px] font-mono ${isActive ? 'text-slate-200' : 'text-[#555555]'}`}>
                      m = {track.mass} kg • {track.steps.length} pts
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={track.footprint}
                    onChange={(e) => onUpdateTrack(track.id, { footprint: e.target.value as TrackFootprint })}
                    className="bg-white border border-[#808080] rounded-[2px] px-1.5 py-0.5 text-[11px] text-black font-medium"
                  >
                    <option value="circle">Circle</option>
                    <option value="diamond">Diamond</option>
                    <option value="square">Square</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => onSelectTrack(track.id)}
                    className={`px-2 py-0.5 rounded-[2px] text-[11px] font-semibold transition-colors ${
                      isActive
                        ? 'bg-white text-black border border-[#808080]'
                        : 'bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080]'
                    }`}
                  >
                    {isActive ? 'Active' : 'Select'}
                  </button>

                  {tracks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteTrack(track.id)}
                      className={`p-1 transition-colors ${isActive ? 'text-white hover:text-red-300' : 'text-[#666666] hover:text-[#8b0000]'}`}
                      title="Delete track"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Create New Track Form */}
        <form onSubmit={handleCreate} className="mt-4 pt-3 border-t border-[#808080] space-y-3 text-xs">
          <div className="font-semibold text-black">Add New Track / Particle:</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="e.g. Mass B, Cart, Target"
              value={newTrackName}
              onChange={(e) => setNewTrackName(e.target.value)}
              className="bg-white border border-[#808080] rounded-[2px] px-2.5 py-1 text-xs text-black outline-none font-medium"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-black font-medium">Mass (kg):</span>
              <input
                type="number"
                step="any"
                min="0.001"
                value={newTrackMass}
                onChange={(e) => setNewTrackMass(e.target.value)}
                className="w-16 bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-black font-medium">Color:</span>
              <div className="flex gap-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewTrackColor(c)}
                    className={`w-4 h-4 rounded-full border ${
                      newTrackColor === c ? 'border-black scale-110' : 'border-transparent opacity-85'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!newTrackName.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-[2px] bg-[#1e3a5f] hover:bg-[#152843] disabled:opacity-40 text-white font-semibold transition-colors border border-[#0f1d30]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Track</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
