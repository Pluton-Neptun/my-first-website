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
import { createClient } from 'redis';
import { csrfSync } from 'csrf-sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

const { csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) => {
        if (req.body && req.body._csrf) return req.body._csrf;
        if (req.headers['x-csrf-token']) return req.headers['x-csrf-token'];
        return null;
    }
});

const redisClient = createClient({ 
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: { reconnectStrategy: false }
});
redisClient.on('error', () => {}); 

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
app.use(session({
    secret: "my_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL })
}));
app.use(csrfSynchronisedProtection);
app.use((req, res, next) => { res.locals.csrfToken = req.csrfToken(); next(); });

// ✅ ПОДКЛЮЧАЕМ ВСЕ ФАЙЛЫ
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import activitiesRoutes from './routes/activitiesRoutes.js'; // Используем существующий
import workRoutes from './routes/workRoutes.js';
import mainRoutes from './routes/mainRoutes.js';
import eveningRoutes from './routes/eveningRoutes.js';

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

async function connectToDb() {
    try {
        await mongoClient.connect();
        if (process.env.RENDER) try { await redisClient.connect(); } catch(e){}
        db = mongoClient.db("my-first-website-db");
        
        app.use('/', mainRoutes(db)); 
        app.use('/', authRoutes(db)); 
        
        // НОВЫЕ ПОДКЛЮЧЕНИЯ
        app.use('/profile', profileRoutes(db)); 
        app.use('/activities', activitiesRoutes(db)); // Активности теперь тут
        
        app.use('/work', workRoutes(db, upload)); 
        app.use('/evening', eveningRoutes(db));

        app.listen(PORT, () => console.log(`🚀 Сервер: http://localhost:${PORT}`));
    } catch (error) { console.error(error); }
}
connectToDb();