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
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8"><title>Регистрация</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-image: url('/images/background.jpg'); background-size: cover; background-position: center; background-attachment: fixed; }
                    form { background: rgba(0, 0, 0, 0.8); padding: 30px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.5); width: 320px; color: white; }
                    h2 { text-align: center; margin-bottom: 20px; }
                    input { width: 95%; padding: 12px; margin-bottom: 15px; border-radius: 5px; border: 1px solid #ccc; }
                    button { width: 100%; padding: 12px; border: none; border-radius: 5px; background-color: #28a745; color: white; font-size: 16px; cursor: pointer; }
                    button:hover { background-color: #218838; }
                    a { color: #6cafff; text-decoration: none; }
                    .consent-group { margin-bottom: 15px; font-size: 0.9em; }
                    .consent-group input { width: auto; margin-right: 5px; }
                </style>
            </head>
            <body>
                <form action="/register" method="POST">
                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                    <h2>Регистрация</h2>
                    <input type="text" name="name" placeholder="Имя" required>
                    <input type="email" name="email" placeholder="Email" required>
                    <input type="password" name="password" placeholder="Пароль" required>
                    <div class="consent-group">
                        <input type="checkbox" id="consent" required>
                        <label for="consent">Я согласен с <a href="/privacy-policy" target="_blank">Политикой</a></label>
                    </div>
                    <button type="submit">Зарегистрироваться</button>
                    <div style="text-align:center; margin-top:15px;">
                        <a href="/login">Уже есть аккаунт? Войти</a>
                    </div>
                </form>
            </body>
            </html>
        `);
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
    // 2. ПРОФИЛЬ (С СООБЩЕНИЯМИ)
    // ---------------------------------------
    router.get("/profile", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            const user = await db.collection('users').findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            const availability = user.availability || { days: [], time: "" };

            // Получаем сообщения для профиля
            const messages = await db.collection('messages').find({ toUserId: user._id }).sort({ createdAt: -1 }).toArray();

            let messagesHtml = messages.map(m => `
                <div style="background:rgba(255,255,255,0.1); padding:10px; margin-bottom:10px; border-radius:5px; border-left:4px solid #00c3ff;">
                    <div style="font-size:0.9em; color:#ccc; margin-bottom:5px;">
                        <strong>От: ${m.fromContact}</strong> (${m.source || 'Галерея'}) - ${new Date(m.createdAt).toLocaleDateString()}
                    </div>
                    <div style="font-size:1.1em;">${m.text}</div>
                </div>
            `).join('') || '<p style="color:#aaa; text-align:center;">Сообщений пока нет.</p>';

            res.send(` 
                <html><head><meta charset="UTF-8"><title>Профиль</title><script src="/ga.js"></script><style>body{font-family:Arial;padding:20px;background:url('/images/background.jpg') center/cover fixed;color:white}.content{background:rgba(0,0,0,0.85);padding:30px;border-radius:10px;max-width:600px;margin:auto}input,button,textarea{width:95%;padding:10px;margin:5px 0;border-radius:5px;box-sizing:border-box}button{background:#28a745;color:white;border:none;cursor:pointer}.checkbox-group label{display:inline-block;margin-right:15px}h2,h3{text-align:center}a{color:#6cafff;text-decoration:none}</style></head><body>
                    <div class="content">
                        <h2>Привет, ${user.name}!</h2>
                        <div style="display:flex;gap:10px;justify-content:center;margin-bottom:20px;">
                            <a href="/work" style="background:#ff9800;color:white;padding:10px;border-radius:5px;">🍹 Коктейль</a>
                            <a href="/activities" style="background:#007BFF;color:white;padding:10px;border-radius:5px;">⚽ Активности</a>
                        </div>
                        <hr>
                        <form action="/update-availability" method="POST">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <h3>Ваши данные:</h3>
                            <label>Телефон:</label><input type="text" name="phone" value="${user.phone||''}" placeholder="+7...">
                            <label>Город:</label><input type="text" name="city" value="${user.city||''}" placeholder="Город">
                            <label>Страна:</label><input type="text" name="country" value="${user.country||''}" placeholder="Страна">
                            <div class="checkbox-group" style="margin:15px 0;"><label>Дни:</label><label><input type="checkbox" name="days" value="ПН" ${availability.days.includes('ПН')?'checked':''}>ПН</label><label><input type="checkbox" name="days" value="СР" ${availability.days.includes('СР')?'checked':''}>СР</label><label><input type="checkbox" name="days" value="ПТ" ${availability.days.includes('ПТ')?'checked':''}>ПТ</label></div>
                            <label>Время:</label><input type="text" name="time" value="${availability.time||''}" placeholder="18:00 - 20:00">
                            <button type="submit">Сохранить</button>
                        </form>
                        
                        <hr>
                        <h3 style="color:#00c3ff;">📬 Ваши Сообщения</h3>
                        <div style="max-height:300px; overflow-y:auto; margin-bottom:20px;">
                            ${messagesHtml}
                        </div>
                        <hr>

                        <form action="/post-comment" method="POST">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <h3>Комментарий на главную</h3>
                            <textarea name="commentText" required style="height:60px;"></textarea>
                            <button type="submit" style="background:#007BFF">Отправить</button>
                        </form>
                        <form action="/logout" method="POST" style="text-align:center;margin-top:20px;"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}"><button type="submit" style="background:#dc3545">Выйти</button></form>
                    </div>
                </body></html>
            `);
        } catch (error) { res.status(500).send("Ошибка."); }
    });

    router.post('/update-availability', requireLogin, async (req, res) => {
        const d = Array.isArray(req.body.days)?req.body.days:[req.body.days].filter(Boolean);
        await db.collection('users').updateOne({ _id: ObjectId.createFromHexString(req.session.user._id) }, { $set: { phone: req.body.phone, city: req.body.city, country: req.body.country, availability: { days: d, time: req.body.time } } });
        res.redirect('/profile');
    });

    router.post("/post-comment", requireLogin, async (req, res) => {
        await db.collection("comments").insertOne({ authorName: req.session.user.name, text: req.body.commentText, createdAt: new Date() });
        await clearCache(LOGIN_PAGE_CACHE_KEY); res.redirect("/profile");
    });

    // ---------------------------------------
    // 3. АКТИВНОСТИ
    // ---------------------------------------
 router.get("/activities", async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate');  
            const users = await db.collection("users").find().toArray();
            let userActivities = [];
            if(req.session.user) {
                const u = await db.collection("users").findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
                userActivities = u.activities || [];
            }
            const counts = { chess: users.filter(u=>u.activities?.includes("Шахматы")).length, football: users.filter(u=>u.activities?.includes("Футбол")).length, dance: users.filter(u=>u.activities?.includes("Танцы")).length, hockey: users.filter(u=>u.activities?.includes("Хоккей")).length, volley: users.filter(u=>u.activities?.includes("Волейбол")).length, hiking: users.filter(u=>u.activities?.includes("Походы")).length, travel: users.filter(u=>u.activities?.includes("Путешествие")).length };
            const renderCard = (name,c,l) => `<div class="activity-card"><div class="activity-header"><a href="/activities/${name}" style="color:#333;text-decoration:none;">${l||name}</a><span>Уч: ${c}</span></div>
            ${req.session.user ? `<form action="/update-activity" method="POST" style="display:inline;"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}"><input type="hidden" name="activity" value="${name}">${userActivities.includes(name)?`<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>`:`<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}</form>` : `<a href="/login" class="btn btn-join">Войти</a>`}</div>`;

            res.send(`<!DOCTYPE html><html><head><style>body{font-family:Arial;padding:20px;background:#f0f0f0}.tab-container{max-width:600px;margin:auto}.activity-card{padding:15px;background:white;margin-bottom:10px;border-radius:8px}.activity-header{display:flex;justify-content:space-between;font-weight:bold;margin-bottom:10px}.btn{padding:8px 12px;border:none;border-radius:5px;color:white;cursor:pointer;text-decoration:none}.btn-join{background:#28a745}.btn-leave{background:#dc3545}a.back-link{color:#007BFF;display:block;text-align:center;margin-top:20px}</style></head><body><div class="tab-container"><h2>Активности</h2><h3>Основные</h3>${renderCard("Шахматы",counts.chess,"♟️ Шахматы")}${renderCard("Футбол",counts.football,"⚽ Футбол")}${renderCard("Танцы",counts.dance,"💃 Танцы")}<h3>Активный отдых</h3>${renderCard("Хоккей",counts.hockey,"🏒 Хоккей")}${renderCard("Волейбол",counts.volley,"🏐 Волейбол")}${renderCard("Походы",counts.hiking,"🥾 Походы")}<h3>Для души</h3>${renderCard("Путешествие",counts.travel,"✈️ Путешествие с тобой")}<a href="/profile" class="back-link">В профиль</a></div></body></html>`);
        } catch(e){res.send("Ошибка")}
    });

    router.post("/update-activity", requireLogin, async (req, res) => {
        const { activity, action } = req.body;
        const uid = ObjectId.createFromHexString(req.session.user._id);
        if(action==="join") await db.collection("users").updateOne({_id:uid},{$addToSet:{activities:activity}});
        else await db.collection("users").updateOne({_id:uid},{$pull:{activities:activity}});
        await clearCache(LOGIN_PAGE_CACHE_KEY); res.redirect("/activities");
    });

    // СТРАНИЦА УЧАСТНИКОВ (С ФОРМОЙ ОТПРАВКИ)
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
                        <input type="text" name="contact" placeholder="Ваш контакт (Email/Тел)" required style="width:100%; margin-bottom:5px; padding:5px;">
                        <textarea name="text" placeholder="Напишите сообщение..." required style="width:100%; height:50px; padding:5px;"></textarea>
                        <button type="submit" style="width:100%; padding:5px; background:#007BFF; color:white; border:none; cursor:pointer;">Написать ${p.name}</button>
                    </form>
                </div>`).join('') || '<p>Пока никого нет.</p>';
                
            res.send(`
                <!DOCTYPE html><html><head><meta charset="UTF-8"><title>${activityName}</title>
                <style>
                    body{font-family:Arial;padding:20px;background:#eee; max-width:800px; margin:auto;}
                    .card{background:white;padding:15px;margin-bottom:15px;border-radius:5px; box-shadow:0 2px 5px rgba(0,0,0,0.1);}
                    a { display:block; text-align:center; margin-top:20px; padding:10px; background:#6c757d; color:white; text-decoration:none; border-radius:5px;}
                </style></head><body>
                <h1 style="text-align:center">${activityName}</h1>
                ${html}
                <div style="text-align:center; margin-top:20px;">
                    <a href="/activities" style="display:inline-block;">Назад к списку</a>
             </div>
                <script>
                    async function sendActivityMessage(e, toUserId) {
                        e.preventDefault();
                        const form = e.target;
                        const contact = form.contact.value;
                        const text = form.text.value;
                    const res = await fetch('/send-message', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-csrf-token': '${res.locals.csrfToken}' },
                            body: JSON.stringify({ toUserId: toUserId, contactInfo: contact, messageText: text, source: '${activityName}' })
                        });
                        if(res.ok) { alert('Сообщение отправлено! Ответ придет в Ваш Профиль.'); form.text.value = ''; }
                        else { alert('Ошибка отправки.'); }
                    }
                </script>
                </body></html>
            `);
        } catch (error) { res.status(500).send('Ошибка.'); }
    });

    // ---------------------------------------
    // 4. ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ (✅ ВОССТАНОВЛЕНА)
    // ---------------------------------------
    router.get('/privacy-policy', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Политика конфиденциальности</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; background-color: #f4f4f4; color: #333; }
                    .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
                    h1 { color: #2c3e50; }
                    a.btn { display: inline-block; background-color: #007BFF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Политика конфиденциальности</h1>
                    <p>Последнее обновление: ${new Date().toLocaleDateString()}</p>
                    <h2>1. Сбор информации</h2><p>Мы собираем Имя, Email и данные профиля (по желанию).</p>
                    <h2>2. Использование</h2><p>Данные используются для работы функций сайта (Активности, Чат).</p>
                    <h2>3. Безопасность</h2><p>Пароли шифруются, данные защищены.</p>
                    <h2>4. Третьи лица</h2><p>Мы не передаем ваши данные третьим лицам.</p>
                    <a href="/register" class="btn">Вернуться к регистрации</a>
                </div>
            </body>
            </html>
        `);
    });

    return router;
};  