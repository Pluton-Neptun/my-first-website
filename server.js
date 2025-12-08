// server.js (Обновленный)
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from 'url';
import session from "express-session";
import cors from "cors";
import MongoStore from 'connect-mongo';
import { MongoClient } from "mongodb";
import 'dotenv/config';
import multer from 'multer';
import fs from 'fs';
import { csrfSync } from 'csrf-sync';

// --- ИМПОРТЫ ДЛЯ ГЕНЕРАЦИИ КАРТЫ САЙТА ---
import { SitemapStream, streamToPromise } from 'sitemap';
import { createGzip } from 'zlib';
// -----------------------------------------

// Подключаем файлы маршрутов
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import activitiesRoutes from './routes/activitiesRoutes.js';
import workRoutes from './routes/workRoutes.js';
import mainRoutes from './routes/mainRoutes.js';
import eveningRoutes from './routes/eveningRoutes.js';

// Подключаем сервис кэширования
import './cacheService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// Важно для Render и Cloudflare (чтобы правильно определялся IP и протокол)
app.set('trust proxy', 1);

// Настройка защиты от CSRF атак
const { csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) => {
        if (req.body && req.body._csrf) return req.body._csrf;
        if (req.headers['x-csrf-token']) return req.headers['x-csrf-token'];
        return null;
    }
});

// Папка для загрузок (используется как резерв или для других маршрутов)
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Настройка Multer (сохранение на диск)
const uploadDisk = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
    })
});

// Основные настройки Express
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(uploadDir));

// Настройка сессий (храним в MongoDB)
app.use(session({
    secret: process.env.SESSION_SECRET || "my_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL }),
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true только на сервере (HTTPS)
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 1 день
    }
}));

// Включаем CSRF защиту
app.use(csrfSynchronisedProtection);
app.use((req, res, next) => { res.locals.csrfToken = req.csrfToken(); next(); });

// Подключение к базе данных
const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

async function connectToDb() {
    try {
        await mongoClient.connect();
        console.log("✅ Успешно подключились к MongoDB");

        db = mongoClient.db("my-first-website-db");

        // ============================================================
        // 🗺️ АВТОМАТИЧЕСКАЯ ГЕНЕРАЦИЯ SITEMAP.XML
        // ============================================================
        app.get('/sitemap.xml', async (req, res) => {
            res.header('Content-Type', 'application/xml');
            res.header('Content-Encoding', 'gzip');

            try {
                const smStream = new SitemapStream({ hostname: 'https://mikky.kz' });
                const pipeline = smStream.pipe(createGzip());

                // 1. Статические страницы
                smStream.write({ url: '/', changefreq: 'daily', priority: 1.0 });
                smStream.write({ url: '/login', changefreq: 'monthly', priority: 0.8 });
                smStream.write({ url: '/register.html', changefreq: 'monthly', priority: 0.8 });

                // 2. Страница "Вечер" (Она публичная, поэтому добавляем)
                smStream.write({ url: '/evening', changefreq: 'daily', priority: 0.8 });

                // 3. Активности (берем список из вашего файла activitiesRoutes)
                const myActivities = [
                    "Шахматы",
                    "Футбол",
                    "Танцы",
                    "Хоккей",
                    "Волейбол",
                    "Походы",
                    "Путешествие"
                ];

                for (const name of myActivities) {
                    smStream.write({
                        url: `/activities/${encodeURIComponent(name)}`,
                        changefreq: 'weekly',
                        priority: 0.9
                    });
                }

                // Завершаем поток и отправляем ответ
                smStream.end();
                streamToPromise(pipeline).then(sm => res.send(sm));

            } catch (error) {
                console.error("❌ Ошибка генерации Sitemap:", error);
                res.status(500).end();
            }
        });
        // ============================================================

        // Подключаем маршруты приложения
        app.use('/', mainRoutes(db));
        app.use('/', authRoutes(db));
        app.use('/profile', profileRoutes(db));
        app.use('/activities', activitiesRoutes(db));
        app.use('/work', workRoutes(db, uploadDisk)); // workRoutes использует свою память, но передаем uploadDisk для совместимости
        app.use('/evening', eveningRoutes(db));

        // Запуск сервера
        app.listen(PORT, () => console.log(`🚀 Сервер запущен: http://localhost:${PORT}`));

    } catch (error) {
        console.error("❌ Ошибка запуска сервера:", error);
    }
}
connectToDb();