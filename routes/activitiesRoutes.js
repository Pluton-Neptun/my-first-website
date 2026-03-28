import express from 'express';
import { ObjectId } from "mongodb"; 
import { addUserActivity, removeUserActivity } from '../services/activityService.js';

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db) => {
    const router = express.Router();

    // ------------------------------------------
    // 1. СПИСОК ВСЕХ АКТИВНОСТЕЙ
    // ------------------------------------------
    router.get("/", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate');  
            
            const users = await db.collection("users").find().toArray();
            const currentUser = await db.collection("users").findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            const userActivities = currentUser ? (currentUser.activities || []) : [];
            
            const hasActivity = (list, name) => list.some(a => a === name || (a && a.name === name));
            const countUsers = (name) => users.filter(u => u.activities && hasActivity(u.activities, name)).length;

            const counts = {
                chess: countUsers("Шахматы"), football: countUsers("Футбол"), dance: countUsers("Танцы"),
                hockey: countUsers("Хоккей"), volley: countUsers("Волейбол"), hiking: countUsers("Походы"),
                travel: countUsers("Путешествие")
            };
            
            const renderCard = (name, count, label) => {
                const isJoined = hasActivity(userActivities, name);
                 
                let actionHtml = '';
                if (isJoined) {
                    actionHtml = `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>`;
                } else {
                    actionHtml = `
                        <div class="limit-box">
                            <label>Хочу до: <input type="number" name="limit" placeholder="∞"></label> чел.
                        </div>
                        <button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>
                    `;
                }

                return `
                <div class="activity-card">
                    <div class="activity-header">
                        <a href="/activities/${name}" class="activity-title">${label || name}</a>
                        <span class="activity-count">Уч: ${count}</span>
                    </div>
                    <form action="/activities/update" method="POST" class="activity-form">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <input type="hidden" name="activity" value="${name}">
                        ${actionHtml}
                    </form>
                </div>`; 
            };

            res.send(` 
                <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Активности</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <style>
                    body { font-family: Arial, sans-serif; padding: 10px; background-color: #f4f6f9; margin: 0; color: #333; }
                    .tab-container { width: 100%; max-width: 600px; margin: 0 auto; padding-bottom: 30px; box-sizing: border-box; }
                    h2 { text-align: center; margin-top: 10px; }
                    h3 { margin-top: 25px; border-bottom: 2px solid #ddd; padding-bottom: 8px; color: #555; }
                    
                    .activity-card { padding: 20px; background-color: white; border: 1px solid #e1e4e8; margin-bottom: 15px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
                    .activity-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
                    .activity-title { color:#007BFF; text-decoration:none; font-size: 1.3em; font-weight: bold; }
                    .activity-count { background: #eee; padding: 5px 10px; border-radius: 20px; font-weight: bold; color: #555; }
                    
                    .limit-box { margin-bottom: 15px; font-size: 1em; color: #555; }
                    .limit-box input { width: 70px; padding: 10px; border: 1px solid #ccc; border-radius: 5px; font-size: 16px; margin-left: 5px; text-align: center; }
                    
                    .btn { padding: 12px 20px; border: none; border-radius: 8px; color: white; cursor: pointer; font-size: 16px; font-weight: bold; width: 100%; box-sizing: border-box; transition: 0.2s;}
                    .btn-join { background-color: #28a745; } .btn-join:hover { background-color: #218838; }
                    .btn-leave { background-color: #dc3545; } .btn-leave:hover { background-color: #c82333; }
                    
                    a.back-link { display: block; background: #6c757d; color: white; text-align: center; padding: 15px; margin-top: 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;}
                    
                    /* МОБИЛЬНАЯ АДАПТАЦИЯ */
                    @media (max-width: 600px) {
                        .activity-card { padding: 15px; }
                        .activity-header { flex-direction: column; align-items: flex-start; gap: 10px; }
                        .activity-title { font-size: 1.4em; }
                        .limit-box { display: flex; align-items: center; justify-content: space-between; background: #f9f9f9; padding: 10px; border-radius: 5px; }
                        .btn { padding: 15px; font-size: 18px; }
                    }
                </style></head><body>
                <div class="tab-container">
                    <h2>Доступные активности</h2>
                    
                    <h3>Основные</h3>
                    ${renderCard("Шахматы", counts.chess, "♟️ Шахматы")}
                    ${renderCard("Футбол", counts.football, "⚽ Футбол")}
                    ${renderCard("Танцы", counts.dance, "💃 Танцы")}
                    
                    <h3>Активный отдых</h3>
                    ${renderCard("Хоккей", counts.hockey, "🏒 Хоккей")}
                    ${renderCard("Волейбол", counts.volley, "🏐 Волейбол")}
                    ${renderCard("Походы", counts.hiking, "🥾 Походы")}
                    
                    <h3>Для души</h3>
                    ${renderCard("Путешествие", counts.travel, "✈️ Путешествие с тобой")}
                    
                    <a href="/" class="back-link">⬅ Вернуться на главную</a>
                </div></body></html>
            `);
        } catch(error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    // ------------------------------------------
    // 2. ОБНОВЛЕНИЕ ПОДПИСКИ
    // ------------------------------------------
    router.post("/update", requireLogin, async (req, res) => {
        try {
            const { activity, action, limit } = req.body; 
            const uid = req.session.user._id;
            
            if(action === "join") await addUserActivity(db, uid, activity, limit);
            else await removeUserActivity(db, uid, activity);
            
            res.redirect("/activities");
        } catch (e) {
            console.error(e);
            res.status(500).send("Ошибка обновления активности");
        }
    });

    // ------------------------------------------
    // 3. ПРОСМОТР УЧАСТНИКОВ (С МОБИЛЬНОЙ АДАПТАЦИЕЙ)
    // ------------------------------------------
    router.get('/:activityName', async (req, res) => {
        try {
            const activityName = req.params.activityName;
            
            if (['favicon.ico', 'update', 'css', 'js', 'sitemap.xml'].includes(activityName)) return res.status(404).send('Not found');

            const safeCsrf = res.locals.csrfToken || ''; 

            const participants = await db.collection('users').find({ 
                $or: [
                    { activities: activityName },
                    { "activities.name": activityName }
                ]
            }).toArray();
            
            let html = participants.map(p => { 
                let limitInfo = "";
                
                if (Array.isArray(p.activities)) { 
                    const actObj = p.activities.find(a => a && typeof a === 'object' && a.name === activityName);
                    if (actObj && actObj.limit) {
                        limitInfo = `<span style="color:#d4af37; font-weight:bold; font-size:0.9em; background:#333; padding:2px 8px; border-radius:10px;">(Ищет до ${actObj.limit} чел.)</span>`;
                    }
                }

                return `
                <div class="card">
                    <div class="card-title">
                        ${p.name || 'Пользователь'} ${limitInfo}
                    </div>
                    <div class="card-info">📞 ${p.phone || 'Нет'} | 🌍 ${p.city || ''}</div>
                    <div class="card-info" style="margin-bottom:15px;">📅 ${(p.availability?.days||[]).join(', ')} | ⏰ ${p.availability?.time || ''}</div>
                    
                    <form onsubmit="sendActivityMessage(event, '${p._id}')" class="msg-form">
                        <input type="text" name="contact" placeholder="Ваш контакт" required>
                        <textarea name="text" placeholder="Сообщение..." required></textarea>
                        <button type="submit">Написать ${p.name || ''}</button>
                    </form>
                </div>`;
            }).join('') || '<p style="text-align:center; color:#777; font-size:18px; margin-top:30px;">Пока никого нет.</p>';
                
            res.send(`
                <!DOCTYPE html><html><head><meta charset="UTF-8"><title>${activityName}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <style>
                    body{font-family:Arial,sans-serif;padding:15px;background:#eee;max-width:800px;margin:auto;}
                    h1{text-align:center; color:#333; margin-bottom:20px;}
                    .card{background:white;padding:20px;margin-bottom:20px;border-radius:10px;box-shadow:0 3px 10px rgba(0,0,0,0.1)}
                    .card-title{font-weight:bold; font-size:1.3em; margin-bottom:10px; display:flex; flex-wrap:wrap; gap:10px; align-items:center;}
                    .card-info{color:#555; font-size:1.1em; margin-bottom:5px;}
                    
                    .msg-form{background:#f9f9f9; padding:15px; border-radius:8px; border:1px solid #ddd;}
                    .msg-form input, .msg-form textarea{width:100%; margin-bottom:10px; padding:12px; box-sizing:border-box; border:1px solid #ccc; border-radius:5px; font-size:16px;}
                    .msg-form textarea{height:80px; resize:vertical;}
                    .msg-form button{width:100%; padding:15px; background:#007BFF; color:white; border:none; cursor:pointer; border-radius:5px; font-size:16px; font-weight:bold;}
                    
                    a.back-btn{display:block;text-align:center;margin-top:30px;padding:15px;background:#6c757d;color:white;text-decoration:none;border-radius:8px; font-weight:bold; font-size:16px;}
                    
                    @media (max-width: 600px) {
                        body { padding: 10px; }
                        .card { padding: 15px; }
                        .card-title { font-size: 1.2em; flex-direction: column; align-items: flex-start; gap: 5px; }
                    }
                </style></head><body>
                <h1>${activityName}</h1>
                ${html}
                <a href="/activities" class="back-btn">⬅ Назад к списку</a>
                
                <script>
                    async function sendActivityMessage(e,t){
                        e.preventDefault();
                        const btn = e.target.querySelector('button');
                        btn.disabled = true;
                        btn.innerText = 'Отправка...';
                        
                        const c=e.target.contact.value;
                        const x=e.target.text.value;
                        
                        const r=await fetch('/send-message',{
                            method:'POST',
                            headers:{'Content-Type':'application/json','x-csrf-token':'${safeCsrf}'},
                            body:JSON.stringify({toUserId:t,contactInfo:c,messageText:x,source:'${activityName}'})
                        });
                        
                        btn.disabled = false;
                        btn.innerText = 'Написать еще раз';
                        
                        if(r.ok) { alert('Отправлено! Ответ придет в Ваш профиль.'); e.target.text.value=''; }
                        else { alert('Ошибка отправки.'); }
                    }
                </script>
                </body></html>
            `);
        } catch (error) { 
            console.error(error); 
            res.status(500).send('Ошибка сервера (уже чиним).'); 
        }
    });

    return router;
};