// cacheService.js
import { createClient } from 'redis';

export const LOGIN_PAGE_CACHE_KEY = 'login_page_cache'; // Экспортируем ключ
const DEFAULT_EXPIRATION = 3600; // 1 час кэша

// Настройка для Render: если есть REDIS_URL, парсим его
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const clientOptions = {
    url: redisUrl,
    socket: {
        // ВАЖНО ДЛЯ RENDER: Разрешаем самоподписанные сертификаты SSL
        tls: redisUrl.startsWith('rediss://'),
        rejectUnauthorized: false 
    }
};

const redisClient = createClient(clientOptions);

redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Автоматическое подключение при старте
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

// Функция очистки кэша
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

// Экспортируем сам клиент, если нужно
export default redisClient; 