import { ObjectId } from 'mongodb';
import { clearCache, LOGIN_PAGE_CACHE_KEY } from '../cacheService.js';

// Список активностей, за которыми следим
const TRACK_LIST = ["Шахматы", "Футбол", "Танцы", "Хоккей", "Волейбол", "Походы", "Путешествие"];

/**
 * 1. ДОБАВЛЕНИЕ АКТИВНОСТИ (Вызывается из профиля или при записи)
 */
export async function addUserActivity(db, userId, activityName, limitRaw) {
    const limit = limitRaw ? parseInt(limitRaw) : null;
    const userIdObj = new ObjectId(userId);

    // Создаем новый объект
    const newActivity = { name: activityName, limit: limit };

    // 🔥 ИСПРАВЛЕНИЕ: Удаляем старую запись надежным способом (и строку, и объект)
    // 1. Удаляем, если это объект с таким именем (игнорируя limit и прочее)
    await db.collection('users').updateOne(
        { _id: userIdObj },
        { $pull: { activities: { name: activityName } } }
    );
    // 2. Удаляем, если это просто строка
    await db.collection('users').updateOne(
        { _id: userIdObj },
        { $pull: { activities: activityName } }
    );

    // Добавляем новую запись
    await db.collection('users').updateOne(
        { _id: userIdObj },
        { $push: { activities: newActivity } }
    );

    // Сбрасываем кэш
    await clearCache(LOGIN_PAGE_CACHE_KEY);
}

/**
 * 2. УДАЛЕНИЕ АКТИВНОСТИ (Вызывается из профиля по кнопке Отписаться)
 */
export async function removeUserActivity(db, userId, activityName) {
    const userIdObj = new ObjectId(userId);

    // 🔥 ИСПРАВЛЕНИЕ: "Двойной удар" для 100% удаления
    
    // Шаг 1: Удаляем объект, у которого name === activityName (даже если есть limit)
    await db.collection('users').updateOne(
        { _id: userIdObj },
        { $pull: { activities: { name: activityName } } }
    );

    // Шаг 2: Удаляем, если это записано просто как строка "Шахматы"
    await db.collection('users').updateOne(
        { _id: userIdObj },
        { $pull: { activities: activityName } }
    );

    await clearCache(LOGIN_PAGE_CACHE_KEY);
}

/**
 * 3. ПРОВЕРКА ЛИМИТОВ И ПОДСЧЕТ (Оставил без изменений, тут логика верная)
 */
export async function checkLimitsAndGetCounts(db) { 
    const users = await db.collection("users").find().toArray();
    let cacheNeedsUpdate = false;
    const counts = {}; 

    for (const sport of TRACK_LIST) {
        // Находим всех игроков (учитываем и строки, и объекты)
        const players = users.filter(u => 
            Array.isArray(u.activities) && 
            u.activities.some(a => (a === sport) || (a.name === sport))
        );

        const currentCount = players.length;

        // --- ЛОГИКА АВТО-УДАЛЕНИЯ ---
        for (const player of players) {
            // Ищем запись об активности (только объекты имеют лимиты)
            const activityRecord = player.activities.find(a => a && a.name === sport);
            
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
        
        counts[sport] = currentCount; 
    }

    if (cacheNeedsUpdate) {
        await clearCache(LOGIN_PAGE_CACHE_KEY);
    }

    return counts;
}