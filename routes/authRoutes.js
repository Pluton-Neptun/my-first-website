import express from 'express';
import path from 'path';
import { ObjectId } from "mongodb";
import { setCache, getCache, clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const __dirname = path.resolve();

// Вспомогательная функция времени
function formatTime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));
    let parts = [];
    if (hours > 0) parts.push(`${hours}ч`);
    if (minutes > 0) parts.push(`${minutes}м`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}с`);
    return parts.join(' ');
}

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db) => {
    const router = express.Router();

    // 1. СТРАНИЦА РЕГИСТРАЦИИ (Чистая, без городов и стран)
    router.get('/register.html', (req, res) => res.redirect('/register')); 
    
    router.get('/register', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Регистрация</title>
                <script src="/ga.js"></script>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-image: url('/images/background.jpg'); background-size: cover; background-position: center; background-attachment: fixed; }
                    form { background: rgba(0, 0, 0, 0.7); padding: 30px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.5); width: 320px; }
                    h2 { color: white; text-align: center; margin-bottom: 20px; }
                    input { width: 95%; padding: 12px; margin-bottom: 15px; border-radius: 5px; border: 1px solid #ccc; background-color: #f4f4f4; }
                    button { width: 100%; padding: 12px; border: none; border-radius: 5px; background-color: #28a745; color: white; font-size: 16px; cursor: pointer; transition: background-color 0.3s; }
                    button:hover { background-color: #218838; }
                    a { color: #6cafff; display: block; text-align: center; margin-top: 15px; }
                    .consent-group { margin-bottom: 15px; color: white; font-size: 0.9em; }
                    .consent-group a { display: inline; margin: 0; }
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
                        <label for="consent">Я согласен с <a href="/privacy-policy" target="_blank">Политикой конфиденциальности</a></label>
                    </div>
                    <button type="submit">Зарегистрироваться</button>
                    <a href="/login">Уже есть аккаунт? Войти</a>
                </form>
            </body>
            </html>
        `);
    });

    router.post("/register", async (req, res) => {
        try {
            const { name, email, password } = req.body;
            const existingUser = await db.collection("users").findOne({ email: email });
            if (existingUser) return res.send(`<h2>Ошибка</h2><p>Email ${email} уже зарегистрирован.</p><a href="/register">Назад</a>`);
            
            // Создаем пользователя (пока без телефона и города)
            const newUser = { 
                name, email, password, 
                phone: "", city: "", country: "", 
                registeredAt: new Date().toLocaleString(), activities: [] 
            };
         await db.collection("users").insertOne(newUser);
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.send(`<h2>Успешно!</h2><p>Спасибо, ${name}. <a href="/login">Войти</a>.</p>`);
        } catch (error) { console.error(error); res.status(500).send("Ошибка сервера."); }
    });

    // 2. СТРАНИЦА ВХОДА (ГЛАВНАЯ)
    router.get("/login", async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            let pageData = await getCache(LOGIN_PAGE_CACHE_KEY); 
            
            if (!pageData) {
                const comments = await db.collection("comments").find().sort({ createdAt: -1 }).toArray(); 
                const users = await db.collection("users").find().toArray(); 
                const tasks = await db.collection('tasks').find().sort({ createdAt: -1 }).toArray(); 
                const readyDocs = await db.collection('ready_documents').find().sort({ completedAt: -1 }).toArray(); 
                pageData = { 
                    comments, tasks, readyDocs,
                    chessCount: users.filter(u => u.activities?.includes("Шахматы")).length,
                    footballCount: users.filter(u => u.activities?.includes("Футбол")).length,
                    danceCount: users.filter(u => u.activities?.includes("Танцы")).length
                };
                await setCache(LOGIN_PAGE_CACHE_KEY, pageData); 
            }

            let commentsHtml = pageData.comments.map(c => `<div class="comment"><b>${c.authorName}:</b> ${c.text}</div>`).join('');
            let tasksHtml = pageData.tasks.map(t => `<div class="work-item"><span>${t.originalName}</span><span class="work-author">${t.uploadedBy}</span></div>`).join('');
            let completedHtml = pageData.readyDocs.map(doc => {
                const time = formatTime(new Date(doc.completedAt) - new Date(doc.createdAt));
                return `<div class="completed-item">✅ <span>${doc.originalName}</span> <span class="completed-details">(${doc.uploadedBy} | ${time})</span></div>`;
            }).join('');

            res.send(` 
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8"><title>Вход</title>
                    <script src="/ga.js"></script>
                    <style>
                        body { font-family: Arial; background: url('/images/background.jpg') center/cover fixed; display: flex; justify-content: center; padding: 20px; margin: 0; }
                        .main-wrapper { display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; max-width: 1200px; }
                        .block { background: rgba(0,0,0,0.7); color: white; padding: 20px; border-radius: 8px; width: 320px; margin-bottom: 20px; }
                        input, button { width: 95%; padding: 10px; margin-bottom: 10px; border-radius: 5px; }
                        button { background: #007BFF; color: white; border: none; cursor: pointer; }
                        .comment { background: rgba(255,255,255,0.1); padding: 5px; margin-bottom: 5px; }
                        a { color: #6cafff; display: block; text-align: center; }
                        /* Ссылки на активности */
                        a.activity-link { display: inline-block; text-align: left; margin: 5px 0; font-size: 1.1em; text-decoration: none; border-bottom: 1px dashed #6cafff; color: white; }
                        a.activity-link:hover { color: #6cafff; border-bottom-style: solid; }
                        
                        h2, h3 { text-align: center; margin-top: 0; }
                        .work-item { border-left: 3px solid orange; padding: 5px; background: rgba(255,165,0,0.2); margin-bottom: 5px; }
                        .completed-item { border-left: 3px solid green; padding: 5px; background: rgba(0,128,0,0.2); margin-bottom: 5px; }
                    </style>
                </head>
                <body>
                    <div class="main-wrapper">
                        <div class="block">
                            <h3>Вход</h3>
                            <form action="/login" method="POST">
                                <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                                <input type="email" name="email" placeholder="Email" required>
                                <input type="password" name="password" placeholder="Пароль" required>
                                <button type="submit">Войти</button>
                                <a href="/register">Нет аккаунта? Регистрация</a>
                            </form>
                            <hr>
                            <h3>Активности (Нажмите):</h3>
                            <p><a href="/activities/Шахматы" target="_blank" class="activity-link">♟️ Шахматы: ${pageData.chessCount}</a></p>
                            <p><a href="/activities/Футбол" target="_blank" class="activity-link">⚽ Футбол: ${pageData.footballCount}</a></p>
                            <p><a href="/activities/Танцы" target="_blank" class="activity-link">💃 Танцы: ${pageData.danceCount}</a></p>
                        </div>
                        
                        <div class="block">
                            <h3>Последние комментарии</h3>
                            ${commentsHtml || "<p>Пусто</p>"}
                        </div>
                        <div class="block">
                            <h3>В работе</h3>
                            ${tasksHtml || "<p>Нет задач</p>"}
                        </div>
                         <div class="block">
                            <h3>Выполнено</h3>
                            ${completedHtml || "<p>Нет задач</p>"}
                        </div>
                    </div>
                </body>
                </html>
            `);
        } catch(error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    router.post("/login", async (req, res) => {
        try {
            const { email, password } = req.body;
            const user = await db.collection("users").findOne({ email, password });
            if (user) {
                req.session.user = user;
                res.redirect("/profile");
            } else {
                res.send(`<h2>Ошибка</h2><p>Неверные данные.</p><a href="/login">Назад</a>`);
            }
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });
    
    // 3. ПРОФИЛЬ (Здесь заполняем Телефон, Город, Страну)
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
                        .content { background: rgba(0,0,0,0.7); padding: 20px; border-radius: 10px; max-width: 600px; margin: auto; }
                        input, button, textarea { width: 95%; padding: 10px; margin: 5px 0; border-radius: 5px; }
                        button { background: #28a745; color: white; border: none; cursor: pointer; }
                        .logout-btn { background: #dc3545; }
                        a { color: #6cafff; display: block; margin-top: 10px; text-align: center; }
                     .availability-form h3 { margin-top: 0; }
                     .availability-form label { display: block; margin-bottom: 5px; }
                        .checkbox-group label { display: inline-block; margin-right: 15px; }
                    </style>
                </head>
                <body>
                    <div class="content">
                        <h2>Привет, ${user.name}!</h2>
                        <p><b>Email:</b> ${user.email}</p>
                     <hr>
                        
                        <form action="/update-availability" method="POST" class="availability-form">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <h3>Заполните данные для активностей:</h3>
                            
                            <label>Номер телефона:</label>
                            <input type="text" name="phone" value="${user.phone || ''}" placeholder="+7 (XXX) XXX-XX-XX">
                            
                            <label>Город:</label>
                            <input type="text" name="city" value="${user.city || ''}" placeholder="Например: Актау">
                            
                            <label>Страна:</label>
                            <input type="text" name="country" value="${user.country || ''}" placeholder="Например: Казахстан">

                            <div class="checkbox-group">
                                <label>Дни:</label><br>
                            <label><input type="checkbox" name="days" value="ПН" ${availability.days.includes('ПН')?'checked':''}>ПН</label>
                                <label><input type="checkbox" name="days" value="СР" ${availability.days.includes('СР')?'checked':''}>СР</label>
                             <label><input type="checkbox" name="days" value="ПТ" ${availability.days.includes('ПТ')?'checked':''}>ПТ</label>
                        </div>
                            
                            <label>Удобное время:</label>
                            <input type="text" name="time" value="${availability.time}" placeholder="18:00 - 20:00">
                            
                            <button type="submit">Сохранить</button>
                        </form>

                        <hr>
                        <form action="/post-comment" method="POST">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <h3>Комментарий</h3>
                            <textarea name="commentText" required></textarea>
                            <button type="submit" style="background:#007BFF">Отправить</button>
                        </form>
                        <hr>
                        <form action="/logout" method="POST" style="text-align:center">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <button type="submit" class="logout-btn">Выйти</button>
                        </form>
                        <a href="/activities">Активности</a>
                        <a href="/work">Рабочий раздел</a>
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
            await db.collection('users').updateOne({ _id: ObjectId.createFromHexString(req.session.user._id) }, {
                $set: { phone, city, country, availability: { days: daysArray, time } }
            });
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.redirect('/profile');
        } catch (error) { console.error(error); res.status(500).send('Ошибка.'); }
    });

    // 4. СТРАНИЦА СПИСКА УЧАСТНИКОВ (Вот здесь всё отсвечивается!)
    router.get('/activities/:activityName', async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            const activityName = req.params.activityName;
            const participants = await db.collection('users').find({ activities: activityName }).toArray();

            let participantsHtml = participants.map(p => {
                const availability = p.availability || { days: [], time: '...' };
                const daysString = availability.days.join(', ') || '...';
                
                // ПОКАЗЫВАЕМ ВСЕ ДАННЫЕ ВМЕСТЕ
                return `
                    <div class="participant-card">
                        <h3>${p.name}</h3>
                        <p>📞 <strong>Телефон:</strong> ${p.phone || 'Не указан'}</p>
                        <p>🌍 <strong>Город/Страна:</strong> ${p.city || ''}, ${p.country || ''}</p>
                        <p>📅 <strong>Время:</strong> ${daysString} | ${availability.time}</p>
                    </div>
                `;
            }).join('');

            if (participants.length === 0) participantsHtml = '<p>Пока никого нет.</p>';

            res.send(` 
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8"><title>${activityName}</title>
                    <style>
                        body { font-family: Arial; padding: 20px; background-color: #f4f4f4; }
                        .container { max-width: 800px; margin: 0 auto; }
                        .participant-card { background: white; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                        h1 { color: #0056b3; }
                        h3 { margin-top: 0; color: #28a745; }
                        a { color: #007BFF; text-decoration: none; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Участники: ${activityName}</h1>
                        ${participantsHtml}
                        <br><a href="/login">На главную</a>
                    </div>
                </body>
                </html>
            `);
        } catch (error) { console.error(error); res.status(500).send('Ошибка.'); }
    });

    // СОХРАНЕНИЕ КОММЕНТАРИЕВ
    router.post("/post-comment", requireLogin, async (req, res) => {
        try {
            await db.collection("comments").insertOne({ authorName: req.session.user.name, text: req.body.commentText, createdAt: new Date() });
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.redirect("/profile");
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    // ВЫХОД
    router.post("/logout", (req, res) => {
        req.session.destroy(() => { res.clearCookie('connect.sid'); res.redirect('/'); });
    });

    return router;
};