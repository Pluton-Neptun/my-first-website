const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

// Импортируем вашего клиента Redis. 
// ВАЖНО: Укажите правильный путь к файлу, где вы подключаете Redis!
// Обычно это что-то вроде '../config/redis' или '../db/redis'.
// Если у вас нет отдельного файла, я добавил код создания клиента прямо сюда (см. ниже).
const { createClient } = require('redis'); 

// --- НАСТРОЙКА REDIS КЛИЕНТА (Если не импортируете готового) ---
const client = createClient({
    url: process.env.REDIS_URL // Убедитесь, что эта переменная есть в .env (Render её дает)
});

// Запускаем подключение (нужно для node-redis v4)
client.connect().catch(err => console.error('Redis Client Error', err));
// -------------------------------------------------------------

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 5, // Лимит: 5 попыток
    message: {
        message: "Слишком много попыток регистрации. Попробуйте через час."
    },
    standardHeaders: true,
    legacyHeaders: false,
    
    // Включаем хранилище Redis
    store: new RedisStore({
        // Эта функция отправляет команды в Redis
        sendCommand: (...args) => client.sendCommand(...args),
        // (Опционально) Префикс, чтобы ключи в Redis не путались с другими данными
        prefix: 'rl:register:', 
    }),
});

module.exports = registerLimiter;