document.addEventListener('DOMContentLoaded', () => {
    // 1. ПОЛУЧАЕМ ТОКЕН ЗАЩИТЫ ИЗ HTML
    const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    const tasksList = document.getElementById('tasks-list');
    const readyList = document.getElementById('ready-list');
    const uploadForm = document.getElementById('upload-form');
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
            // ❗ Путь изменен на /work/tasks
            const response = await fetch('/work/tasks');
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
                        <a href="/work/download/${task.fileName}" class="btn-style download-btn">Скачать</a>
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
            // ❗ Путь изменен на /work/ready-documents
            const response = await fetch('/work/ready-documents');
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
    
    // Обработка формы "Задачи"
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(uploadForm);
        // Токен уже есть внутри формы (скрытое поле), поэтому заголовки не нужны
        // ❗ Путь изменен на /work/upload
        const response = await fetch('/work/upload', { method: 'POST', body: formData });
        if (response.ok) {
            uploadForm.reset();
            fetchTasks();
        } else {
            alert('Ошибка при загрузке файла.');
        }
    });

    // Обработка формы "Готовые"
    uploadReadyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(uploadReadyForm);
        // ❗ Путь изменен на /work/upload-ready
        const response = await fetch('/work/upload-ready', { method: 'POST', body: formData });
        if (response.ok) {
            uploadReadyForm.reset();
            fetchReadyDocuments(); 
        } else {
            alert('Ошибка при загрузке файла.');
        }
    });

    // Клик по кнопке "Завершить"
    tasksList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('complete-btn')) {
            const taskId = e.target.dataset.id;
            // ❗ Путь /work/complete-task/ID
            // ❗ Добавлен заголовок с токеном
            const response = await fetch(`/work/complete-task/${taskId}`, { 
                method: 'POST',
                headers: {
                    'x-csrf-token': csrfToken 
                }
            });
            if (response.ok) {
                fetchTasks();
                fetchReadyDocuments();
            } else {
                alert('Не удалось завершить задачу.');
            }
        }
    });

    // Клик по кнопке "Удалить"
    readyList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const docId = e.target.dataset.id;
            if (confirm('Вы уверены, что хотите удалить этот документ?')) {
                // ❗ Путь /work/ready-documents/ID
                // ❗ Добавлен заголовок с токеном
                const response = await fetch(`/work/ready-documents/${docId}`, { 
                    method: 'DELETE',
                    headers: {
                        'x-csrf-token': csrfToken 
                    }
                });
                if (response.ok) {
                    fetchReadyDocuments(); 
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