import express from 'express';
import * as roomService from '../services/roomService.js';

async function createRoom(req, res) {
    const { creator } = req.body || {};
    if (!creator || typeof creator !== 'string' || !creator.trim()) {
        return res.status(400).json({ error: 'creator (username) required' });
    }
    const room = await roomService.createRoom(creator);
    res.json(room);
}

function getRoom(req, res) {
    const room = roomService.get(req.params.id);
    if (!room) return res.status(404).json({ exists: false });
    res.json({ exists: true, creator: room.creator });
}

const router = express.Router();
router.post('/', createRoom);
router.get('/:id', getRoom);

export default router;
