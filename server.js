import open from 'open';
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from 'url';
import session from "express-session";
import cors from "cors";

// ✅ НОВЫЕ ИМПОРТЫ для работы с MongoDB и .env
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
        db = mongoClient.db("my-first-website-db"); // Указываем имя вашей БД
        // Запускаем сервер только после успешного подключения к БД
        app.listen(PORT, () => {
            console.log(`Сервер запущен: http://localhost:${PORT}`);
            if (process.env.NODE_ENV !== 'production') {
                open(`http://localhost:${PORT}`);
            }
        });
    } catch (error) {
        console.error("Не удалось подключиться к MongoDB", error);
        process.exit(1); // Выход из приложения при ошибке подключения
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
        console.error(error);
        res.status(500).send("Произошла ошибка на сервере.");
    }
});

// ✅ СТРАНИЦА ВХОДА (переписана под MongoDB)
app.get("/login", async (req, res) => {
    try {
        const users = await db.collection("users").find().toArray();
        // ... остальная логика подсчета активностей
        const chessCount = users.filter(u => u.activities?.includes("Шахматы")).length;
        const footballCount = users.filter(u => u.activities?.includes("Футбол")).length;
        const danceCount = users.filter(u => u.activities?.includes("Танцы")).length;
        // ... HTML код страницы входа (без изменений)
        // (я сократил его для краткости, ваш код остается прежним)
        res.send(`... ваш большой HTML-код для страницы входа ...`);

    } catch(error) {
        console.error(error);
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
        console.error(error);
        res.status(500).send("Произошла ошибка на сервере.");
    }
});

// ✅ ПРОФИЛЬ (без изменений в логике)
app.get("/profile", requireLogin, (req, res) => {
    const { name, email, registeredAt } = req.session.user;
    res.send(`... ваш HTML-код для страницы профиля ...`);
});

// ✅ ВЫХОД (без изменений в логике)
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) return res.redirect('/profile');
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// ✅ СТРАНИЦА АКТИВНОСТЕЙ (переписана под MongoDB)
app.get("/activities", requireLogin, async (req, res) => {
    try {
        const users = await db.collection("users").find().toArray();
        // ... остальная логика подсчета активностей
        const chessCount = users.filter(u => u.activities?.includes("Шахматы")).length;
        // ... и т.д.
        res.send(`... ваш HTML-код для страницы активностей ...`);
    } catch(error) {
        console.error(error);
        res.status(500).send("Произошла ошибка на сервере.");
    }
});

// ... другие ваши маршруты ...

// ✅ ЗАПУСК ВСЕГО ПРИЛОЖЕНИЯ
connectToDb();