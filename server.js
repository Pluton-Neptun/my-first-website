import open from 'open';
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from 'url';
import session from "express-session";
import cors from "cors"; 
import MongoStore from 'connect-mongo';
// ✅ ИСПРАВЛЕНО: Добавлен ObjectId в импорт
import { MongoClient, ObjectId } from "mongodb";
import 'dotenv/config';

// --- Инициализация Express ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
    secret: "my_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.DATABASE_URL
    })
}));

// --- Настройка подключения к базе данных ---
const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

async function connectToDb() {
    try {
        await mongoClient.connect();
        console.log("Успешно подключились к MongoDB");
        db = mongoClient.db("my-first-website-db");
        
        app.listen(PORT, () => {
            console.log(`Сервер запущен: http://localhost:${PORT}`);
            if (!process.env.RENDER) {
                open(`http://localhost:${PORT}`);
            }
        });
    } catch (error) {
        console.error("Не удалось подключиться к MongoDB", error);
        process.exit(1);
    }
}

// --- Маршруты (Routes) ---

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect("/login");
};

// РЕГИСТРАЦИЯ
app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const usersCollection = db.collection("users");
        const existingUser = await usersCollection.findOne({ email: email });
        if (existingUser) {
            return res.send(`<h2>Ошибка</h2><p>Email ${email} уже зарегистрирован.</p><a href="/">Вернуться</a>`);
        }
        const newUser = { name, email, password, registeredAt: new Date().toLocaleString(), activities: [] };
        await usersCollection.insertOne(newUser);
        res.send(`<h2>Регистрация прошла успешно!</h2><p>Спасибо, ${name}. Теперь вы можете <a href="/login">войти</a>.</p>`);
    } catch (error) {
        res.status(500).send("Произошла ошибка на сервере.");
    }
});


