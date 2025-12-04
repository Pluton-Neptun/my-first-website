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

    // 1. СТРАНИЦА "КОКТЕЙЛЬ"
    router.get('/', requireLogin, (req, res) => { 
        res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Коктейль можно попить</title>
                <script src="/ga.js"></script>
                <meta name="csrf-token" content="${res.locals.csrfToken}">
                <style>
                  body { font-family: Arial, sans-serif; padding: 20px; background-image: url('/images/background.jpg'); background-size: cover; background-position: center; background-attachment: fixed; color: white; }
                  .container { max-width: 800px; margin: 20px auto; background-color: rgba(0, 0, 0, 0.75); padding: 30px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.5); }
                  h1, h2, h3 { text-shadow: 1px 1px 3px black; text-align: center; }
                  .tabs { margin-bottom: 20px; border-bottom: 1px solid #555; display: flex; justify-content: center; }
                  .tab-button { padding: 10px 20px; border: none; background-color: transparent; color: #ccc; cursor: pointer; font-size: 1.1em; border-radius: 5px 5px 0 0; }
                  .tab-button.active { background-color: rgba(255, 255, 255, 0.1); color: #ff9800; border-bottom: 2px solid #ff9800; }
                  .tab-content { display: none; padding: 20px; border-top: none; }
                  .tab-content.active { display: block; }
                  ul { list-style: none; padding: 0; }
                  li { background-color: rgba(255, 255, 255, 0.1); padding: 15px; margin-bottom: 10px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; }
                  button { padding: 8px 12px; border: none; border-radius: 5px; color: white; cursor: pointer; margin-left: 10px; }
                  .delete-btn { background-color: #dc3545; }
                  form button { background-color: #ff9800; width: 100%; margin-top: 10px; padding: 12px; margin-left: 0; }
                  form input[type="file"] { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 5px; border: 1px solid #ccc; margin-bottom: 10px; }
                  
                  /* Стиль для выбора статуса */
                  .status-group { margin: 15px 0; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 5px; }
                  .status-group label { display: block; margin-bottom: 5px; cursor: pointer; }
                  .status-group input[type="radio"] { margin-right: 10px; }
                  /* Стиль для суммы */
                  .amount-input { margin-top: 10px; width: 100%; padding: 8px; box-sizing: border-box; border-radius: 5px; border: 1px solid #ccc; color: black; }

                  a.btn-back { display: block; background-color: #6c757d; color: white; text-align: center; padding: 10px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🍹 Коктейль можно попить</h1>
                    <div class="tabs">
                      <button class="tab-button active" data-tab="tab-tasks">Мои Загрузки</button>
                      <button class="tab-button" data-tab="tab-ready">Готовые</button>
                    </div>

                    <div id="tab-tasks" class="tab-content active">
                      <h2>Загрузить новый файл</h2>
                      <form id="upload-form" enctype="multipart/form-data">
                          <input type="file" name="document" required>
                          
                          <div class="status-group">
                              <p style="margin-top:0">Выберите статус:</p>
                              <label><input type="radio" name="status" value="free"> Свободна сегодня</label>
                              <label><input type="radio" name="status" value="company"> Ждем компанию</label>
                              
                              <input type="text" name="amount" class="amount-input" placeholder="Сумма до... (например: 5000)">
                          </div>

                          <button type="submit">Загрузить</button>
                      </form>
                      <h3 style="margin-top: 30px;">Список файлов:</h3>
                      <ul id="tasks-list"></ul>
                    </div>

                    <div id="tab-ready" class="tab-content">
                      <h2>Загрузить в готовые</h2>
                       <form id="upload-ready-form" enctype="multipart/form-data">
                          <input type="file" name="document" required>
                          <button type="submit">Загрузить</button>
                      </form>
                      <h3 style="margin-top: 30px;">Готовые файлы:</h3>
                      <ul id="ready-list"></ul>
                    </div>
                    <a href="/profile" class="btn-back">Вернуться в профиль</a>
                </div>
                <script src="/work.js"></script>
            </body>
            </html>
        `);
    });

    // 2. ЗАГРУЗКА (Сохраняем статус и СУММУ)
    router.post('/upload', requireLogin, upload.single('document'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Нет файла.' });
            
           const status = req.body.status || 'busy';
            const amount = req.body.amount || ''; // ✅ Получаем сумму

            await db.collection('tasks').insertOne({
                originalName: req.file.originalname, 
                fileName: req.file.filename, 
                path: req.file.path,
                uploadedBy: req.session.user.name, 
                userId: ObjectId.createFromHexString(req.session.user._id), 
                status: status, 
                amount: amount, // ✅ Сохраняем в базу
                createdAt: new Date()
            });
            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            res.json({ status: 'ok' });
        } catch (error) { console.error(error); res.status(500).json({ error: 'Ошибка сервера' }); }
    });

    router.post('/upload-ready', requireLogin, upload.single('document'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Нет файла.' });
            await db.collection('ready_documents').insertOne({
                originalName: req.file.originalname, fileName: req.file.filename, path: req.file.path,
                uploadedBy: req.session.user.name, userId: ObjectId.createFromHexString(req.session.user._id),
                createdAt: new Date(), completedAt: new Date()
            });
            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            res.json({ status: 'ok' });
        } catch (error) { console.error(error); res.status(500).json({ error: 'Ошибка сервера' }); }
    }); 

    // 3. СПИСКИ
    router.get('/tasks', requireLogin, async (req, res) => { 
        try {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            const tasks = await db.collection('tasks').find().sort({ createdAt: -1 }).toArray(); 
            res.json(tasks);
        } catch (error) { res.status(500).json({ message: "Ошибка." }); }
    });

    router.get('/ready-documents', requireLogin, async (req, res) => { 
        try {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            const documents = await db.collection('ready_documents').find().sort({ completedAt: -1 }).toArray();   
            res.json(documents);
        } catch (error) { res.status(500).json({ message: "Ошибка." }); }
    });

    // 4. УДАЛЕНИЕ
    router.delete('/tasks/:id', requireLogin, async (req, res) => {
        try {
            const taskId = req.params.id;
            const task = await db.collection('tasks').findOne({ _id: ObjectId.createFromHexString(taskId) });
            if (task) {
                const filePath = path.join(uploadDir, task.fileName);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                await db.collection('tasks').deleteOne({ _id: ObjectId.createFromHexString(taskId) });
                await clearCache(LOGIN_PAGE_CACHE_KEY);
                res.sendStatus(200);
            } else { res.status(404).send('Не найдено'); }
        } catch (error) { console.error(error); res.status(500).send('Ошибка'); }
    });

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
            } else { res.status(404).send('Не найдено'); }
        } catch (error) { console.error(error); res.status(500).send('Ошибка'); }
    });
    
    return router;
}; 