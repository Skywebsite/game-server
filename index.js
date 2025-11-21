/* Minimal Express server with MongoDB (Mongoose) storing match scores/history */
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// Mongo connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rps';
mongoose
  .connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || undefined })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error', err));

const MatchSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['bot'], required: true },
    usernames: { type: [String], index: true, required: true },
    winnerName: { type: String, required: true }, // 'draw' when draw
    picks: { type: Object, required: true },
    roomId: { type: String },
    playedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Match = mongoose.model('Match', MatchSchema);

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Save result (used by the app)
app.post('/api/saveResult', async (req, res) => {
  try {
    const { mode, usernames, winnerName, picks, roomId, playedAt } = req.body || {};
    if (!mode || !Array.isArray(usernames) || !winnerName || !picks) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const doc = await Match.create({
      mode,
      usernames,
      winnerName,
      picks,
      roomId,
      playedAt: playedAt ? new Date(playedAt) : new Date(),
    });
    res.json({ ok: true, id: doc._id });
  } catch (e) {
    console.error('saveResult error', e);
    res.status(500).json({ error: 'Failed to save' });
  }
});

// Alias endpoint requested: /api/score (POST behaves same as save; GET returns summary)
app.post('/api/score', async (req, res) => {
  try {
    const { mode, usernames, winnerName, picks, roomId, playedAt } = req.body || {};
    if (!mode || !Array.isArray(usernames) || !winnerName || !picks) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const doc = await Match.create({
      mode,
      usernames,
      winnerName,
      picks,
      roomId,
      playedAt: playedAt ? new Date(playedAt) : new Date(),
    });
    res.json({ ok: true, id: doc._id });
  } catch (e) {
    console.error('score POST error', e);
    res.status(500).json({ error: 'Failed to save' });
  }
});

// GET /api/score?username=Alex -> summary + recent history
app.get('/api/score', async (req, res) => {
  try {
    const username = (req.query.username || '').toString();
    if (!username) {
      const count = await Match.countDocuments();
      const recent = await Match.find().sort({ createdAt: -1 }).limit(20).lean();
      return res.json({ totalMatches: count, recent });
    }
    const recent = await Match.find({ usernames: username }).sort({ createdAt: -1 }).limit(20).lean();
    const total = await Match.countDocuments({ usernames: username });
    const wins = await Match.countDocuments({ usernames: username, winnerName: username });
    const draws = await Match.countDocuments({ usernames: username, winnerName: 'draw' });
    const losses = total - wins - draws;
    res.json({ username, total, wins, losses, draws, recent });
  } catch (e) {
    console.error('score GET error', e);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});


