/**
 * Shared Game model for MongoDB
 */

import mongoose from 'mongoose';

export const GameSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['bot'], required: true },
    usernames: [{ type: String, required: true, index: true }],
    winnerName: { type: String, default: 'draw', required: true },
    picks: {
      type: Object,
      required: true,
    },
    roomId: { type: String, index: true },
    ownerName: { type: String, required: true, index: true },
    playedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// Create indexes for better query performance
GameSchema.index({ ownerName: 1, playedAt: -1 });
GameSchema.index({ usernames: 1, playedAt: -1 });

export const Game = mongoose.models.Game || mongoose.model('Game', GameSchema);

