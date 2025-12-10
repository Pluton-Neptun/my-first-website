// middleware/limiter.js
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

// 👇 Импортируем готового клиента из вашего файла!
// ВАЖНО: Проверьте путь. Если cacheService.js лежит в папке выше, то '../cacheService.js'
// Если в той же папке utils, то './cacheService.js'
import redisClient from '../cacheService.js'; 

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 5, // Лимит 5 попыток
    message: { 
        message: "Слишком много попыток регистрации. Попробуйте через час." 
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({ 
        // Передаем клиента из вашего cacheService
        sendCommand: (...args) => redisClient.sendCommand(...args),
        prefix: 'rl:register:', 
    }),
});

export default registerLimiter;