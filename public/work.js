document.addEventListener('DOMContentLoaded', () => {
    // 1. Берем токен защиты
    const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    const tasksList = document.getElementById('tasks-list');
    const readyList = document.getElementById('ready-list');
    const uploadForm = document.getElementById('upload-form');
    const uploadReadyForm = document.getElementById('upload-ready-form');

    // Табы
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(item => item.classList.remove('active'));
            contents.forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // Загрузка ЗАДАЧ (Обратите внимание на путь: /work/tasks)
    async function fetchTasks() {
        try {
            const response = await fetch('/work/tasks'); // ✅ Новый путь
            if (!response.ok) throw new Error('Ошибка сети');
            const tasks = await response.json();
            tasksList.innerHTML = '';
            if (tasks.length === 0) {
                tasksList.innerHTML = '<li>Новых задач нет.</li>';
            } else {
                tasks.forEach(task => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <span>${task.originalName} (Загрузил: ${task.uploadedBy})</span>
                        <div>
                            <a href="/work/download/${task.fileName}" class="btn-style download-btn">Скачать</a>
                            <button class="complete-btn btn-style" data-id="${task._id}">Завершить</button>
                        </div>
                    `;
                    tasksList.appendChild(li);
                });
            }
        } catch (error) {
            tasksList.innerHTML = '<li>Не удалось загрузить список задач.</li>';
        }
    }

    // Загрузка ГОТОВЫХ (Обратите внимание на путь: /work/ready-documents)
    async function fetchReadyDocuments() {
        try {
            const response = await fetch('/work/ready-documents'); // ✅ Новый путь
            if (!response.ok) throw new Error('Ошибка сети');
            const documents = await response.json();
            readyList.innerHTML = '';
            if (documents.length === 0) {
                readyList.innerHTML = '<li>Готовых документов нет.</li>';
            } else {
                documents.forEach(doc => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <span>${doc.originalName} (Выполнил: ${doc.uploadedBy})</span>
                        <div>
                            <a href="/work/download/${doc.fileName}" class="btn-style download-btn" download>Скачать</a>
                            <button class="delete-btn btn-style" data-id="${doc._id}">Удалить</button>
                        </div>
                    `;
                    readyList.appendChild(li);
                });
            }
        } catch (error) {
            readyList.innerHTML = '<li>Не удалось загрузить список документов.</li>';
        }
    }
    
    // Кнопка ЗАВЕРШИТЬ
    tasksList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('complete-btn')) {
            const taskId = e.target.dataset.id;
          const response = await fetch(`/work/complete-task/${taskId}`, { 
                method: 'POST',
                headers: { 'x-csrf-token': csrfToken } // ✅ Передаем токен
            });
            if (response.ok) { fetchTasks(); fetchReadyDocuments(); }
            else { alert('Не удалось завершить задачу.'); }
        }
    });

    // Кнопка УДАЛИТЬ
    readyList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const docId = e.target.dataset.id;
            if (confirm('Удалить документ?')) {
                const response = await fetch(`/work/ready-documents/${docId}`, { 
                    method: 'DELETE',
                    headers: { 'x-csrf-token': csrfToken } // ✅ Передаем токен
                });
                if (response.ok) { fetchReadyDocuments(); }
                else { alert('Не удалось удалить документ.'); }
            }
        }
    });

  fetchTasks();
    fetchReadyDocuments();
});