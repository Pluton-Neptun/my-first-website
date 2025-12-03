import express from 'express';
import { ObjectId } from "mongodb";
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db) => {
    const router = express.Router();

   router.get('/:activityName', async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
           const activityName = req.params.activityName;
            const participants = await db.collection('users').find({ activities: activityName }).toArray();
            
            let html = participants.map(p => `
                <div style="background:white; padding:15px; border-radius:5px; margin-bottom:10px;">
                    <h3>${p.name}</h3>
                    <p>Дни: ${(p.availability?.days || []).join(', ')}</p>
                </div>`).join('') || '<p>Никого нет.</p>';

            res.send(`
                <!DOCTYPE html><html><head><meta charset="UTF-8"><title>${activityName}</title><script src="/ga.js"></script></head>
                <body style="font-family:Arial; padding:20px; background:#f4f4f4;">
                    <h1>${activityName}</h1>
                    ${html}
                    <a href="/activities">Назад</a>
                </body></html>
            `);
        } catch (error) { console.error(error); res.status(500).send('Ошибка.'); }
    }); 

  router.get("/", requireLogin, async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
         const users = await db.collection("users").find().toArray();
            const myActivities = (await db.collection("users").findOne({ _id: ObjectId.createFromHexString(req.session.user._id) }))?.activities || [];
            
            const renderCard = (name) => {
                const count = users.filter(u => u.activities?.includes(name)).length;
                const isJoined = myActivities.includes(name);
                return `
                <div style="background:white; padding:15px; margin-bottom:10px; border-radius:5px; display:flex; justify-content:space-between;">
                    <span><b>${name}</b> (${count})</span>
                    <form action="/activities/update" method="POST" style="margin:0;">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}"> <input type="hidden" name="activity" value="${name}">
                        <button type="submit" name="action" value="${isJoined ? 'leave' : 'join'}" style="background:${isJoined?'#dc3545':'#28a745'}; color:white; border:none; padding:5px 10px; cursor:pointer;">
                            ${isJoined ? 'Отписаться' : 'Записаться'}
                        </button>
                    </form>
                </div>`;
            };

            res.send(` 
                <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Активности</title><script src="/ga.js"></script></head>
                <body style="font-family:Arial; background:#f0f0f0; padding:20px;">
                    <div style="max-width:600px; margin:auto;">
                        <h2>Активности</h2>
                        ${renderCard("Шахматы")}
                        ${renderCard("Футбол")}
                        ${renderCard("Танцы")}
                        <br><a href="/profile">В профиль</a>
                    </div>
                </body></html>
            `);
        } catch(error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    router.post("/update", requireLogin, async (req, res) => {
        try {
            const { activity, action } = req.body;
            const update = action === "join" ? { $addToSet: { activities: activity } } : { $pull: { activities: activity } };
            await db.collection("users").updateOne({ _id: ObjectId.createFromHexString(req.session.user._id) }, update);
            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            res.redirect("/activities");
        } catch (error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    return router;
};