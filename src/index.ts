import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import mongoose from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import { connectToMongoDB } from './db';
import { setupSocket } from './socket';
import { Game } from './models/Game';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Improved CORS configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const defaultOrigins = ['http://localhost:8081', 'http://localhost:19006', 'exp://localhost:8081'];
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : defaultOrigins;

const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow all origins
    callback(null, true);
  },
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'] as string[],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Username'] as string[],
  optionsSuccessStatus: 204,
};

const io = new SocketIOServer(server, {
  cors: corsConfig,
});
setupSocket(io);

app.use(cors(corsConfig));
app.options('*', cors(corsConfig));
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  if (isDevelopment) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

app.get('/health', (_req, res) => {
	const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
	res.json({ 
		ok: true, 
		service: 'rps-backend', 
		timestamp: new Date().toISOString(),
		mongodb: mongoStatus
	});
});

// Get matches for a specific user
app.get('/api/users/:username/matches', async (req: Request, res: Response) => {
	try {
		const { username } = req.params;
		const limit = parseInt(req.query.limit as string) || 50;
		const skip = parseInt(req.query.skip as string) || 0;

		const matches = await Game.find({
			$or: [
				{ ownerName: username },
				{ usernames: username }
			]
		})
			.sort({ playedAt: -1 })
			.limit(limit)
			.skip(skip)
			.lean();

		const total = await Game.countDocuments({
			$or: [
				{ ownerName: username },
				{ usernames: username }
			]
		});

		const wins = await Game.countDocuments({
			$or: [
				{ ownerName: username, winnerName: username },
				{ usernames: username, winnerName: username }
			]
		});

		const losses = await Game.countDocuments({
			$or: [
				{ ownerName: username, winnerName: { $nin: [username, 'draw'] } },
				{ usernames: username, winnerName: { $nin: [username, 'draw'] } }
			]
		});

		const draws = await Game.countDocuments({
			$or: [
				{ ownerName: username, winnerName: 'draw' },
				{ usernames: username, winnerName: 'draw' }
			]
		});

		res.json({
			username,
			total,
			wins,
			losses,
			draws,
			matches,
		});
	} catch (error: any) {
		console.error('Error fetching user matches:', error);
		res.status(500).json({ error: 'Failed to fetch matches' });
	}
});

// Save result from client (e.g., bot games)
app.post('/api/saveResult', async (req: Request, res: Response) => {
	// Check MongoDB connection
	if (mongoose.connection.readyState !== 1) {
		console.warn('⚠️  Attempted to save match but MongoDB is not connected');
		return res.status(503).json({ 
			error: 'Database not available', 
			message: 'MongoDB connection is not established. Please check server logs.' 
		});
	}

	try {
		const { mode, usernames, winnerName, picks, ownerName, playedAt } = req.body as {
			mode: 'bot';
			usernames: string[];
			winnerName: string;
			picks: any;
			ownerName?: string;
			playedAt?: string;
		};

		// Validation
		if (!mode || mode !== 'bot') {
			return res.status(400).json({ error: 'Invalid mode. Must be "bot"' });
		}
		if (!Array.isArray(usernames) || usernames.length === 0) {
			return res.status(400).json({ error: 'Invalid usernames. Must be a non-empty array' });
		}
		if (!winnerName || typeof winnerName !== 'string') {
			return res.status(400).json({ error: 'Invalid winnerName' });
		}
		if (!picks || typeof picks !== 'object') {
			return res.status(400).json({ error: 'Invalid picks. Must be an object' });
		}

		// Ensure ownerName is set
		const finalOwnerName = ownerName || usernames[0] || 'Unknown';
		
		const doc = await Game.create({
			mode,
			usernames,
			winnerName,
			picks,
			ownerName: finalOwnerName,
			playedAt: playedAt ? new Date(playedAt) : new Date(),
		});

		console.log(`✅ Match saved: ID=${doc._id}, Owner=${finalOwnerName}, Mode=${mode}, Winner=${winnerName}`);
		res.json({ ok: true, id: doc._id, ownerName: finalOwnerName });
	} catch (error: any) {
		console.error('❌ Error saving match result:', error);
		console.error('Error details:', {
			message: error?.message,
			stack: error?.stack,
			name: error?.name,
		});
		const message = error?.message ?? 'Failed to save match result';
		res.status(500).json({ error: message, details: isDevelopment ? error?.stack : undefined });
	}
});

// Per-user scoped endpoint
app.post('/api/users/:username/saveResult', async (req: Request, res: Response) => {
	const { username } = req.params;
	// Check MongoDB connection
	if (mongoose.connection.readyState !== 1) {
		console.warn('⚠️  Attempted to save match but MongoDB is not connected');
		return res.status(503).json({ 
			error: 'Database not available', 
			message: 'MongoDB connection is not established. Please check server logs.' 
		});
	}

	try {
		const { mode, usernames, winnerName, picks, playedAt } = req.body as {
			mode: 'bot';
			usernames: string[];
			winnerName: string;
			picks: any;
			playedAt?: string;
		};

		// Validation
		if (!mode || mode !== 'bot') {
			return res.status(400).json({ error: 'Invalid mode. Must be "bot"' });
		}
		if (!Array.isArray(usernames) || usernames.length === 0) {
			return res.status(400).json({ error: 'Invalid usernames' });
		}
		if (!winnerName || typeof winnerName !== 'string') {
			return res.status(400).json({ error: 'Invalid winnerName' });
		}
		if (!picks || typeof picks !== 'object') {
			return res.status(400).json({ error: 'Invalid picks' });
		}

		const doc = await Game.create({
			mode,
			usernames,
			winnerName,
			picks,
			ownerName: username,
			playedAt: playedAt ? new Date(playedAt) : new Date(),
		});

		console.log(`✅ Match saved for user: ID=${doc._id}, Owner=${username}, Mode=${mode}, Winner=${winnerName}`);
		res.json({ ok: true, id: doc._id, ownerName: username });
	} catch (error: any) {
		console.error('❌ Error saving match result for user:', error);
		console.error('Error details:', {
			username,
			message: error?.message,
			stack: error?.stack,
			name: error?.name,
		});
		const message = error?.message ?? 'Failed to save match result';
		res.status(500).json({ error: message, details: isDevelopment ? error?.stack : undefined });
	}
});

// Error handling middleware (must be after all routes)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

const port = Number(process.env.PORT || 3001);

async function main() {
	const uri = process.env.MONGODB_URI;
	if (!uri) {
		console.warn('⚠️  MONGODB_URI not set. Match saving will fail!');
		console.warn('   Set MONGODB_URI in your .env file to enable match saving.');
	} else {
		try {
			console.log('🔌 Connecting to MongoDB...');
			await connectToMongoDB(uri);
			console.log('✅ MongoDB connected successfully');
		} catch (err) {
			console.error('❌ MongoDB connection failed:', (err as any)?.message ?? err);
			console.error('   Match saving will not work until MongoDB is connected.');
			console.error('   Please check your MONGODB_URI in the .env file.');
		}
	}
	
	server.listen(port, () => {
		console.log(`\n🚀 Server started:`);
		console.log(`   HTTP: http://localhost:${port}`);
		console.log(`   WebSocket: ws://localhost:${port}`);
		console.log(`   MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Not connected'}\n`);
	});
}

main().catch((err) => {
	console.error('Failed to start server:', err);
	process.exit(1);
});


