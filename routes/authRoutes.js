
import express from 'express';
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';
// 👇 ДОБАВИЛ ИМПОРТ ЛИМИТЕРА
import registerLimiter from '../middleware/limiter.js'; 

export default (db) => {
    const router = express.Router();

    // ==================================================
    // 1. РЕГИСТРАЦИЯ (Страница + Обработка)
    // ==================================================
    
    // Если кто-то заходит по старой ссылке .html - перекидываем
    router.get('/register.html', (req, res) => res.redirect('/register')); 
    
    // Показываем форму регистрации
    router.get('/register', (req, res) => { 
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Регистрация</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body{font-family:Arial;background:url('/images/background.jpg') center/cover fixed;height:100vh;display:flex;justify-content:center;align-items:center;margin:0}
                    form{background:rgba(0,0,0,0.85);padding:30px;border-radius:10px;color:white;width:300px;box-shadow:0 0 15px black}
                    input{width:100%;padding:10px;margin:10px 0;border-radius:5px;border:none;box-sizing:border-box}
                    button{width:100%;padding:10px;background:#28a745;color:white;border:none;cursor:pointer;font-size:16px;border-radius:5px;margin-top:10px}
                    button:hover{background:#218838}
                    a{color:#6cafff;text-decoration:none}
                    a:hover{text-decoration:underline}
                </style>
            </head>
            <body>
                <form action="/register" method="POST">
                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                    <h2 style="text-align:center">Регистрация</h2>
                    
                    <input type="text" name="name" placeholder="Ваше Имя" required>
                    <input type="email" name="email" placeholder="Email" required>
                    <input type="password" name="password" placeholder="Пароль" required>
                    
                    <div style="margin:15px 0; font-size:0.9em">
                        <input type="checkbox" required style="width:auto; margin:0 5px 0 0"> 
                        <label>Я согласен с <a href="/privacy-policy" target="_blank">Политикой</a></label>
                    </div>
                    
                    <button type="submit">Зарегистрироваться</button>
                    
                    <div style="text-align:center; margin-top:20px; font-size:0.9em">
                        Уже есть аккаунт? <br>
                        <a href="/login">Войти здесь</a>
                    </div>
                </form>
            </body>
            </html>
        `);
    });

    // Обрабатываем данные регистрации
    // 👇 ДОБАВИЛ registerLimiter ВТОРЫМ АРГУМЕНТОМ
    router.post("/register", registerLimiter, async (req, res) => {
        try {
            // Проверка: занят ли email?
            const existingUser = await db.collection("users").findOne({ email: req.body.email });
            if (existingUser) {
                return res.send(`<body style="background:#333;color:white;text-align:center;padding-top:50px;font-family:Arial">
                    <h2>Этот Email уже занят!</h2>
                    <a href="/register" style="color:#6cafff">Вернуться назад</a>
                </body>`);
            }

            // Создаем пользователя
            await db.collection("users").insertOne({ 
                name: req.body.name, 
                email: req.body.email, 
                password: req.body.password, // (В будущем лучше добавить хеширование)
                activities: [], 
                createdAt: new Date() 
            });

            // Чистим кэш и отправляем на вход
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.redirect('/login');

        } catch (e) { 
            console.error(e);
            res.status(500).send("Ошибка сервера при регистрации"); 
        }
    });

    // ==================================================
    // 2. ВХОД (Страница + Обработка) - ЭТОГО НЕ ХВАТАЛО
    // ==================================================
    
    // Вот этой части не хватало!
    router.get('/login', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Вход</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body{font-family:Arial;background:url('/images/background.jpg') center/cover fixed;height:100vh;display:flex;justify-content:center;align-items:center;margin:0}
                    form{background:rgba(0,0,0,0.85);padding:30px;border-radius:10px;color:white;width:300px;box-shadow:0 0 15px black}
                    input{width:100%;padding:10px;margin:10px 0;border-radius:5px;border:none;box-sizing:border-box}
                    button{width:100%;padding:10px;background:#007bff;color:white;border:none;cursor:pointer;font-size:16px;border-radius:5px;margin-top:10px}
                    button:hover{background:#0056b3}
                    a{color:#6cafff;text-decoration:none}
                </style>
            </head>
            <body>
                <form action="/login" method="POST">
                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                    <h2 style="text-align:center">Вход</h2>
                    
                    <input type="email" name="email" placeholder="Email" required>
                    <input type="password" name="password" placeholder="Пароль" required>
                    
                    <button type="submit">Войти</button>
                    
                    <div style="text-align:center; margin-top:20px; font-size:0.9em">
                        Нет аккаунта? <br>
                        <a href="/register">Зарегистрироваться</a>
                    </div>
                </form>
            </body>
            </html>
        `);
    });

    // Обработка входа
    router.post("/login", async (req, res) => {
        try {
            const user = await db.collection("users").findOne({ 
                email: req.body.email, 
                password: req.body.password 
            });

            if (user) { 
                req.session.user = user; 
                res.redirect("/profile"); 
            } else { 
                res.send(`<body style="background:#333;color:white;text-align:center;padding-top:50px;font-family:Arial">
                    <h2>Неверный логин или пароль</h2>
                    <a href="/login" style="color:#6cafff">Попробовать снова</a>
                </body>`); 
            }
        } catch (e) {
            console.error(e);
            res.status(500).send("Ошибка при входе");
        }
    });
    
    // ==================================================
    // 3. ВЫХОД И ПОЛИТИКА
    // ==================================================
    
    router.post("/logout", (req, res) => {
        req.session.destroy(() => {
            res.redirect('/'); // После выхода кидаем на главную
        });
    });

    router.get('/privacy-policy', (req, res) => {
        res.send(`
            <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Политика</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>body{font-family:Arial,sans-serif;padding:20px;max-width:800px;margin:auto;line-height:1.6;background:#f4f4f4}</style></head>
            <body>
            <div style="background:white;padding:30px;border-radius:10px;box-shadow:0 2px 5px rgba(0,0,0,0.1)">
                <h1>Политика конфиденциальности</h1>
                <p><strong>1. Сбор данных:</strong> Мы собираем ваше имя и email только для обеспечения работы личного кабинета.</p>
                <p><strong>2. Использование:</strong> Данные используются для входа в систему и записи на активности.</p>
                <p><strong>3. Безопасность:</strong> Мы не передаем ваши данные третьим лицам.</p>
                <br>
                <a href="/register">Вернуться к регистрации</a>
            </div>
            </body></html>
        `);
    });

    return router;
}; 