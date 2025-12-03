import express from 'express';
import path from 'path';
import { ObjectId } from "mongodb";
import fs from 'fs';
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const __dirname = path.resolve();

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db, upload) => {
    const router = express.Router();
    const uploadDir = path.join(__dirname, 'public', 'uploads');

    // 1. СТРАНИЦА РАБОТЫ (HTML)
    router.get('/', requireLogin, (req, res) => { 
       res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Работа</title>
                <script src="/ga.js"></script>
              <meta name="csrf-token" content="${res.locals.csrfToken}">
              <style>
                  body { font-family: Arial, sans-serif; padding: 20px; background-image: url('/images/background.jpg'); background-size: cover; background-position: center; background-attachment: fixed; color: white; }
                  .container { max-width: 800px; margin: 20px auto; background-color: rgba(0, 0, 0, 0.75); padding: 30px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.5); }
                  h1, h2, h3 { text-shadow: 1px 1px 3px black; }
                  .tabs { margin-bottom: 20px; border-bottom: 1px solid #555; }
                  .tab-button { padding: 10px 15px; border: none; background-color: transparent; color: #ccc; cursor: pointer; font-size: 1.1em; border-radius: 5px 5px 0 0; }
                  .tab-button.active { background-color: rgba(255, 255, 255, 0.1); color: white; border-bottom: 2px solid #ff9800; }
                  .tab-content { display: none; padding: 20px; border-top: none; }
                  .tab-content.active { display: block; }
                  ul { list-style: none; padding: 0; }
                  li { background-color: rgba(255, 255, 255, 0.1); padding: 15px; margin-bottom: 10px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; }
                  button, a.btn-style { padding: 8px 12px; border: none; border-radius: 5px; color: white; cursor: pointer; text-decoration: none; display: inline-block; margin-left: 10px; }
                  .complete-btn { background-color: #28a745; }
                  .download-btn { background-color: #007BFF; }
                  .delete-btn { background-color: #dc3545; }
                  form button { background-color: #ff9800; width: 100%; margin-top: 10px; padding: 12px; }
                  form input { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 5px; border: 1px solid #ccc; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Раздел "Работа"</h1>
                  <div class="tabs">
                      <button class="tab-button active" data-tab="tab-tasks">Задачи</button>
                      <button class="tab-button" data-tab="tab-ready">Готовые</button>
                    </div>

                    <div id="tab-tasks" class="tab-content active">
                      <h2>Загрузка новых задач</h2>
                      <form id="upload-form" action="/work/upload" method="POST" enctype="multipart/form-data">
                          <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <p>Выберите документ (станет задачей "в работе"):</p>
                          <input type="file" name="document" required>
                          <button type="submit">Загрузить как задачу</button>
                      </form>
                      <h3 style="margin-top: 30px;">Список задач в работе:</h3>
                      <ul id="tasks-list"></ul>
                    </div>

                    <div id="tab-ready" class="tab-content">
                      <h2>Загрузка готовых документов</h2>
                       <form id="upload-ready-form" action="/work/upload-ready" method="POST" enctype="multipart/form-data">
                          <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                       <p>Выберите документ для загрузки сразу в "Готовые":</p>
                          <input type="file" name="document" required>
                          <button type="submit">Загрузить как готовый</button>
                      </form>
                      <h3 style="margin-top: 30px;">Список готовых документов:</h3>
                      <ul id="ready-list"></ul>
                    </div>
                    <a href="/profile" class="btn-style" style="background-color: #6c757d; margin-top: 20px;">Вернуться в профиль</a>
                </div>
             <script src="/work.js"></script>
            </body>
            </html>
        `);
    });

    // 2. ЗАГРУЗКА
    router.post('/upload', requireLogin, upload.single('document'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).send('Файл не был загружен.');
            await db.collection('tasks').insertOne({
                originalName: req.file.originalname, fileName: req.file.filename, path: req.file.path,
                uploadedBy: req.session.user.name, userId: ObjectId.createFromHexString(req.session.user._id), createdAt: new Date()
            });
            await clearCache(LOGIN_PAGE_CACHE_KEY); 
          res.redirect('/work');
        } catch (error) { console.error(error); res.status(500).send('Ошибка сервера.'); }
    });

    router.post('/upload-ready', requireLogin, upload.single('document'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).send('Файл не был загружен.');
            await db.collection('ready_documents').insertOne({
                originalName: req.file.originalname, fileName: req.file.filename, path: req.file.path,
                uploadedBy: req.session.user.name, userId: ObjectId.createFromHexString(req.session.user._id),
                createdAt: new Date(), completedAt: new Date()
            });
            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            res.redirect('/work');
        } catch (error) { console.error(error); res.status(500).send('Ошибка сервера.'); }
    }); 

    // 3. API СПИСКОВ
    router.get('/tasks', requireLogin, async (req, res) => { 
        try {
            const tasks = await db.collection('tasks').find().sort({ createdAt: -1 }).toArray(); 
            res.json(tasks);
        } catch (error) { res.status(500).json({ message: "Ошибка сервера" }); }
    });

    router.get('/ready-documents', requireLogin, async (req, res) => { 
        try {
            const documents = await db.collection('ready_documents').find().sort({ completedAt: -1 }).toArray();   
            res.json(documents);
        } catch (error) { res.status(500).json({ message: "Ошибка сервера" }); }
    });

    router.get('/download/:filename', requireLogin, (req, res) => {
        const filePath = path.join(uploadDir, req.params.filename);
        if (fs.existsSync(filePath)) res.download(filePath, req.params.filename);
        else res.status(404).send('Файл не найден.');
    });

    // ✅ ВОТ ЭТИХ ДВУХ ЧАСТЕЙ НЕ ХВАТАЛО НА СКРИНШОТЕ:
    
    // 4. ЗАВЕРШЕНИЕ
    router.post('/complete-task/:id', requireLogin, async (req, res) => {
        try {
            const taskId = req.params.id;
            const task = await db.collection('tasks').findOne({ _id: ObjectId.createFromHexString(taskId) });
            if (task) {
                await db.collection('ready_documents').insertOne({
                    originalName: task.originalName, fileName: task.fileName, path: task.path,
                    uploadedBy: task.uploadedBy, completedBy: req.session.user.name,
                    userId: task.userId, createdAt: task.createdAt, completedAt: new Date()
                });
                await db.collection('tasks').deleteOne({ _id: ObjectId.createFromHexString(taskId) });
                await clearCache(LOGIN_PAGE_CACHE_KEY);
                res.sendStatus(200);
            } else { res.status(404).send('Задача не найдена'); }
        } catch (error) { console.error(error); res.status(500).send('Ошибка сервера'); }
    });

    // 5. УДАЛЕНИЕ
    router.delete('/ready-documents/:id', requireLogin, async (req, res) => {
        try {
            const docId = req.params.id;
            const doc = await db.collection('ready_documents').findOne({ _id: ObjectId.createFromHexString(docId) });
            if (doc) {
                const filePath = path.join(uploadDir, doc.fileName);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                await db.collection('ready_documents').deleteOne({ _id: ObjectId.createFromHexString(docId) });
                await clearCache(LOGIN_PAGE_CACHE_KEY);
                res.sendStatus(200);
            } else { res.status(404).send('Документ не найден'); }
        } catch (error) { console.error(error); res.status(500).send('Ошибка сервера'); }
    });
    
    return router;
};