import express from 'express';
import { ObjectId } from "mongodb";
import { setCache, clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db) => {
    const router = express.Router();

    // 1. РЕГИСТРАЦИЯ И ВХОД    router.get('/register.html', (req, res) => res.redirect('/register')); 
    
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
            const { name, email, password } = req.body;
            const existingUser = await db.collection("users").findOne({ email: email });
            if (existingUser) return res.send(`<h2>Ошибка</h2><p>Email занят.</p><a href="/register">Назад</a>`);
            
            const newUser = { name, email, password, phone: "", city: "", country: "", registeredAt: new Date().toLocaleString(), activities: [] };
            await db.collection("users").insertOne(newUser);
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.send(`<h2>Успешно!</h2><p><a href="/login">Войти</a></p>`);
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });

   router.post("/login", async (req, res) => {
        try {
            const user = await db.collection("users").findOne({ email: req.body.email, password: req.body.password });
            if (user) { req.session.user = user; res.redirect("/profile"); }
            else { res.send(`<h2>Ошибка</h2><p>Неверно.</p><a href="/login">Назад</a>`); }
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    router.post("/logout", (req, res) => {
        req.session.destroy(() => { res.clearCookie('connect.sid'); res.redirect('/'); });
    });

    // 2. ПРОФИЛЬ
    router.get("/profile", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            const user = await db.collection('users').findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            if (!user) { req.session.destroy(); return res.redirect('/login'); }
            
            const availability = user.availability || { days: [], time: "" };

            res.send(` 
                <html>
                <head>
                    <meta charset="UTF-8"><title>Профиль</title>
                    <script src="/ga.js"></script>
                    <style>
                        body { font-family: Arial; padding: 20px; background: url('/images/background.jpg') center/cover fixed; color: white; }
                        .content { background: rgba(0,0,0,0.85); padding: 30px; border-radius: 10px; max-width: 600px; margin: auto; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
                        input, button, textarea { width: 95%; padding: 10px; margin: 5px 0; border-radius: 5px; box-sizing: border-box; }
                        button { background: #28a745; color: white; border: none; cursor: pointer; font-size: 16px; }
                        .logout-btn { background: #dc3545; }
                     a { color: #6cafff; display: block; margin-top: 10px; text-align: center; text-decoration: none; font-size: 1.1em; }
                        .checkbox-group label { display: inline-block; margin-right: 15px; cursor: pointer; }
                        h2, h3 { text-align: center; }
                        hr { border: 0; border-top: 1px solid #555; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="content">
                        <h2>Привет, ${user.name}!</h2>
                        <p style="text-align:center"><b>Email:</b> ${user.email}</p>
                        
                        <div style="display:flex; gap:10px; justify-content:center; margin-bottom:20px;">
                            <a href="/work" style="background:#ff9800; color:white; padding:10px; border-radius:5px;">🍹 Коктейль можно попить</a>
                            <a href="/activities" style="background:#007BFF; color:white; padding:10px; border-radius:5px;">⚽ Активности</a>
                        </div>
                        
                        <hr>
                      <form action="/update-availability" method="POST">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <h3>Ваши данные:</h3>
                          <label>Телефон:</label>
                          <input type="text" name="phone" value="${user.phone || ''}" placeholder="+7 (XXX) XXX-XX-XX">
                            <label>Город:</label>
                            <input type="text" name="city" value="${user.city || ''}" placeholder="Ваш город">
                         <label>Страна:</label>
                            <input type="text" name="country" value="${user.country || ''}" placeholder="Ваша страна">
                         <div class="checkbox-group" style="margin: 15px 0;">
                                <label style="font-weight:bold; display:block; margin-bottom:5px;">Свободные дни:</label>
                                <label><input type="checkbox" name="days" value="ПН" ${availability.days.includes('ПН')?'checked':''}> ПН</label>
                                <label><input type="checkbox" name="days" value="СР" ${availability.days.includes('СР')?'checked':''}> СР</label>
                                <label><input type="checkbox" name="days" value="ПТ" ${availability.days.includes('ПТ')?'checked':''}> ПТ</label>
                         </div>
                            <label>Удобное время:</label>
                            <input type="text" name="time" value="${availability.time || ''}" placeholder="Например: 18:00 - 20:00">
                          <button type="submit">Сохранить изменения</button>
                        </form>
                     <hr>
                      <form action="/post-comment" method="POST">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <h3>Оставить комментарий</h3>
                            <textarea name="commentText" required placeholder="Напишите что-нибудь на главную..." style="height:80px;"></textarea>
                            <button type="submit" style="background:#007BFF">Отправить</button>
                        </form>
                       <hr>
                        <form action="/logout" method="POST" style="text-align:center">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <button type="submit" class="logout-btn">Выйти</button>
                        </form>
                    </div>
                </body>
                </html>
            `);
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    router.post('/update-availability', requireLogin, async (req, res) => {
        try {
            const { days, time, phone, city, country } = req.body;
            const daysArray = Array.isArray(days) ? days : (days ? [days] : []); 
          await db.collection('users').updateOne(
                { _id: ObjectId.createFromHexString(req.session.user._id) }, 
                { $set: { phone, city, country, availability: { days: daysArray, time } } }
          );
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.redirect('/profile');
        } catch (error) { console.error(error); res.status(500).send('Ошибка.'); }
    });

    router.post("/post-comment", requireLogin, async (req, res) => {
        try {
            await db.collection("comments").insertOne({ authorName: req.session.user.name, text: req.body.commentText, createdAt: new Date() });
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.redirect("/profile");
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    // 3. АКТИВНОСТИ
    
    // Страница списка (Нужен вход для записи, но просмотр можно открыть)
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
        try {
            const { activity, action } = req.body;
            const userId = ObjectId.createFromHexString(req.session.user._id);
            let updateQuery;
            if (action === "join") updateQuery = { $addToSet: { activities: activity } };
            else if (action === "leave") updateQuery = { $pull: { activities: activity } };
            
            if (updateQuery) {
                await db.collection("users").updateOne({ _id: userId }, updateQuery);
             const updatedUser = await db.collection("users").findOne({ _id: userId });
                req.session.user.activities = updatedUser.activities;
            }
            await clearCache(LOGIN_PAGE_CACHE_KEY);  
            res.redirect("/activities");
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    // ✅ СТРАНИЦА УЧАСТНИКОВ (ТЕПЕРЬ ДОСТУПНА ВСЕМ)
    // Убрали requireLogin, чтобы можно было заходить с главной страницы
    router.get('/activities/:activityName', async (req, res) => {
        try {
            const activityName = req.params.activityName;
            const participants = await db.collection('users').find({ activities: activityName }).toArray();
            
            let html = participants.map(p => `
                <div class="card">
                    <h3>${p.name}</h3>
                    <p>📞 ${p.phone || 'Не указан'}</p>
                    <p>🌍 ${p.city || ''} ${p.country || ''}</p>
                    <p>📅 ${(p.availability?.days||[]).join(', ')}</p>
                    <p>⏰ ${p.availability?.time || ''}</p>
                </div>`).join('') || '<p>Пока никого нет.</p>';
                
            res.send(`
                <!DOCTYPE html><html><head><meta charset="UTF-8"><title>${activityName}</title>
                <style>
                    body{font-family:Arial;padding:20px;background:#eee; max-width:800px; margin:auto;}
                    .card{background:white;padding:15px;margin-bottom:10px;border-radius:5px; box-shadow:0 2px 5px rgba(0,0,0,0.1);}
                    h1 { text-align:center; color:#333; }
                    a { display:block; text-align:center; margin-top:20px; padding:10px; background:#007BFF; color:white; text-decoration:none; border-radius:5px;}
                </style></head><body>
                <h1>Участники: ${activityName}</h1>
                ${html}
                <div style="text-align:center; margin-top:20px;">
                    <a href="/login" style="background:#6c757d; display:inline-block;">На главную</a>
                    <a href="/activities" style="background:#28a745; display:inline-block;">Записаться</a>
                </div>
                </body></html>
            `);
        } catch (error) { console.error(error); res.status(500).send('Ошибка.'); }
    });

    // 4. ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ
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