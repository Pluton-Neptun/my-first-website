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

// Подключаем наши роуты
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import activitiesRoutes from './routes/activitiesRoutes.js';
import workRoutes from './routes/workRoutes.js';
import mainRoutes from './routes/mainRoutes.js';
import eveningRoutes from './routes/eveningRoutes.js';

// Импорт сервиса кэширования (чтобы Redis подключился при старте)
import './cacheService.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// 1. ВАЖНО ДЛЯ CLOUDFLARE И RENDER
// Это заставляет Express доверять заголовкам от прокси
app.set('trust proxy', 1);

const { csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) => {
        if (req.body && req.body._csrf) return req.body._csrf;
        if (req.headers['x-csrf-token']) return req.headers['x-csrf-token'];
        return null;
    }
});

// Настройка папки загрузок
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
})});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(uploadDir));

// Сессии храним в MongoDB (это надежно)
app.use(session({
    secret: process.env.SESSION_SECRET || "my_secret_key", // Лучше вынести в .env
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL }),
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true на Render (HTTPS), false локально
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 1 день
    }
}));

app.use(csrfSynchronisedProtection);
app.use((req, res, next) => { res.locals.csrfToken = req.csrfToken(); next(); });
const mongoClient = new MongoClient(process.env.DATABASE_URL); 
let db;

async function connectToDb() {
    try {
        await mongoClient.connect();
        console.log("✅ Успешно подключились к MongoDB");
        
        // Лучше брать имя базы из URI или .env, но пока оставим как у вас
        db = mongoClient.db("my-first-website-db"); 
        
        app.use('/', mainRoutes(db)); 
        app.use('/', authRoutes(db)); 
     app.use('/profile', profileRoutes(db)); 
        app.use('/activities', activitiesRoutes(db)); 
        app.use('/work', workRoutes(db, upload)); 
        app.use('/evening', eveningRoutes(db));

        app.listen(PORT, () => console.log(`🚀 Сервер запущен: http://localhost:${PORT}`));
    } catch (error) { 
        console.error("❌ Ошибка запуска сервера:", error); 
    }
}
connectToDb(); 