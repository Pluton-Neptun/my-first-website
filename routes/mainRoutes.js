import express from 'express';
import { ObjectId } from 'mongodb'; 
import { getCache, setCache, clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';
import { checkLimitsAndGetCounts } from '../services/activityService.js';

function isImage(filename) { return filename && filename.match(/\.(jpg|jpeg|png|gif|webp)$/i); }

export default (db) => {
    const router = express.Router();

    const ADMIN_EMAIL = 'tin@mail.ru'; 

    router.get('/clear-cache-now', async (req, res) => {
        try {
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.send('<h2 style="color: green; text-align: center; margin-top: 50px;">✅ Кэш Redis успешно сброшен!</h2><div style="text-align: center;"><a href="/" style="font-size: 20px;">Вернуться на главную</a></div>');
        } catch (error) { res.send('Ошибка: ' + error.message); }
    });

    router.post('/admin-delete', async (req, res) => { 
        if (!req.session || !req.session.user || req.session.user.email !== ADMIN_EMAIL) {
            return res.status(403).json({ error: 'У вас нет прав для удаления' });
        }
        try {
            const { type, id } = req.body;
            if (type === 'comment') await db.collection('comments').deleteOne({ _id: new ObjectId(id) });
            else if (type === 'feedback') await db.collection('feedback').deleteOne({ _id: new ObjectId(id) });
             else if (type === 'restaurant') await db.collection('restaurants').deleteOne({ _id: new ObjectId(id) });
            else if (type === 'task') await db.collection('tasks').deleteOne({ _id: new ObjectId(id) });

            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.json({ status: 'ok' }); 
        } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка при удалении' }); }
    });

    router.post('/send-message', async (req, res) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'Нужна авторизация' });
        }
        try {
            const { toUserId, imageId, messageText, contactInfo, source } = req.body;
            let receiverId; 
            try { receiverId = new ObjectId(toUserId); } 
            catch (e) {
                if (imageId) { 
                    const img = await db.collection('tasks').findOne({ _id: new ObjectId(imageId) });
                    if (img) receiverId = new ObjectId(img.userId);
                }
            }

            if (!receiverId) return res.status(400).json({ error: 'Не найден получатель' });

            const senderContact = contactInfo || req.session.user.phone || req.session.user.name;

            await db.collection('messages').insertOne({
                toUserId: receiverId, 
                fromContact: senderContact,
                imageId: imageId ? new ObjectId(imageId) : null, 
                source: source || "Галерея",
                text: messageText, 
                reply: null, 
                createdAt: new Date(), 
                isRead: false
            });
            
            await db.collection('comments').insertOne({ authorName: req.session.user.name, text: messageText, createdAt: new Date(), likes: [], dislikes: [] });
            await clearCache(LOGIN_PAGE_CACHE_KEY); 
            res.json({ status: 'ok' });
        } catch (error) { console.error(error); res.status(500).json({ error: 'Ошибка отправки' }); }
    });

    router.post('/vote-comment', async (req, res) => {
        if (!req.session || !req.session.user) return res.status(401).json({ error: 'Нужна авторизация' });
        try {
            const { commentId, type } = req.body;
            const userEmail = req.session.user.email;
            const comment = await db.collection("comments").findOne({ _id: new ObjectId(commentId) });
            if (!comment) return res.status(404).json({ error: 'Не найден' });

            let likes = comment.likes || [];
            let dislikes = comment.dislikes || [];

            if (type === 'like') {
                if (likes.includes(userEmail)) likes = likes.filter(e => e !== userEmail);
                else { likes.push(userEmail); dislikes = dislikes.filter(e => e !== userEmail); }
            } else if (type === 'dislike') {
                if (dislikes.includes(userEmail)) dislikes = dislikes.filter(e => e !== userEmail);
                else { dislikes.push(userEmail); likes = likes.filter(e => e !== userEmail); }
            }

            await db.collection("comments").updateOne({ _id: new ObjectId(commentId) }, { $set: { likes, dislikes } });
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.json({ likes: likes.length, dislikes: dislikes.length });
        } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
    });

    router.post('/add-restaurant', async (req, res) => {
        if (!req.session || !req.session.user) return res.status(401).send('Нужна авторизация');
        try {
            await db.collection('restaurants').insertOne({
                name: req.body.name, discount: req.body.discount, description: req.body.description,
                contact: req.body.contact, addedBy: req.session.user.email, createdAt: new Date()
            });
            await clearCache(LOGIN_PAGE_CACHE_KEY);
            res.redirect('/');
        } catch (e) { console.error(e); res.status(500).send("Ошибка при добавлении ресторана"); }
    });

    router.post('/submit-feedback', async (req, res) => {
        try {
            const { feedbackText, contactInfo } = req.body;
            if (feedbackText && feedbackText.trim() !== '') {
                await db.collection('feedback').insertOne({ text: feedbackText, contact: contactInfo || 'Гость', createdAt: new Date() });
                await clearCache(LOGIN_PAGE_CACHE_KEY);
            }
            res.json({ status: 'ok' });
        } catch (err) { 
            console.error(err); 
            res.status(500).json({ error: 'Ошибка при отправке пожелания' }); 
        }
    });

    // 2. ГЛАВНАЯ СТРАНИЦА
    router.get(["/", "/login"], async (req, res) => { 
        try {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); 
            
            const currentUser = req.session && req.session.user ? req.session.user : null;
            const isAdmin = currentUser && currentUser.email === ADMIN_EMAIL;
            
            let pageData = await getCache(LOGIN_PAGE_CACHE_KEY); 
            
            if (!pageData || !pageData.restaurants || !pageData.feedbacks) {
                const comments = await db.collection("comments").find().sort({ createdAt: -1 }).toArray(); 
                const tasks = await db.collection('tasks').find().sort({ createdAt: -1 }).toArray(); 
                const restaurants = await db.collection('restaurants').find().sort({ createdAt: -1 }).toArray(); 
                const feedbacks = await db.collection('feedback').find().sort({ createdAt: -1 }).limit(15).toArray(); 
                pageData = { comments, tasks, restaurants, feedbacks }; 
                await setCache(LOGIN_PAGE_CACHE_KEY, pageData); 
            }
 
            const getDeleteBtn = (type, id) => {
                if (!isAdmin) return '';
                return `<span onclick="adminDelete('${type}', '${id}', this)" style="background: red; color: white; padding: 2px 5px; font-size: 10px; border-radius: 3px; cursor: pointer; margin-left: 8px; user-select: none; position: relative; top: -1px;" title="Удалить">❌</span>`;
            };

            let commentsHtml = pageData.comments.map(c => {
                const likesCount = c.likes ? c.likes.length : 0;
                const dislikesCount = c.dislikes ? c.dislikes.length : 0;
                return `
                <div class="comment" style="background: rgba(255,255,255,0.1); padding: 10px; margin-bottom: 10px; border-radius: 5px;">
                    <div style="font-size: 14px; margin-bottom: 8px;"><b>${c.authorName}</b>${getDeleteBtn('comment', c._id)}: ${c.text}</div>
                    <div style="display: flex; gap: 15px; font-size: 13px;">
                        <span onclick="voteComment('${c._id}', 'like')" style="cursor: pointer; color: #28a745; user-select: none; padding: 2px 5px; border-radius: 3px; background: rgba(40,167,69,0.1);">👍 <span id="likes-${c._id}"><b>${likesCount}</b></span></span>
                        <span onclick="voteComment('${c._id}', 'dislike')" style="cursor: pointer; color: #dc3545; user-select: none; padding: 2px 5px; border-radius: 3px; background: rgba(220,53,69,0.1);">👎 <span id="dislikes-${c._id}"><b>${dislikesCount}</b></span></span>
                    </div>
                </div>`;
            }).join('');

            let historyItems = [];
            pageData.comments.forEach(c => {
                const shortText = c.text.length > 25 ? c.text.substring(0, 25) + '...' : c.text;
                if (c.likes) c.likes.forEach(email => historyItems.push({ type: 'like', email, text: shortText, date: c.createdAt }));
                if (c.dislikes) c.dislikes.forEach(email => historyItems.push({ type: 'dislike', email, text: shortText, date: c.createdAt }));
            });
            historyItems.sort((a, b) => new Date(b.date) - new Date(a.date));

            let freeDislikesShown = 0;
            let historyHtml = historyItems.map(item => {
                if (item.type === 'like') {
                    return `<div style="background: rgba(40,167,69,0.1); padding: 8px; margin-bottom: 5px; border-radius: 5px; font-size: 13px; border-left: 3px solid #28a745;">👍 <b>${item.email}</b> оценил: <i style="color:#bbb;">"${item.text}"</i></div>`;
                } else {
                    if (freeDislikesShown < 1) { 
                        freeDislikesShown++;
                        return `<div style="background: rgba(220,53,69,0.1); padding: 8px; margin-bottom: 5px; border-radius: 5px; font-size: 13px; border-left: 3px solid #dc3545;">👎 <b>${item.email}</b> не оценил: <i style="color:#bbb;">"${item.text}"</i><div style="font-size: 10px; color: #ffc107; margin-top: 3px;">(Демо-просмотр: 1 из 1)</div></div>`;
                    } else { 
                        return `<div style="background: rgba(0,0,0,0.3); padding: 8px; margin-bottom: 5px; border-radius: 5px; font-size: 13px; border-left: 3px solid #777;">🔒 <b>Скрытый аккаунт</b> поставил дизлайк.<br><a href="#" onclick="alert('Просмотр всех дизлайков — платная услуга!'); return false;" style="color:#ffc107; font-size:11px; text-decoration:none;">💰 Открыть (Платная услуга)</a></div>`;
                    }
                }
            }).join('') || '<p style="text-align:center; color:#777; font-size: 14px;">Истории пока нет.</p>';

            const historyContainer = `<div style="max-height: 250px; overflow-y: auto; padding-right: 5px;" class="custom-scrollbar">${historyHtml}</div>`;

            let restaurantsHtml = (pageData.restaurants || []).map(r => `
                <div style="background: rgba(255,152,0,0.1); padding: 12px; margin-bottom: 10px; border-radius: 5px; border-left: 4px solid #ff9800;">
                    <div style="font-size: 15px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                        <div><b>${r.name}</b>${getDeleteBtn('restaurant', r._id)}</div> 
                        <span style="color:#ff9800; font-weight:bold; background:rgba(255,152,0,0.2); padding:2px 6px; border-radius:4px; font-size:12px;">${r.discount}</span>
                    </div>
                    <div style="font-size: 13px; color: #ccc; margin-bottom: 8px;">${r.description}</div>
                    <div style="font-size: 12px; color: #aaa;">📞 Бронь: <span style="color:white;">${r.contact}</span></div>
                </div>
            `).join('') || '<p style="text-align:center; color:#777; font-size: 14px;">Пока нет предложений.</p>';

            const restaurantsContainer = `<div style="max-height: 250px; overflow-y: auto; padding-right: 5px;" class="custom-scrollbar">${restaurantsHtml}</div>`;

            let feedbacksHtml = (pageData.feedbacks || []).map(f => `
                <div style="background: rgba(255,255,255,0.1); padding: 10px; margin-bottom: 5px; border-radius: 5px; font-size: 13px; border-left: 3px solid #6cafff;">
                    <b style="color: #6cafff;">${f.contact}</b>${getDeleteBtn('feedback', f._id)}: <span style="color:#eee;">${f.text}</span>
                </div>
            `).join('') || '<p style="text-align:center; color:#777; font-size: 13px;">Будьте первыми!</p>';

            const feedbackContainer = `<div style="max-height: 150px; overflow-y: auto; padding-right: 5px; margin-bottom: 15px;" class="custom-scrollbar">${feedbacksHtml}</div>`;

            const renderGalleryItem = (t) => { 
                let src = t.imageBase64 ? `data:${t.mimetype || 'image/jpeg'};base64,${t.imageBase64}` : `/uploads/${t.fileName}`;
                const content = `<img src="${src}" alt="${t.originalName}" loading="lazy">`;
                
                let statusHtml = ''; 
                if (t.amount && t.amount.trim() !== '') statusHtml = `<div class="status-label status-amount">${t.amount}</div>`;
                else if (t.status === 'free') statusHtml = `<div class="status-label status-free">Свободна сегодня</div>`;
                else if (t.status === 'company') statusHtml = `<div class="status-label status-company">Ждем компанию</div>`;
                else if (t.status === 'alone') statusHtml = `<div class="status-label status-alone">Я одна (один)</div>`;
                else if (t.status === 'want_cocktail') statusHtml = `<div class="status-label status-cocktail">Хочу коктейль 🍹</div>`;
                else if (t.status === 'ride') statusHtml = `<div class="status-label status-ride">Прокатиться 🚗</div>`;
                else statusHtml = `<div class="status-label status-busy">Временно занята</div>`;
                
                 let adminDeletePhotoBtn = isAdmin ? `<div onclick="if(event) event.stopPropagation(); adminDelete('task', '${t._id}', this)" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border-radius:50%; width:20px; height:20px; display:flex; justify-content:center; align-items:center; font-size:10px; cursor:pointer; z-index:10; box-shadow: 0 0 5px black;" title="Удалить фото">❌</div>` : '';

                return `
                    <div class="gallery-wrapper" style="position: relative;" onclick="openModal('${t._id}', '${t.userId}', this.querySelector('img').src, '${t.originalName}')">
                        ${adminDeletePhotoBtn}
                        <div class="gallery-item work-border" title="Нажмите, чтобы открыть">${content}</div>
                        ${statusHtml}
                    </div>
                `;
            }; 

            let tasksHtml = `<div class="gallery-grid">` + pageData.tasks.map(t => renderGalleryItem(t)).join('') + `</div>`;

            let authBlockHtml = '';
            if (currentUser) {
                authBlockHtml = `
                    <h3 style="margin-top:0;">Привет, <span style="color:#28a745;">${currentUser.name}</span>!</h3>
                    <a href="/profile" style="display:block; background:#28a745; color:white; padding:12px; text-align:center; text-decoration:none; border-radius:5px; font-weight:bold; margin-bottom:10px;">В личный кабинет 👤</a>
                    <form action="/logout" method="POST" style="margin:0;">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <button type="submit" style="background:#dc3545; margin:0;">Выйти</button>
                    </form>
                `;
            } else {
                authBlockHtml = `
                    <h3 style="margin-top:0;">Вход</h3>
                    <form action="/login" method="POST" style="margin:0;">
                        <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                        <input type="email" name="email" placeholder="Email" required>
                        <input type="password" name="password" placeholder="Пароль" required>
                        <button type="submit">Войти</button>
                        <a href="/register" class="link">Нет аккаунта? Регистрация</a>
                    </form>
                `;
            }

            const emojiPickerHtml = currentUser ? `
                <div id="emojiPickerBar" class="emoji-picker" style="display: none; margin: 5px 0; font-size: 22px; text-align: center; user-select: none; transition: 0.3s;">
                    <span onclick="addEmoji('👍')" style="cursor:pointer; margin: 0 4px;">👍</span>
                    <span onclick="addEmoji('🔥')" style="cursor:pointer; margin: 0 4px;">🔥</span>
                    <span onclick="addEmoji('💡')" style="cursor:pointer; margin: 0 4px;">💡</span>
                    <span onclick="addEmoji('😍')" style="cursor:pointer; margin: 0 4px;">😍</span>
                    <span onclick="addEmoji('🚀')" style="cursor:pointer; margin: 0 4px;">🚀</span>
                    <span onclick="addEmoji('😂')" style="cursor:pointer; margin: 0 4px;">😂</span>
                    <span onclick="addEmoji('🤝')" style="cursor:pointer; margin: 0 4px;">🤝</span>
                </div>
            ` : '';

            res.send(` 
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                    <title>Главная стена</title>
                    <link rel="canonical" href="https://mikky.kz/" />
                    <script src="/ga.js"></script>
                    <style>
                     html { scroll-snap-type: y mandatory; }
                        body { font-family: Arial, sans-serif; background: url('/images/background.jpg') center/cover fixed; margin: 0; height: 100dvh; overflow-y: scroll; }
                        .page-section { min-height: 100dvh; width: 100%; scroll-snap-align: start; display: flex; justify-content: center; align-items: flex-start; padding-top: 40px; padding-bottom: 40px; box-sizing: border-box; position: relative; }
                      .second-page { background: rgba(0, 0, 0, 0.4); display: flex; flex-direction: column; justify-content: center; align-items: center; }
                        .scroll-hint { position: absolute; bottom: 20px; color: white; font-size: 24px; animation: bounce 2s infinite; opacity: 0.7; z-index: 10; pointer-events: none;}
                        @keyframes bounce { 0%, 20%, 50%, 80%, 100% {transform: translateY(0);} 40% {transform: translateY(-10px);} 60% {transform: translateY(-5px);} }
                        
                        /* 👇 ИСПРАВЛЕНИЕ: Расширили контейнер и ужали блоки, чтобы влезло 4 в ряд */
                        .main-wrapper { display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; max-width: 1400px; width: 100%; }
                        .block { background: rgba(0,0,0,0.7); color: white; padding: 20px; border-radius: 8px; width: 100%; max-width: 320px; margin-bottom: 20px; box-sizing: border-box; }
                        
                        input, button { width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 5px; box-sizing: border-box; font-size: 16px; } 
                      button { background: #007BFF; color: white; border: none; cursor: pointer; font-weight: bold;}
                        .gallery-grid { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; } 
                        .gallery-wrapper { display: flex; flex-direction: column; align-items: center; width: 85px; cursor: pointer; transition: 0.2s; }
                        .gallery-wrapper:hover { transform: scale(1.05); }
                        .gallery-item { width: 85px; height: 85px; display: flex; justify-content: center; align-items: center; overflow: hidden; border-radius: 5px; background: rgba(255,255,255,0.1); }
                        .gallery-item img { width: 100%; height: 100%; object-fit: cover; }
                      .work-border { border: 2px solid orange; }
                      .status-label { font-size: 10px; text-align: center; margin-top: 4px; font-weight: bold; width: 100%; word-break: break-word; line-height: 1.2;}
                        
                        .status-free { color: #28a745; } 
                        .status-company { color: #ffc107; } 
                        .status-alone { color: #e056fd; } 
                        .status-cocktail { color: #00bcd4; } 
                        .status-ride { color: #ffeb3b; } 
                        .status-busy { color: #ccc; font-style: italic; } 
                        .status-amount { color: #00c3ff; font-size: 11px; }

                        .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center; }
                        .modal { background: white; padding: 20px; border-radius: 10px; width: 90%; max-width: 400px; text-align: center; position: relative; max-height: 90vh; overflow-y: auto; }
                        .modal img { max-width: 100%; max-height: 30vh; border-radius: 5px; margin-bottom: 15px; object-fit: contain; }
                        .modal-buttons { display: flex; flex-direction: column; gap: 10px; justify-content: center; margin-top: 15px; } 
                      .btn-view { background: #6c757d; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: block; width: 100%; box-sizing: border-box; }
                        .btn-chat { background: #28a745; color: white; padding: 12px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; width: 100%; }
                        .btn-login-prompt { background: #dc3545; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: block; width: 100%; box-sizing: border-box; font-weight: bold; }
                        .close-modal { position: absolute; top: 10px; right: 15px; font-size: 30px; cursor: pointer; color: #333; font-weight: bold; z-index: 5;}
                        #msg-form { display: none; margin-top: 15px; text-align: left; }
                        #msg-form textarea { width: 100%; height: 80px; margin-bottom: 10px; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; font-size: 16px;}
                        #msg-form input { width: 100%; padding: 10px; margin-bottom: 10px; box-sizing: border-box; border: 1px solid #ccc; font-size: 16px;}
                      a.link { color: #6cafff; display: block; text-align: center; margin-top: 10px; padding: 10px;}
                        .new-activities-wrapper { display: flex; gap: 15px; flex-wrap: wrap; justify-content: center; max-width: 800px; width: 100%; }
                        .new-btn { display: inline-block; padding: 12px 25px; background: rgba(255,255,255,0.1); border: 2px solid white; color: white; text-decoration: none; border-radius: 30px; font-size: 1.1em; transition: 0.3s; margin: 5px; }
                        .travel-link { font-family: 'Comic Sans MS', 'Brush Script MT', cursive; font-size: 1.8em; color: #ffeb3b; transform: rotate(-5deg); margin: 20px 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); display: inline-block; text-decoration: none; text-align: center;}
                      a.activity-btn { display: block; width: 100%; padding: 12px; margin-bottom: 10px; color: white; text-align: center; text-decoration: none; border-radius: 5px; box-sizing: border-box; font-weight: bold; border: 1px solid rgba(255,255,255,0.2); transition: 0.3s; }
                        .chess-btn { background-color: #6f42c1; } .foot-btn { background-color: #fd7e14; } .dance-btn { background-color: #e83e8c; }
                        .evening-link { display: block; margin-top: 30px; font-size: 1.3em; color: #d4af37; text-decoration: none; border: 2px solid #d4af37; padding: 10px 20px; border-radius: 10px; transition: 0.3s; background: rgba(0,0,0,0.5); text-align: center;}
                        
                        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.1); border-radius: 5px; }
                        .custom-scrollbar::-webkit-scrollbar-thumb { background: #888; border-radius: 5px; }
                        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }

                        .emoji-picker span { transition: transform 0.2s; display: inline-block; }
                        .emoji-picker span:hover { transform: scale(1.3); }

                        @media (max-width: 600px) {
                            .page-section { padding-top: 20px; display: block; height: auto; min-height: 100dvh; }
                            .main-wrapper { flex-direction: column; align-items: center; padding-bottom: 60px; }
                            .block { width: 95%; max-width: none; } 
                            .new-btn { font-size: 1em; padding: 10px 20px; width: 80%; text-align: center; }
                            .travel-link { font-size: 1.5em; margin-left: 0; transform: rotate(0deg); }
                            .scroll-hint { display: none; } 
                            h3 { text-align: center; }
                        }
                    </style>
                </head>
                <body>
                    <div id="photoModal" class="modal-overlay">
                        <div class="modal">
                            <span class="close-modal" onclick="closeModal('photoModal')">&times;</span>
                            <h3 id="modalTitle" style="margin-top:0; color:black;">Фото</h3>
                            <img id="modalImg" src="">
                            
                            <div id="actionButtons" class="modal-buttons">
                                <a id="viewLink" href="#" target="_blank" class="btn-view">👁️ Просто посмотреть</a>
                                ${currentUser ? 
                                    `<button onclick="showChatForm()" class="btn-chat">💬 Написать сообщение</button>` 
                                    : 
                                    `<a href="/login" class="btn-login-prompt">🔒 Войти, чтобы написать</a>`
                                }
                            </div>
                            
                            <div id="msg-form">
                                <label style="color:black; font-weight:bold;">Ваш контакт:</label>
                                <input type="text" id="contactInfo" placeholder="Email или телефон..." value="${currentUser ? (currentUser.phone || currentUser.email) : ''}">
                                <label style="color:black; font-weight:bold;">Сообщение:</label>
                                <textarea id="messageText" placeholder="Привет! Я насчет этого фото..."></textarea>
                                <button onclick="sendMessage()" style="background:#007BFF">Отправить владельцу</button>
                            </div>
                        </div>
                    </div>

                    <div id="restaurantModal" class="modal-overlay">
                        <div class="modal">
                            <span class="close-modal" onclick="closeModal('restaurantModal')">&times;</span>
                            <h3 style="margin-top:0; color:black;">Предложить ресторан</h3>
                            <form action="/add-restaurant" method="POST" style="text-align:left;">
                                <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                                <label style="color:black; font-weight:bold; font-size:14px;">Название заведения:</label>
                                <input type="text" name="name" required placeholder="Например: Мята Lounge" style="border:1px solid #ccc; color:black;">
                                <label style="color:black; font-weight:bold; font-size:14px;">Скидка / Акция:</label>
                                <input type="text" name="discount" required placeholder="Например: Скидка 20% на бар" style="border:1px solid #ccc; color:black;">
                                <label style="color:black; font-weight:bold; font-size:14px;">Описание (коротко):</label>
                                <textarea name="description" required placeholder="Уютная атмосфера, живая музыка..." style="width: 100%; height: 60px; margin-bottom: 10px; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; font-size: 14px;"></textarea>
                                <label style="color:black; font-weight:bold; font-size:14px;">Ваш контакт (бронь):</label>
                                <input type="text" name="contact" required placeholder="Телефон или Telegram" value="${currentUser ? (currentUser.phone || currentUser.email) : ''}" style="border:1px solid #ccc; color:black;">
                                <button type="submit" style="background:#ff9800; margin-top:10px;">Опубликовать предложение</button>
                            </form>
                        </div>
                    </div>

                    <div class="page-section">
                        <div class="main-wrapper">
                            
                            <div class="block">
                                <h3 style="color: #6cafff; margin-top:0;">💡 Идеи и пожелания</h3>
                                <p style="font-size: 12px; color: #ccc; margin-top: -10px;">Как нам улучшить сайт?</p>
                                ${feedbackContainer}
                                
                                <form onsubmit="submitFeedback(event)" style="margin:0;">
                                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                                    <input type="text" name="contactInfo" placeholder="Ваше имя/контакт" value="${currentUser ? (currentUser.name || currentUser.email) : ''}" required style="padding: 8px; font-size: 14px;">
                                    
                                    ${emojiPickerHtml}
                                    
                                    <textarea id="feedbackInput" name="feedbackText" placeholder="Напишите вашу идею..." required style="width: 100%; height: 50px; margin-bottom: 10px; padding: 8px; box-sizing: border-box; border-radius: 5px; font-size: 14px; resize: none;" onclick="showEmojiPicker()"></textarea>
                                    <button type="submit" style="background:#007BFF; padding: 10px; font-size: 14px;">Отправить идею</button>
                                </form>
                            </div>
                            
                            <div class="block">
                                ${authBlockHtml}
                                <hr>
                                <h3>Активности:</h3>
                                <a href="/activities/Шахматы" class="activity-btn chess-btn">♟️ Шахматы</a>
                                <a href="/activities/Футбол" class="activity-btn foot-btn">⚽ Футбол</a>
                                <a href="/activities/Танцы" class="activity-btn dance-btn">💃 Танцы</a>
                            </div>
                            
                            <div class="block">
                                <h3>Последние комментарии</h3>
                                ${commentsHtml || "<p>Пусто</p>"}
                            </div>

                            <div class="block">
                                <h3>🍹 Коктейль (Галерея)</h3>
                                ${tasksHtml || "<p>Нет загрузок</p>"}
                            </div>

                            <div class="block">
                                <h3>📜 История оценок</h3>
                                ${historyContainer}
                            </div>

                            <div class="block">
                                <h3 style="color:#ff9800;">🍽️ Рестораны со скидкой</h3>
                                ${restaurantsContainer}
                                ${currentUser ? 
                                    `<button onclick="document.getElementById('restaurantModal').style.display='flex'" style="background:#ff9800; margin-top:15px; font-size:15px;">+ Предложить свой</button>` 
                                    : 
                                    `<p style="font-size:13px; color:#aaa; text-align:center; margin-top:15px;">Войдите, чтобы предложить ресторан</p>`
                                }
                            </div>

                      </div>
                        <div class="scroll-hint">⬇</div>
                    </div>

                    <div class="page-section second-page">
                        <h2 style="color:white; margin-bottom:30px; text-align:center;">Активный отдых</h2>
                        <div class="new-activities-wrapper">
                            <a href="/activities/Хоккей" class="new-btn">🏒 Хоккей</a>
                            <a href="/activities/Волейбол" class="new-btn">🏐 Волейбол</a>
                            <a href="/activities/Походы" class="new-btn">🥾 Походы</a>
                        </div>
                        <div style="margin-top: 30px; text-align:center; width: 100%;">
                            <a href="/activities/Путешествие" class="travel-link">✈️ Путешествие с тобой...</a><br>
                            <a href="/evening" class="evening-link">🌙 После 19:00... <br>Кто что предложит?</a>
                        </div>
                    </div>

                    <script>
                        let currentToUserId = ''; let currentImageId = '';

                        function showEmojiPicker() {
                            const picker = document.getElementById('emojiPickerBar');
                            if (picker) {
                                picker.style.display = 'block';
                            }
                        }

                        function addEmoji(emoji) {
                            const input = document.getElementById('feedbackInput');
                            if (input) {
                                input.value += emoji;
                                input.focus();
                            }
                        }

                        async function submitFeedback(e) {
                            e.preventDefault(); 
                            const form = e.target;
                            const btn = form.querySelector('button');
                            const contactInfo = form.contactInfo.value;
                            const feedbackText = form.feedbackText.value;
                            const csrf = form._csrf.value;

                            btn.disabled = true;
                            btn.innerText = 'Отправка...';

                            const res = await fetch('/submit-feedback', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
                                body: JSON.stringify({ contactInfo, feedbackText })
                            });

                            if (res.ok) {
                                form.feedbackText.value = ''; 
                                btn.innerText = 'Отправлено! ✔️';
                                btn.style.background = '#28a745'; 
                                
                                setTimeout(() => {
                                    btn.disabled = false;
                                    btn.innerText = 'Отправить идею';
                                    btn.style.background = '#007BFF'; 
                                }, 2500);
                            } else {
                                alert('Ошибка отправки.');
                                btn.disabled = false;
                                btn.innerText = 'Отправить идею';
                            }
                        }
 
                        async function adminDelete(type, id, btn) { 
                            if (!confirm('Точно удалить этот контент?')) return;
                            const res = await fetch('/admin-delete', {
                                method: 'POST',
                                headers: {'Content-Type': 'application/json', 'x-csrf-token': "${res.locals.csrfToken}"},
                                body: JSON.stringify({ type, id })
                            });
                            if (res.ok) { 
                                const element = btn.closest('.comment') || btn.closest('div[style*="rgba(255,152,0,0.1)"]') || btn.closest('div[style*="rgba(255,255,255,0.1)"]') || btn.closest('.gallery-wrapper');
                                if (element) element.remove();
                            } else {
                                alert('Произошла ошибка при удалении.');
                            }
                        }

                        function openModal(id, userId, url, title) {
                            document.getElementById('photoModal').style.display = 'flex';
                            document.getElementById('modalImg').src = url;
                            document.getElementById('modalTitle').innerText = title;
                            document.getElementById('viewLink').href = url;
                            
                            document.getElementById('actionButtons').style.display = 'flex';
                            document.getElementById('msg-form').style.display = 'none';
                            document.getElementById('messageText').value = '';
                            
                            currentToUserId = userId; currentImageId = id;
                        }

                        function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }
                        function showChatForm() { document.getElementById('actionButtons').style.display = 'none'; document.getElementById('msg-form').style.display = 'block'; }

                        async function sendMessage() {
                            const text = document.getElementById('messageText').value;
                            const contact = document.getElementById('contactInfo') ? document.getElementById('contactInfo').value : '';
                            
                            if(!text) return alert('Напишите сообщение!');

                            const res = await fetch('/send-message', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'x-csrf-token': "${res.locals.csrfToken}" },
                                body: JSON.stringify({ toUserId: currentToUserId, imageId: currentImageId, messageText: text, contactInfo: contact, source: 'Галерея' })
                            });
                            
                            if(res.ok) { 
                                alert('Отправлено!'); 
                                closeModal('photoModal'); 
                                location.reload(); 
                            } else if (res.status === 401) {
                                alert('Для отправки сообщения нужно войти в аккаунт!');
                                window.location.href = '/login';
                            } else { 
                                alert('Ошибка отправки.'); 
                            }
                        }

                        async function voteComment(commentId, type) {
                            const res = await fetch('/vote-comment', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'x-csrf-token': "${res.locals.csrfToken}" },
                                body: JSON.stringify({ commentId: commentId, type: type })
                            });

                            if (res.status === 401) { alert('Войдите в аккаунт!'); return; }

                            if (res.ok) { location.reload(); } 
                            else { alert('Ошибка при голосовании.'); }
                        }

                        window.onclick = function(event) {
                            if (event.target == document.getElementById('photoModal')) closeModal('photoModal');
                            if (event.target == document.getElementById('restaurantModal')) closeModal('restaurantModal');
                        }
                    </script>
                </body>
                </html>
            `);
        } catch(error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    return router;
};