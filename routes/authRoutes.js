// routes/authRoutes.js
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

// Вспомогательная функция для форматирования времени (скопирована из server.js)
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

// Функция, возвращающая Express Router
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
            // 🛑 ВНИМАНИЕ: Здесь нужно внедрить хеширование пароля (bcrypt)!
            const newUser = { name, email, password, registeredAt: new Date().toLocaleString(), activities: [] };
            await usersCollection.insertOne(newUser);
            
            await clearCache(LOGIN_PAGE_CACHE_KEY);  
            
            res.send(`<h2>Регистрация прошла успешно!</h2><p>Спасибо, ${name}. Теперь вы можете <a href="/login">войти</a>.</p>`);
        } catch (error) {
            console.error("Ошибка при регистрации:", error);
            res.status(500).send("Произошла ошибка на сервере.");
        }
    });

    // СТРАНИЦА ВХОДА (Она же главная, по сути)
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

            // --- Формирование HTML (перенесено из server.js) ---
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
                    <style>/* ... СТИЛИ (сокращено) ... */</style>
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
            // 🛑 ВНИМАНИЕ: Здесь нужно использовать сравнение хеша (bcrypt.compare)!
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
                    <style>/* ... Стили профиля (сокращено) ... */</style>
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
                    availability: {
                        days: daysArray,
                        time: time
                    }
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