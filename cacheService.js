// cacheService.js
import { createClient } from 'redis';

const DEFAULT_EXPIRATION = 3600; // 1 час кэша

const redisClient = createClient({ 
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redisClient.on('error', (err) => console.error('Redis Client Error', err)); 

async function connectRedis() {
    try {
        if (!redisClient.isReady) {
            await redisClient.connect(); 
            console.log("Успешно подключились к Redis");
        }
        return redisClient;
    } catch (error) {
        console.error("Не удалось подключиться к Redis", error);
        throw error;
    }
}

async function setCache(key, value, options = { EX: DEFAULT_EXPIRATION }) {
    if (redisClient.isReady) {
        await redisClient.set(key, JSON.stringify(value), options);
    }
}

async function getCache(key) {
    if (redisClient.isReady) {
        const cachedValue = await redisClient.get(key);
        return cachedValue ? JSON.parse(cachedValue) : null;
    }
    return null;
}

async function clearCache(key) {
    if (redisClient.isReady) {
        if (key.endsWith('*')) { 
            const keys = await redisClient.keys(key);
            if (keys.length > 0) {
                await redisClient.del(keys);
            }
        } else {
            await redisClient.del(key);
        }
    }
}

const LOGIN_PAGE_CACHE_KEY = 'loginPageData';

export { 
    connectRedis,
    setCache, 
    getCache, 
    clearCache, 
    LOGIN_PAGE_CACHE_KEY 
};