// СТРАНИЦА ВХОДА (с отображением комментариев)
// СТРАНИЦА ВХОДА (с исправленной вёрсткой)
app.get("/login", async (req, res) => {
    try {
        // Получаем все комментарии из базы данных
        const comments = await db.collection("comments").find().sort({ createdAt: -1 }).toArray();
        let commentsHtml = comments.map(comment =>
            `<div class="comment"><b>${comment.authorName}:</b> ${comment.text}</div>`
        ).join('');

        // Остальная логика без изменений
        const users = await db.collection("users").find().toArray();
        const chessCount = users.filter(u => u.activities?.includes("Шахматы")).length;
        const footballCount = users.filter(u => u.activities?.includes("Футбол")).length;
        const danceCount = users.filter(u => u.activities?.includes("Танцы")).length;

        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8"><title>Вход и Активности</title>
                <style>
                    body {
                        font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;
                        background-image: url('/images/background.jpg'); background-size: cover; background-position: center;
                        background-attachment: fixed; padding: 20px; margin: 0;
                    }
                    /* ✅ ОБНОВЛЁННЫЙ КОНТЕЙНЕР-ОБЁРТКА */
                    .main-wrapper {
                        display: flex;
                        gap: 20px; /* Расстояние между блоками */
                        align-items: flex-start; /* Выравнивание по верху */
                        flex-wrap: wrap; /* Перенос на новую строку на маленьких экранах */
                        justify-content: center;
                    }
                    .container { width: 100%; max-width: 500px; }
                    .activities-block { background: rgba(0, 0, 0, 0.7); color: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
                    .activities-block h2 { margin-top: 0; text-align: center; }
                    .activity { background-color: #4CAF50; padding: 15px; margin-bottom: 5px; border-radius: 5px; display: flex; justify-content: space-between; }
                    form { background: rgba(0, 0, 0, 0.7); color: white; padding: 30px; border-radius: 8px; }
                    form h2 { text-align: center; margin-top: 0; }
                    input { width: 95%; padding: 12px; margin-bottom: 15px; border-radius: 5px; border: 1px solid #ccc; }
                    button { width: 100%; padding: 12px; border: none; border-radius: 5px; background-color: #007BFF; color: white; font-size: 16px; cursor: pointer; }
                    a { color: #6cafff; display: block; text-align: center; margin-top: 15px; }
                    .special-offer { background-color: #e91e63; justify-content: center; text-align: center; font-weight: bold; font-size: 1.1em; }
                    /* Стили для блока комментариев */
                    .comments-container { background: rgba(0, 0, 0, 0.7); color: white; padding: 20px; border-radius: 8px; width: 100%; max-width: 400px; }
                    .comments-container h3 { margin-top: 0; text-align: center; }
                    .comment { background: rgba(255, 255, 255, 0.1); padding: 10px; border-radius: 5px; margin-bottom: 5px; word-wrap: break-word; }
                </style>
            </head>
            <body>
                <div class="main-wrapper">
                    <div class="comments-container">
                        <h3>Последние комментарии:</h3>
                        ${commentsHtml.length > 0 ? commentsHtml : "<p>Пока нет комментариев.</p>"}
                    </div>

                    <div class="container">
                        <div class="activities-block">
                            <h2>Доступные активности</h2>
                            <div class="activity"><span>Шахматы</span><span>Участников: ${chessCount}</span></div>
                            <div class="activity"><span>Футбол</span><span>Участников: ${footballCount}</span></div>
                            <div class="activity"><span>Танцы</span><span>Участников: ${danceCount}</span></div>
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
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await db.collection("users").findOne({ email: email, password: password });
        if (user) {
            req.session.user = user;
            res.redirect("/profile");
        } else {
            res.send(`<h2>Ошибка входа</h2><p>Неверный email или пароль.</p><a href="/login">Попробовать снова</a>`);
        }
    } catch (error) {
        res.status(500).send("Произошла ошибка на сервере.");
    }
});


// ПРОФИЛЬ (с формой для комментариев)
app.get("/profile", requireLogin, (req, res) => {
    const { name, email, registeredAt } = req.session.user;
    res.send(`
        <html>
        <head>
            <meta charset="UTF-8"><title>Профиль</title>
            <style>
                body { font-family: Arial; padding: 20px; background: url('/images/background.jpg') no-repeat center center fixed; background-size: cover; color: white; text-shadow: 1px 1px 3px black; }
                .content { background-color: rgba(0,0,0,0.7); padding: 20px; border-radius: 10px; max-width: 500px; margin: 20px auto; }
                h2, p { margin-bottom: 15px; }
                button, a { background-color: #444; color: white; padding: 8px 15px; border: none; border-radius: 5px; text-decoration: none; cursor: pointer; display: inline-block; margin-top: 5px; }
                /* Стили для формы комментария */
                textarea { width: 95%; padding: 10px; margin-top: 10px; border-radius: 5px; border: 1px solid #ccc; font-family: Arial; }
                .comment-form button { background-color: #007BFF; width: 100%; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="content">
                <h2>Здравствуйте, ${name}!</h2>
                <p><b>Email:</b> ${email}</p>
                <p><b>Дата регистрации:</b> ${registeredAt}</p>
                
                <form action="/post-comment" method="POST" class="comment-form">
                    <h3>Оставить комментарий (исчезнет через 2 часа)</h3>
                    <textarea name="commentText" rows="3" placeholder="Напишите что-нибудь..." required></textarea>
                    <button type="submit">Отправить</button>
                </form>

                <hr style="margin: 20px 0;">
                <form action="/logout" method="POST" style="display:inline-block;"><button type="submit">Выйти</button></form>
                <a href="/">На главную</a>
                <a href="/activities">Посмотреть активности</a>
            </div>
        </body>
        </html>
    `);
});

// ✅ НОВЫЙ МАРШРУТ ДЛЯ СОХРАНЕНИЯ КОММЕНТАРИЕВ
app.post("/post-comment", requireLogin, async (req, res) => {
    try {
        const { commentText } = req.body;
        const commentsCollection = db.collection("comments");

        const newComment = {
            authorName: req.session.user.name,
            text: commentText,
            createdAt: new Date() // Очень важное поле для TTL-индекса!
        };

        await commentsCollection.insertOne(newComment);
        res.redirect("/profile"); // Возвращаем пользователя обратно в профиль

    } catch (error) {
        console.error("Ошибка при сохранении комментария:", error);
        res.status(500).send("Не удалось сохранить комментарий.");
    }
});

// ВЫХОД
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) return res.redirect('/profile');
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});


// СТРАНИЦА АКТИВНОСТЕЙ
app.get("/activities", requireLogin, async (req, res) => {
    try {
        const users = await db.collection("users").find().toArray();
        let userActivities = [];
     if (req.session.user && req.session.user._id) {
    // БЫЛО: const currentUser = await db.collection("users").findOne({ _id: new ObjectId(req.session.user._id) });
    // СТАЛО:
    const currentUser = await db.collection("users").findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
    if (currentUser) {
        userActivities = currentUser.activities || [];
    }
}
        const chessCount = users.filter(u => u.activities?.includes("Шахматы")).length;
        const footballCount = users.filter(u => u.activities?.includes("Футбол")).length;
        const danceCount = users.filter(u => u.activities?.includes("Танцы")).length;
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Активности</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background-color: #f0f0f0; margin: 0; }
                    .tab-container { max-width: 600px; margin: 20px auto; }
                    .activity-card { padding: 15px; background-color: white; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 8px; }
                    .activity-header { display: flex; justify-content: space-between; align-items: center; font-size: 1.2em; font-weight: bold; }
                    .activity-details { margin-top: 10px; }
                    .btn { padding: 8px 12px; border: none; border-radius: 5px; color: white; cursor: pointer; text-decoration: none; font-size: 1em;}
                    .btn-join { background-color: #28a745; }
                    .btn-leave { background-color: #dc3545; }
                    a.back-link { color: #007BFF; text-decoration: none; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="tab-container">
                    <h2>Доступные активности</h2>
                    <div class="activity-card">
                        <div class="activity-header"><span>Шахматы</span><span>Участников: ${chessCount}</span></div>
                        <div class="activity-details">
                            <form action="/update-activity" method="POST" style="display:inline;">
                                <input type="hidden" name="activity" value="Шахматы">
                                ${userActivities.includes("Шахматы") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                            </form>
                        </div>
                    </div>
                    <div class="activity-card">
                        <div class="activity-header"><span>Футбол</span><span>Участников: ${footballCount}</span></div>
                        <div class="activity-details">
                            <form action="/update-activity" method="POST" style="display:inline;">
                                <input type="hidden" name="activity" value="Футбол">
                                ${userActivities.includes("Футбол") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                            </form>
                        </div>
                    </div>
                    <div class="activity-card">
                        <div class="activity-header"><span>Танцы</span><span>Участников: ${danceCount}</span></div>
                        <div class="activity-details">
                            <form action="/update-activity" method="POST" style="display:inline;">
                                <input type="hidden" name="activity" value="Танцы">
                                ${userActivities.includes("Танцы") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                            </form>
                        </div>
                    </div>
                    <br>
                    <a href="/profile" class="back-link">Вернуться в профиль</a>
                </div>
            </body>
            </html>
        `); // ✅ ВОТ ИСПРАВЛЕНИЕ: Добавлены закрывающие символы
    } catch(error) {
        console.error("Ошибка на странице активностей:", error);
        res.status(500).send("Произошла ошибка на сервере.");
    }
});

// ОБРАБОТКА ЗАПИСИ НА АКТИВНОСТИ
app.post("/update-activity", requireLogin, async (req, res) => {
    try {
        const { activity, action } = req.body;
     const userId = ObjectId.createFromHexString(req.session.user._id);
        const usersCollection = db.collection("users");
        let updateQuery;
        if (action === "join") {
            updateQuery = { $addToSet: { activities: activity } };
        } else if (action === "leave") {
            updateQuery = { $pull: { activities: activity } };
        }
        if (updateQuery) {
            await usersCollection.updateOne({ _id: userId }, updateQuery);
        }
        res.redirect("/activities");
    } catch (error) {
        console.error("Ошибка при обновлении активностей:", error);
        res.status(500).send("Не удалось обновить активность.");
    }
});

// --- ЗАПУСК ВСЕГО ПРИЛОЖЕНИЯ ---
connectToDb();
