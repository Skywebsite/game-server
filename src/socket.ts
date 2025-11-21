import { Server } from 'socket.io';

type Player = { id: string; name: string };
type RoomState = { id: string; status: 'waiting' | 'playing'; players: Player[] };

const roomIdToState = new Map<string, RoomState>();

export function setupSocket(io: Server) {
	io.on('connection', (socket) => {
		console.log('✅ New socket connection:', socket.id);
		
		socket.on('joinRoom', ({ roomId, name }: { roomId: string; name: string }) => {
			console.log('📥 joinRoom request:', { roomId, name, socketId: socket.id });
			if (!roomId) {
				console.warn('⚠️ joinRoom called without roomId');
				return;
			}
			let room = roomIdToState.get(roomId);
			if (!room) {
				console.log('🆕 Creating new room:', roomId);
				room = { id: roomId, status: 'waiting', players: [] };
				roomIdToState.set(roomId, room);
			} else {
				console.log('📂 Joining existing room:', roomId, 'Current players:', room.players.length);
			}
			// Check if player is already in the room to prevent duplicates
			const existingPlayer = room.players.find((p) => p.id === socket.id);
			if (existingPlayer) {
				// Player already in room, just update their name and send room update
				existingPlayer.name = name || 'Player';
				socket.join(roomId);
				// Send room update to the specific socket that just joined (in case they missed previous updates)
				socket.emit('roomUpdate', { status: room.status, players: room.players.map((p) => ({ id: p.id, name: p.name })) });
				// Also broadcast to all players in the room
				io.to(roomId).emit('roomUpdate', { status: room.status, players: room.players.map((p) => ({ id: p.id, name: p.name })) });
				return;
			}
			if (room.players.length >= 4) {
				socket.emit('roomFull');
				return;
			}
			room.players.push({ id: socket.id, name: name || 'Player' });
			socket.join(roomId);
			// Only set status to 'waiting' if it's not already 'playing'
			if (room.status !== 'playing') {
				room.status = 'waiting';
			}
			const playerList = room.players.map((p) => ({ id: p.id, name: p.name }));
			console.log('✅ Player joined room:', { roomId, playerId: socket.id, playerName: name, totalPlayers: playerList.length, status: room.status });
			// Send room update to all players in the room
			io.to(roomId).emit('roomUpdate', { status: room.status, players: playerList });
			console.log('📤 Emitted roomUpdate to room:', roomId, 'Players:', playerList);
		});

		socket.on('startGame', ({ roomId }: { roomId: string }) => {
			const room = roomIdToState.get(roomId);
			if (!room) return;
			// Check if requester is the room creator (first player)
			const isCreator = room.players.length > 0 && room.players[0].id === socket.id;
			if (!isCreator) {
				socket.emit('error', { message: 'Only the room creator can start the game' });
				return;
			}
			if (room.players.length < 2) {
				socket.emit('error', { message: 'Need at least 2 players to start' });
				return;
			}
			// Update room status and broadcast gameStarted to all players
			room.status = 'playing';
			io.to(roomId).emit('gameStarted');
			io.to(roomId).emit('roomUpdate', { status: room.status, players: room.players.map((p) => ({ id: p.id, name: p.name })) });
		});

		// Handle player choices in multiplayer game
		socket.on('playerChoice', ({ roomId, playerId, choice }: { roomId: string; playerId: string; choice: string }) => {
			const room = roomIdToState.get(roomId);
			if (!room) return;

			console.log(`🎯 Player ${playerId} chose ${choice} in room ${roomId}`);

			// Broadcast the choice to all players in the room
			io.to(roomId).emit('playerChoice', { playerId, choice });
		});

		// Handle Truth or Dare events
		socket.on('td_choice', ({ roomId, choice }: { roomId: string; choice: 'truth' | 'dare' }) => {
			io.to(roomId).emit('td_choice', { playerId: socket.id, choice });
		});

		socket.on('td_challenge', ({ roomId, loserId, winnerId, text }: { roomId: string; loserId: string; winnerId: string; text: string }) => {
			io.to(roomId).emit('td_challenge', { loserId, winnerId, text });
		});

		socket.on('td_complete', ({ roomId }: { roomId: string }) => {
			io.to(roomId).emit('td_complete');
		});

		socket.on('td_toggle', ({ roomId, enabled }: { roomId: string; enabled: boolean }) => {
			io.to(roomId).emit('td_toggle', { enabled });
		});

		socket.on('td_response', ({ roomId, loserId, response }: { roomId: string; loserId: string; response: string }) => {
			io.to(roomId).emit('td_response', { loserId, response });
		});

		socket.on('disconnect', () => {
			console.log('🔌 Socket disconnected:', socket.id);
			for (const [roomId, room] of roomIdToState.entries()) {
				const before = room.players.length;
				room.players = room.players.filter((p) => p.id !== socket.id);
				if (room.players.length === 0) {
					console.log('🗑️ Room deleted (no players):', roomId);
					roomIdToState.delete(roomId);
				} else if (before !== room.players.length) {
					console.log('👋 Player left room:', { roomId, remainingPlayers: room.players.length });
					room.status = 'waiting';
					io.to(roomId).emit('roomUpdate', { status: room.status, players: room.players.map((p) => ({ id: p.id, name: p.name })) });
				}
			}
		});
	});
}
