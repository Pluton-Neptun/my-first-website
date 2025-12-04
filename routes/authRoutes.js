import express from 'express';
import path from 'path';
import { ObjectId } from "mongodb";
import { setCache, getCache, clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const __dirname = path.resolve();

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

function isImage(filename) {
    return filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
}

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db) => {
    const router = express.Router();

    // 1. РЕГИСТРАЦИЯ
    router.get('/register.html', (req, res) => res.redirect('/register')); 
    
    router.get('/register', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8"><title>Регистрация</title>
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
                        <label for="consent">Я согласен с <a href="/privacy-policy" target="_blank">Политикой</a></label>
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
            if (existingUser) return res.send(`<h2>Ошибка</h2><p>Email занят.</p><a href="/register">Назад</a>`);
            const newUser = { name, email, password, phone: "", city: "", country: "", registeredAt: new Date().toLocaleString(), activities: [] };
            await db.collection("users").insertOne(newUser);
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.send(`<h2>Успешно!</h2><p><a href="/login">Войти</a></p>`);
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    // 2. ГЛАВНАЯ (ВХОД)
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
            
            // ГАЛЕРЕЯ "КОКТЕЙЛЬ"
            let tasksHtml = `<div class="gallery-grid">` + pageData.tasks.map(t => {
                const url = `/uploads/${t.fileName}`;
                const content = isImage(t.fileName) 
                    ? `<img src="${url}" alt="${t.originalName}">`
                    : `<div class="file-icon">📄</div>`;
                
                // ✅ НОВАЯ ЛОГИКА СТАТУСОВ
                let displayText = '';
                let displayClass = '';

                // 1. Если написана сумма - показываем только её
                if (t.amount && t.amount.trim() !== '') {
                    displayText = t.amount;
                    displayClass = 'status-amount'; // Голубой цвет
                } 
                // 2. Иначе показываем стандартный статус
                else {
                    if (t.status === 'free') { displayText = 'Свободна сегодня'; displayClass = 'status-free'; }
                    else if (t.status === 'company') { displayText = 'Ждем компанию'; displayClass = 'status-company'; }
                    else { displayText = 'Временно занята'; displayClass = 'status-busy'; }
                }

                return `
                    <div class="gallery-wrapper">
                        <a href="${url}" target="_blank" class="gallery-item work-border" title="${t.originalName}">
                            ${content}
                        </a>
                        <div class="status-label ${displayClass}">${displayText}</div>
                    </div>
                `;
            }).join('') + `</div>`;

            let completedHtml = `<div class="gallery-grid">` + pageData.readyDocs.map(d => {
                const url = `/uploads/${d.fileName}`;
                const content = isImage(d.fileName) 
                    ? `<img src="${url}" alt="${d.originalName}">`
                    : `<div class="file-icon">✅</div>`;
                
                return `<a href="${url}" target="_blank" class="gallery-item ready-border" title="Выполнил: ${d.uploadedBy}">
                            ${content}
                        </a>`;
            }).join('') + `</div>`;

            res.send(` 
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8"><title>Вход</title>
                    <script src="/ga.js"></script>
                    <style>
                        html { scroll-snap-type: y mandatory; }
                        body { font-family: Arial; background: url('/images/background.jpg') center/cover fixed; margin: 0; height: 100vh; overflow-y: scroll; }

                        .page-section { min-height: 100vh; width: 100%; scroll-snap-align: start; display: flex; justify-content: center; align-items: flex-start; padding-top: 40px; box-sizing: border-box; position: relative; }
                        .second-page { background: rgba(0, 0, 0, 0.4); align-items: center; }
                        .scroll-hint { position: absolute; bottom: 20px; color: white; font-size: 24px; animation: bounce 2s infinite; opacity: 0.7; }
                        @keyframes bounce { 0%, 20%, 50%, 80%, 100% {transform: translateY(0);} 40% {transform: translateY(-10px);} 60% {transform: translateY(-5px);} }

                        .main-wrapper { display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; max-width: 1200px; padding-bottom: 50px; }
                        .block { background: rgba(0,0,0,0.7); color: white; padding: 20px; border-radius: 8px; width: 320px; margin-bottom: 20px; }
                        input, button { width: 95%; padding: 10px; margin-bottom: 10px; border-radius: 5px; box-sizing: border-box; }
                        button { background: #007BFF; color: white; border: none; cursor: pointer; width: 100%; font-size: 16px; }
                        
                        .gallery-grid { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-start; }
                        .gallery-wrapper { display: flex; flex-direction: column; align-items: center; width: 90px; }
                        .gallery-item { width: 85px; height: 85px; display: flex; justify-content: center; align-items: center; overflow: hidden; border-radius: 5px; background: rgba(255,255,255,0.1); transition: transform 0.2s; }
                        .gallery-item img { width: 100%; height: 100%; object-fit: cover; }
                        .gallery-item:hover { transform: scale(1.1); z-index: 10; box-shadow: 0 0 10px rgba(255,255,255,0.5); }
                        .work-border { border: 2px solid orange; }
                        .ready-border { border: 2px solid #28a745; }
                        .file-icon { font-size: 40px; }
                        
                        .status-label { font-size: 10px; text-align: center; margin-top: 4px; font-weight: bold; width: 100%; word-break: break-word; }
                        
                        /* ЦВЕТА СТАТУСОВ */
                        .status-free { color: #28a745; } /* Зеленый */
                        .status-company { color: #ffc107; } /* Оранжевый */
                        .status-busy { color: #ccc; font-style: italic; } /* Серый */
                        .status-amount { color: #00c3ff; font-size: 11px; } /* ✅ Голубой (для суммы) */

                        a.activity-btn { display: block; width: 100%; padding: 12px; margin-bottom: 10px; color: white; text-align: center; text-decoration: none; border-radius: 5px; box-sizing: border-box; font-weight: bold; border: 1px solid rgba(255,255,255,0.2); transition: 0.3s; }
                        .chess-btn { background-color: #6f42c1; } 
                        .foot-btn { background-color: #fd7e14; } 
                        .dance-btn { background-color: #e83e8c; } 
                        a.activity-btn:hover { transform: scale(1.02); opacity: 0.9; }
                        
                        .comment { background: rgba(255,255,255,0.1); padding: 5px; margin-bottom: 5px; }
                        a.link { color: #6cafff; display: block; text-align: center; margin-top: 10px; }
                        h2, h3 { text-align: center; margin-top: 0; }
                    </style>
                </head>
                <body>
                    <div class="page-section">
                        <div class="main-wrapper">
                            <div class="block">
                                <h3>Вход</h3>
                                <form action="/login" method="POST">
                                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                                    <input type="email" name="email" placeholder="Email" required>
                                    <input type="password" name="password" placeholder="Пароль" required>
                                    <button type="submit">Войти</button>
                                    <a href="/register" class="link">Нет аккаунта? Регистрация</a>
                                </form>
                                <hr>
                                <h3>Активности:</h3>
                                <a href="/activities/Шахматы" target="_blank" class="activity-btn chess-btn">♟️ Шахматы (${pageData.chessCount})</a>
                                <a href="/activities/Футбол" target="_blank" class="activity-btn foot-btn">⚽ Футбол (${pageData.footballCount})</a>
                                <a href="/activities/Танцы" target="_blank" class="activity-btn dance-btn">💃 Танцы (${pageData.danceCount})</a>
                            </div>
                            
                            <div class="block">
                                <h3>Последние комментарии</h3>
                                ${commentsHtml || "<p>Пусто</p>"}
                            </div>
                            <div class="block">
                                <h3>🍹 Коктейль (Галерея)</h3>
                                ${tasksHtml || "<p>Нет загрузок</p>"}
                            </div>
                            <div class="block">
                                <h3>Выполнено (Галерея)</h3>
                                ${completedHtml || "<p>Нет задач</p>"}
                            </div>
                        </div>
                        <div class="scroll-hint">⬇</div>
                    </div>

                    <div class="page-section second-page">
                        <h2 style="color: rgba(255,255,255,0.3);">Второй лист (Пусто)</h2>
                    </div>

                </body>
                </html>
            `);
        } catch(error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    router.post("/login", async (req, res) => {
        try {
            const user = await db.collection("users").findOne({ email: req.body.email, password: req.body.password });
            if (user) { req.session.user = user; res.redirect("/profile"); }
            else { res.send(`<h2>Ошибка</h2><p>Неверно.</p><a href="/login">Назад</a>`); }
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });
    
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
                        .checkbox-group label { display: inline-block; margin-right: 15px; }
                    </style>
                </head>
                <body>
                    <div class="content">
                        <h2>Привет, ${user.name}!</h2>
                        <p><b>Email:</b> ${user.email}</p>
                        <hr>
                        <form action="/update-availability" method="POST">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <h3>Ваши данные:</h3>
                            <label>Телефон:</label>
                            <input type="text" name="phone" value="${user.phone || ''}" placeholder="+7 (XXX) XXX-XX-XX">
                            <label>Город:</label>
                            <input type="text" name="city" value="${user.city || ''}" placeholder="Город">
                            <label>Страна:</label>
                            <input type="text" name="country" value="${user.country || ''}" placeholder="Страна">
                            <div class="checkbox-group">
                                <label>Дни:</label><br>
                                <label><input type="checkbox" name="days" value="ПН" ${availability.days.includes('ПН')?'checked':''}>ПН</label>
                                <label><input type="checkbox" name="days" value="СР" ${availability.days.includes('СР')?'checked':''}>СР</label>
                                <label><input type="checkbox" name="days" value="ПТ" ${availability.days.includes('ПТ')?'checked':''}>ПТ</label>
                            </div>
                            <label>Время:</label>
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
                        <a href="/work">Коктейль можно попить 🍹</a>
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

    router.get("/activities", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate');  
            const users = await db.collection("users").find().toArray();
            let userActivities = [];
            
            const currentUser = await db.collection("users").findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            if (currentUser) {
                userActivities = currentUser.activities || [];
            }
            
            const chessCount = users.filter(u => u.activities?.includes("Шахматы")).length;
            const footballCount = users.filter(u => u.activities?.includes("Футбол")).length;
            const danceCount = users.filter(u => u.activities?.includes("Танцы")).length;
            
            res.send(` 
                <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Активности</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background-color: #f0f0f0; margin: 0; }
                    .tab-container { max-width: 600px; margin: 20px auto; }
                    .activity-card { padding: 15px; background-color: white; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 8px; }
                    .activity-header { display: flex; justify-content: space-between; align-items: center; font-size: 1.2em; font-weight: bold; }
                    .btn { padding: 8px 12px; border: none; border-radius: 5px; color: white; cursor: pointer; text-decoration: none; font-size: 1em;}
                    .btn-join { background-color: #28a745; } .btn-leave { background-color: #dc3545; }
                    a.back-link { color: #007BFF; text-decoration: none; font-weight: bold; }
                </style></head><body>
                <div class="tab-container">
                    <h2>Доступные активности</h2>
                    <div class="activity-card"><div class="activity-header"><span>Шахматы</span><span>Участников: ${chessCount}</span></div>
                        <form action="/update-activity" method="POST" style="display:inline;">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <input type="hidden" name="activity" value="Шахматы">
                        ${userActivities.includes("Шахматы") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                        </form></div>
                    <div class="activity-card"><div class="activity-header"><span>Футбол</span><span>Участников: ${footballCount}</span></div>
                        <form action="/update-activity" method="POST" style="display:inline;">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <input type="hidden" name="activity" value="Футбол">
                        ${userActivities.includes("Футбол") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                        </form></div>
                    <div class="activity-card"><div class="activity-header"><span>Танцы</span><span>Участников: ${danceCount}</span></div>
                        <form action="/update-activity" method="POST" style="display:inline;">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <input type="hidden" name="activity" value="Танцы">
                        ${userActivities.includes("Танцы") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                        </form></div>
                    <br><a href="/profile" class="back-link">Вернуться в профиль</a>
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

    router.get('/activities/:activityName', async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            const activityName = req.params.activityName;
            const participants = await db.collection('users').find({ activities: activityName }).toArray();
            let html = participants.map(p => `
                <div class="card">
                    <h3>${p.name}</h3>
                    <p>📞 ${p.phone || 'Нет'}</p>
                    <p>🌍 ${p.city || ''} ${p.country || ''}</p>
                    <p>📅 ${(p.availability?.days||[]).join(', ')} | ${p.availability?.time || ''}</p>
                </div>`).join('') || '<p>Пусто</p>';
            res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${activityName}</title><style>body{font-family:Arial;padding:20px;background:#eee}.card{background:white;padding:15px;margin-bottom:10px;border-radius:5px}</style></head><body><h1>${activityName}</h1>${html}<br><a href="/login">Назад</a></body></html>`);
        } catch (error) { console.error(error); res.status(500).send('Ошибка.'); }
    });

    router.post("/post-comment", requireLogin, async (req, res) => {
        try {
            await db.collection("comments").insertOne({ authorName: req.session.user.name, text: req.body.commentText, createdAt: new Date() });
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.redirect("/profile");
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    router.post("/logout", (req, res) => {
        req.session.destroy(() => { res.clearCookie('connect.sid'); res.redirect('/'); });
    });

    router.get('/privacy-policy', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Политика конфиденциальности</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; background-color: #f4f4f4; color: #333; }
                    .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                    h1 { color: #2c3e50; }
                    h2 { color: #34495e; margin-top: 20px; }
                    p { margin-bottom: 15px; }
                    a.btn { display: inline-block; background-color: #007BFF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                    a.btn:hover { background-color: #0056b3; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Политика конфиденциальности</h1>
                    <p>Последнее обновление: ${new Date().toLocaleDateString()}</p>
                    
                    <h2>1. Сбор информации</h2>
                    <p>Мы собираем только ту информацию, которую вы предоставляете добровольно при регистрации: Имя, Email, а также данные профиля (Город, Страна, Телефон).</p>

                    <h2>2. Использование информации</h2>
                    <p>Информация используется для организации доступа к сервисам сайта, включая участие в активностях (Шахматы, Футбол, Танцы) и ведение рабочих задач.</p>

                    <h2>3. Защита данных</h2>
                    <p>Мы принимаем меры безопасности для защиты ваших данных. Пароли и личная информация хранятся в защищенной базе данных.</p>

                    <h2>4. Передача третьим лицам</h2>
                    <p>Мы не продаем, не обмениваем и не передаем вашу личную информацию посторонним лицам.</p>

                    <a href="/register" class="btn">Вернуться к регистрации</a>
                </div>
            </body>
            </html>
        `);
    });

    return router;
};