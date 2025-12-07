import express from 'express';
import path from 'path';
import { ObjectId } from "mongodb";
import multer from 'multer'; // Импортируем Multer здесь для настройки памяти
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const __dirname = path.resolve();
const requireLogin = (req, res, next) => { if (req.session.user) next(); else return res.redirect("/login"); };

// НАСТРОЙКА ЗАГРУЗКИ В ПАМЯТЬ (Для Render)
const storage = multer.memoryStorage();
const uploadMemory = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Ограничение 10MB (чтобы база не лопнула)
});

export default (db, uploadDisk) => { // uploadDisk нам больше не нужен, используем uploadMemory
    const router = express.Router();

    // СТРАНИЦА КАБИНЕТА
    router.get('/', requireLogin, async (req, res) => { 
        res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Коктейль можно попить</title>
                <script src="/ga.js"></script>
                <style>
                  body { font-family: Arial, sans-serif; padding: 20px; background-image: url('/images/background.jpg'); background-size: cover; color: white; background-attachment: fixed; }
                  .container { max-width: 800px; margin: 20px auto; background-color: rgba(0, 0, 0, 0.85); padding: 30px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.5); }
                  h1, h2 { text-align: center; }
                  
                  /* ТАБЫ */
                  .tabs { margin-bottom: 20px; border-bottom: 1px solid #555; display: flex; justify-content: center; }
                  .tab-button { padding: 12px 20px; border: none; background: none; color: #ccc; cursor: pointer; font-size: 1.1em; font-weight: bold; }
                  .tab-button.active { color: #ff9800; border-bottom: 3px solid #ff9800; }
                  .tab-content { display: none; }
                  .tab-content.active { display: block; }
                  
                  /* СООБЩЕНИЯ */
                  .msg-card { background: rgba(255,255,255,0.1); padding: 15px; margin-bottom: 15px; border-radius: 8px; border-left: 5px solid #00c3ff; }
                  .msg-header { display: flex; justify-content: space-between; font-size: 0.9em; color: #aaa; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; }
                  .msg-text { font-size: 1.1em; margin-bottom: 10px; line-height: 1.4; }
                  .reply-area { width: 100%; padding: 8px; border-radius: 5px; border: none; margin-top: 5px; }
                  
                  /* ЗАГРУЗКА */
                  .status-group { margin: 15px 0; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 5px; }
                  .status-group input[type="text"] { width: 100%; padding: 10px; margin-top: 10px; border-radius: 5px; border: none; box-sizing: border-box; }
                  .status-group label { display: block; margin-bottom: 5px; cursor: pointer; }
                  
                  button { padding: 10px 20px; background: #ff9800; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 10px; }
                  button:hover { opacity: 0.9; }
                  a.btn-back { display: block; background: #6c757d; color: white; text-align: center; padding: 10px; margin-top: 20px; text-decoration: none; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🍹 Коктейль можно попить</h1>
                    <div class="tabs">
                      <button class="tab-button active" onclick="openTab('tab-tasks')">Мои Загрузки</button>
                      <button class="tab-button" onclick="openTab('tab-messages')">📨 Входящие сообщения</button>
                    </div>

                    <div id="tab-tasks" class="tab-content active">
                      <h2>Загрузить фото</h2>
                      <form id="upload-form" enctype="multipart/form-data">
                          <input type="file" name="document" required style="margin-bottom:10px; color:white;">
                          
                          <div class="status-group">
                              <p style="margin-top:0; font-weight:bold; color:#ff9800;">Настройки статуса:</p>
                              <label><input type="radio" name="status" value="free"> Свободна сегодня</label>
                              <label><input type="radio" name="status" value="company"> Ждем компанию</label>
                              <hr style="border:0; border-top:1px solid #555; margin:10px 0;">
                              <input type="text" name="amount" placeholder="ИЛИ напишите свою сумму/условие...">
                          </div>
                          
                          <button type="submit" style="width:100%">Загрузить в Галерею</button>
                      </form>
                      <h3 style="margin-top: 30px;">Мои активные файлы:</h3>
                      <ul id="tasks-list" style="list-style:none; padding:0;"></ul>
                    </div>

                    <div id="tab-messages" class="tab-content">
                      <h2>Сообщения от гостей</h2>
                      <div id="messages-list">
                          <p>Загрузка...</p>
                      </div>
                    </div>
                    
                    <a href="/profile" class="btn-back">Вернуться в профиль</a>
                </div>

                <script>
                    const CSRF_TOKEN = "${res.locals.csrfToken}";

                    function openTab(id) {
                        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                        document.getElementById(id).classList.add('active');
                        document.querySelector(\`button[onclick="openTab('\${id}')"]\`).classList.add('active');
                     if(id === 'tab-messages') loadMessages();
                    }
                    
                 document.getElementById('upload-form').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        // Отправляем с заголовком CSRF
                        await fetch('/work/upload', { method: 'POST', body: formData, headers: {'x-csrf-token': CSRF_TOKEN} });
                        loadTasks();
                        alert('Фото загружено в Галерею (Надежно)!');
                        e.target.reset();
                    });

                  async function loadTasks() {
                        const res = await fetch('/work/tasks');
                        const tasks = await res.json();
                        const list = document.getElementById('tasks-list');
                       if(tasks.length === 0) { list.innerHTML = '<p>Нет загруженных фото.</p>'; return; }

                        list.innerHTML = tasks.map(t => \`
                            <li style="background:rgba(255,255,255,0.1); padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <strong>\${t.originalName}</strong><br>
                                    <small style="color:#aaa">\${t.amount ? t.amount : (t.status === 'free' ? 'Свободна' : 'Ждем компанию')}</small>
                                </div>
                                <button onclick="deleteTask('\${t._id}')" style="background:#dc3545; padding:5px 10px; margin:0;">Удалить</button>
                            </li>\`).join('');
                    }

                    async function deleteTask(id) {
                        if(!confirm('Удалить это фото?')) return;
                        await fetch('/work/tasks/'+id, { method: 'DELETE', headers: {'x-csrf-token': CSRF_TOKEN} });
                        loadTasks();
                    }

                 async function loadMessages() {
                        const res = await fetch('/work/messages');
                        const msgs = await res.json();
                        const div = document.getElementById('messages-list');
                       if(msgs.length === 0) { div.innerHTML = '<p>Сообщений пока нет.</p>'; return; }

                        div.innerHTML = msgs.map(m => \`
                            <div class="msg-card">
                                <div class="msg-header">
                                    <span>👤 От: <strong>\${m.fromContact}</strong></span>
                                    <span>\${new Date(m.createdAt).toLocaleString()}</span>
                                </div>
                                <div class="msg-text">\${m.text}</div>
                                \${m.reply ? 
                                    \`<div style="background:rgba(40, 167, 69, 0.2); padding:5px; border-radius:5px; margin-top:5px;">
                                        ✅ <strong>Вы ответили:</strong> \${m.reply}
                                     </div>\` : 
                                    \`<div id="reply-box-\${m._id}">
                                        <input type="text" id="reply-\${m._id}" class="reply-area" placeholder="Напишите ответ...">
                                        <button onclick="replyTo('\${m._id}')" style="margin-top:5px; background:#00c3ff; width:100%;">Отправить ответ</button>
                                    </div>\`
                                }
                            </div>
                        \`).join('');
                    }

                    async function replyTo(id) {
                        const text = document.getElementById('reply-'+id).value;
                        if(!text) return alert('Напишите текст ответа!');                        const res = await fetch('/work/reply', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN},
                            body: JSON.stringify({ msgId: id, text })
                        });
                        if(res.ok) { alert('Ответ отправлен!'); loadMessages(); }
                    }

                    loadTasks();
                </script>
            </body>
            </html>
        `);
    });

  // ИСПРАВЛЕННЫЙ РОУТ ЗАГРУЗКИ (В БАЗУ ДАННЫХ)
  router.post('/upload', requireLogin, uploadMemory.single('document'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Нет файла' });

            // Конвертируем картинку в строку Base64
            const imgBase64 = req.file.buffer.toString('base64');

            await db.collection('tasks').insertOne({
                originalName: req.file.originalname, 
                fileName: req.file.originalname, // Имя оставляем для совместимости
                // path: ... путь больше не нужен
                imageBase64: imgBase64, // <-- ВОТ САМО ФОТО
                mimetype: req.file.mimetype, // Тип файла (jpg/png)
                uploadedBy: req.session.user.name, 
                userId: ObjectId.createFromHexString(req.session.user._id), 
                status: req.body.status || 'busy', 
                amount: req.body.amount || '',
                createdAt: new Date()
            });
            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            res.json({ status: 'ok' });
        } catch (error) { 
            console.error(error);
            res.status(500).json({ error: 'Err' }); 
        }
    });

    router.get('/tasks', requireLogin, async (req, res) => { 
        // При загрузке списка не тянем саму картинку (она тяжелая), только инфо
        // Используем projection чтобы исключить imageBase64 из списка (экономия трафика)
        const tasks = await db.collection('tasks')
            .find({ userId: ObjectId.createFromHexString(req.session.user._id) })
            .project({ imageBase64: 0 }) // Не загружаем картинку в админке, только имя
            .sort({ createdAt: -1 })
            .toArray(); 
        res.json(tasks);
    });

    router.delete('/tasks/:id', requireLogin, async (req, res) => {
        // Удаляем только из базы, так как файлов на диске нет
        await db.collection('tasks').deleteOne({ _id: ObjectId.createFromHexString(req.params.id) });
        await clearCache(LOGIN_PAGE_CACHE_KEY);
        res.sendStatus(200);
    });

   router.get('/messages', requireLogin, async (req, res) => {
        const msgs = await db.collection('messages').find({ toUserId: ObjectId.createFromHexString(req.session.user._id) }).sort({ createdAt: -1 }).toArray();
        res.json(msgs);
    });

    router.post('/reply', requireLogin, async (req, res) => {
        await db.collection('messages').updateOne({ _id: ObjectId.createFromHexString(req.body.msgId) }, { $set: { reply: req.body.text, isRead: true } });
        res.json({ status: 'ok' });
    });
    
    return router;
};