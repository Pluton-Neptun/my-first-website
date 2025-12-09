import express from 'express';
import { ObjectId } from "mongodb";

export default (db) => {
    const router = express.Router();

    // 1. СТРАНИЦА "ПОСЛЕ 19:00" (СПИСОК)
    router.get('/', async (req, res) => {
        try {
            const plans = await db.collection('evening_plans').find().sort({ createdAt: -1 }).toArray();
            const user = req.session.user;

            const listHtml = plans.map(p => `
                <div class="plan-card">
                    <div class="plan-header">
                        <span class="plan-time">⏰ ${p.time}</span>
                        <strong style="color:#d4af37;">${p.author}</strong>
                    </div>
                    
                    <div class="plan-text" onclick="toggleReply('${p._id}')" title="Нажмите, чтобы ответить">
                        ${p.text}
                    </div>
                    
                    <button class="btn-reply-toggle" onclick="toggleReply('${p._id}')">💬 Ответить</button>

                    <div id="reply-form-${p._id}" class="reply-container" style="display:none;">
                        <form onsubmit="sendEveningMessage(event, '${p.userId}', '${p.text}')">
                            <input type="text" name="contact" placeholder="Ваш контакт (чтобы ответили)" required>
                            <div style="display:flex; gap:5px;">
                                <input type="text" name="msg" placeholder="Сообщение..." required style="flex-grow:1;">
                                <button type="submit" class="btn-send">➤</button>
                            </div>
                        </form>
                    </div>

                    ${user && user._id === p.userId ? 
                        `<form action="/evening/delete" method="POST" style="margin-top:10px; text-align:right;">
                            <input type="hidden" name="id" value="${p._id}">
                             <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <button class="btn-delete">Удалить</button>
                        </form>` : ''
                    }
                </div>
            `).join('') || '<p style="text-align:center; color:#ccc; margin-top:50px;">Пока тишина... Скоро здесь будут планы!</p>';

            res.send(`
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <title>После 19:00</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial; background: url('/images/background.jpg') center/cover fixed; color: white; padding: 20px; margin: 0; }
                        
                        /* MOBILE FIX: Сделал ширину адаптивной */
                        .container { 
                            width: 100%;
                            max-width: 700px; 
                            margin: 0 auto; 
                            background: rgba(0,0,0,0.85); 
                            padding: 20px; 
                            border-radius: 10px; 
                            min-height: 80vh; 
                            box-sizing: border-box; /* Чтобы padding не ломал ширину */
                        }

                        h1 { text-align: center; color: #d4af37; text-shadow: 1px 1px 2px black; margin-bottom: 30px; font-size: 1.5em; }
                        
                        .plan-card { background: rgba(255,255,255,0.1); padding: 15px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #9c27b0; transition:0.2s; }
                        .plan-card:hover { background: rgba(255,255,255,0.15); }
                        
                        .plan-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.9em; color:#ccc; }
                        .plan-time { background: #9c27b0; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 0.9em;}
                        
                      .plan-text { font-size: 1.2em; margin-bottom: 10px; line-height: 1.4; cursor: pointer; color: white; text-decoration: underline; text-decoration-color: rgba(255,255,255,0.3); word-wrap: break-word;}
                        .plan-text:hover { color: #d4af37; }

                        .btn-reply-toggle { background: transparent; border: 1px solid #aaa; color: #aaa; padding: 8px 12px; border-radius: 20px; cursor: pointer; font-size: 0.9em; }
                        .btn-reply-toggle:hover { color: white; border-color: white; }

                        .reply-container { margin-top: 15px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; }
                        .reply-container input { width: 100%; padding: 10px; margin-bottom: 5px; box-sizing: border-box; border-radius: 5px; border: none; font-size: 16px;}
                        .btn-send { background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; padding: 0 20px; font-size: 18px;}
                        
                        .btn-delete { background: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-size: 12px; opacity: 0.7; margin-top: 5px;}

                        a.back-link { display: block; text-align: center; color: #ccc; margin-top: 30px; text-decoration: none; font-size: 1.1em; padding: 10px; border: 1px solid #555; border-radius: 5px;}
                        
                        /* Дополнительная адаптация для телефонов */
                        @media (max-width: 600px) {
                            body { padding: 10px; }
                            .container { padding: 15px; }
                            h1 { font-size: 1.3em; }
                        }
                    </style> 
                </head> 
                <body>
                    <div class="container">
                        <h1>🌙 Кто что делает после 19:00?</h1>
                        
                        <div class="plans-list">
                            ${listHtml}
                        </div>

                        <a href="/login" class="back-link">⬅ На Главную</a>
                    </div>

                    <script> 
                        function toggleReply(id) {
                            const form = document.getElementById('reply-form-' + id);
                            form.style.display = (form.style.display === 'none') ? 'block' : 'none';
                        }

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
                                    source: 'После 19:00 (' + planTitle + ')' 
                                })
                            });

                            if(res.ok) {
                                alert('Сообщение отправлено автору! Ответ придет в Ваш кабинет.');
                                form.msg.value = '';
                                form.parentNode.style.display = 'none';
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

    // 2. ДОБАВЛЕНИЕ ПЛАНА (ИЗМЕНЕН ПУТЬ РЕДИРЕКТА)
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
            // БЫЛО: res.redirect('/evening');
            // СТАЛО: Возвращаем пользователя в кабинет
            res.redirect('/profile'); 
        } catch (e) { res.status(500).send("Ошибка"); }
    });

    // 3. УДАЛЕНИЕ ПЛАНА
    router.post('/delete', async (req, res) => {
        if (!req.session.user) return res.redirect('/login');
        try {
            await db.collection('evening_plans').deleteOne({ _id: ObjectId.createFromHexString(req.body.id), userId: req.session.user._id });
            res.redirect('/evening'); // Здесь можно оставить /evening, так как удаляют обычно из списка
        } catch (e) { res.status(500).send("Ошибка"); }
    });

    return router;
};