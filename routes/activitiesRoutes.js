import express from 'express';
import { ObjectId } from "mongodb";
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db) => {
    const router = express.Router();

    // ------------------------------------------
    // 1. СПИСОК ВСЕХ АКТИВНОСТЕЙ (Главная страница раздела)
    // ------------------------------------------
    router.get("/", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate');  
            
            const users = await db.collection("users").find().toArray();
            const currentUser = await db.collection("users").findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            const userActivities = currentUser ? (currentUser.activities || []) : [];
            
            // Считаем участников для ВСЕХ категорий
            const counts = {
                chess: users.filter(u => u.activities?.includes("Шахматы")).length,
                football: users.filter(u => u.activities?.includes("Футбол")).length,
                dance: users.filter(u => u.activities?.includes("Танцы")).length,
                hockey: users.filter(u => u.activities?.includes("Хоккей")).length,
                volley: users.filter(u => u.activities?.includes("Волейбол")).length,
                hiking: users.filter(u => u.activities?.includes("Походы")).length,
                travel: users.filter(u => u.activities?.includes("Путешествие")).length
            };
            
            const renderCard = (name, count, label) => `
                <div class="activity-card">
                    <div class="activity-header">
                        <a href="/activities/${name}" style="color:#333; text-decoration:none;">${label || name}</a>
                        <span>Уч: ${count}</span>
                    </div>
                    <form action="/activities/update" method="POST" style="display:inline;">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <input type="hidden" name="activity" value="${name}">
                        ${userActivities.includes(name) 
                            ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` 
                            : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                    </form>
                </div>`; 

            res.send(` 
                <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Активности</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background-color: #f0f0f0; margin: 0; }
                    .tab-container { max-width: 600px; margin: 20px auto; }
                    .activity-card { padding: 15px; background-color: white; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 8px; }
                    .activity-header { display: flex; justify-content: space-between; align-items: center; font-size: 1.2em; font-weight: bold; margin-bottom: 10px; }
                    .btn { padding: 8px 12px; border: none; border-radius: 5px; color: white; cursor: pointer; text-decoration: none; font-size: 1em;}
                    .btn-join { background-color: #28a745; } .btn-leave { background-color: #dc3545; }
                    a.back-link { color: #007BFF; text-decoration: none; font-weight: bold; display:block; text-align:center; margin-top:20px; }
                    h3 { margin-top: 30px; border-bottom: 2px solid #ccc; padding-bottom: 5px; }
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
                    
                    <a href="/profile" class="back-link">Вернуться в профиль</a>
                </div></body></html>
            `);
        } catch(error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    // ------------------------------------------
    // 2. ОБНОВЛЕНИЕ ПОДПИСКИ (Записаться/Отписаться)
    // ------------------------------------------
    router.post("/update", requireLogin, async (req, res) => {
        const { activity, action } = req.body;
        const uid = ObjectId.createFromHexString(req.session.user._id);
        
        if(action==="join") await db.collection("users").updateOne({_id:uid},{$addToSet:{activities:activity}});
        else await db.collection("users").updateOne({_id:uid},{$pull:{activities:activity}});
        
        await clearCache(LOGIN_PAGE_CACHE_KEY); 
        res.redirect("/activities");
    });

    // ------------------------------------------
    // 3. ПРОСМОТР УЧАСТНИКОВ + ОТПРАВКА СООБЩЕНИЙ
    // ------------------------------------------
    router.get('/:activityName', async (req, res) => {
        try {
            const activityName = req.params.activityName;
            const participants = await db.collection('users').find({ activities: activityName }).toArray();
            
            let html = participants.map(p => `
                <div class="card">
                    <div style="font-weight:bold; font-size:1.2em; margin-bottom:5px;">${p.name}</div>
                    <div style="color:#666;">📞 ${p.phone || 'Нет'} | 🌍 ${p.city || ''}</div>
                    <div style="margin-bottom:10px;">📅 ${(p.availability?.days||[]).join(', ')} | ⏰ ${p.availability?.time || ''}</div>
                    
                    <form onsubmit="sendActivityMessage(event, '${p._id}')" style="background:#f9f9f9; padding:10px; border-radius:5px;">
                        <input type="text" name="contact" placeholder="Ваш контакт" required style="width:100%; margin-bottom:5px; padding:5px;">
                        <textarea name="text" placeholder="Сообщение..." required style="width:100%; height:50px; padding:5px;"></textarea>
                        <button type="submit" style="width:100%; padding:5px; background:#007BFF; color:white; border:none; cursor:pointer;">Написать ${p.name}</button>
                    </form>
                </div>`).join('') || '<p>Пока никого нет.</p>';
                
            res.send(`
                <!DOCTYPE html><html><head><meta charset="UTF-8"><title>${activityName}</title>
                <style>
                    body{font-family:Arial;padding:20px;background:#eee;max-width:800px;margin:auto}
                    .card{background:white;padding:15px;margin-bottom:15px;border-radius:5px;box-shadow:0 2px 5px rgba(0,0,0,0.1)}
                    a{display:block;text-align:center;margin-top:20px;padding:10px;background:#6c757d;color:white;text-decoration:none;border-radius:5px}
                </style></head><body>
                <h1 style="text-align:center">${activityName}</h1>
                ${html}
                <a href="/activities">Назад к списку</a>
                
                <script>
                    async function sendActivityMessage(e,t){
                        e.preventDefault();
                        const c=e.target.contact.value;
                        const x=e.target.text.value;
                        
                        const r=await fetch('/send-message',{
                            method:'POST',
                            headers:{'Content-Type':'application/json','x-csrf-token':'${res.locals.csrfToken}'},
                            body:JSON.stringify({toUserId:t,contactInfo:c,messageText:x,source:'${activityName}'})
                        });
                        
                        if(r.ok) { alert('Отправлено! Ответ придет в Ваш профиль.'); e.target.text.value=''; }
                        else { alert('Ошибка отправки.'); }
                    }
                </script>
                </body></html>
            `);
        } catch (error) { res.status(500).send('Ошибка.'); }
    });

    return router;
};