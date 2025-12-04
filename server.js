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
import { csrfSync } from 'csrf-sync';

const __filename = fileURLToPath(import.meta.url); 
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// --- CSRF ---
const { csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) => {
        if (req.body && req.body._csrf) return req.body._csrf;
        if (req.headers['x-csrf-token']) return req.headers['x-csrf-token'];
        return null;
    }
});

// --- Redis (Только для Render) ---
const redisClient = createClient({ 
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: { reconnectStrategy: false }
});
redisClient.on('error', (err) => {}); // Глушим ошибки

// Функции кэша (работают только если клиент подключен)
async function setCache(key, value, options = { EX: 3600 }) {
    if (redisClient.isOpen) try { await redisClient.set(key, JSON.stringify(value), options); } catch (e) {}
}
async function getCache(key) { 
    if (redisClient.isOpen) {
        try { return JSON.parse(await redisClient.get(key)); } catch (e) { return null; }
    }
    return null;
}
async function clearCache(key) { 
    if (redisClient.isOpen) {
        try {
            if (key.endsWith('*')) { 
                const keys = await redisClient.keys(key);
                if (keys.length > 0) await redisClient.del(keys);
            } else { await redisClient.del(key); }
        } catch (e) {}
    }
}
export { setCache, getCache, clearCache };
export const LOGIN_PAGE_CACHE_KEY = 'loginPageData';

// --- Multer ---
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), { maxAge: '7d' }));
app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));

app.use(session({
    secret: "my_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL })
}));

app.use(csrfSynchronisedProtection);
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken(); 
    next();
});

import authRoutes from './routes/authRoutes.js'; 
import workRoutes from './routes/workRoutes.js';

// --- ЗАПУСК ---
const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

async function connectToDb() {
    try {
        await mongoClient.connect();
        console.log("✅ MongoDB подключена");
        
        // Включаем Redis ТОЛЬКО если мы на Render
        if (process.env.RENDER) {
            try {
                await redisClient.connect();
                console.log("✅ Redis подключен (Render)");
            } catch (e) { console.log("⚠️ Ошибка Redis на Render"); }
        } else {
            console.log("💻 Локальный режим (без Redis)");
        }
        
        db = mongoClient.db("my-first-website-db");
        app.use('/', authRoutes(db));
        app.use('/work', workRoutes(db, upload));

        app.use((err, req, res, next) => {
            if (err.code === 'EBADCSRFTOKEN') return res.status(403).send('Ошибка безопасности. Обновите страницу.');
            console.error(err);
            res.status(500).send('Ошибка сервера');
        });
        
        app.listen(PORT, () => console.log(`🚀 Сервер: http://localhost:${PORT}`));
    } catch (error) { console.error("Ошибка запуска:", error); }
}
connectToDb();