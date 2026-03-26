import express from 'express'; 
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js'; 
import registerLimiter from '../middleware/limiter.js';  

export default (db) => {
    const router = express.Router();

    // ==================================================
    // 1. РЕГИСТРАЦИЯ
    // ==================================================
    router.get('/register.html', (req, res) => res.redirect('/register'));  
    
    router.get('/register', (req, res) => {  
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Регистрация</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <style>
                    body{font-family:Arial;background:url('/images/background.jpg') center/cover fixed;height:100vh;display:flex;justify-content:center;align-items:center;margin:0}
                    /* Сделали форму резиновой для телефонов */
                    form{background:rgba(0,0,0,0.85);padding:30px;border-radius:10px;color:white;width:90%;max-width:350px;box-sizing:border-box;box-shadow:0 0 15px black}
                    /* Увеличили padding и font-size для удобства пальцев */
                    input{width:100%;padding:15px;margin:10px 0;border-radius:5px;border:none;box-sizing:border-box;font-size:16px;}
                    button{width:100%;padding:15px;background:#28a745;color:white;border:none;cursor:pointer;font-size:18px;border-radius:5px;margin-top:10px;font-weight:bold;}
                    button:hover{background:#218838}
                    a{color:#6cafff;text-decoration:none}
                    a:hover{text-decoration:underline}
                    
                    @media (max-width: 400px) {
                        form { padding: 20px; }
                    }
                </style>
            </head>
            <body>
                <form action="/register" method="POST">
                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                    <h2 style="text-align:center; margin-top:0;">Регистрация</h2>
                    
                    <input type="text" name="name" placeholder="Ваше Имя" required>
                    <input type="email" name="email" placeholder="Email" required>
                    <input type="password" name="password" placeholder="Пароль" required>
                    
                    <div style="margin:15px 0; font-size:14px; display:flex; align-items:center;">
                        <input type="checkbox" required style="width:20px; height:20px; margin:0 10px 0 0;"> 
                        <label>Я согласен с <a href="/privacy-policy" target="_blank">Политикой</a></label>
                    </div>
                    
                    <button type="submit">Зарегистрироваться</button>
                    
                    <div style="text-align:center; margin-top:20px; font-size:15px; line-height:1.5;">
                        Уже есть аккаунт? <br>
                        <a href="/login" style="font-weight:bold;">Войти здесь</a>
                    </div>
                </form>
            </body>
            </html>
        `);
    });
 
    router.post("/register", registerLimiter, async (req, res) => {
        try {
             const existingUser = await db.collection("users").findOne({ email: req.body.email });
            if (existingUser) {
                return res.send(`<body style="background:#333;color:white;text-align:center;padding-top:50px;font-family:Arial;font-size:18px;">
                    <h2>Этот Email уже занят!</h2>
                    <br><a href="/register" style="color:#6cafff;padding:15px;border:1px solid #6cafff;border-radius:5px;text-decoration:none;">Вернуться назад</a>
                </body>`);
            }

            await db.collection("users").insertOne({  
                name: req.body.name, 
                email: req.body.email, 
                password: req.body.password, 
                activities: [], 
                createdAt: new Date() 
            });

            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            res.redirect('/login');

        } catch (e) { 
            console.error(e);
            res.status(500).send("Ошибка сервера при регистрации"); 
        }
    });

    // ==================================================
    // 2. ВХОД
    // ==================================================
    router.get('/login', (req, res) => { 
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Вход</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <style>
                    body{font-family:Arial;background:url('/images/background.jpg') center/cover fixed;height:100vh;display:flex;justify-content:center;align-items:center;margin:0}
                    form{background:rgba(0,0,0,0.85);padding:30px;border-radius:10px;color:white;width:90%;max-width:350px;box-sizing:border-box;box-shadow:0 0 15px black}
                    input{width:100%;padding:15px;margin:10px 0;border-radius:5px;border:none;box-sizing:border-box;font-size:16px;}
                    button{width:100%;padding:15px;background:#007bff;color:white;border:none;cursor:pointer;font-size:18px;border-radius:5px;margin-top:10px;font-weight:bold;}
                    button:hover{background:#0056b3}
                    a{color:#6cafff;text-decoration:none}
                    
                    @media (max-width: 400px) {
                        form { padding: 20px; }
                    }
                </style>
            </head>
            <body>
                <form action="/login" method="POST">
                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                    <h2 style="text-align:center; margin-top:0;">Вход</h2>
                    
                    <input type="email" name="email" placeholder="Email" required>
                    <input type="password" name="password" placeholder="Пароль" required>
                    
                    <button type="submit">Войти</button>
                    
                    <div style="text-align:center; margin-top:20px; font-size:15px; line-height:1.5;">
                        Нет аккаунта? <br>
                        <a href="/register" style="font-weight:bold;">Зарегистрироваться</a>
                    </div>
                </form>
            </body>
            </html>
        `);
    });

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
                res.send(`<body style="background:#333;color:white;text-align:center;padding-top:50px;font-family:Arial;font-size:18px;">
                    <h2>Неверный логин или пароль</h2>
                    <br><a href="/login" style="color:#6cafff;padding:15px;border:1px solid #6cafff;border-radius:5px;text-decoration:none;">Попробовать снова</a>
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
        req.session.destroy(() => res.redirect('/'));
    });

    router.get('/privacy-policy', (req, res) => {
        res.send(`
            <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Политика</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>body{font-family:Arial,sans-serif;padding:15px;max-width:800px;margin:auto;line-height:1.6;background:#f4f4f4;font-size:16px;}</style></head>
            <body>
            <div style="background:white;padding:20px;border-radius:10px;box-shadow:0 2px 5px rgba(0,0,0,0.1)">
                <h2>Политика конфиденциальности</h2>
                <p><strong>1. Сбор данных:</strong> Мы собираем ваше имя и email только для обеспечения работы личного кабинета.</p>
                <p><strong>2. Использование:</strong> Данные используются для входа в систему и записи на активности.</p>
                <p><strong>3. Безопасность:</strong> Мы не передаем ваши данные третьим лицам.</p>
                <br><br>
                <a href="/register" style="display:block;text-align:center;padding:15px;background:#007bff;color:white;text-decoration:none;border-radius:5px;font-weight:bold;">Вернуться к регистрации</a>
            </div>
            </body></html>
        `);
    });

    return router;
};
