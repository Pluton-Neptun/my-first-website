import express from 'express';
import { ObjectId } from "mongodb";
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db) => {
    const router = express.Router();

    // 1. ГЛАВНАЯ СТРАНИЦА ПРОФИЛЯ
    router.get("/", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            const user = await db.collection('users').findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            const availability = user.availability || { days: [], time: "" };

            // Загрузка сообщений
            const allMessages = await db.collection('messages').find({ toUserId: user._id }).sort({ createdAt: -1 }).toArray();
            const eveningMessages = allMessages.filter(m => m.source && m.source.includes('После 19:00'));
            const otherMessages = allMessages.filter(m => !m.source || !m.source.includes('После 19:00'));

            // 👇 ОБНОВЛЕННЫЙ РЕНДЕР СООБЩЕНИЙ С КНОПКОЙ УДАЛИТЬ
            const renderMsg = (m) => `
                <div class="msg-card">
                    <div class="msg-head">
                        <strong>От: ${m.fromContact}</strong> 
                        <span style="font-size:0.8em; opacity:0.7;">${new Date(m.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div class="msg-source">Тема: ${m.source || 'Галерея'}</div>
                    <div class="msg-body">${m.text}</div>
                    
                    <form action="/profile/messages/delete/${m._id}" method="POST" style="text-align:right; margin-top:5px;">
                         <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                         <button type="submit" style="background:#dc3545; font-size:12px; padding:5px 10px; width:auto;">Удалить 🗑️</button>
                    </form>
                </div>
            `;

            res.send(` 
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Профиль</title>
                    <script src="/ga.js"></script>
                    <style>
                        body{font-family:Arial;padding:20px;background:url('/images/background.jpg') center/cover fixed;color:white; margin:0;}
                        .content{background:rgba(0,0,0,0.9);padding:30px;border-radius:10px;max-width:700px;margin:auto;box-shadow:0 0 20px rgba(0,0,0,0.7);}
                        
                        /* КНОПКИ */
                        .nav-buttons { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom:20px; }
                        .nav-btn { text-decoration:none; padding:12px 20px; border-radius:30px; font-weight:bold; color:white; transition:0.3s; text-align:center; cursor: pointer; }
                        .nav-btn:hover { transform:scale(1.05); }
                        
                        .btn-cocktail { background: linear-gradient(45deg, #ff9800, #ff5722); }
                        .btn-activities { background: linear-gradient(45deg, #2196f3, #00bcd4); }
                        .btn-publish { background: linear-gradient(45deg, #e056fd, #be2edd); border: 2px solid #fff; }

                        h2,h3{text-align:center}
                        input,button,textarea{width:95%;padding:10px;margin:5px 0;border-radius:5px;box-sizing:border-box}
                        button{background:#28a745;color:white;border:none;cursor:pointer}
                        .msg-card { background:rgba(255,255,255,0.1); padding:10px; margin-bottom:10px; border-radius:5px; border-left:4px solid #00c3ff; }
                        .msg-source { font-size:0.8em; color:#d4af37; margin-bottom:5px; font-weight:bold; }
                        hr { border:0; border-top:1px solid #555; margin:20px 0; }
                      
                        /* ТАБЫ */
                        .tabs { display:flex; justify-content:center; gap:20px; margin-bottom:15px; border-bottom:1px solid #555; padding-bottom:10px; flex-wrap:wrap;}
                        .tab-link { color:#aaa; cursor:pointer; font-size:1.1em; padding: 5px 10px; border-radius: 5px; transition: 0.3s;}
                        .tab-link:hover { background: rgba(255,255,255,0.1); }
                        .tab-link.active { color:white; font-weight:bold; border-bottom:2px solid white; background: rgba(255,255,255,0.1); }
                        .tab-content { display:none; }
                        .tab-content.active { display:block; animation: fadeIn 0.5s; }
                        
                        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
                        
                        .checkbox-group label { display: inline-block; margin-right: 15px; cursor: pointer; }
                    
                        /* --- НАЧАЛО МОБИЛЬНЫХ НАСТРОЕК --- */
                        @media (max-width: 768px) {
                            body {
                                background-attachment: scroll; 
                                background-position: center center;
                            }
                            .content {
                                width: 95%; 
                                margin: 10px auto; 
                                padding: 15px; 
                            }
                            button, .btn {
                                padding: 15px; 
                                font-size: 18px;
                            }
                            body {
                                font-size: 16px;
                            }
                        }
                        /* --- КОНЕЦ МОБИЛЬНЫХ НАСТРОЕК --- */
                    </style>
                </head>
                <body>
                    <div class="content">
                        <h2>Кабинет: ${user.name}</h2>
                        
                        <div class="nav-buttons">
                            <a href="/work" class="nav-btn btn-cocktail">🍹 Коктейль</a>
                            <a href="/activities" class="nav-btn btn-activities">⚽ Активности</a>
                            <a href="/profile/create-evening" class="nav-btn btn-publish">🌙 После 19:00</a>
                        </div>
                        
                        <hr>

                        <div class="tabs">
                            <span class="tab-link active" onclick="showTab('tab-all')" id="link-tab-all">📬 Входящие</span>
                            <span class="tab-link" onclick="showTab('tab-evening')" id="link-tab-evening" style="color:#d4af37;">💬 Ответы</span>
                        </div>

                        <div id="tab-all" class="tab-content active" style="max-height:400px; overflow-y:auto;">
                            ${otherMessages.length > 0 ? otherMessages.map(renderMsg).join('') : '<p style="text-align:center;color:#777">Нет новых сообщений.</p>'}
                        </div>

                        <div id="tab-evening" class="tab-content" style="max-height:400px; overflow-y:auto;">
                            <h4 style="color:#ccc; text-align:center;">Вам ответили на планы:</h4>
                            ${eveningMessages.length > 0 ? eveningMessages.map(renderMsg).join('') : '<p style="text-align:center;color:#777">Пока ответов нет.</p>'}
                        </div>  
                        <hr>
                        
                        <h3>Ваши данные:</h3>
                        <form action="/profile/update-availability" method="POST">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <label>Телефон:</label><input type="text" name="phone" value="${user.phone||''}" placeholder="+7...">
                            <label>Город:</label><input type="text" name="city" value="${user.city||''}" placeholder="Город">
                            <label>Страна:</label><input type="text" name="country" value="${user.country||''}" placeholder="Страна">
                            <div class="checkbox-group" style="margin: 15px 0;">
                                <label>Дни:</label>
                                <label><input type="checkbox" name="days" value="ПН" ${availability.days.includes('ПН')?'checked':''}>ПН</label>
                                <label><input type="checkbox" name="days" value="СР" ${availability.days.includes('СР')?'checked':''}>СР</label>
                                <label><input type="checkbox" name="days" value="ПТ" ${availability.days.includes('ПТ')?'checked':''}>ПТ</label>
                            </div>
                            <label>Удобное время:</label><input type="text" name="time" value="${availability.time||''}" placeholder="18:00 - 20:00">
                            <button type="submit">Сохранить</button>
                        </form>

                        <form action="/profile/post-comment" method="POST" style="margin-top:20px;">
                             <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                             <label>Комментарий на главную:</label>
                             <textarea name="commentText" required style="height:40px;"></textarea>
                             <button type="submit" style="background:#007BFF">Отправить</button>
                        </form>
                        
                        <div style="margin-top: 50px; border-top: 1px solid #ccc; padding-top: 20px; text-align: center;">
                            <h3 style="color: #dc3545;">Опасная зона</h3>
                            <form action="/profile/delete" method="POST" onsubmit="return confirm('Вы уверены? Это действие нельзя отменить!');">
                                <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                                <button type="submit" style="background: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">
                                    🗑️ Удалить мой аккаунт
                                </button>
                            </form>
                        </div>

                        <form action="/logout" method="POST" style="text-align:center;margin-top:20px;"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}"><button type="submit" style="background:#777">Выйти</button></form>
                    </div>

                    <script>
                        function showTab(id) {
                          document.querySelectorAll('.tab-content').forEach(d => d.classList.remove('active'));
                            document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
                         document.getElementById(id).classList.add('active');
                            document.getElementById('link-'+id).classList.add('active');
                        }
                    </script>
                </body></html>
            `);
        } catch (error) { res.status(500).send("Ошибка."); }
    });

    // 2. НОВАЯ ОТДЕЛЬНАЯ СТРАНИЦА "ПОСЛЕ 19:00"
    router.get("/create-evening", requireLogin, async (req, res) => {
        const user = await db.collection('users').findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
        
        res.send(`
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>После 19:00</title>
                <script src="/ga.js"></script>
                <style>
                    body{font-family:Arial;padding:20px;background:url('/images/background.jpg') center/cover fixed;color:white; margin:0;}
                    .content{background:rgba(0,0,0,0.9);padding:30px;border-radius:10px;max-width:600px;margin:50px auto;box-shadow:0 0 20px rgba(0,0,0,0.7);}
                    h2{text-align:center; color: #e056fd;}
                    input,button,textarea{width:100%;padding:12px;margin:8px 0;border-radius:5px;box-sizing:border-box}
                    button{background: linear-gradient(45deg, #e056fd, #be2edd); color:white;border:none;cursor:pointer; font-weight:bold; font-size:1.1em;}
                    button:hover{opacity:0.9;}
                    .btn-back{display:block; text-align:center; color:#ccc; margin-top:15px; text-decoration:none;}
                    
                    /* МОБИЛЬНАЯ АДАПТАЦИЯ ДЛЯ ЭТОЙ СТРАНИЦЫ */
                    @media (max-width: 768px) {
                        body { background-attachment: scroll; }
                        .content { width: 95%; margin: 20px auto; padding: 15px; }
                        button { padding: 15px; font-size: 18px; }
                    }
                </style>
            </head>
            <body>
                <div class="content">
                    <h2>🌙 Опубликовать: После 19:00</h2>
                    <p style="text-align:center; color:#aaa; margin-bottom:20px;">Ваше объявление появится на общей доске.</p>
                    
                    <form action="/evening/add" method="POST">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        
                        <label>Ваше время:</label>
                        <input type="text" name="time" placeholder="Пример: 20:30" required>
                        
                        <label>Ваш контакт:</label>
                        <input type="text" name="contact" value="${user.phone||''}" placeholder="Телефон или Telegram" required>
                        
                        <label>Ваши планы:</label>
                        <textarea name="text" placeholder="Иду в кино / Ищу компанию на ужин / Кальян..." required style="height:100px;"></textarea>
                        
                        <button type="submit">Опубликовать</button>
                    </form>
                    
                    <a href="/profile" class="btn-back">⬅ Вернуться в кабинет</a>
                </div>
            </body>
            </html>
        `);
    });

    // 3. ОБРАБОТЧИКИ ФОРМ
    router.post('/update-availability', requireLogin, async (req, res) => {
        const days = Array.isArray(req.body.days) ? req.body.days : (req.body.days ? [req.body.days] : []);
        await db.collection('users').updateOne(
            { _id: ObjectId.createFromHexString(req.session.user._id) }, 
            { $set: { phone: req.body.phone, city: req.body.city, country: req.body.country, availability: { days, time: req.body.time } } }
        );
        res.redirect('/profile');
    });

    router.post("/post-comment", requireLogin, async (req, res) => {
        await db.collection("comments").insertOne({ authorName: req.session.user.name, text: req.body.commentText, createdAt: new Date() });
        await clearCache(LOGIN_PAGE_CACHE_KEY); 
        res.redirect("/profile");
    });

    // 👇 ДОБАВЛЕН МАРШРУТ УДАЛЕНИЯ СООБЩЕНИЙ
    router.post('/messages/delete/:id', requireLogin, async (req, res) => {
        try {
            const messageId = req.params.id;
            const userId = ObjectId.createFromHexString(req.session.user._id);
            
            // Удаляем сообщение только если оно принадлежит текущему юзеру
            await db.collection('messages').deleteOne({
                _id: new ObjectId(messageId),
                toUserId: userId
            });
            
            res.redirect('/profile');
        } catch (e) {
            console.error(e);
            res.status(500).send("Ошибка удаления");
        }
    });

    // 4. УДАЛЕНИЕ АККАУНТА
    router.post('/delete', requireLogin, async (req, res) => {
        try {
            const userId = ObjectId.createFromHexString(req.session.user._id);
            await db.collection('users').deleteOne({ _id: userId });
            await db.collection('evening_plans').deleteMany({ userId: userId }); 
            await db.collection('tasks').deleteMany({ userId: userId }); 
            
            req.session.destroy(() => {
                res.redirect('/');
            });
        } catch (error) {
            console.error(error);
            res.status(500).send("Ошибка при удалении");
        }
    });

    return router;
};