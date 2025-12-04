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

// Функция для проверки, картинка это или нет
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

    // 2. СТРАНИЦА ВХОДА
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
            
            // --- ГЕНЕРАЦИЯ ГАЛЕРЕИ ДЛЯ "В РАБОТЕ" ---
            let tasksHtml = `<div class="gallery-grid">` + pageData.tasks.map(t => {
                const url = `/uploads/${t.fileName}`;
                // Если картинка - показываем фото, если нет - иконку
                const content = isImage(t.fileName) 
                    ? `<img src="${url}" alt="${t.originalName}">`
                    : `<div class="file-icon">📄</div>`;
                
                return `<a href="${url}" target="_blank" class="gallery-item work-border" title="${t.originalName}">
                            ${content}
                        </a>`;
            }).join('') + `</div>`;

            // --- ГЕНЕРАЦИЯ ГАЛЕРЕИ ДЛЯ "ВЫПОЛНЕНО" ---
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
                        body { font-family: Arial; background: url('/images/background.jpg') center/cover fixed; display: flex; justify-content: center; padding: 20px; margin: 0; }
                        .main-wrapper { display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; max-width: 1200px; }
                        .block { background: rgba(0,0,0,0.7); color: white; padding: 20px; border-radius: 8px; width: 320px; margin-bottom: 20px; }
                        input, button { width: 95%; padding: 10px; margin-bottom: 10px; border-radius: 5px; box-sizing: border-box; }
                        button { background: #007BFF; color: white; border: none; cursor: pointer; width: 100%; font-size: 16px; }
                        
                        /* СТИЛИ ДЛЯ ГАЛЕРЕИ (ФОТО) */
                        .gallery-grid {
                            display: flex;
                            flex-wrap: wrap;
                            gap: 8px;
                            justify-content: flex-start;
                        }
                        .gallery-item {
                            width: 85px;  /* Маленький размер */
                            height: 85px; /* Квадрат */
                            display: block;
                            overflow: hidden;
                            border-radius: 5px;
                            transition: transform 0.2s;
                            background: rgba(255,255,255,0.1);
                            display: flex; justify-content: center; align-items: center; text-decoration: none;
                        }
                        .gallery-item img {
                            width: 100%;
                            height: 100%;
                            object-fit: cover; /* Заполняет квадрат, обрезая лишнее */
                        }
                        .gallery-item:hover {
                            transform: scale(1.1); /* Увеличение при наведении */
                            z-index: 10;
                            box-shadow: 0 0 10px rgba(255,255,255,0.5);
                        }
                        .work-border { border: 2px solid orange; }
                        .ready-border { border: 2px solid #28a745; }
                        .file-icon { font-size: 40px; }

                        /* КНОПКИ АКТИВНОСТЕЙ */
                        a.activity-btn { 
                            display: block; width: 100%; padding: 12px; margin-bottom: 10px; color: white; text-align: center; text-decoration: none; border-radius: 5px; box-sizing: border-box; font-weight: bold; border: 1px solid rgba(255,255,255,0.2); transition: 0.3s;
                        }
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
                            <h3>В работе (Галерея)</h3>
                            ${tasksHtml || "<p>Нет задач</p>"}
                        </div>
                         <div class="block">
                            <h3>Выполнено (Галерея)</h3>
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
            const user = await db.collection("users").findOne({ email: req.body.email, password: req.body.password });
            if (user) { req.session.user = user; res.redirect("/profile"); }
            else { res.send(`<h2>Ошибка</h2><p>Неверно.</p><a href="/login">Назад</a>`); }
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });
    
    // 3. ПРОФИЛЬ
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

    // ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ 
    router.get('/privacy-policy', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8"><title>Политика</title>
                <style>body{font-family:Arial;padding:20px;max-width:800px;margin:auto;background:#fff;color:#333}</style>
            </head>
            <body>
                <h1>Политика конфиденциальности</h1>
                <p>Мы защищаем ваши данные. Мы не передаем их третьим лицам.</p>
                <a href="/register">Вернуться</a>
            </body>
            </html>
        `);
    }); 

    return router;
};