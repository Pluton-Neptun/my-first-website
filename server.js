import open from 'open';
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from 'url';
import session from "express-session";
import cors from "cors";

// ✅ НОВЫЕ ИМПОРТЫ для работы с базой данных
import { MongoClient } from "mongodb";
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
    saveUninitialized: false
}));

// ✅ НАСТРОЙКА ПОДКЛЮЧЕНИЯ К БАЗЕ ДАННЫХ
const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db; // Переменная для хранения подключения к БД

async function connectToDb() {
    try {
        await mongoClient.connect();
        console.log("Успешно подключились к MongoDB");
        // Указываем имя вашей БД. Если ее нет, она создастся автоматически
        db = mongoClient.db("my-first-website-db");
        
        // Запускаем сервер только после успешного подключения к БД
        app.listen(PORT, () => {
            console.log(`Сервер запущен: http://localhost:${PORT}`);
            // Открываем браузер только при локальной разработке
            if (!process.env.RENDER) {
                open(`http://localhost:${PORT}`);
            }
        });
    } catch (error) {
        console.error("Не удалось подключиться к MongoDB", error);
        process.exit(1); // Выход, если не удалось подключиться
    }
}

// --- Маршруты (Routes) ---

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect("/login");
};

// ✅ РЕГИСТРАЦИЯ (переписана под MongoDB)
app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const usersCollection = db.collection("users");

        const existingUser = await usersCollection.findOne({ email: email });
        if (existingUser) {
            return res.send(`<h2>Ошибка</h2><p>Email ${email} уже зарегистрирован.</p><a href="/">Вернуться</a>`);
        }

        const newUser = { name, email, password, registeredAt: new Date().toLocaleString() };
        await usersCollection.insertOne(newUser);

        console.log(`Новый пользователь: ${name} (${email})`);
        res.send(`<h2>Регистрация прошла успешно!</h2><p>Спасибо, ${name}. Теперь вы можете <a href="/login">войти</a>.</p>`);
    } catch (error) {
        console.error("Ошибка при регистрации:", error);
        res.status(500).send("Произошла ошибка на сервере.");
    }
});

// ✅ СТРАНИЦА ВХОДА (переписана под MongoDB)
app.get("/login", async (req, res) => {
    try {
        const users = await db.collection("users").find().toArray();
        const chessCount = users.filter(u => u.activities?.includes("Шахматы")).length;
        const footballCount = users.filter(u => u.activities?.includes("Футбол")).length;
        const danceCount = users.filter(u => u.activities?.includes("Танцы")).length;

        // Код HTML-страницы остаётся тот же, что и был
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Вход и Активности</title>
                <style>
                    body {
                        font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh;
                        background-image: url('/images/background.jpg'); background-size: cover; background-position: center;
                        background-attachment: fixed; padding: 20px; margin: 0; flex-direction: column;
                    }
                    .container { width: 100%; max-width: 500px; }
                    .activities-block {
                        background: rgba(0, 0, 0, 0.7); color: white; padding: 20px;
                        border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 20px;
                    }
                    .activities-block h2 { margin-top: 0; text-align: center; }
                    .activity {
                        background-color: #4CAF50; padding: 15px; margin-bottom: 5px; border-radius: 5px;
                        display: flex; justify-content: space-between;
                    }
                    form { background: rgba(0, 0, 0, 0.7); color: white; padding: 30px; border-radius: 8px; }
                    form h2 { text-align: center; margin-top: 0; }
                    input { width: 95%; padding: 12px; margin-bottom: 15px; border-radius: 5px; border: 1px solid #ccc; }
                    button { width: 100%; padding: 12px; border: none; border-radius: 5px; background-color: #007BFF; color: white; font-size: 16px; cursor: pointer; }
                    button:hover { background-color: #0056b3; }
                    a { color: #6cafff; display: block; text-align: center; margin-top: 15px; }
                    .special-offer {
                        background-color: #e91e63; justify-content: center; text-align: center; font-weight: bold; font-size: 1.1em;
                    }
                </style>
            </head>
            <body>
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
            </body>
            </html>
        `);
    } catch(error) {
        console.error("Ошибка на странице входа:", error);
        res.status(500).send("Произошла ошибка на сервере.");
    }
});

// ✅ АВТОРИЗАЦИЯ (переписана под MongoDB)
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
        console.error("Ошибка при авторизации:", error);
        res.status(500).send("Произошла ошибка на сервере.");
    }
});

// ✅ ПРОФИЛЬ (без изменений в логике)
app.get("/profile", requireLogin, (req, res) => {
    // Эта страница берёт данные из сессии, поэтому её менять не нужно
    const { name, email, registeredAt } = req.session.user;
    res.send(`...Ваш HTML-код для страницы профиля...`);
});

// ✅ ВЫХОД (без изменений в логике)
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) return res.redirect('/profile');
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// ✅ ЗАПУСК ВСЕГО ПРИЛОЖЕНИЯ
connectToDb();