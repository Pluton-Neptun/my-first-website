/**
 * Служба Афиши
 * Получает список всех активностей (сборов), созданных за последние 3 дня.
 * Используется для вывода на Главной странице в блоке "Афиша".
 */
export async function getAfisha(db) {
    // Вычисляем дату: текущее время минус 3 дня
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    
    // Ищем в коллекции activity_requests новые сборы
    const afisha = await db.collection('activity_requests')
        .find({ createdAt: { $gte: threeDaysAgo } })
        .sort({ createdAt: -1 })
        .toArray();

    return afisha;
}