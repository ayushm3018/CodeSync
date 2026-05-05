import Redis from 'ioredis';
import { REDIS_HOST, REDIS_PORT } from '../config.js';

export const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
redis.on('error', (err) => console.error('[redis]', err.message));

export const metaKey = (id) => `room:${id}:meta`;
export const docKey = (id) => `room:${id}:doc`;
