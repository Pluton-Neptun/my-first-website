// routes/activitiesRoutes.js
import express from 'express';
import { ObjectId } from "mongodb";
import { 
    clearCache, 
    LOGIN_PAGE_CACHE_KEY 
} from '../cacheService.js';

// Middleware для проверки авторизации (дублируется, но можно передать из server.js, пока оставлю здесь)
const requireLogin = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        return res.redirect("/login"); 
    }
};

// Функция, возвращающая Express Router
export default (db) => {
    const router = express.Router();

    // Страница со списком участников активности
    router.get('/:activityName', async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate');  
            
            const activityName = req.params.activityName;
            
            const participants = await db.collection('users').find({ 
                activities: activityName 
            }).toArray();

            let participantsHtml = participants.map(p => {
                const availability = p.availability || { days: [], time: 'не указано' };
                const daysString = availability.days.join(', ') || 'не указаны';
                
                const phone = p.phone || 'Не указан';
                const city = p.city || 'Не указан';
                const country = p.country || 'Не указана';

                return `
                    <div class="participant-card">
                        <h3>${p.name}</h3>
                        <p><strong>Свободные дни:</strong> ${daysString}</p>
                        <p><strong>Удобное время:</strong> ${availability.time}</p>
                        <p><strong>Телефон:</strong> ${phone}</p>
                        <p><strong>Город:</strong> ${city}</p>
                        <p><strong>Страна:</strong> ${country}</p>
                    </div>
                `;
            }).join('');

            if (participants.length === 0) {
                participantsHtml = '<p>На эту активность еще никто не записался.</p>';
            }

            res.send(` 
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <title>Участники: ${activityName}</title>
                    <style>/* ... СТИЛИ (сокращено) ... */</style>
                </head>
                <body>
                    <div class="container">
                        <h1>Участники активности "${activityName}"</h1>
                        ${participantsHtml}
                        <br>
                        <a href="/login">Вернуться на главную</a>
                    </div>
                </body>
                </html>
            `);
        } catch (error) {
            console.error('Ошибка на странице участников:', error);
            res.status(500).send('Произошла ошибка на сервере.');
        }
    }); 

    // СТРАНИЦА АКТИВНОСТЕЙ
    router.get("/", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate');  
            
            const users = await db.collection("users").find().toArray();
            let userActivities = [];
            if (req.session.user && req.session.user._id) {
                const currentUser = await db.collection("users").findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
                if (currentUser) {
                    userActivities = currentUser.activities || [];
                }
            }
            const chessCount = users.filter(u => u.activities?.includes("Шахматы")).length;
            const footballCount = users.filter(u => u.activities?.includes("Футбол")).length;
            const danceCount = users.filter(u => u.activities?.includes("Танцы")).length;
            
            res.send(` 
                <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Активности</title>
                <style>/* ... СТИЛИ (сокращено) ... */</style></head><body>
                <div class="tab-container">
                    <h2>Доступные активности</h2>
                    <div class="activity-card"><div class="activity-header"><span>Шахматы</span><span>Участников: ${chessCount}</span></div>
                        <form action="/activities/update" method="POST" style="display:inline;"><input type="hidden" name="activity" value="Шахматы">
                        ${userActivities.includes("Шахматы") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                        </form></div>
                    <div class="activity-card"><div class="activity-header"><span>Футбол</span><span>Участников: ${footballCount}</span></div>
                        <form action="/activities/update" method="POST" style="display:inline;"><input type="hidden" name="activity" value="Футбол">
                        ${userActivities.includes("Футбол") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                        </form></div>
                    <div class="activity-card"><div class="activity-header"><span>Танцы</span><span>Участников: ${danceCount}</span></div>
                        <form action="/activities/update" method="POST" style="display:inline;"><input type="hidden" name="activity" value="Танцы">
                        ${userActivities.includes("Танцы") ? `<button type="submit" name="action" value="leave" class="btn btn-leave">Отписаться</button>` : `<button type="submit" name="action" value="join" class="btn btn-join">Записаться</button>`}
                        </form></div>
                    <br><a href="/profile" class="back-link">Вернуться в профиль</a>
                </div></body></html>
            `);
        } catch(error) {
            console.error("Ошибка на странице активностей:", error);
            res.status(500).send("Произошла ошибка на сервере.");
        }
    });

    // ОБРАБОТКА ЗАПИСИ НА АКТИВНОСТИ
    router.post("/update", requireLogin, async (req, res) => {
        try {
            const { activity, action } = req.body;
            const userId = ObjectId.createFromHexString(req.session.user._id);
            const usersCollection = db.collection("users");
            let updateQuery;
            if (action === "join") {
                updateQuery = { $addToSet: { activities: activity } };
            } else if (action === "leave") {
                updateQuery = { $pull: { activities: activity } };
            }
            if (updateQuery) {
                await usersCollection.updateOne({ _id: userId }, updateQuery);
            }
            
            await clearCache(LOGIN_PAGE_CACHE_KEY);  
            
            res.redirect("/activities");
        } catch (error) {
            console.error("Ошибка при обновлении активностей:", error);
            res.status(500).send("Не удалось обновить активность.");
        }
    });

    return router;
};