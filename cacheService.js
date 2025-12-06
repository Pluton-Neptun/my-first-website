// cacheService.js
import { createClient } from 'redis';

export const LOGIN_PAGE_CACHE_KEY = 'login_page_cache'; 
const DEFAULT_EXPIRATION = 3600; // 1 час кэша

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'; 

const clientOptions = {
    url: redisUrl,
    socket: { 
        tls: redisUrl.startsWith('rediss://'),
        rejectUnauthorized: false 
    }
};

const redisClient = createClient(clientOptions);

redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => { 
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
            console.log("✅ Успешно подключились к Redis (cacheService)");
        }
    } catch (err) {
        console.error("❌ Ошибка подключения Redis:", err);
    }
})();

// НОВЫЕ ЭКСПОРТЫ: getCache и setCache
export async function getCache(key) {
    try {
        if (redisClient.isOpen) {
            const data = await redisClient.get(key);
            if (data !== null) {
                return JSON.parse(data);
            }
        }
        return null;
    } catch (err) {
        console.error('Error getting cache:', err);
        return null;
    }
}

export async function setCache(key, value, duration = DEFAULT_EXPIRATION) {
    try {
        if (redisClient.isOpen) {
            await redisClient.setEx(key, duration, JSON.stringify(value));
        }
    } catch (err) {
        console.error('Error setting cache:', err);
    }
}

// Существующий экспорт:
export async function clearCache(key) {
    try {
        if (redisClient.isOpen) {
            await redisClient.del(key);
            console.log(`Cache cleared for key: ${key}`);
        }
    } catch (err) {
        console.error('Error clearing cache:', err);
    }
}

export default redisClient;