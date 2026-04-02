// Этот файл отвечает только за генерацию третьего экрана (Афиша 2.0 / Потоки)
export function getThirdSectionHtml() {
    return `
        <div class="page-section third-page" style="background: rgba(0, 10, 30, 0.6); display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative; overflow: hidden;">
            
            <div class="wind-stream stream-1"></div>
            <div class="wind-stream stream-2"></div>
            <div class="wind-stream stream-3"></div>

            <h2 style="color: #00e5ff; margin-bottom:30px; text-align:center; z-index: 2; text-shadow: 0 0 10px rgba(0,229,255,0.5); font-size: 2em;">
                🌪️ Информационные потоки
            </h2>
            
            <div class="main-wrapper" style="z-index: 2; max-width: 1200px;">
                
                <div class="block stream-block">
                    <h3 style="color: #00e5ff; margin-top:0;">🗣️ Горячие обсуждения</h3>
                    <p style="font-size: 13px; color: #ccc;">Здесь будет поток самых обсуждаемых тем за сегодня. (В разработке)</p>
                </div>

                <div class="block stream-block">
                    <h3 style="color: #ff4081; margin-top:0;">🏆 Топ активных</h3>
                    <p style="font-size: 13px; color: #ccc;">Здесь будет выводиться список самых инициативных пользователей недели. (В разработке)</p>
                </div>

                <div class="block stream-block">
                    <h3 style="color: #b2ff59; margin-top:0;">📰 Новости и Анонсы</h3>
                    <p style="font-size: 13px; color: #ccc;">Поток системных обновлений и важных событий сайта. (В разработке)</p>
                </div>

            </div>
            
            <style>
                /* Стили специально для третьей страницы */
                .third-page { scroll-snap-align: start; }
                
                .stream-block {
                    background: rgba(0, 20, 40, 0.7);
                    border-top: 3px solid #00e5ff;
                    transition: transform 0.3s, box-shadow 0.3s;
                    backdrop-filter: blur(5px);
                }
                .stream-block:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 10px 20px rgba(0, 229, 255, 0.2);
                }
                
                /* Анимация "ветра" на фоне */
                .wind-stream {
                    position: absolute;
                    background: linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.2), transparent);
                    height: 2px;
                    width: 200%;
                    left: -100%;
                    animation: windFlow 4s linear infinite;
                    pointer-events: none; /* Чтобы ветер не мешал кликать по блокам */
                }
                .stream-1 { top: 20%; animation-duration: 5s; }
                .stream-2 { top: 50%; animation-duration: 3s; animation-delay: 1s; height: 3px; }
                .stream-3 { top: 80%; animation-duration: 6s; animation-delay: 2s; }

                @keyframes windFlow {
                    0% { transform: translateX(-10%); opacity: 0; }
                    50% { opacity: 1; }
                    100% { transform: translateX(50%); opacity: 0; }
                }
            </style>
        </div>
    `;
}