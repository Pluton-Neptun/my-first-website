import express from 'express';
import { ObjectId } from "mongodb";
import { setCache, clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db) => {
    const router = express.Router();

    // ---------------------------------------
    // 1. РЕГИСТРАЦИЯ И ВХОД
    // ---------------------------------------
    router.get('/register.html', (req, res) => res.redirect('/register')); 
    
    router.get('/register', (req, res) => {
        res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Регистрация</title><style>body{font-family:Arial;background:url('/images/background.jpg') center/cover;height:100vh;display:flex;justify-content:center;align-items:center}form{background:rgba(0,0,0,0.8);padding:30px;border-radius:10px;color:white;width:300px}input{width:95%;padding:10px;margin:10px 0;border-radius:5px}button{width:100%;padding:10px;background:#28a745;color:white;border:none;cursor:pointer}a{color:#6cafff;}</style></head><body><form action="/register" method="POST"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}"><h2>Регистрация</h2><input type="text" name="name" placeholder="Имя" required><input type="email" name="email" placeholder="Email" required><input type="password" name="password" placeholder="Пароль" required><div style="margin:10px 0"><input type="checkbox" required> <label>Согласен с <a href="/privacy-policy" target="_blank">Политикой</a></label></div><button type="submit">Готово</button><br><br><a href="/login" style="display:block;text-align:center">Войти</a></form></body></html>`);
    });

    router.post("/register", async (req, res) => {
        try {
            if (await db.collection("users").findOne({ email: req.body.email })) return res.send(`Email занят. <a href="/register">Назад</a>`);
            await db.collection("users").insertOne({ name: req.body.name, email: req.body.email, password: req.body.password, activities: [], createdAt: new Date() });
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.redirect('/login');
        } catch (e) { res.status(500).send("Ошибка"); }
    });

    router.post("/login", async (req, res) => {
        const user = await db.collection("users").findOne({ email: req.body.email, password: req.body.password });
        if (user) { req.session.user = user; res.redirect("/profile"); } else { res.send("Ошибка входа"); }
    });
    router.post("/logout", (req, res) => req.session.destroy(() => res.redirect('/')));

    // ---------------------------------------
    // 2. ПРОФИЛЬ (КАБИНЕТ)
    // ---------------------------------------
    router.get("/profile", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            const user = await db.collection('users').findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            const availability = user.availability || { days: [], time: "" };

            // Загрузка сообщений
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
                    
                    /* МЕНЮ */
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
                    
                    /* ФОРМА (Внутри таба) */
                    .create-plan-box { background: rgba(156, 39, 176, 0.2); padding: 15px; border-radius: 8px; border: 1px solid #9c27b0; margin-bottom: 20px; }
                    
                    /* ТАБЫ */
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
                        <form action="/update-availability" method="POST">
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
                            
                            <label>Удобное время:</label>
                            <input type="text" name="time" value="${availability.time||''}" placeholder="18:00 - 20:00">
                            <button type="submit">Сохранить</button>
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
        await clearCache(LOGIN_PAGE_CACHE_KEY); res.redirect("/profile");
    });

    // ---------------------------------------
    // 3. АКТИВНОСТИ (✅ ВОССТАНОВЛЕН КОД)
    // ---------------------------------------
    router.get("/activities", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate');  
            const users = await db.collection("users").find().toArray();
            const currentUser = await db.collection("users").findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            const userActivities = currentUser ? (currentUser.activities || []) : [];
            
            const counts = {
                chess: users.filter(u => u.activities?.includes("Шахматы")).length,
                football: users.filter(u => u.activities?.includes("Футбол")).length,
                dance: users.filter(u => u.activities?.includes("Танцы")).length,
                hockey: users.filter(u => u.activities?.includes("Хоккей")).length,
                volley: users.filter(u => u.activities?.includes("Волейбол")).length,
                hiking: users.filter(u => u.activities?.includes("Походы")).length,
                travel: users.filter(u => u.activities?.includes("Путешествие")).length
            };
            
            const renderCard = (name, count, label) => `
                <div class="activity-card">
                    <div class="activity-header">
                        <a href="/activities/${name}" style="color:#333; text-decoration:none;">${label || name}</a>
                        <span>Уч: ${count}</span>
                    </div>
                    <form action="/update-activity" method="POST" style="display:inline;">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <input type="hidden" name="activity" value="${name}">
                        ${userActivities.includes(name) 
                            ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` 
                            : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                    </form>
                </div>`;

            res.send(` 
                <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Активности</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background-color: #f0f0f0; margin: 0; }
                    .tab-container { max-width: 600px; margin: 20px auto; }
                    .activity-card { padding: 15px; background-color: white; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 8px; }
                    .activity-header { display: flex; justify-content: space-between; align-items: center; font-size: 1.2em; font-weight: bold; margin-bottom: 10px; }
                    .btn { padding: 8px 12px; border: none; border-radius: 5px; color: white; cursor: pointer; text-decoration: none; font-size: 1em;}
                    .btn-join { background-color: #28a745; } .btn-leave { background-color: #dc3545; }
                    a.back-link { color: #007BFF; text-decoration: none; font-weight: bold; display:block; text-align:center; margin-top:20px; }
                    h3 { margin-top: 30px; border-bottom: 2px solid #ccc; padding-bottom: 5px; }
                </style></head><body>
                <div class="tab-container">
                    <h2>Доступные активности</h2>
                    <h3>Основные</h3>
                    ${renderCard("Шахматы", counts.chess, "♟️ Шахматы")}
                    ${renderCard("Футбол", counts.football, "⚽ Футбол")}
                    ${renderCard("Танцы", counts.dance, "💃 Танцы")}
                    <h3>Активный отдых</h3>
                    ${renderCard("Хоккей", counts.hockey, "🏒 Хоккей")}
                    ${renderCard("Волейбол", counts.volley, "🏐 Волейбол")}
                    ${renderCard("Походы", counts.hiking, "🥾 Походы")}
                    <h3>Для души</h3>
                    ${renderCard("Путешествие", counts.travel, "✈️ Путешествие с тобой")}
                    <a href="/profile" class="back-link">Вернуться в профиль</a>
                </div></body></html>
            `);
        } catch(error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    router.post("/update-activity", requireLogin, async (req, res) => {
        const { activity, action } = req.body;
        const uid = ObjectId.createFromHexString(req.session.user._id);
        if(action==="join") await db.collection("users").updateOne({_id:uid},{$addToSet:{activities:activity}});
        else await db.collection("users").updateOne({_id:uid},{$pull:{activities:activity}});
        await clearCache(LOGIN_PAGE_CACHE_KEY); res.redirect("/activities");
    });

    router.get('/activities/:activityName', async (req, res) => {
        try {
            const activityName = req.params.activityName;
            const participants = await db.collection('users').find({ activities: activityName }).toArray();
            
            let html = participants.map(p => `
                <div class="card">
                    <div style="font-weight:bold; font-size:1.2em; margin-bottom:5px;">${p.name}</div>
                    <div style="color:#666;">📞 ${p.phone || 'Нет'} | 🌍 ${p.city || ''}</div>
                    <div style="margin-bottom:10px;">📅 ${(p.availability?.days||[]).join(', ')} | ⏰ ${p.availability?.time || ''}</div>
                    
                    <form onsubmit="sendActivityMessage(event, '${p._id}')" style="background:#f9f9f9; padding:10px; border-radius:5px;">
                        <input type="text" name="contact" placeholder="Ваш контакт" required style="width:100%; margin-bottom:5px; padding:5px;">
                        <textarea name="text" placeholder="Сообщение..." required style="width:100%; height:50px; padding:5px;"></textarea>
                        <button type="submit" style="width:100%; padding:5px; background:#007BFF; color:white; border:none; cursor:pointer;">Написать ${p.name}</button>
                    </form>
                </div>`).join('') || '<p>Пока никого нет.</p>';
                
            res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${activityName}</title><style>body{font-family:Arial;padding:20px;background:#eee;max-width:800px;margin:auto}.card{background:white;padding:15px;margin-bottom:15px;border-radius:5px;box-shadow:0 2px 5px rgba(0,0,0,0.1)}a{display:block;text-align:center;margin-top:20px;padding:10px;background:#6c757d;color:white;text-decoration:none;border-radius:5px}</style></head><body><h1 style="text-align:center">${activityName}</h1>${html}<a href="/activities">Назад к списку</a><script>async function sendActivityMessage(e,t){e.preventDefault();const c=e.target.contact.value,x=e.target.text.value,r=await fetch('/send-message',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':'${res.locals.csrfToken}'},body:JSON.stringify({toUserId:t,contactInfo:c,messageText:x,source:'${activityName}'})});r.ok?alert('Отправлено!'):alert('Ошибка');e.target.text.value='';}</script></body></html>`);
        } catch (error) { res.status(500).send('Ошибка.'); }
    });

    // ---------------------------------------
    // 4. ПОЛИТИКА (✅ ВОССТАНОВЛЕН ПОЛНЫЙ ТЕКСТ)
    // ---------------------------------------
    router.get('/privacy-policy', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head><meta charset="UTF-8"><title>Политика конфиденциальности</title><style>body{font-family:Arial,sans-serif;padding:20px;line-height:1.6;background:#f4f4f4;color:#333}.container{max-width:800px;margin:0 auto;background:white;padding:30px;border-radius:10px}</style></head>
            <body>
                <div class="container">
                    <h1>Политика конфиденциальности</h1>
                    <p>Последнее обновление: ${new Date().toLocaleDateString()}</p>
                    <h2>1. Сбор информации</h2><p>Мы собираем Имя, Email и данные профиля (по желанию).</p>
                    <h2>2. Использование</h2><p>Данные используются для работы функций сайта (Активности, Чат).</p>
                    <h2>3. Безопасность</h2><p>Пароли шифруются, данные защищены.</p>
                    <h2>4. Третьи лица</h2><p>Мы не передаем ваши данные третьим лицам.</p>
                </div>
            </body>
            </html>
        `);
    });

    return router;
};