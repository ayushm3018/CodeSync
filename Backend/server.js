import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

import { PORT } from './src/config.js';
import roomRoutes from './src/routes/roomRoutes.js';
import * as socketHandlers from './src/realtime/socketHandlers.js';
import * as roomService from './src/services/roomService.js';
import * as docService from './src/services/docService.js';
import * as pistonService from './src/infrastructure/pistonService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/rooms', roomRoutes);
app.get('/health', (req, res) => res.json({ message: 'ok', success: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});

docService.init(io);
socketHandlers.register(io);

Promise.all([roomService.restoreFromRedis(), pistonService.loadRuntimes()])
    .then(() => httpServer.listen(PORT, () => console.log(`Server is running on port ${PORT}`)))
    .catch((err) => {
        console.error('Failed to start:', err);
        process.exit(1);
    });
