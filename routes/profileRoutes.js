import express from 'express';
import { ObjectId } from "mongodb";
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db) => {
    const router = express.Router();

    // ГЛАВНАЯ СТРАНИЦА ПРОФИЛЯ
    router.get("/", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            const user = await db.collection('users').findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            const availability = user.availability || { days: [], time: "" };

            // 1. Загрузка сообщений
            const allMessages = await db.collection('messages').find({ toUserId: user._id }).sort({ createdAt: -1 }).toArray();
            const eveningMessages = allMessages.filter(m => m.source && m.source.includes('После 19:00'));
            const otherMessages = allMessages.filter(m => !m.source || !m.source.includes('После 19:00'));

            const renderMsg = (m) => `
                <div class="msg-card">
                    <div class="msg-head">
                        <strong>От: ${m.fromContact}</strong> 
                        <span style="font-size:0.8em; opacity:0.7;">${new Date(m.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div class="msg-source">Тема: ${m.source || 'Галерея'}</div>
                    <div class="msg-body">${m.text}</div>
                </div>
            `;

            res.send(` 
                <html><head><meta charset="UTF-8"><title>Профиль</title><script src="/ga.js"></script><style>
                    body{font-family:Arial;padding:20px;background:url('/images/background.jpg') center/cover fixed;color:white}
                    .content{background:rgba(0,0,0,0.9);padding:30px;border-radius:10px;max-width:700px;margin:auto;box-shadow:0 0 20px rgba(0,0,0,0.7);}
                    
                    .nav-buttons { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom:20px; }
                    .nav-btn { text-decoration:none; padding:12px 20px; border-radius:30px; font-weight:bold; color:white; transition:0.3s; text-align:center; }
                    .nav-btn:hover { transform:scale(1.05); }
                    .btn-cocktail { background: linear-gradient(45deg, #ff9800, #ff5722); }
                    .btn-activities { background: linear-gradient(45deg, #2196f3, #00bcd4); }
                    .btn-evening { background: linear-gradient(45deg, #9c27b0, #673ab7); border: 2px solid #d4af37; }

                    h2,h3{text-align:center}
                    input,button,textarea{width:95%;padding:10px;margin:5px 0;border-radius:5px;box-sizing:border-box}
                    button{background:#28a745;color:white;border:none;cursor:pointer}
                    .msg-card { background:rgba(255,255,255,0.1); padding:10px; margin-bottom:10px; border-radius:5px; border-left:4px solid #00c3ff; }
                    .msg-source { font-size:0.8em; color:#d4af37; margin-bottom:5px; font-weight:bold; }
                    hr { border:0; border-top:1px solid #555; margin:20px 0; }
                    
                    /* Форма "Создать план" (внутри таба) */
                    .create-plan-box { background: rgba(156, 39, 176, 0.2); padding: 15px; border-radius: 8px; border: 1px solid #9c27b0; margin-bottom: 20px; }
                    
                    .tabs { display:flex; justify-content:center; gap:20px; margin-bottom:15px; border-bottom:1px solid #555; padding-bottom:10px; }
                    .tab-link { color:#aaa; cursor:pointer; font-size:1.1em; }
                    .tab-link.active { color:white; font-weight:bold; border-bottom:2px solid white; }
                    .tab-content { display:none; }
                    .tab-content.active { display:block; }
                    
                    .checkbox-group label { display: inline-block; margin-right: 15px; cursor: pointer; }
                </style></head><body>
                    <div class="content">
                        <h2>Кабинет: ${user.name}</h2>
                        
                        <div class="nav-buttons">
                            <a href="/work" class="nav-btn btn-cocktail">🍹 Коктейль</a>
                            <a href="/activities" class="nav-btn btn-activities">⚽ Активности</a>
                            <a href="/evening" class="nav-btn btn-evening">🌙 Доска (Смотреть)</a>
                        </div>
                        
                        <hr>

                        <div class="tabs">
                            <span class="tab-link active" onclick="showTab('tab-all')">📬 Входящие (Общие)</span>
                            <span class="tab-link" onclick="showTab('tab-evening')" style="color:#d4af37;">🌙 Доска: Публикация и Ответы</span>
                        </div>

                        <div id="tab-all" class="tab-content active" style="max-height:400px; overflow-y:auto;">
                            ${otherMessages.length > 0 ? otherMessages.map(renderMsg).join('') : '<p style="text-align:center;color:#777">Нет новых сообщений.</p>'}
                        </div>

                        <div id="tab-evening" class="tab-content" style="max-height:600px; overflow-y:auto;">
                            
                            <div class="create-plan-box">
                                <h3 style="color:#d4af37; margin-top:0;">📝 Создать объявление</h3>
                                <form action="/evening/add" method="POST">
                                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                                    <div style="display:flex; gap:10px;">
                                        <input type="text" name="time" placeholder="Время (20:00)" required style="width:30%;">
                                        <input type="text" name="contact" value="${user.phone||''}" placeholder="Ваш контакт" required style="width:70%;">
                                    </div>
                                    <textarea name="text" placeholder="Заголовок: Иду в кино... / Кальян / Прогулка..." required style="height:60px;"></textarea>
                                    <button type="submit" style="background:#9c27b0;">Опубликовать на Доску</button>
                                </form>
                            </div>

                            <h4 style="color:#ccc; text-align:center;">Ответы на ваши объявления:</h4>
                            ${eveningMessages.length > 0 ? eveningMessages.map(renderMsg).join('') : '<p style="text-align:center;color:#777">Пока никто не ответил.</p>'}
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

                        <form action="/logout" method="POST" style="text-align:center;margin-top:20px;"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}"><button type="submit" style="background:#dc3545">Выйти</button></form>
                    </div>

                    <script>
                        function showTab(id) {
                            document.querySelectorAll('.tab-content').forEach(d => d.classList.remove('active'));
                            document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
                            document.getElementById(id).classList.add('active');
                            event.target.classList.add('active');
                        }
                    </script>
                </body></html>
            `);
        } catch (error) { res.status(500).send("Ошибка."); }
    });

    // ОБНОВЛЕНИЕ ДАННЫХ
    router.post('/update-availability', requireLogin, async (req, res) => {
        const days = Array.isArray(req.body.days) ? req.body.days : (req.body.days ? [req.body.days] : []);
        await db.collection('users').updateOne(
            { _id: ObjectId.createFromHexString(req.session.user._id) }, 
            { $set: { phone: req.body.phone, city: req.body.city, country: req.body.country, availability: { days, time: req.body.time } } }
        );
        res.redirect('/profile');
    });

    // КОММЕНТАРИЙ
    router.post("/post-comment", requireLogin, async (req, res) => {
        await db.collection("comments").insertOne({ authorName: req.session.user.name, text: req.body.commentText, createdAt: new Date() });
        await clearCache(LOGIN_PAGE_CACHE_KEY); 
        res.redirect("/profile");
    });

    return router;
};