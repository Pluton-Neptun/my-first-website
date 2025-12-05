import express from 'express';
import { ObjectId } from "mongodb";
import { getCache, setCache, LOGIN_PAGE_CACHE_KEY, clearCache } from '../cacheService.js';

function isImage(filename) { return filename.match(/\.(jpg|jpeg|png|gif|webp)$/i); }

export default (db) => {
    const router = express.Router();

    // ---------------------------------------------------------
    // 1. ОТПРАВКА СООБЩЕНИЯ (УНИВЕРСАЛЬНАЯ)
    // ---------------------------------------------------------
    router.post('/send-message', async (req, res) => {
        try {
            const { toUserId, imageId, messageText, contactInfo, source } = req.body;
            
            await db.collection('messages').insertOne({
                toUserId: ObjectId.createFromHexString(toUserId),
                fromContact: contactInfo || "Гость",
                imageId: imageId || null, 
                source: source || "Галерея", // Откуда написали (Галерея или Шахматы и т.д.)
                text: messageText,
                reply: null, // Ответа пока нет
                createdAt: new Date(),
                isRead: false
            });
            
            res.json({ status: 'ok' });
        } catch (error) { 
            console.error(error); 
            res.status(500).json({ error: 'Ошибка отправки' }); 
        }
    });

    // ---------------------------------------------------------
    // 2. ГЛАВНАЯ СТРАНИЦА (LOGIN)
    // ---------------------------------------------------------
    router.get("/login", async (req, res) => {
        try {
            res.set('Cache-Control', 'public, max-age=0, must-revalidate'); 
            
            // Кэширование
            let pageData = await getCache(LOGIN_PAGE_CACHE_KEY); 
            if (!pageData) {
                const comments = await db.collection("comments").find().sort({ createdAt: -1 }).toArray(); 
                const users = await db.collection("users").find().toArray(); 
                const tasks = await db.collection('tasks').find().sort({ createdAt: -1 }).toArray(); 
                const readyDocs = await db.collection('ready_documents').find().sort({ completedAt: -1 }).toArray(); 
                
                pageData = { 
                    comments, tasks, readyDocs,
                    // Счетчики
                    chessCount: users.filter(u => u.activities?.includes("Шахматы")).length,
                    footballCount: users.filter(u => u.activities?.includes("Футбол")).length,
                    danceCount: users.filter(u => u.activities?.includes("Танцы")).length,
                    hockeyCount: users.filter(u => u.activities?.includes("Хоккей")).length,
                    volleyCount: users.filter(u => u.activities?.includes("Волейбол")).length,
                    hikingCount: users.filter(u => u.activities?.includes("Походы")).length,
                    travelCount: users.filter(u => u.activities?.includes("Путешествие")).length,
                };
                await setCache(LOGIN_PAGE_CACHE_KEY, pageData); 
            }

            // HTML Комментариев
            let commentsHtml = pageData.comments.map(c => `<div class="comment"><b>${c.authorName}:</b> ${c.text}</div>`).join('');
            
            // HTML Галереи (Коктейль)
            let tasksHtml = `<div class="gallery-grid">` + pageData.tasks.map(t => {
                const url = `/uploads/${t.fileName}`;
                const content = isImage(t.fileName) 
                    ? `<img src="${url}" alt="${t.originalName}">` 
                    : `<div class="file-icon">📄</div>`;
                
                // Статусы
                let statusHtml = '';
                if (t.amount && t.amount.trim() !== '') {
                    statusHtml = `<div class="status-label status-amount">${t.amount}</div>`;
                } else if (t.status === 'free') {
                    statusHtml = `<div class="status-label status-free">Свободна сегодня</div>`;
                } else if (t.status === 'company') {
                    statusHtml = `<div class="status-label status-company">Ждем компанию</div>`;
                } else {
                    statusHtml = `<div class="status-label status-busy">Временно занята</div>`;
                }

                return `
                    <div class="gallery-wrapper" onclick="openModal('${t._id}', '${t.userId}', '${url}', '${t.originalName}')">
                        <div class="gallery-item work-border" title="Нажмите, чтобы открыть">
                            ${content}
                        </div>
                        ${statusHtml}
                    </div>
                `;
            }).join('') + `</div>`;

            // HTML Галереи (Выполнено)
            let completedHtml = `<div class="gallery-grid">` + pageData.readyDocs.map(d => {
                const url = `/uploads/${d.fileName}`;
                const content = isImage(d.fileName) ? `<img src="${url}" alt="${d.originalName}">` : `<div class="file-icon">✅</div>`;
                return `<a href="${url}" target="_blank" class="gallery-item ready-border">${content}</a>`;
            }).join('') + `</div>`;

            // РЕНДЕРИНГ СТРАНИЦЫ
            res.send(` 
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8"><title>Вход</title>
                    <script src="/ga.js"></script>
                    <style>
                        /* ОСНОВА */
                        html { scroll-snap-type: y mandatory; }
                        body { font-family: Arial; background: url('/images/background.jpg') center/cover fixed; margin: 0; height: 100vh; overflow-y: scroll; }
                        
                        /* ЛИСТЫ (ЭКРАНЫ) */
                        .page-section { min-height: 100vh; width: 100%; scroll-snap-align: start; display: flex; justify-content: center; align-items: flex-start; padding-top: 40px; box-sizing: border-box; position: relative; }
                        .second-page { background: rgba(0, 0, 0, 0.4); display: flex; flex-direction: column; justify-content: center; align-items: center; }
                        
                        /* АНИМАЦИЯ СТРЕЛКИ */
                        .scroll-hint { position: absolute; bottom: 20px; color: white; font-size: 24px; animation: bounce 2s infinite; opacity: 0.7; }
                        @keyframes bounce { 0%, 20%, 50%, 80%, 100% {transform: translateY(0);} 40% {transform: translateY(-10px);} 60% {transform: translateY(-5px);} }
                        
                        /* БЛОКИ */
                        .main-wrapper { display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; max-width: 1200px; padding-bottom: 50px; }
                        .block { background: rgba(0,0,0,0.7); color: white; padding: 20px; border-radius: 8px; width: 320px; margin-bottom: 20px; }
                        
                        input, button { width: 95%; padding: 10px; margin-bottom: 10px; border-radius: 5px; box-sizing: border-box; }
                        button { background: #007BFF; color: white; border: none; cursor: pointer; width: 100%; font-size: 16px; }
                        
                        /* ГАЛЕРЕЯ */
                        .gallery-grid { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-start; }
                        .gallery-wrapper { display: flex; flex-direction: column; align-items: center; width: 90px; cursor: pointer; transition: 0.2s; }
                        .gallery-wrapper:hover { transform: scale(1.05); }
                        .gallery-item { width: 85px; height: 85px; display: flex; justify-content: center; align-items: center; overflow: hidden; border-radius: 5px; background: rgba(255,255,255,0.1); }
                        .gallery-item img { width: 100%; height: 100%; object-fit: cover; }
                        .work-border { border: 2px solid orange; }
                        .ready-border { border: 2px solid #28a745; }
                        
                        /* СТАТУСЫ */
                        .status-label { font-size: 10px; text-align: center; margin-top: 4px; font-weight: bold; width: 100%; word-break: break-word; }
                        .status-free { color: #28a745; } 
                        .status-company { color: #ffc107; } 
                        .status-busy { color: #ccc; font-style: italic; } 
                        .status-amount { color: #00c3ff; font-size: 11px; }

                        /* МОДАЛЬНОЕ ОКНО */
                        .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center; }
                        .modal { background: white; padding: 20px; border-radius: 10px; width: 90%; max-width: 400px; text-align: center; position: relative; }
                        .modal img { max-width: 100%; max-height: 250px; border-radius: 5px; margin-bottom: 15px; object-fit: contain; }
                        .modal-buttons { display: flex; gap: 10px; justify-content: center; margin-top: 15px; }
                        
                        .btn-view { background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }
                        .btn-chat { background: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
                        .close-modal { position: absolute; top: 10px; right: 15px; font-size: 30px; cursor: pointer; color: #333; font-weight: bold; }
                        
                        /* ФОРМА ЧАТА В МОДАЛКЕ */
                        #msg-form { display: none; margin-top: 15px; text-align: left; }
                        #msg-form textarea { width: 100%; height: 80px; margin-bottom: 10px; padding: 5px; box-sizing: border-box; border: 1px solid #ccc; }
                        #msg-form input { width: 100%; padding: 8px; margin-bottom: 10px; box-sizing: border-box; border: 1px solid #ccc; }

                        .comment { background: rgba(255,255,255,0.1); padding: 5px; margin-bottom: 5px; }
                        a.link { color: #6cafff; display: block; text-align: center; margin-top: 10px; }
                        
                        /* СТИЛИ АКТИВНОСТЕЙ И КНОПОК */
                        .new-activities-wrapper { display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; max-width: 800px; }
                        .new-btn { display: inline-block; padding: 15px 30px; background: rgba(255,255,255,0.1); border: 2px solid white; color: white; text-decoration: none; border-radius: 30px; font-size: 1.2em; transition: 0.3s; }
                        .new-btn:hover { background: white; color: black; transform: scale(1.1); }
                        .travel-link { font-family: 'Comic Sans MS', 'Brush Script MT', cursive; font-size: 2em; color: #ffeb3b; transform: rotate(-5deg); margin-left: 40px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); display: inline-block; text-decoration: none; }
                        
                        /* КНОПКИ АКТИВНОСТЕЙ (ОСНОВНЫЕ) */
                        a.activity-btn { display: block; width: 100%; padding: 12px; margin-bottom: 10px; color: white; text-align: center; text-decoration: none; border-radius: 5px; box-sizing: border-box; font-weight: bold; border: 1px solid rgba(255,255,255,0.2); transition: 0.3s; }
                        .chess-btn { background-color: #6f42c1; } .foot-btn { background-color: #fd7e14; } .dance-btn { background-color: #e83e8c; }
                    
                        /* КНОПКА ПОСЛЕ 19:00 */
                        .evening-link {
                            display: block; margin-top: 40px; 
                            font-size: 1.5em; color: #d4af37; /* Золотой */
                            text-decoration: none; border: 2px solid #d4af37;
                            padding: 10px 20px; border-radius: 10px;
                            transition: 0.3s; background: rgba(0,0,0,0.5);
                        }
                        .evening-link:hover { background: #d4af37; color: black; }
                    </style>
                </head>
                <body>
                    <div id="photoModal" class="modal-overlay">
                        <div class="modal">
                            <span class="close-modal" onclick="closeModal()">&times;</span>
                            <h3 id="modalTitle" style="margin-top:0; color:black;">Фото</h3>
                            <img id="modalImg" src="">
                            
                            <div id="actionButtons" class="modal-buttons">
                                <a id="viewLink" href="#" target="_blank" class="btn-view">👁️ Просто посмотреть</a>
                                <button onclick="showChatForm()" class="btn-chat">💬 Написать сообщение</button>
                            </div>

                            <div id="msg-form">
                                <label style="color:black; font-weight:bold;">Ваш контакт:</label>
                                <input type="text" id="contactInfo" placeholder="Email или телефон...">
                                <label style="color:black; font-weight:bold;">Сообщение:</label>
                                <textarea id="messageText" placeholder="Привет! Я насчет этого фото..."></textarea>
                                <button onclick="sendMessage()" style="background:#007BFF">Отправить владельцу</button>
                            </div>
                        </div>
                    </div>

                    <div class="page-section">
                        <div class="main-wrapper">
                            <div class="block">
                                <h3>Вход</h3>
                                <form action="/login" method="POST">
                                    <input type="hidden" name="_csrf" value="${res.locals.csrfToken}">
                                    <input type="email" name="email" placeholder="Email" required>
                                    <input type="password" name="password" placeholder="Пароль" required>
                                    <button type="submit">Войти</button>
                                    <a href="/register" class="link">Нет аккаунта? Регистрация</a>
                                </form>
                                <hr>
                                <h3>Активности:</h3>
                                <a href="/activities/Шахматы" target="_blank" class="activity-btn chess-btn">♟️ Шахматы (${pageData.chessCount})</a>
                                <a href="/activities/Футбол" target="_blank" class="activity-btn foot-btn">⚽ Футбол (${pageData.footballCount})</a>
                                <a href="/activities/Танцы" target="_blank" class="activity-btn dance-btn">💃 Танцы (${pageData.danceCount})</a>
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
                                <h3>Выполнено (Галерея)</h3>
                                ${completedHtml || "<p>Нет задач</p>"}
                            </div>
                      </div>
                        <div class="scroll-hint">⬇</div>
                    </div>

                    <div class="page-section second-page">
                        <h2 style="color:white; margin-bottom:40px;">Активный отдых</h2>
                        <div class="new-activities-wrapper">
                            <a href="/activities/Хоккей" target="_blank" class="new-btn">🏒 Хоккей (${pageData.hockeyCount})</a>
                            <a href="/activities/Волейбол" target="_blank" class="new-btn">🏐 Волейбол (${pageData.volleyCount})</a>
                            <a href="/activities/Походы" target="_blank" class="new-btn">🥾 Походы (${pageData.hikingCount})</a>
                        </div>
                        
                        <div style="margin-top: 40px; text-align:center;">
                            <a href="/activities/Путешествие" target="_blank" class="travel-link">✈️ Путешествие с тобой... (${pageData.travelCount})</a>
                            
                            <a href="/evening" class="evening-link">🌙 После 19:00... Кто что предложит?</a>
                        </div>
                    </div>

                    <script>
                        let currentToUserId = '';
                        let currentImageId = '';

                        function openModal(id, userId, url, title) {
                            document.getElementById('photoModal').style.display = 'flex';
                            document.getElementById('modalImg').src = url;
                            document.getElementById('modalTitle').innerText = title;
                            document.getElementById('viewLink').href = url;
                            document.getElementById('actionButtons').style.display = 'flex';
                            document.getElementById('msg-form').style.display = 'none';
                            document.getElementById('messageText').value = '';
                            currentToUserId = userId;
                            currentImageId = id;
                        }

                        function closeModal() {
                            document.getElementById('photoModal').style.display = 'none';
                        }

                        function showChatForm() {
                            document.getElementById('actionButtons').style.display = 'none';
                            document.getElementById('msg-form').style.display = 'block';
                        }

                        async function sendMessage() {
                            const text = document.getElementById('messageText').value;
                            const contact = document.getElementById('contactInfo').value;
                            
                            if(!text) return alert('Напишите сообщение!');

                            const res = await fetch('/send-message', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-csrf-token': "${res.locals.csrfToken}"
                                },
                                body: JSON.stringify({
                                    toUserId: currentToUserId,
                                    imageId: currentImageId,
                                    messageText: text,
                                    contactInfo: contact,
                                    source: 'Галерея'
                                })
                            });
                            
                            if(res.ok) {
                                alert('Сообщение отправлено владельцу в кабинет!');
                                closeModal();
                            } else {
                                alert('Ошибка отправки. Попробуйте позже.');
                            }
                        }

                        document.getElementById('photoModal').addEventListener('click', function(e) {
                            if (e.target === this) closeModal();
                        });
                    </script>
                </body>
                </html>
            `);
        } catch(error) { console.error(error); res.status(500).send("Ошибка."); }
    });

    return router;
};