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
// 1. Импорт защиты
import { csrfSync } from "csrf-sync";

// Импорт сервисов и маршрутов
import { connectRedis } from './cacheService.js';
import authRoutes from './routes/authRoutes.js';
import activitiesRoutes from './routes/activitiesRoutes.js';
import workRoutes from './routes/workRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// --- Настройка multer ---
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, uploadDir); },
    filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage });

function startFileCleanupJob() { console.log("Фоновая задача очистки файлов запущена."); }

app.use(cors()); 
app.use(bodyParser.urlencoded({ extended: true }));

// Настройка статики
app.use(express.static(path.join(__dirname, "public"), { 
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=604800');
        }
    }
}));
app.use('/uploads', express.static(uploadDir, { maxAge: 1000 * 60 * 60 * 24 * 7 }));

// Сессии
app.use(session({
    secret: "my_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL })
}));

// 2. Настройка CSRF (защита форм)
const { csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) => {
        return req.body['_csrf'] || req.headers['x-csrf-token'];
    }
});

// Включаем защиту глобально для всех POST запросов
app.use(csrfSynchronisedProtection);

// Передаем токен во все шаблоны
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

async function connectToDb() {
    try {
        await mongoClient.connect();
        console.log("Успешно подключились к MongoDB");
        await connectRedis(); 
        db = mongoClient.db("my-first-website-db");
        
        // Маршруты
        app.get('/', (req, res) => { 
            // Перенаправляем на логин, чтобы там сгенерировался токен и HTML
            res.redirect('/login');
        });

         app.get('/privacy-policy', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
        });
        
         app.use('/', authRoutes(db));
        app.use('/activities', activitiesRoutes(db)); 
        app.use('/work', workRoutes(db, upload)); 
        
         app.listen(PORT, () => {
            console.log(`Сервер запущен: http://localhost:${PORT}`);
            if (!process.env.RENDER) open(`http://localhost:${PORT}`);
            startFileCleanupJob(); 
        });
    } catch (error) {
        console.error("Ошибка подключения:", error);
        process.exit(1);
    }
}

// Глобальная обработка ошибок (включая ошибку CSRF)
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).send(`
            <h1 style="color:red; text-align:center; margin-top:50px;">Ошибка безопасности (CSRF)</h1>
            <p style="text-align:center;">Ваша сессия устарела или запрос небезопасен.</p>
            <p style="text-align:center;"><a href="/">Вернуться на главную</a></p>
        `);
    }
    console.error(`\n[FATAL ERROR] Path: ${req.path}`);
    console.error(err.stack);
    if (!res.headersSent) res.status(500).send('<h1>Внутренняя ошибка сервера.</h1>');
});

connectToDb();