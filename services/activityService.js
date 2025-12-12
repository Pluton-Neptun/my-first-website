import { ObjectId } from 'mongodb';
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

// Список активностей, за которыми следим
const TRACK_LIST = ["Шахматы", "Футбол", "Танцы", "Хоккей", "Волейбол", "Походы", "Путешествие"];

/**
 * 1. ДОБАВЛЕНИЕ АКТИВНОСТИ (Вызывается из профиля)
 */
export async function addUserActivity(db, userId, activityName, limitRaw) {
    const limit = limitRaw ? parseInt(limitRaw) : null;
    const userIdObj = new ObjectId(userId);

    // Создаем объект
    const newActivity = { name: activityName, limit: limit };

    // 1. Удаляем старую запись об этой активности (чтобы обновить)
    await db.collection('users').updateOne(
        { _id: userIdObj },
        { $pull: { activities: { $in: [activityName, { name: activityName }] } } }
    );

    // 2. Добавляем новую
    await db.collection('users').updateOne(
        { _id: userIdObj },
        { $push: { activities: newActivity } }
    );

    // Сбрасываем кэш, так как данные изменились
    await clearCache(LOGIN_PAGE_CACHE_KEY);
}

/**
 * 2. УДАЛЕНИЕ АКТИВНОСТИ (Вызывается из профиля по крестику)
 */
export async function removeUserActivity(db, userId, activityName) {
    await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $pull: { activities: { $in: [activityName, { name: activityName }] } } }
    );
    await clearCache(LOGIN_PAGE_CACHE_KEY);
}

/**
 * 3. ПРОВЕРКА ЛИМИТОВ И ПОДСЧЕТ (Вызывается на Главной странице)
 * Возвращает готовые цифры для отображения: { footballCount: 5, chessCount: 2 ... }
 */
export async function checkLimitsAndGetCounts(db) {
    // Берем всех юзеров
    const users = await db.collection("users").find().toArray();
    let cacheNeedsUpdate = false;

    // Объект для результатов подсчета
    const counts = {};

    for (const sport of TRACK_LIST) {
        // Находим всех игроков в этот спорт
        const players = users.filter(u => 
            Array.isArray(u.activities) && 
            u.activities.some(a => (a === sport) || (a.name === sport))
        );

        const currentCount = players.length;

        // --- ЛОГИКА АВТО-УДАЛЕНИЯ ---
        for (const player of players) {
            // Ищем запись об активности
            const activityRecord = player.activities.find(a => a.name === sport);
            
            // Если есть лимит И он достигнут
            if (activityRecord && activityRecord.limit && currentCount >= activityRecord.limit) {
                // Удаляем активность из базы
                await db.collection('users').updateOne(
                    { _id: player._id },
                    { $pull: { activities: { name: sport } } }
                );
                console.log(`AUTO-DELETE: ${sport} у ${player.name} (Лимит ${activityRecord.limit}, набрано ${currentCount})`);
                cacheNeedsUpdate = true;
            }
        }
        
        // Записываем кол-во (для отображения на сайте)
        // Если кого-то удалили, цифра обновится при следующей загрузке, 
        // но для текущего рендера берем currentCount (или currentCount - 1, если хотим супер-точность, но это не критично)
        counts[sport] = currentCount;
    }

    if (cacheNeedsUpdate) {
        await clearCache(LOGIN_PAGE_CACHE_KEY);
    }

    return counts;
}