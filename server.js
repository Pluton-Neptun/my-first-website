// server.js (Обновленный)
import open from 'open';
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from 'url';
import session from "express-session";
import cors from "cors";
import MongoStore from 'connect-mongo';
import { MongoClient, ObjectId } from "mongodb";
import 'dotenv/config';
import multer from 'multer';
import fs from 'fs';
import { createClient } from 'redis';
import { csrfSync } from 'csrf-sync'; // ✅ ЗАЩИТА CSRF

// --- Инициализация Express ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// --- Настройка CSRF (Защита от атак) ---
const { csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) => {
        if (req.body && req.body._csrf) return req.body._csrf;
        if (req.headers['x-csrf-token']) return req.headers['x-csrf-token'];
        return null;
    }
});

// --- Инициализация Redis (С ЗАЩИТОЙ ОТ СБОЕВ) ---
const redisClient = createClient({ 
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: false // Не пытаться бесконечно подключаться, если нет Redis
    }
});

// Чтобы ошибка Redis не крашила весь сервер
redisClient.on('error', (err) => {
    // Просто выводим в консоль, но не останавливаем сервер
    console.log('⚠️ Redis не подключен (это нормально для локального теста). Кэш выключен.'); 
});

// --- Вспомогательные функции кэширования ---
const DEFAULT_EXPIRATION = 3600; // 1 час кэша

async function setCache(key, value, options = { EX: DEFAULT_EXPIRATION }) {
    if (redisClient.isOpen) { // ✅ Проверяем, работает ли Redis
        try {
            await redisClient.set(key, JSON.stringify(value), options);
        } catch (e) { console.error("Ошибка записи кэша"); }
    }
}

async function getCache(key) {
    if (redisClient.isOpen) { // ✅ Проверяем, работает ли Redis
        try {
            const cachedValue = await redisClient.get(key);
            return cachedValue ? JSON.parse(cachedValue) : null;
        } catch (e) { return null; }
    }
    return null;
}

async function clearCache(key) {
    if (redisClient.isOpen) { // ✅ Проверяем, работает ли Redis
        try {
            if (key.endsWith('*')) { 
                const keys = await redisClient.keys(key);
                if (keys.length > 0) await redisClient.del(keys);
            } else {
                await redisClient.del(key);
            }
        } catch (e) { console.error("Ошибка очистки кэша"); }
    }
}

export { setCache, getCache, clearCache, LOGIN_PAGE_CACHE_KEY }; // Экспортируем для роутов

const LOGIN_PAGE_CACHE_KEY = 'loginPageData';

// Вспомогательная функция для форматирования времени
function formatTime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));

    let parts = [];
    if (hours > 0) parts.push(`${hours}ч`);
    if (minutes > 0) parts.push(`${minutes}м`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}с`);

    return parts.join(' ');
}

// --- Настройка multer для загрузки файлов ---
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, uploadDir); },
    filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); // Добавлено для JSON запросов

const STATIC_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;  
app.use(express.static(path.join(__dirname, "public"), { maxAge: STATIC_MAX_AGE_MS }));
app.use('/uploads', express.static(uploadDir, { maxAge: STATIC_MAX_AGE_MS }));

app.use(session({ 
    secret: "my_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL })
}));

// ✅ Включаем защиту CSRF
app.use(csrfSynchronisedProtection);

// Middleware для передачи токена во все шаблоны (res.locals)
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken(); 
    next();
});

// --- Импорт маршрутов ---
import authRoutes from './routes/authRoutes.js';
import workRoutes from './routes/workRoutes.js';
// Если у вас есть activitiesRoutes, раскомментируйте:
// import activitiesRoutes from './routes/activitiesRoutes.js';

// --- Настройка подключения к базе данных ---
const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

async function connectToDb() {
    try {
        await mongoClient.connect();
        console.log("Успешно подключились к MongoDB");
        
        // Попытка подключить Redis, но не падаем, если не вышло
        try {
            await redisClient.connect();
            console.log("Успешно подключились к Redis");
        } catch (redisError) {
            console.log("⚠️ Redis не доступен локально. Работаем без кэша.");
        }
        
        db = mongoClient.db("my-first-website-db");
        
        // Подключаем маршруты
        app.use('/', authRoutes(db));
        app.use('/work', workRoutes(db, upload)); // Маршруты "Коктейль"
        // app.use('/', activitiesRoutes(db)); // Если нужно

        // Глобальный обработчик ошибок (чтобы сервер не падал)
        app.use((err, req, res, next) => {
            if (err.code === 'EBADCSRFTOKEN') {
                return res.status(403).send('<h2>Ошибка безопасности (CSRF)</h2><p>Попробуйте обновить страницу.</p>');
            }
            console.error(err);
            res.status(500).send('Что-то пошло не так!');
        });
        
        app.listen(PORT, () => {
            console.log(`Сервер запущен: http://localhost:${PORT}`);
            if (!process.env.RENDER) {
                // open(`http://localhost:${PORT}`); // Можно раскомментировать
            }
        });
    } catch (error) {
        console.error("Критическая ошибка запуска:", error);
    }
}

connectToDb();