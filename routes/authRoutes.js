import express from 'express'; 
import path from 'path'; 
import { ObjectId } from "mongodb";
import { 
    setCache, 
    getCache, 
    clearCache, 
    LOGIN_PAGE_CACHE_KEY 
} from '../cacheService.js';

const __dirname = path.resolve();

// Вспомогательная функция для форматирования времени
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

// Middleware для проверки авторизации
const requireLogin = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        return res.redirect("/login"); 
    }
};

export default (db) => { 
    const router = express.Router();

    // РЕГИСТРАЦИЯ
    router.post("/register", async (req, res) => {
        try {
            const { name, email, password } = req.body;
            const usersCollection = db.collection("users");
            const existingUser = await usersCollection.findOne({ email: email });
            if (existingUser) {
                return res.send(`<h2>Ошибка</h2><p>Email ${email} уже зарегистрирован.</p><a href="/">Вернуться</a>`);
            }
            // 🛑 TODO: В будущем добавить хеширование пароля (bcrypt)
            const newUser = { name, email, password, registeredAt: new Date().toLocaleString(), activities: [] };
            await usersCollection.insertOne(newUser);
            
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            
            res.send(`<h2>Регистрация прошла успешно!</h2><p>Спасибо, ${name}. Теперь вы можете <a href="/login">войти</a>.</p>`);
        } catch (error) {
            console.error("Ошибка при регистрации:", error);
            res.status(500).send("Произошла ошибка на сервере.");
        }
    });

    // СТРАНИЦА ВХОДА (Она же главная)
    router.get("/login", async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            
            let pageData = await getCache(LOGIN_PAGE_CACHE_KEY); 
            
            if (!pageData) {
                console.log('Miss cache [loginPageData]'); 
                 const comments = await db.collection("comments").find().sort({ createdAt: -1 }).toArray(); 
                const users = await db.collection("users").find().toArray(); 
                const chessCount = users.filter(u => u.activities?.includes("Шахматы")).length;
                const footballCount = users.filter(u => u.activities?.includes("Футбол")).length;
                const danceCount = users.filter(u => u.activities?.includes("Танцы")).length;
                const tasks = await db.collection('tasks').find().sort({ createdAt: -1 }).toArray(); 
                const readyDocs = await db.collection('ready_documents').find().sort({ completedAt: -1 }).toArray(); 

                 pageData = { comments, chessCount, footballCount, danceCount, tasks, readyDocs };
                await setCache(LOGIN_PAGE_CACHE_KEY, pageData); 
            } else { 
                console.log('Hit cache [loginPageData]'); 
            }

             let commentsHtml = pageData.comments.map(comment =>
                `<div class="comment"><b>${comment.authorName}:</b> ${comment.text}</div>`
            ).join('');
            
            let tasksHtml = pageData.tasks.map(task => 
                `<div class="work-item"><span>${task.originalName}</span><span class="work-author">Загрузил: ${task.uploadedBy}</span></div>`
            ).join('');
            
            let completedTasksHtml = pageData.readyDocs.map(doc => {
                const completedAt = new Date(doc.completedAt);
                const createdAt = new Date(doc.createdAt);
                 const timeDiff = completedAt.getTime() - createdAt.getTime();
                const timeTaken = formatTime(timeDiff);
                return `<div class="completed-item">✅ <span>${doc.originalName}</span> <span class="completed-details">(Выполнил: ${doc.uploadedBy} | Время: ${timeTaken})</span></div>`;
            }).join('');

            res.send(` 
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8"><title>Вход и Активности</title>
                    <style>
                        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background-image: url('/images/background.jpg'); background-size: cover; background-position: center; background-attachment: fixed; padding: 20px; margin: 0; }
                        .main-wrapper { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; justify-content: center; max-width: 1600px; }
                        .container { width: 100%; max-width: 400px; }
                        .activities-block, .comments-container, .work-block, .completed-work-block { background: rgba(0, 0, 0, 0.7); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 20px; width: 100%; max-width: 380px; }
                        .activities-block h2, .comments-container h3, .work-block h2, .completed-work-block h2 { margin-top: 0; text-align: center; }
                        .activity { background-color: #4CAF50; padding: 15px; margin-bottom: 5px; border-radius: 5px; display: flex; justify-content: space-between; }
                        .special-offer { background-color: #e91e63; justify-content: center; text-align: center; font-weight: bold; font-size: 1.1em; }
                        form { background: rgba(0, 0, 0, 0.7); color: white; padding: 30px; border-radius: 8px; }
                        form h2 { text-align: center; margin-top: 0; }
                        input { width: 95%; padding: 12px; margin-bottom: 15px; border-radius: 5px; border: 1px solid #ccc; }
                        button { width: 100%; padding: 12px; border: none; border-radius: 5px; background-color: #007BFF; color: white; font-size: 16px; cursor: pointer; }
                        a { color: #6cafff; display: block; text-align: center; margin-top: 15px; }
                        .comment { background: rgba(255, 255, 255, 0.1); padding: 10px; border-radius: 5px; margin-bottom: 5px; word-wrap: break-word; }
                        .work-block { border-left: 3px solid #ff9800; }
                        .work-item { background-color: rgba(0, 123, 255, 0.3); padding: 15px; margin-bottom: 5px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; word-break: break-all; }
                        .work-author { font-size: 0.8em; opacity: 0.8; font-style: italic; }
                        .completed-work-block { border-left: 3px solid #28a745; }
                        .completed-item { background-color: rgba(40, 167, 69, 0.3); padding: 15px; margin-bottom: 5px; border-radius: 5px; word-break: break-all; }
                        .completed-details { font-size: 0.9em; opacity: 0.9; color: #f0f0f0; margin-left: 10px; }
                        .activity-link { text-decoration: none; color: white; display: block; }
                        .activity-link .activity:hover { transform: scale(1.03); box-shadow: 0 0 10px rgba(255, 255, 255, 0.3); transition: all 0.2s ease-in-out; }
                    </style>
                </head>
                <body>
                    <div class="main-wrapper">
                        <div class="comments-container">
                            <h3>Последние комментарии</h3>
                            ${commentsHtml.length > 0 ? commentsHtml : "<p>Пока нет комментариев.</p>"}
                        </div>

                        <div class="work-block">
                            <h2>Задачи в работе</h2>
                            ${tasksHtml.length > 0 ? tasksHtml : "<p>Нет активных задач.</p>"}
                        </div>
                        
                        <div class="completed-work-block">
                            <h2>Недавно выполненные</h2>
                            ${completedTasksHtml.length > 0 ? completedTasksHtml : "<p>Нет выполненных задач.</p>"}
                        </div>

                        <div class="container">
                            <div class="activities-block">
                                <h2>Доступные активности</h2>
                                <a href="/activities/Шахматы" target="_blank" class="activity-link">
                                    <div class="activity"><span>Шахматы</span><span>Участников: ${pageData.chessCount}</span></div>
                                </a>
                                <a href="/activities/Футбол" target="_blank" class="activity-link">
                                    <div class="activity"><span>Футбол</span><span>Участников: ${pageData.footballCount}</span></div>
                                </a>
                                <a href="/activities/Танцы" target="_blank" class="activity-link">
                                    <div class="activity"><span>Танцы</span><span>Участников: ${pageData.danceCount}</span></div>
                                </a>
                                <div class="activity special-offer"><span>Я тебя люблю и хочешь подарю целую вечеринку в Париже! ❤️</span></div>
                            </div>
                            <form action="/login" method="POST">
                                <h2>Вход</h2>
                                <input type="email" name="email" placeholder="Email" required>
                                <input type="password" name="password" placeholder="Пароль" required>
                                <button type="submit">Войти</button>
                                <a href="/register.html">Нет аккаунта? Зарегистрироваться</a>
                            </form>
                        </div>
                    </div>
                </body>
                </html>
            `);
        } catch(error) {
            console.error("Ошибка на странице входа:", error);
            res.status(500).send("Произошла ошибка на сервере.");
        }
    });

    // АВТОРИЗАЦИЯ
    router.post("/login", async (req, res) => {
        try {
            const { email, password } = req.body;
            // 🛑 TODO: В будущем добавить bcrypt.compare
            const user = await db.collection("users").findOne({ email: email, password: password });
            if (user) {
                req.session.user = user;
                res.redirect("/profile");
            } else {
                res.send(`<h2>Ошибка входа</h2><p>Неверный email или пароль.</p><a href="/login">Попробовать снова</a>`);
            }
        } catch (error) {
            console.error("Ошибка при авторизации:", error);
            res.status(500).send("Произошла ошибка на сервере.");
        }
    });
    
    // ПРОФИЛЬ
    router.get("/profile", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            
            const user = await db.collection('users').findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            
            if (!user) {
                req.session.destroy();
                return res.redirect('/login');
            }

            const { name, email, registeredAt } = user;
            const availability = user.availability || { days: [], time: "" };

            res.send(` 
                <html>
                <head>
                    <meta charset="UTF-8"><title>Профиль</title>
                    <script src="/ga.js"></script>
                    <style>
                        body { font-family: Arial; padding: 20px; background: url('/images/background.jpg') no-repeat center center fixed; background-size: cover; color: white; text-shadow: 1px 1px 3px black; }
                        .content { background-color: rgba(0,0,0,0.7); padding: 20px; border-radius: 10px; max-width: 600px; margin: 20px auto; }
                        h2, p { margin-bottom: 15px; }
                        button, a { background-color: #444; color: white; padding: 8px 15px; border: none; border-radius: 5px; text-decoration: none; cursor: pointer; display: inline-block; margin: 5px; }
                        .comment-form button { background-color: #007BFF; width: 100%; margin-top: 10px; }
                        hr { margin: 25px 0; border-color: #555; }
                        .availability-form h3 { margin-top: 0; }
                        .availability-form .form-group { margin-bottom: 15px; }
                        .availability-form label { display: block; margin-bottom: 5px; }
                        .availability-form input[type="text"] { width: 95%; padding: 10px; border-radius: 5px; border: 1px solid #ccc; }
                        .availability-form .checkbox-group label { display: inline-block; margin-right: 15px; }
                        .availability-form button { background-color: #28a745; width: 100%; }
                    </style>
                </head>
                <body>
                    <div class="content">
                        <h2>Здравствуйте, ${name}!</h2>
                        <p><b>Email:</b> ${email}</p>
                         <p><b>Дата регистрации:</b> ${registeredAt}</p>
                        <hr>
                         <form action="/update-availability" method="POST" class="availability-form">
                            <h3>Укажите ваши данные и время</h3>
                             <div class="form-group">
                                <label for="phone">Номер телефона:</label>
                                <input type="text" id="phone" name="phone" value="${user.phone || ''}" placeholder="+7 (XXX) XXX-XX-XX">
                            </div> 
                            <div class="form-group">
                                <label for="city">Город:</label>
                                <input type="text" id="city" name="city" value="${user.city || ''}" placeholder="Например: Актау">
                            </div> 
                            <div class="form-group">
                                <label for="country">Страна:</label>
                                <input type="text" id="country" name="country" value="${user.country || ''}" placeholder="Например: Казахстан">
                            </div> 
                            <div class="form-group checkbox-group">
                                <label>Дни недели:</label><br>
                                <input type="checkbox" name="days" value="ПН" ${availability.days.includes('ПН') ? 'checked' : ''}> ПН
                                <input type="checkbox" name="days" value="ВТ" ${availability.days.includes('ВТ') ? 'checked' : ''}> ВТ
                                <input type="checkbox" name="days" value="СР" ${availability.days.includes('СР') ? 'checked' : ''}> СР
                                <input type="checkbox" name="days" value="ЧТ" ${availability.days.includes('ЧТ') ? 'checked' : ''}> ЧТ
                                <input type="checkbox" name="days" value="ПТ" ${availability.days.includes('ПТ') ? 'checked' : ''}> ПТ
                                <input type="checkbox" name="days" value="СБ" ${availability.days.includes('СБ') ? 'checked' : ''}> СБ
                                <input type="checkbox" name="days" value="ВС" ${availability.days.includes('ВС') ? 'checked' : ''}> ВС
                            </div>
                            <div class="form-group">
                                <label for="time">Удобное время (например, 18:00 - 21:00):</label>
                                <input type="text" id="time" name="time" value="${availability.time}" placeholder="18:00 - 21:00">
                            </div>
                            <button type="submit">Сохранить данные</button>
                        </form>
                        <hr> 
                        <form action="/post-comment" method="POST" class="comment-form">
                            <h3>Оставить комментарий</h3>
                            <textarea name="commentText" rows="3" placeholder="Напишите что-нибудь..." required></textarea>
                            <button type="submit">Отправить</button>
                        </form>
                        <hr> 
                        <form action="/logout" method="POST" style="display:inline-block;"><button type="submit">Выйти</button></form>
                        <a href="/">На главную</a>
                        <a href="/activities">Посмотреть активности</a>
                        <a href="/work" class="work-button">Перейти к работе</a>
                    </div>
                </body>
                </html>
            `);
        } catch (error) {
            console.error("Ошибка на странице профиля:", error);
            res.status(500).send("Произошла ошибка на сервере.");
        }
    });

    // Обновление свободного времени пользователя
    router.post('/update-availability', requireLogin, async (req, res) => {
        try {
            const { days, time, phone, city, country } = req.body;
            const userId = ObjectId.createFromHexString(req.session.user._id);

            const daysArray = Array.isArray(days) ? days : (days ? [days] : []); 

            const updateQuery = {
                $set: { 
                    phone: phone,
                    city: city,
                    country: country,
                    availability: { days: daysArray, time: time }
                }
            };

            await db.collection('users').updateOne({ _id: userId }, updateQuery);
            
            req.session.user.availability = { days: daysArray, time: time }; 
            req.session.user.phone = phone;
            req.session.user.city = city;
            req.session.user.country = country;

            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            
            res.redirect('/profile');

        } catch (error) {
            console.error('Ошибка при обновлении времени доступности:', error);
            res.status(500).send('Не удалось обновить данные.');
        }
    });

    // СОХРАНЕНИЕ КОММЕНТАРИЕВ
    router.post("/post-comment", requireLogin, async (req, res) => {
        try {
            const { commentText } = req.body;
            const commentsCollection = db.collection("comments");
            const newComment = {
                authorName: req.session.user.name,
                text: commentText,
                createdAt: new Date()
            };
            await commentsCollection.insertOne(newComment);
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.redirect("/profile");
        } catch (error) {
            console.error("Ошибка при сохранении комментария:", error);
            res.status(500).send("Не удалось сохранить комментарий.");
        }
    });

    // ВЫХОД
    router.post("/logout", (req, res) => {
        req.session.destroy(err => {
            if (err) return res.redirect('/profile');
            res.clearCookie('connect.sid');
            res.redirect('/');
        });
    });

    return router;
};