import mongoose from 'mongoose';

export async function connectToMongoDB(uri: string): Promise<void> {
	if (!uri) {
		throw new Error('MONGODB_URI is not set');
	}
	if (mongoose.connection.readyState === 1) {
		console.log('✅ MongoDB already connected');
		return;
	}
	
	try {
		await mongoose.connect(uri, { 
			dbName: 'rps',
			serverSelectionTimeoutMS: 5000,
		});
		console.log('✅ MongoDB connected to database: rps');
	} catch (error: any) {
		console.error('❌ MongoDB connection error:', error.message);
		throw error;
	}
}


