import express from 'express';
import path from 'path';
import { ObjectId } from "mongodb";
import multer from 'multer'; 
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const __dirname = path.resolve();
const requireLogin = (req, res, next) => { if (req.session.user) next(); else return res.redirect("/login"); };

// 1. НАСТРОЙКА ЗАГРУЗКИ В ПАМЯТЬ (ВАЖНО ДЛЯ RENDER)
// Мы не сохраняем файлы на диск, мы держим их в RAM, чтобы сразу положить в Базу
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Лимит 10MB (чтобы база не лопнула)
});

// Убрал uploadDisk из аргументов, он больше не нужен
export default (db) => { 
    const router = express.Router();

    // =========================================================
    // 1. СТРАНИЦА КАБИНЕТА (HTML)
    // =========================================================
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
                  body { font-family: Arial, sans-serif; padding: 20px; background-image: url('/images/background.jpg'); background-size: cover; color: white; background-attachment: fixed; margin: 0; }
                  .container { max-width: 800px; margin: 20px auto; background-color: rgba(0, 0, 0, 0.85); padding: 30px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.5); }
                  h1, h2 { text-align: center; }
                  
                  /* ТАБЫ */
                  .tabs { margin-bottom: 20px; border-bottom: 1px solid #555; display: flex; justify-content: center; flex-wrap: wrap; gap: 5px; }
                  .tab-button { padding: 12px 20px; border: none; background: rgba(255,255,255,0.05); color: #ccc; cursor: pointer; font-size: 1.1em; font-weight: bold; border-radius: 5px 5px 0 0; }
                  .tab-button.active { color: #ff9800; border-bottom: 3px solid #ff9800; background: rgba(255,255,255,0.1); }
                  .tab-content { display: none; }
                  .tab-content.active { display: block; animation: fadeIn 0.4s; }
                  
                  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
                  
                  /* СООБЩЕНИЯ */
                  .msg-card { background: rgba(255,255,255,0.1); padding: 15px; margin-bottom: 15px; border-radius: 8px; border-left: 5px solid #00c3ff; }
                  .msg-header { display: flex; justify-content: space-between; font-size: 0.9em; color: #aaa; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; }
                  .msg-text { font-size: 1.1em; margin-bottom: 10px; line-height: 1.4; }
                  .reply-area { width: 100%; padding: 8px; border-radius: 5px; border: none; margin-top: 5px; box-sizing: border-box; }
                  
                  /* ЗАГРУЗКА */
                  .status-group { margin: 15px 0; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 5px; }
                  .status-group input[type="text"] { width: 100%; padding: 10px; margin-top: 10px; border-radius: 5px; border: none; box-sizing: border-box; }
                  .status-group label { display: block; margin-bottom: 5px; cursor: pointer; padding: 5px; }
                  
                  button { padding: 12px 20px; background: #ff9800; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 10px; }
                  button:hover { opacity: 0.9; }
                  a.btn-back { display: block; background: #6c757d; color: white; text-align: center; padding: 12px; margin-top: 20px; text-decoration: none; border-radius: 5px; }

                  /* --- МОБИЛЬНАЯ АДАПТАЦИЯ --- */
                  @media (max-width: 768px) {
                      body { background-attachment: scroll; padding: 10px; }
                      .container { padding: 15px; width: 100%; box-sizing: border-box; margin-top: 10px; margin-bottom: 10px; }
                      .tabs { flex-direction: column; gap: 0; }
                      .tab-button { width: 100%; text-align: left; border-radius: 5px; margin-bottom: 5px; border-bottom: none; border-left: 4px solid transparent; }
                      .tab-button.active { border-bottom: none; border-left: 4px solid #ff9800; }
                      h1 { font-size: 1.8em; } 
                      input, textarea, select { font-size: 16px; }
                      button { width: 100%; padding: 15px; }
                  }
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
                          <input type="file" name="document" required style="margin-bottom:10px; color:white; width:100%">
                          
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
                        const btns = document.querySelectorAll('.tab-button');
                        if(id === 'tab-tasks') btns[0].classList.add('active');
                        else btns[1].classList.add('active');
                        
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
                                <button onclick="deleteTask('\${t._id}')" style="background:#dc3545; padding:8px 15px; margin:0; width:auto; font-size:14px;">Удалить</button>
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
                        if(!text) return alert('Напишите текст ответа!'); 
                        const res = await fetch('/work/reply', {
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

    // =========================================================
    // 2. ОБРАБОТКА ЗАГРУЗКИ (Base64)
    // =========================================================
    router.post('/upload', requireLogin, upload.single('document'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Нет файла' });

            // 1. Превращаем файл из буфера (памяти) в строку Base64
            const imgBase64 = req.file.buffer.toString('base64');

            // 2. Сохраняем в базу данных
            await db.collection('tasks').insertOne({
                originalName: req.file.originalname, 
                fileName: req.file.originalname, 
                // Вместо пути к файлу сохраняем САМ файл в тексте
                imageBase64: imgBase64, 
                mimetype: req.file.mimetype, // (например image/jpeg)
                
                uploadedBy: req.session.user.name, 
                userId: ObjectId.createFromHexString(req.session.user._id), 
                status: req.body.status || 'busy', 
                amount: req.body.amount || '',
                createdAt: new Date()
            });

            // 3. Чистим кэш главной, чтобы фото появилось сразу
            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            
            res.json({ status: 'ok' });
        } catch (error) { 
            console.error(error);
            res.status(500).json({ error: 'Ошибка загрузки' }); 
        }
    });

    // Получить список загрузок (для админки)
    router.get('/tasks', requireLogin, async (req, res) => { 
        // Мы НЕ загружаем саму картинку (imageBase64) в этот список, чтобы он работал быстро
        // Картинка загружается только на ГЛАВНОЙ странице
        const tasks = await db.collection('tasks')
            .find({ userId: ObjectId.createFromHexString(req.session.user._id) })
            .project({ imageBase64: 0 }) // <--- Исключаем тяжелое поле
            .sort({ createdAt: -1 })
            .toArray(); 
        res.json(tasks);
    });

    // Удаление
    router.delete('/tasks/:id', requireLogin, async (req, res) => { 
        await db.collection('tasks').deleteOne({ _id: ObjectId.createFromHexString(req.params.id) });
        await clearCache(LOGIN_PAGE_CACHE_KEY);
        res.sendStatus(200);
    });

    // Сообщения
   router.get('/messages', requireLogin, async (req, res) => {
        const msgs = await db.collection('messages').find({ toUserId: ObjectId.createFromHexString(req.session.user._id) }).sort({ createdAt: -1 }).toArray();
        res.json(msgs);
    });

    // Ответ на сообщение
    router.post('/reply', requireLogin, async (req, res) => {
        await db.collection('messages').updateOne({ _id: ObjectId.createFromHexString(req.body.msgId) }, { $set: { reply: req.body.text, isRead: true } });
        res.json({ status: 'ok' });
    });
    
    return router;
};