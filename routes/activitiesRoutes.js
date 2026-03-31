import express from 'express';
import { ObjectId } from "mongodb"; 

const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else return res.redirect("/login"); 
};

export default (db) => {
    const router = express.Router();

    router.get("/", requireLogin, async (req, res) => { 
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate');  
            const uid = ObjectId.createFromHexString(req.session.user._id);
            
            const myRequests = await db.collection('activity_requests').find({ 
                userId: uid, 
                expiresAt: { $gt: new Date() } 
            }).toArray();

            const renderCard = (name, icon) => {
                const activeReq = myRequests.find(r => r.activity === name);
                
                if (activeReq) {
                    const spotsLeft = activeReq.limit - (activeReq.participants ? activeReq.participants.length : 0);
                    return `
                    <div class="activity-card" style="border-left: 5px solid #28a745; background: #f8fff9;">
                        <div class="activity-header">
                            <a href="/activities/${name}" class="activity-title">${icon} ${name}</a>
                            <span style="background:#28a745; color:white; padding:5px 10px; border-radius:20px; font-size:12px; font-weight:bold;">Опубликовано</span>
                        </div>
                        <p style="font-size:14px; color:#555; margin-bottom: 15px;">
                            ⏳ Ищем до: <b>${activeReq.limit} чел.</b><br>
                            ✅ Записалось: <b>${activeReq.participants ? activeReq.participants.length : 0}</b><br>
                            🔥 Осталось мест: <b style="color:#dc3545">${spotsLeft}</b>
                        </p>
                        <form action="/activities/delete-request" method="POST" style="margin:0;">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <input type="hidden" name="requestId" value="${activeReq._id}">
                            <button type="submit" class="btn btn-leave" style="padding:10px;">Отменить сбор</button>
                        </form>
                    </div>`;
                } else {
                    return `
                    <div class="activity-card">
                        <div class="activity-header">
                            <a href="/activities/${name}" class="activity-title">${icon} ${name}</a>
                        </div>
                        <form action="/activities/publish" method="POST" class="activity-form" style="margin:0;">
                            <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                            <input type="hidden" name="activity" value="${name}">
                            <div class="limit-box" style="margin-bottom:10px;">
                                <label style="font-weight:bold; color:#555;">Ищу компанию до: 
                                    <input type="number" name="limit" value="10" min="1" max="100" required style="width:60px; padding:8px; border-radius:5px; border:1px solid #ccc; text-align:center;">
                                чел.</label>
                            </div>
                            <button type="submit" class="btn btn-publish" style="background:#007BFF; color:white; padding:12px;">Опубликовать поиск</button>
                        </form>
                    </div>`;
                }
            };

            res.send(` 
                <!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Мои активности</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <style>
                    body { font-family: Arial, sans-serif; padding: 10px; background-color: #f4f6f9; margin: 0; color: #333; }
                    .tab-container { width: 100%; max-width: 600px; margin: 0 auto; padding-bottom: 30px; box-sizing: border-box; }
                    h2 { text-align: center; margin-top: 10px; color: #333; }
                    h3 { margin-top: 25px; border-bottom: 2px solid #ddd; padding-bottom: 8px; color: #555; }
                    .activity-card { padding: 20px; background-color: white; border: 1px solid #e1e4e8; margin-bottom: 15px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
                    .activity-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
                    .activity-title { color:#007BFF; text-decoration:none; font-size: 1.3em; font-weight: bold; }
                    .btn { padding: 12px 20px; border: none; border-radius: 8px; color: white; cursor: pointer; font-size: 16px; font-weight: bold; width: 100%; box-sizing: border-box; transition: 0.2s;}
                    .btn-publish:hover { opacity:0.9; }
                    .btn-leave { background-color: #dc3545; } .btn-leave:hover { background-color: #c82333; }
                    .nav-buttons { display: flex; gap: 10px; margin-top: 30px; }
                    a.back-link { flex: 1; display: block; color: white; text-align: center; padding: 15px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-sizing: border-box; background: #6c757d;}
                </style></head><body>
                <div class="tab-container">
                    <h2>Создать сбор на игру</h2>
                    <p style="text-align:center; color:#777; font-size:14px; margin-top:-10px;">Ваш сбор будет автоматически скрыт через 10 часов или когда наберется нужное количество людей.</p>
                    
                    <h3>Основные</h3>
                    ${renderCard("Шахматы", "♟️")}
                    ${renderCard("Футбол", "⚽")}
                    ${renderCard("Танцы", "💃")}
                    
                    <h3>Активный отдых</h3>
                    ${renderCard("Хоккей", "🏒")}
                    ${renderCard("Волейбол", "🏐")}
                    ${renderCard("Походы", "🥾")}
                    
                    <h3>Для души</h3>
                    ${renderCard("Путешествие", "✈️")}
                    
                    <div class="nav-buttons">
                        <a href="/profile" class="back-link">👤 В кабинет</a>
                    </div>
                </div>
                </body></html>
            `);
        } catch(error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    router.post("/publish", requireLogin, async (req, res) => { 
        try {
            const { activity, limit } = req.body;
            const user = await db.collection("users").findOne({ _id: ObjectId.createFromHexString(req.session.user._id) });
            
            await db.collection('activity_requests').deleteMany({ userId: user._id, activity: activity });

            await db.collection('activity_requests').insertOne({
                userId: user._id,
                userName: user.name,
                activity: activity,
                limit: parseInt(limit) || 10,
                participants: [], 
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000) 
            });

            res.redirect('/activities');
        } catch (e) { console.error(e); res.status(500).send("Ошибка публикации"); }
    });

    router.post("/delete-request", requireLogin, async (req, res) => { 
        try {
            const { requestId } = req.body;
            await db.collection('activity_requests').deleteOne({ 
                _id: new ObjectId(requestId),
                userId: ObjectId.createFromHexString(req.session.user._id)
            });
            res.redirect('/activities');
        } catch (e) { res.status(500).send("Ошибка удаления"); }
    });

    router.get('/:activityName', requireLogin, async (req, res) => { 
        try {
            const activityName = req.params.activityName; 
            if (['favicon.ico', 'publish', 'delete-request', 'join-request', 'sitemap.xml'].includes(activityName)) return res.status(404).send('Not found');

            const currentUserIdStr = req.session.user._id;
            const currentUser = await db.collection("users").findOne({ _id: ObjectId.createFromHexString(currentUserIdStr) });

            let activeRequests = await db.collection('activity_requests').find({ 
                activity: activityName,
                expiresAt: { $gt: new Date() }
            }).sort({ createdAt: -1 }).toArray();

            // 👇 ИСПРАВЛЕНИЕ: Достаем данные авторов из базы, чтобы показать их на карточке
            for (let reqData of activeRequests) {
                reqData.authorProfile = await db.collection('users').findOne({ _id: reqData.userId }) || {};
            }

            activeRequests = activeRequests.filter(r => {
                const isAuthor = r.userId.toString() === currentUserIdStr;
                const hasSpace = r.participants.length < r.limit;
                return isAuthor || hasSpace; 
            });
            
            let html = activeRequests.map(reqData => { 
                const isAuthor = reqData.userId.toString() === currentUserIdStr;
                const spotsLeft = reqData.limit - reqData.participants.length;
                const hasJoined = reqData.participants.some(p => p.userId === currentUserIdStr);

                // Если смотрит АВТОР сбора:
                if (isAuthor) {
                    let partsHtml = reqData.participants.map(p => 
                        `<div style="background:#eee; padding:10px; border-radius:5px; margin-bottom:8px; font-size:14px; border-left:3px solid #007BFF;">
                            👤 <b>${p.userName}</b><br>📞 <a href="tel:${p.phone}" style="color:#007BFF; font-weight:bold;">${p.phone}</a>
                            ${p.message ? `<div style="margin-top:6px; padding-top:6px; border-top:1px solid #ddd; color:#444;">💬 <i>"${p.message}"</i></div>` : ''}
                        </div>`
                    ).join('') || `<p style="color:#777; font-size:13px;">Пока никто не записался.</p>`;

                    return `
                    <div class="card" style="border: 2px solid #28a745;">
                        <div style="background:#28a745; color:white; padding:5px 10px; border-radius:5px 5px 0 0; font-weight:bold; margin:-20px -20px 15px -20px; text-align:center;">
                            🌟 Ваш сбор активен! (Мест: ${spotsLeft} из ${reqData.limit})
                        </div>
                        <h4 style="margin-top:0;">Список записавшихся:</h4>
                        ${partsHtml}
                    </div>`;
                }

                // Данные организатора для вывода
                const authorCity = reqData.authorProfile.city || 'Не указан';
                const authorCountry = reqData.authorProfile.country ? `(${reqData.authorProfile.country})` : '';
                const authorDays = (reqData.authorProfile.availability?.days || []).join(', ') || 'Любые';
                const authorTime = reqData.authorProfile.availability?.time || 'Любое время';

                // Если смотрит ДРУГОЙ пользователь, и он УЖЕ ЗАПИСАН:
                if (hasJoined) {
                    return `
                    <div class="card" style="border-left: 4px solid #17a2b8;">
                        <div class="card-title">Организатор: ${reqData.userName}</div>
                        <div style="background:#f8f9fa; padding:10px; border-radius:5px; margin-bottom:15px; font-size:13px; color:#555;">
                            🌍 ${authorCity} ${authorCountry}<br>
                            📅 Дни: ${authorDays}<br>
                            ⏰ Время: ${authorTime}
                        </div>
                        <p style="color:#17a2b8; font-weight:bold;">✅ Вы успешно записались!</p>
                        <p style="font-size:13px; color:#555;">Организатор свяжется с вами по указанному номеру.</p>
                    </div>`;
                }

                // Если смотрит ДРУГОЙ пользователь, и есть СВОБОДНЫЕ МЕСТА:
                return `
                <div class="card">
                    <div class="card-title">
                        Организатор: ${reqData.userName}
                    </div>
                    
                    <div style="background:#f8f9fa; padding:12px; border-radius:5px; margin-bottom:15px; font-size:14px; border-left: 3px solid #007BFF; color:#444;">
                        🌍 <b>Город:</b> ${authorCity} ${authorCountry}<br>
                        📅 <b>Удобные дни:</b> ${authorDays}<br>
                        ⏰ <b>Время:</b> ${authorTime}
                    </div>

                    <div class="card-info" style="color:#dc3545; font-weight:bold; margin-bottom:15px;">
                        🔥 Осталось мест: ${spotsLeft} из ${reqData.limit}
                    </div>
                    
                    <form action="/activities/join-request" method="POST" class="msg-form" style="margin:0;">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <input type="hidden" name="requestId" value="${reqData._id}">
                        
                        <label style="font-weight:bold; font-size:14px;">Контакт для связи:</label>
                        <input type="text" name="phone" placeholder="Ваш WhatsApp / Телефон" required value="${currentUser.phone || ''}" style="margin-top:5px;">
                        
                        <label style="font-weight:bold; font-size:14px;">Сообщение (необязательно):</label>
                        <textarea name="message" placeholder="Привет! Я буду вовремя / Возьму мяч..." style="margin-top:5px; margin-bottom:15px;"></textarea>
                        
                        <button type="submit" style="background:#28a745;">Записаться (${spotsLeft} мест)</button>
                    </form>
                </div>`;
            }).join('') || '<p style="text-align:center; color:#777; font-size:18px; margin-top:30px;">Сейчас активных сборов нет. Создайте свой в Кабинете!</p>';
                
            res.send(`
                <!DOCTYPE html><html><head><meta charset="UTF-8"><title>${activityName}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <style>
                    body{font-family:Arial,sans-serif;padding:15px;background:#eee;max-width:800px;margin:auto;}
                    h1{text-align:center; color:#333; margin-bottom:20px;}
                    .card{background:white;padding:20px;margin-bottom:20px;border-radius:10px;box-shadow:0 3px 10px rgba(0,0,0,0.1)}
                    .card-title{font-weight:bold; font-size:1.3em; margin-bottom:10px; color:#007BFF;}
                    .card-info{color:#555; font-size:1.1em; margin-bottom:5px;}
                    
                    .msg-form input, .msg-form textarea {width:100%; padding:12px; box-sizing:border-box; border:1px solid #ccc; border-radius:5px; font-size:15px;}
                    .msg-form textarea { height: 70px; resize: vertical; }
                    .msg-form button{width:100%; padding:15px; color:white; border:none; cursor:pointer; border-radius:5px; font-size:16px; font-weight:bold;}
                    .msg-form button:hover{opacity:0.9;}
                    
                    .nav-buttons { display: flex; gap: 10px; margin-top: 30px; }
                    a.back-btn{ flex: 1; display:block;text-align:center;padding:15px;color:white;text-decoration:none;border-radius:8px; font-weight:bold; font-size:16px; box-sizing: border-box; background: #6c757d;}
                </style></head><body>
                
                <h1>${activityName}</h1>
                <p style="text-align:center; color:#777; margin-top:-10px;">Активные сборы на данный момент:</p>

                ${html}
                
                <div class="nav-buttons">
                    <a href="javascript:history.back()" class="back-btn">⬅ Назад</a>
                </div>
                
                </body></html>
            `);
        } catch (error) { console.error(error); res.status(500).send('Ошибка.'); }
    });

    router.post('/join-request', requireLogin, async (req, res) => { 
        try {
            const { requestId, phone, message } = req.body;
            const uid = req.session.user._id;
            
            await db.collection('users').updateOne(
                { _id: ObjectId.createFromHexString(uid) },
                { $set: { phone: phone } }
            );
            req.session.user.phone = phone; 
            
            await db.collection('activity_requests').updateOne(
                { _id: new ObjectId(requestId) },
                { $push: { 
                    participants: { 
                        userId: uid, 
                        userName: req.session.user.name, 
                        phone: phone, 
                        message: message || '', 
                        joinedAt: new Date() 
                    } 
                }}
            );

            res.redirect(req.get('referer'));
        } catch (error) { console.error(error); res.status(500).send('Ошибка записи.'); }
    });

    return router;
};  