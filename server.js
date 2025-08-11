import open from 'open';
import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import session from "express-session";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
    secret: "my_secret_key",
    resave: false,
    saveUninitialized: false
}));

const usersFile = path.join(__dirname, "users.json");

if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([]));
}

// Middleware для проверки, авторизован ли пользователь
const requireLogin = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect("/login");
    }
};

// Регистрация
app.post("/register", (req, res) => {
    const { name, email, password } = req.body;
    let users = JSON.parse(fs.readFileSync(usersFile, "utf8"));

    if (users.some(u => u.email === email)) {
        return res.send(`<h2>Ошибка</h2><p>Email ${email} уже зарегистрирован.</p><a href="/">Вернуться</a>`);
    }

    const newUser = { name, email, password, registeredAt: new Date().toLocaleString() };
    users.push(newUser);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    console.log(`Новый пользователь: ${name} (${email})`);
    res.send(`<h2>Регистрация прошла успешно!</h2><p>Спасибо, ${name}. Теперь вы можете <a href="/login">войти</a>.</p>`);
});


// Динамический маршрут для страницы входа
app.get("/login", (req, res) => {
    const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    const chessCount = users.filter(user => user.activities && user.activities.includes("Шахматы")).length;
    const footballCount = users.filter(user => user.activities && user.activities.includes("Футбол")).length;
    const danceCount = users.filter(user => user.activities && user.activities.includes("Танцы")).length;

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>Вход и Активности</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    background-image: url('/images/background.jpg');
                    background-size: cover;
                    background-position: center;
                    background-attachment: fixed;
                    padding: 20px;
                    margin: 0;
                    flex-direction: column;
                }
                .container {
                    width: 100%;
                    max-width: 500px;
                }
                .activities-block {
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    margin-bottom: 20px;
                }
                .activities-block h2 {
                    margin-top: 0;
                    text-align: center;
                }
                .activity {
                    background-color: #4CAF50;
                    padding: 15px;
                    margin-bottom: 5px;
                    border-radius: 5px;
                    display: flex;
                    justify-content: space-between;
                }
                form {
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 30px;
                    border-radius: 8px;
                }
                form h2 {
                    text-align: center;
                    margin-top: 0;
                }
                input {
                    width: 95%;
                    padding: 12px;
                    margin-bottom: 15px;
                    border-radius: 5px;
                    border: 1px solid #ccc;
                }
                button {
                    width: 100%;
                    padding: 12px;
                    border: none;
                    border-radius: 5px;
                    background-color: #007BFF;
                    color: white;
                    font-size: 16px;
                    cursor: pointer;
                }
                button:hover { background-color: #0056b3; }
                a {
                    color: #6cafff;
                    display: block;
                    text-align: center;
                    margin-top: 15px;
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
});

// Авторизация
app.post("/login", (req, res) => {
    const { email, password } = req.body;
    let users = JSON.parse(fs.readFileSync(usersFile, "utf8"));

    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        req.session.user = user;
        res.redirect("/profile");
    } else {
        res.send(`<h2>Ошибка входа</h2><p>Неверный email или пароль.</p><a href="/login">Попробовать снова</a>`);
    }
});

// Страница профиля
app.get("/profile", requireLogin, (req, res) => {
    const { name, email, registeredAt } = req.session.user;
    // ✅ ИСПРАВЛЕНО: Добавлены (`...`)
    res.send(`
        <html>
        <head>
            <meta charset="UTF-8"><title>Профиль</title>
            <style>
                body { font-family: Arial; padding: 20px; background: url('/images/background.jpg') no-repeat center center fixed; background-size: cover; color: white; text-shadow: 1px 1px 3px black; }
                .content { background-color: rgba(0,0,0,0.6); padding: 20px; border-radius: 10px; max-width: 500px; margin: 20px auto; }
                button, a { background-color: #444; color: white; padding: 8px 15px; border: none; border-radius: 5px; text-decoration: none; cursor: pointer; display: inline-block; margin-top: 5px; }
                button:hover, a:hover { background-color: #666; }
            </style>
        </head>
        <body>
            <div class="content">
                <h2>Здравствуйте, ${name}!</h2>
                <p><b>Email:</b> ${email}</p>
                <p><b>Дата регистрации:</b> ${registeredAt}</p>
                <form action="/logout" method="POST" style="display:inline;"><button type="submit">Выйти</button></form>
                <br><br>
                <a href="/">На главную</a>
                <a href="/users">Список пользователей</a>
                <a href="/activities">Посмотреть активности</a>
            </div>
        </body>
        </html>
    `);
});

// Выход
app.post("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) { return res.redirect('/profile'); }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// Список пользователей
app.get("/users", requireLogin, (req, res) => {
    const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    let userListHtml = users.map(u => `<li>${u.name} (${u.email}) - Зарегистрирован: ${u.registeredAt}</li>`).join('');
    res.send(`
        <html><head><meta charset="UTF-8"><title>Список пользователей</title><style>body { font-family: Arial; padding: 20px; }</style></head>
        <body><h1>Зарегистрированные пользователи</h1><ul>${userListHtml}</ul><a href="/profile">Назад в профиль</a></body></html>
    `);
});

// Отдельная страница с активностями
// Отдельная страница с активностями (улучшенная версия)
app.get("/activities", requireLogin, (req, res) => {
    const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    const chessCount = users.filter(user => user.activities && user.activities.includes("Шахматы")).length;
    const footballCount = users.filter(user => user.activities && user.activities.includes("Футбол")).length;
    const danceCount = users.filter(user => user.activities && user.activities.includes("Танцы")).length;

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
                .tab-header {
                    background-color: #4CAF50;
                    color: white;
                    padding: 15px;
                    cursor: pointer;
                    border: none;
                    width: 100%;
                    text-align: left;
                    font-size: 18px;
                    border-bottom: 1px solid #ddd;
                    transition: background-color 0.3s;
                }
                .tab-header:hover { background-color: #45a049; }
                .tab-content {
                    padding: 15px;
                    background-color: white;
                    border: 1px solid #ddd;
                    border-top: none;
                    display: none;
                }
                a { color: #4CAF50; text-decoration: none; font-weight: bold; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="tab-container">
                <h2>Доступные активности</h2>
                <button class="tab-header" onclick="toggleTab('chess')">Шахматы</button>
                <div id="chess" class="tab-content"><p>Количество участников: ${chessCount}</p></div>

                <button class="tab-header" onclick="toggleTab('football')">Футбол</button>
                <div id="football" class="tab-content"><p>Количество участников: ${footballCount}</p></div>

                <button class="tab-header" onclick="toggleTab('dance')">Танцы</button>
                <div id="dance" class="tab-content"><p>Количество участников: ${danceCount}</p></div>
                
                <br>
                <a href="/profile">Вернуться в профиль</a>
            </div>
            
            <script>
                function toggleTab(tabId) {
                    const tabContent = document.getElementById(tabId);
                    if (tabContent.style.display === 'block') {
                        tabContent.style.display = 'none';
                    } else {
                        tabContent.style.display = 'block';
                    }
                }
            </script>
        </body>
        </html>
    `); // ✅ ВОТ ИСПРАВЛЕНИЕ: добавлена закрывающая скобка и точка с запятой
});

// Этот код для запуска сервера уже стоит на правильном месте
app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    open(`http://localhost:${PORT}`);
});