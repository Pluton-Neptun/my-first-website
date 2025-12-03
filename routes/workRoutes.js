// routes/workRoutes.js
import express from 'express';
import path from 'path';
import { ObjectId } from "mongodb";
import fs from 'fs';
import { 
    clearCache, 
    LOGIN_PAGE_CACHE_KEY 
} from '../cacheService.js';

const __dirname = path.resolve(); // Нужно определить, так как мы в отдельном модуле

// Middleware для проверки авторизации
const requireLogin = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        return res.redirect("/login"); 
    }
};

// Функция, возвращающая Express Router
export default (db, upload) => {
    const router = express.Router();
    
    // Путь, используемый multer (скопирован из server.js)
    const uploadDir = path.join(__dirname, 'public', 'uploads');

    // 1. Отдать страницу "Работа"
    router.get('/', requireLogin, (req, res) => { 
        res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
        res.sendFile(path.join(__dirname, 'public', 'work.html'));
    });

    // 2. Загрузка файла как ЗАДАЧИ
    router.post('/upload', requireLogin, upload.single('document'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).send('Файл не был загружен.');
            }
            const tasksCollection = db.collection('tasks');
            const newTask = {
                originalName: req.file.originalname,
                fileName: req.file.filename,
                path: req.file.path,
                uploadedBy: req.session.user.name,
                userId: ObjectId.createFromHexString(req.session.user._id),
                createdAt: new Date()
            };
            await tasksCollection.insertOne(newTask);
            
            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            
            res.redirect('/work');
        } catch (error) {
            console.error('Ошибка при загрузке файла:', error);
            res.status(500).send('Ошибка сервера при загрузке файла.');
        }
    });

    // 3. Загрузка файла сразу как ГОТОВОГО
    router.post('/upload-ready', requireLogin, upload.single('document'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).send('Файл не был загружен.');
            }
            const readyCollection = db.collection('ready_documents');
            const newReadyDoc = {
                originalName: req.file.originalname,
                fileName: req.file.filename,
                path: req.file.path,
                uploadedBy: req.session.user.name,
                userId: ObjectId.createFromHexString(req.session.user._id),
                createdAt: new Date(),
                completedAt: new Date()
            };
            await readyCollection.insertOne(newReadyDoc);
            
            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            
            res.redirect('/work');
        } catch (error) {
            console.error('Ошибка при загрузке готового файла:', error);
            res.status(500).send('Ошибка сервера.');
        }
    }); 

    // 4. Получение списка задач в работе (API)
    router.get('/tasks', requireLogin, async (req, res) => { 
        try {
            const tasks = await db.collection('tasks').find().sort({ createdAt: -1 }).toArray(); 
            res.json(tasks);
        } catch (error) {
            console.error('Ошибка при получении /tasks:', error); 
            res.status(500).json({ message: "Ошибка сервера" });  
        }
    });

    // 5. Получение списка готовых документов (API)
    router.get('/ready-documents', requireLogin, async (req, res) => { 
        try {
            const documents = await db.collection('ready_documents').find().sort({ completedAt: -1 }).toArray();   
            res.json(documents);
        } catch (error) {
            console.error('Ошибка при получении /ready-documents:', error);
            res.status(500).json({ message: "Ошибка сервера" }); 
        }
    });

    // 6. Скачивание файла
    router.get('/download/:filename', requireLogin, (req, res) => {
        const filename = req.params.filename;
        const filePath = path.join(uploadDir, filename);
        
        if (fs.existsSync(filePath)) {
            res.download(filePath, filename, (err) => {
                if (err) {
                    console.error("Ошибка при скачивании файла:", err);
                    if (!res.headersSent) res.status(500).send("Не удалось скачать файл.");
                }
            });
        } else {
            res.status(404).send('Файл не найден.');
        }
    });
    
    return router;
};