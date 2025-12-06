
import express from 'express';
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

export default (db) => {
    const router = express.Router();

    // РЕГИСТРАЦИЯ
    router.get('/register.html', (req, res) => res.redirect('/register')); 
    router.get('/register', (req, res) => { 
        res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Регистрация</title><style>body{font-family:Arial;background:url('/images/background.jpg') center/cover;height:100vh;display:flex;justify-content:center;align-items:center}form{background:rgba(0,0,0,0.8);padding:30px;border-radius:10px;color:white;width:300px}input{width:95%;padding:10px;margin:10px 0;border-radius:5px}button{width:100%;padding:10px;background:#28a745;color:white;border:none;cursor:pointer}a{color:#6cafff;}</style></head><body><form action="/register" method="POST"><input type="hidden" name="_csrf" value="${res.locals.csrfToken}"><h2>Регистрация</h2><input type="text" name="name" placeholder="Имя" required><input type="email" name="email" placeholder="Email" required><input type="password" name="password" placeholder="Пароль" required><div style="margin:10px 0"><input type="checkbox" required> <label>Согласен с <a href="/privacy-policy" target="_blank">Политикой</a></label></div><button type="submit">Готово</button><br><br><a href="/login" style="display:block;text-align:center">Войти</a></form></body></html>`);
    });

    router.post("/register", async (req, res) => {
        try {
            if (await db.collection("users").findOne({ email: req.body.email })) return res.send(`Email занят. <a href="/register">Назад</a>`);
            await db.collection("users").insertOne({ name: req.body.name, email: req.body.email, password: req.body.password, activities: [], createdAt: new Date() });
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.redirect('/login');
        } catch (e) { res.status(500).send("Ошибка"); }
    });

    // ВХОД
    router.post("/login", async (req, res) => {
        const user = await db.collection("users").findOne({ email: req.body.email, password: req.body.password });
        if (user) { req.session.user = user; res.redirect("/profile"); } else { res.send("Ошибка входа"); }
    });
    
    // ВЫХОД
    router.post("/logout", (req, res) => req.session.destroy(() => res.redirect('/')));

    // ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ
    router.get('/privacy-policy', (req, res) => {
        res.send(`
            <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Политика</title><style>body{font-family:Arial,sans-serif;padding:20px;max-width:800px;margin:auto}</style></head><body>
            <h1>Политика конфиденциальности</h1><p>1. Мы собираем имя и email.</p><p>2. Используем для работы сайта.</p><p>3. Не передаем третьим лицам.</p>
            </body></html>
        `);
    });

    return router;
};