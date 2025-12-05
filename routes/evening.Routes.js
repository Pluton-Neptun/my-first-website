import express from 'express';
import { ObjectId } from "mongodb";

export default (db) => {
    const router = express.Router();

    // 1. ГЛАВНАЯ СТРАНИЦА "ПОСЛЕ 19:00"
    router.get('/', async (req, res) => {
        try {
            // Получаем планы, сортируем по времени создания (свежие сверху)
            const plans = await db.collection('evening_plans').find().sort({ createdAt: -1 }).toArray();
            
            // Проверяем, вошел ли пользователь (чтобы показать форму добавления)
            const user = req.session.user;

            const listHtml = plans.map(p => `
                <div class="plan-card">
                    <div class="plan-time">⏰ ${p.time}</div>
                    <div class="plan-content">
                        <strong>${p.author}</strong> предлагает:
                        <div class="plan-text">${p.text}</div>
                        <div class="plan-contact">📞 ${p.contact}</div>
                    </div>
                    ${user && user._id === p.userId ? 
                        `<form action="/evening/delete" method="POST" style="margin-left:auto;">
                            <input type="hidden" name="id" value="${p._id}">
                             <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <button class="btn-delete">Удалить</button>
                        </form>` : ''
                    }
                </div>
            `).join('') || '<p style="text-align:center; color:#ccc">Пока тишина... Будьте первым!</p>';

            res.send(`
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <title>После 19:00...</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial; background: url('/images/background.jpg') center/cover fixed; color: white; padding: 20px; margin: 0; }
                        .container { max-width: 700px; margin: 0 auto; background: rgba(0,0,0,0.85); padding: 20px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.5); }
                        h1 { text-align: center; color: #d4af37; text-shadow: 1px 1px 2px black; } /* Золотистый заголовок */
                        
                        /* СТИЛЬ КАРТОЧКИ */
                        .plan-card { background: rgba(255,255,255,0.1); padding: 15px; margin-bottom: 15px; border-radius: 8px; display: flex; align-items: flex-start; gap: 15px; border-left: 4px solid #9c27b0; }
                        .plan-time { background: #9c27b0; color: white; padding: 5px 10px; border-radius: 5px; font-weight: bold; white-space: nowrap; }
                        .plan-content { flex-grow: 1; }
                        .plan-text { font-size: 1.1em; margin: 5px 0; color: #fff; }
                        .plan-contact { font-size: 0.9em; color: #aaa; }
                        .btn-delete { background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; }

                        /* ФОРМА ДОБАВЛЕНИЯ (КАБИНЕТ) */
                        .add-form { background: rgba(255,255,255,0.05); padding: 20px; border-radius: 10px; margin-bottom: 30px; border: 1px solid #444; }
                        input, textarea { width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 5px; border: none; box-sizing: border-box; }
                        button.add-btn { width: 100%; padding: 12px; background: #9c27b0; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; transition: 0.3s; }
                        button.add-btn:hover { background: #7b1fa2; }

                        a.back-link { display: block; text-align: center; color: #ccc; margin-top: 20px; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🌙 Кто что делает после 19:00?</h1>
                        
                        ${user ? `
                            <div class="add-form">
                                <h3 style="margin-top:0">Предложить план:</h3>
                                <form action="/evening/add" method="POST">
                                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                                    <input type="text" name="time" placeholder="Время (например: 20:00)" required>
                                    <textarea name="text" placeholder="Что делаем? (Кальян, Кино, Прогулка...)" required></textarea>
                                    <input type="text" name="contact" placeholder="Ваш контакт (Телеграм / Номер)" value="${user.phone || ''}" required>
                                    <button type="submit" class="add-btn">Опубликовать</button>
                                </form>
                            </div>
                        ` : `
                            <div style="text-align:center; margin-bottom:20px;">
                                <p>Хотите предложить свой план?</p>
                                <a href="/login" style="background:#28a745; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Войти, чтобы написать</a>
                            </div>
                        `}

                        <hr style="border-color:#444; margin-bottom:20px;">
                        
                        <div class="plans-list">
                            ${listHtml}
                        </div>

                        <a href="/login" class="back-link">⬅ На Главную</a>
                    </div>
                </body>
                </html>
            `);
        } catch (error) { console.error(error); res.status(500).send("Ошибка"); }
    });

    // 2. ДОБАВИТЬ ПЛАН
    router.post('/add', async (req, res) => {
        if (!req.session.user) return res.redirect('/login');
        try {
            await db.collection('evening_plans').insertOne({
                userId: req.session.user._id,
                author: req.session.user.name,
                time: req.body.time,
                text: req.body.text,
                contact: req.body.contact,
                createdAt: new Date()
            });
            res.redirect('/evening');
        } catch (e) { res.status(500).send("Ошибка"); }
    });

    // 3. УДАЛИТЬ ПЛАН
    router.post('/delete', async (req, res) => {
        if (!req.session.user) return res.redirect('/login');
        try {
            await db.collection('evening_plans').deleteOne({ 
                _id: ObjectId.createFromHexString(req.body.id),
                userId: req.session.user._id // Удалть можно только свое
            });
            res.redirect('/evening');
        } catch (e) { res.status(500).send("Ошибка"); }
    });

    return router;
}; 