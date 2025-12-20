import express from 'express';
import { ObjectId } from "mongodb";
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';
// 👇 1. ПОДКЛЮЧАЕМ НАШ НОВЫЙ СЕРВИС
import { addUserActivity, removeUserActivity } from '../services/activityService.js';

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
            
            // 👇 Вспомогательная функция: проверяет, есть ли активность у юзера (и как строка, и как объект)
            const hasActivity = (list, name) => {
                return list.some(a => a === name || (a && a.name === name));
            };

            // 👇 Вспомогательная функция: считает количество (учитывая и строки, и объекты)
            const countUsers = (name) => {
                return users.filter(u => u.activities && hasActivity(u.activities, name)).length;
            };

            // Считаем участников (обновленная логика)
            const counts = {
                chess: countUsers("Шахматы"),
                football: countUsers("Футбол"),
                dance: countUsers("Танцы"),
                hockey: countUsers("Хоккей"),
                volley: countUsers("Волейбол"),
                hiking: countUsers("Походы"),
                travel: countUsers("Путешествие")
            };
            
            const renderCard = (name, count, label) => {
                const isJoined = hasActivity(userActivities, name);
                
                // 👇 ЛОГИКА ОТОБРАЖЕНИЯ:
                // Если записан -> кнопка "Отписаться"
                // Если НЕТ -> Поле для лимита + кнопка "Записаться"
                
                let actionHtml = '';
                if (isJoined) {
                    actionHtml = `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>`;
                } else {
                    actionHtml = `
                        <div style="margin-bottom: 5px; font-size: 0.9em; color: #555;">
                            <label>Хочу до: <input type="number" name="limit" placeholder="∞" style="width: 50px; padding: 3px; border: 1px solid #ccc; border-radius: 3px;"> чел.</label>
                        </div>
                        <button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>
                    `;
                }

                return `
                <div class="activity-card">
                    <div class="activity-header">
                        <a href="/activities/${name}" style="color:#333; text-decoration:none;">${label || name}</a>
                        <span>Уч: ${count}</span>
                    </div>
                    <form action="/activities/update" method="POST" style="display:inline;">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <input type="hidden" name="activity" value="${name}">
                        ${actionHtml}
                    </form>
                </div>`; 
            };

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
                    input[type=number]::-webkit-inner-spin-button { opacity: 1; }
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
    // 2. ОБНОВЛЕНИЕ ПОДПИСКИ (Записаться/Отписаться) - ЧЕРЕЗ СЕРВИС
    // ------------------------------------------
    router.post("/update", requireLogin, async (req, res) => {
        try {
            const { activity, action, limit } = req.body; // Получаем limit из формы
            const uid = req.session.user._id;
            
            if(action === "join") {
                // 👇 Используем функцию добавления из сервиса
                await addUserActivity(db, uid, activity, limit);
            } else {
                // 👇 Используем функцию удаления из сервиса
                await removeUserActivity(db, uid, activity);
            }
            
            res.redirect("/activities");
        } catch (e) {
            console.error(e);
            res.status(500).send("Ошибка обновления активности");
        }
    });

    // ------------------------------------------
    // 3. ПРОСМОТР УЧАСТНИКОВ (ИСПРАВЛЕННАЯ БЕЗОПАСНАЯ ВЕРСИЯ)
    // ------------------------------------------
    router.get('/:activityName', async (req, res) => {
        try {
            const activityName = req.params.activityName;
            
            // 🛡️ ЗАЩИТА ОТ БОТОВ: Игнорируем системные файлы
            if (['favicon.ico', 'update', 'css', 'js', 'sitemap.xml'].includes(activityName)) {
                return res.status(404).send('Not found');
            }

            // 🛡️ ЗАЩИТА ОТ ОШИБКИ CSRF (для ботов)
            const safeCsrf = res.locals.csrfToken || '';

            // 👇 ОБНОВЛЕННЫЙ ПОИСК (Твой код сохранен): Ищем и строки "Футбол", и объекты { name: "Футбол" }
            const participants = await db.collection('users').find({
                $or: [
                    { activities: activityName },       // Старый формат (строка)
                    { "activities.name": activityName } // Новый формат (объект)
                ]
            }).toArray();
            
            let html = participants.map(p => { 
                let limitInfo = "";
                
                // 🛡️ ГЛАВНОЕ ИСПРАВЛЕНИЕ ЗДЕСЬ:
                // Добавлена проверка (typeof a === 'object'), чтобы сервер не падал, если в базе старые данные или null
                if (Array.isArray(p.activities)) {
                    const actObj = p.activities.find(a => a && typeof a === 'object' && a.name === activityName);
                    if (actObj && actObj.limit) {
                        limitInfo = `<span style="color:#d4af37; font-weight:bold; font-size:0.9em;">(Ищет до ${actObj.limit} чел.)</span>`;
                    }
                }

                return `
                <div class="card">
                    <div style="font-weight:bold; font-size:1.2em; margin-bottom:5px;">
                        ${p.name || 'Пользователь'} ${limitInfo}
                    </div>
                    <div style="color:#666;">📞 ${p.phone || 'Нет'} | 🌍 ${p.city || ''}</div>
                    <div style="margin-bottom:10px;">📅 ${(p.availability?.days||[]).join(', ')} | ⏰ ${p.availability?.time || ''}</div>
                    
                    <form onsubmit="sendActivityMessage(event, '${p._id}')" style="background:#f9f9f9; padding:10px; border-radius:5px;">
                        <input type="text" name="contact" placeholder="Ваш контакт" required style="width:100%; margin-bottom:5px; padding:5px;">
                        <textarea name="text" placeholder="Сообщение..." required style="width:100%; height:50px; padding:5px;"></textarea>
                        <button type="submit" style="width:100%; padding:5px; background:#007BFF; color:white; border:none; cursor:pointer;">Написать ${p.name || ''}</button>
                    </form>
                </div>`;
            }).join('') || '<p>Пока никого нет.</p>';
                
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
                            headers:{'Content-Type':'application/json','x-csrf-token':'${safeCsrf}'},
                            body:JSON.stringify({toUserId:t,contactInfo:c,messageText:x,source:'${activityName}'})
                        });
                        
                        if(r.ok) { alert('Отправлено! Ответ придет в Ваш профиль.'); e.target.text.value=''; }
                        else { alert('Ошибка отправки.'); }
                    }
                </script>
                </body></html>
            `);
        } catch (error) { 
            console.error("CRITICAL ERROR IN ROUTE:", error); 
            res.status(500).send('Ошибка сервера (уже чиним).'); 
        }
    });

    return router;
};