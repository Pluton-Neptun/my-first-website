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
app.use(bodyParser.urlencoded({ extended: true }));app.use(express.static(path.join(__dirname, "public")));
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

// СТРАНИЦА ВХОДА
app.get("/login", async (req, res) => {
    try {
        const users = await db.collection("users").find().toArray();
        const chessCount = users.filter(u => u.activities?.includes("Шахматы")).length;
        const footballCount = users.filter(u => u.activities?.includes("Футбол")).length;
        const danceCount = users.filter(u => u.activities?.includes("Танцы")).length;
        res.send(`...Ваш HTML для страницы входа...`); // Оставьте ваш HTML здесь
 } catch(error) {
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

// ПРОФИЛЬ
app.get("/profile", requireLogin, (req, res) => {
    const { name, email, registeredAt } = req.session.user;
    res.send(`...Ваш HTML для страницы профиля...`); // Оставьте ваш HTML здесь
});

// ВЫХОД
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) return res.redirect('/profile');
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// СТРАНИЦА АКТИВНОСТЕЙapp.get("/activities", requireLogin, async (req, res) => {
    try {
        const users = await db.collection("users").find().toArray();
        let userActivities = [];
        if (req.session.user && req.session.user._id) {
            // ✅ ИСПРАВЛЕНО: Используем new ObjectId() вместо new MongoClient.ObjectId()
            const currentUser = await db.collection("users").findOne({ _id: new ObjectId(req.session.user._id) });
            if (currentUser) {
                userActivities = currentUser.activities || [];
            }
     }
        const chessCount = users.filter(u => u.activities?.includes("Шахматы")).length;
        const footballCount = users.filter(u => u.activities?.includes("Футбол")).length;
        const danceCount = users.filter(u => u.activities?.includes("Танцы")).length;
     res.send(`
            <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Активности</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background-color: #f0f0f0; margin: 0; } .tab-container { max-width: 600px; margin: 20px auto; } .activity-card { padding: 15px; background-color: white; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 8px; } .activity-header { display: flex; justify-content: space-between; align-items: center; font-size: 1.2em; font-weight: bold; } .activity-details { margin-top: 10px; } .btn { padding: 8px 12px; border: none; border-radius: 5px; color: white; cursor: pointer; text-decoration: none; font-size: 1em;} .btn-join { background-color: #28a745; } .btn-leave { background-color: #dc3545; } a.back-link { color: #007BFF; text-decoration: none; font-weight: bold; }
            </style></head><body><div class="tab-container"><h2>Доступные активности</h2>
            <div class="activity-card"><div class="activity-header"><span>Шахматы</span><span>Участников: ${chessCount}</span></div><div class="activity-details"><form action="/update-activity" method="POST" style="display:inline;"><input type="hidden" name="activity" value="Шахматы">${userActivities.includes("Шахматы") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}</form></div></div>
            <div class="activity-card"><div class="activity-header"><span>Футбол</span><span>Участников: ${footballCount}</span></div><div class="activity-details"><form action="/update-activity" method="POST" style="display:inline;"><input type="hidden" name="activity" value="Футбол">${userActivities.includes("Футбол") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}</form></div></div>
            <div class="activity-card"><div class="activity-header"><span>Танцы</span><span>Участников: ${danceCount}</span></div><div class="activity-details"><form action="/update-activity" method="POST" style="display:inline;"><input type="hidden" name="activity" value="Танцы">${userActivities.includes("Танцы") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}</form></div></div>
            <br><a href="/profile" class="back-link">Вернуться в профиль</a></div></body></html>`);
} catch(error) {
        res.status(500).send("Произошла ошибка на сервере.");
    }
;

// ОБРАБОТКА ЗАПИСИ НА АКТИВНОСТИapp.post("/update-activity", requireLogin, async (req, res) => {
    try {
        const { activity, action } = req.body;
        // ✅ ИСПРАВЛЕНО: Используем new ObjectId() вместо new MongoClient.ObjectId()
        const userId = new ObjectId(req.session.user._id);
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
        res.status(500).send("Не удалось обновить активность.");
    }
;

// --- ЗАПУСК ВСЕГО ПРИЛОЖЕНИЯ ---
connectToDb();