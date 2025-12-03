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

// Импорт сервисов и маршрутов
import { connectRedis } from './cacheService.js';
import authRoutes from './routes/authRoutes.js';
import activitiesRoutes from './routes/activitiesRoutes.js';
import workRoutes from './routes/workRoutes.js';
 
// --- Инициализация Express ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// --- Настройка multer для загрузки файлов ---
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// УДАЛЕНИЕ НЕНУЖНЫХ ФАЙЛОВ (оставлено для целостности)
function startFileCleanupJob() { 
    console.log("Фоновая задача очистки файлов запущена.");
}

// --- Middleware ---
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

const STATIC_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;  
app.use(express.static(path.join(__dirname, "public"), { 
    maxAge: STATIC_MAX_AGE_MS
}));
app.use('/uploads', express.static(uploadDir, { 
    maxAge: STATIC_MAX_AGE_MS
}));

app.use(session({
    secret: "my_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.DATABASE_URL
    })
}));

// --- Настройка подключения к базе данных ---
const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

async function connectToDb() {
    try {
        await mongoClient.connect();
        console.log("Успешно подключились к MongoDB");
        
        await connectRedis(); // Подключение Redis через отдельный сервис
        
        db = mongoClient.db("my-first-website-db");
        
        // --- Подключение маршрутов (Router mounting) ---
        
        // 1. Главная страница / (перенаправляет на index.html)
        app.get('/', (req, res) => { 
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // ✅ 2. ДОБАВЛЕННЫЙ МАРШРУТ: Политика конфиденциальности
        app.get('/privacy-policy', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
        });
        
        // 3. Остальные маршруты (из папки routes)
        app.use('/', authRoutes(db));
        app.use('/activities', activitiesRoutes(db));  
        app.use('/work', workRoutes(db, upload));  
        
        // --- Запуск сервера ---
        app.listen(PORT, () => {
            console.log(`Сервер запущен: http://localhost:${PORT}`);
            if (!process.env.RENDER) {
                open(`http://localhost:${PORT}`);
            }
            startFileCleanupJob(); 
        });
    } catch (error) {
        console.error("Не удалось подключиться к MongoDB или Redis", error);
        process.exit(1);
    }
}

// ===================================================================
// ✅ ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОШИБОК 5XX
// ===================================================================
app.use((err, req, res, next) => {
    // Запись ошибки в лог
    console.error(`\n[FATAL UNHANDLED 5XX ERROR] Path: ${req.path}`);
    console.error(err.stack);

    // Не даем серверу упасть и отправляем ответ 500
    if (!res.headersSent) {
        res.status(500).send('<h1>Внутренняя ошибка сервера.</h1>');
    }
}); 

// Запуск приложения
connectToDb();