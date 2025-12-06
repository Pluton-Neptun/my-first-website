import express from 'express';
import { ObjectId } from "mongodb";

export default (db) => {
    const router = express.Router();

    // 1. СТРАНИЦА "ПОСЛЕ 19:00"
    router.get('/', async (req, res) => {
        try { 
            const plans = await db.collection('evening_plans').find().sort({ createdAt: -1 }).toArray();
            const user = req.session.user; 

            const listHtml = plans.map(p => `
                <div class="plan-card">
                    <div class="plan-header">
                        <span class="plan-time">⏰ ${p.time}</span>
                        <strong>${p.author}</strong>
                    </div>
                    <div class="plan-text">${p.text}</div>
                    
                    <form onsubmit="sendEveningMessage(event, '${p.userId}', '${p.text}')" style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.2); padding-top:10px;">
                        <input type="text" name="contact" placeholder="Ваш контакт (чтобы ответили)" required style="width:100%; margin-bottom:5px; padding:8px; border-radius:5px; border:none;">
                        <div style="display:flex; gap:5px;">
                            <input type="text" name="msg" placeholder="Сообщение (Я с вами / Во сколько?)" required style="flex-grow:1; padding:8px; border-radius:5px; border:none;">
                            <button type="submit" style="background:#28a745; color:white; border:none; border-radius:5px; cursor:pointer; padding:0 15px;">➤</button>
                        </div>
                    </form>

                    ${user && user._id === p.userId ? 
                        `<form action="/evening/delete" method="POST" style="margin-top:10px; text-align:right;">
                            <input type="hidden" name="id" value="${p._id}">
                             <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <button class="btn-delete">Удалить план</button>
                        </form>` : ''
                    }
                </div>
            `).join('') || '<p style="text-align:center; color:#ccc">Пока планов нет. Предложите что-нибудь!</p>';

            res.send(`
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <title>После 19:00</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial; background: url('/images/background.jpg') center/cover fixed; color: white; padding: 20px; margin: 0; }
                        .container { max-width: 700px; margin: 0 auto; background: rgba(0,0,0,0.85); padding: 20px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.5); }
                        h1 { text-align: center; color: #d4af37; text-shadow: 1px 1px 2px black; margin-bottom: 30px;}
                        
                        .plan-card { background: rgba(255,255,255,0.1); padding: 15px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #9c27b0; }
                        .plan-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
                        .plan-time { background: #9c27b0; color: white; padding: 4px 8px; border-radius: 5px; font-weight: bold; }
                        .plan-text { font-size: 1.2em; margin-bottom: 15px; line-height: 1.4; }
                        
                        .btn-delete { background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; opacity: 0.7; }
                        .btn-delete:hover { opacity: 1; }

                        .add-form { background: rgba(255,255,255,0.05); padding: 20px; border-radius: 10px; margin-bottom: 30px; border: 1px solid #444; }
                        input, textarea { background: rgba(255,255,255,0.9); color: black; }
                        
                        a.back-link { display: block; text-align: center; color: #ccc; margin-top: 30px; text-decoration: none; font-size: 1.1em; }
                        a.back-link:hover { color: white; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🌙 Кто что делает после 19:00?</h1>
                        
                        ${user ? `
                            <div class="add-form">
                                <h3 style="margin-top:0; color:#d4af37;">Предложить идею:</h3>
                                <form action="/evening/add" method="POST">
                                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                                    <input type="text" name="time" placeholder="Время (напр. 20:30)" required style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:none;">
                                    <textarea name="text" placeholder="Заголовок: Идем в кальянную / Кино / Прогулка..." required style="width:100%; height:60px; padding:10px; margin-bottom:10px; border-radius:5px; border:none;"></textarea>
                                    <input type="text" name="contact" placeholder="Ваш контакт (для связи)" value="${user.phone || ''}" required style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:none;">
                                    <button type="submit" style="width:100%; padding:12px; background:#9c27b0; color:white; border:none; border-radius:5px; cursor:pointer; font-size:16px;">Опубликовать</button>
                                </form>
                            </div>
                        ` : `
                            <div style="text-align:center; margin-bottom:30px;">
                                <a href="/login" style="background:#28a745; color:white; padding:12px 25px; text-decoration:none; border-radius:30px; font-weight:bold;">Войти, чтобы предложить</a>
                            </div>
                        `}

                        <div class="plans-list">
                            ${listHtml}
                        </div>

                        <a href="/login" class="back-link">⬅ На Главную</a>
                    </div>

                    <script>
                        async function sendEveningMessage(e, toUserId, planTitle) {
                            e.preventDefault();
                            const form = e.target;
                            const contact = form.contact.value;
                            const text = form.msg.value;
                            
                            const res = await fetch('/send-message', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'x-csrf-token': '${res.locals.csrfToken}' },
                                body: JSON.stringify({ 
                                    toUserId: toUserId, 
                                    contactInfo: contact, 
                                    messageText: text, 
                                    source: 'После 19:00 (' + planTitle + ')' // Пометка, что это с вечерней доски
                                })
                            });

                            if(res.ok) {
                                alert('Сообщение отправлено автору! Ответ придет в Ваш кабинет.');
                                form.msg.value = '';
                            } else {
                                alert('Ошибка отправки.');
                            }
                        }
                    </script>
                </body>
                </html>
            `);
        } catch (error) { console.error(error); res.status(500).send("Ошибка"); }
    });

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

    router.post('/delete', async (req, res) => { 
        if (!req.session.user) return res.redirect('/login');
        try {
            await db.collection('evening_plans').deleteOne({ _id: ObjectId.createFromHexString(req.body.id), userId: req.session.user._id });
            res.redirect('/evening');
        } catch (e) { res.status(500).send("Ошибка"); }
    });

    return router;
};