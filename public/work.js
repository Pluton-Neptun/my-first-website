document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    const tasksList = document.getElementById('tasks-list');
    const readyList = document.getElementById('ready-list');
    const uploadForm = document.getElementById('upload-form');
    // ✅ НОВАЯ ФОРМА
    const uploadReadyForm = document.getElementById('upload-ready-form');

    // Переключение вкладок
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(item => item.classList.remove('active'));
            contents.forEach(item => item.classList.remove('active'));
          tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // Загрузка и отображение задач
    async function fetchTasks() {
        try {
            const response = await fetch('/tasks');
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
                        <button class="complete-btn btn-style" data-id="${task._id}">Завершить</button>
                    `;
                    tasksList.appendChild(li);
                });
            }
        } catch (error) {
          tasksList.innerHTML = '<li>Не удалось загрузить список задач.</li>';
        }
    }

    // Загрузка и отображение готовых документов
    async function fetchReadyDocuments() {
        try {
            const response = await fetch('/ready-documents');
            if (!response.ok) throw new Error('Ошибка сети');
            const documents = await response.json();
            readyList.innerHTML = '';
            if (documents.length === 0) {
                readyList.innerHTML = '<li>Готовых документов нет.</li>';
            } else {
                documents.forEach(doc => {
                    const li = document.createElement('li');
                    // ✅ ДОБАВЛЕНА КНОПКА УДАЛЕНИЯ
                    li.innerHTML = `
                        <span>${doc.originalName} (Выполнил: ${doc.uploadedBy})</span>
                        <div>
                            <a href="/download/${doc._id}" class="btn-style download-btn" download>Скачать</a>
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
    
    // Обработка формы "Задачи"
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(uploadForm);
        const response = await fetch('/upload', { method: 'POST', body: formData });
        if (response.ok) {
            uploadForm.reset();
            fetchTasks();
        } else {
            alert('Ошибка при загрузке файла.');
        }
    });

    // ✅ НОВЫЙ ОБРАБОТЧИК: для формы "Готовые"
    uploadReadyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(uploadReadyForm);
        // Отправляем на новый маршрут
        const response = await fetch('/upload-ready', { method: 'POST', body: formData });
        if (response.ok) {
            uploadReadyForm.reset();
            fetchReadyDocuments(); // Обновляем список готовых
        } else {
            alert('Ошибка при загрузке файла.');
        }
    });

    // Клик по кнопке "Завершить"
    tasksList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('complete-btn')) {
            const taskId = e.target.dataset.id;
            const response = await fetch(`/complete-task/${taskId}`, { method: 'POST' });
            if (response.ok) {
                fetchTasks();
                fetchReadyDocuments();
            } else {
                alert('Не удалось завершить задачу.');
            }
        }
    });

    // ✅ НОВЫЙ ОБРАБОТЧИК: клик по кнопке "Удалить"
    readyList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const docId = e.target.dataset.id;
            if (confirm('Вы уверены, что хотите удалить этот документ?')) {
                const response = await fetch(`/ready-documents/${docId}`, { method: 'DELETE' });
                if (response.ok) {
                    fetchReadyDocuments(); // Обновляем список
                } else {
                    alert('Не удалось удалить документ.');
                }
            }
        }
    });

    // Первоначальная загрузка
    fetchTasks();
    fetchReadyDocuments();
});