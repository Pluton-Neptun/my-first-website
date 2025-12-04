document.addEventListener('DOMContentLoaded', () => { 
    const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
   const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    const tasksList = document.getElementById('tasks-list');
    const readyList = document.getElementById('ready-list');
    const uploadForm = document.getElementById('upload-form');
    const uploadReadyForm = document.getElementById('upload-ready-form');

   tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(item => item.classList.remove('active'));
            contents.forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // СПИСОК ЗАДАЧ (Без кнопки скачать)
    async function fetchTasks() {
        try {
            const response = await fetch('/work/tasks');
            if (!response.ok) throw new Error('Ошибка');
            const tasks = await response.json();
            tasksList.innerHTML = '';
            if (tasks.length === 0) tasksList.innerHTML = '<li>Пусто.</li>';
            else {
                tasks.forEach(task => {
                    const li = document.createElement('li');
                    // Добавлена кнопка УДАЛИТЬ (delete-task-btn)
                    li.innerHTML = `
                        <span>${task.originalName} (${task.uploadedBy})</span>
                        <button class="delete-btn delete-task-btn" data-id="${task._id}">Удалить</button>
                    `;
                    tasksList.appendChild(li);
                });
            }
        } catch (error) { tasksList.innerHTML = '<li>Ошибка.</li>'; }
    }

    // СПИСОК ГОТОВЫХ (Без кнопки скачать)
    async function fetchReadyDocuments() {
        try {
            const response = await fetch('/work/ready-documents');
            if (!response.ok) throw new Error('Ошибка');
            const docs = await response.json();
            readyList.innerHTML = '';
            if (docs.length === 0) readyList.innerHTML = '<li>Пусто.</li>';
            else {
                docs.forEach(doc => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <span>${doc.originalName} (${doc.uploadedBy})</span>
                        <button class="delete-btn delete-ready-btn" data-id="${doc._id}">Удалить</button>
                    `;
                    readyList.appendChild(li);
                });
            }
        } catch (error) { readyList.innerHTML = '<li>Ошибка.</li>'; }
    }
    
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const response = await fetch('/work/upload', { method: 'POST', body: new FormData(uploadForm) });
        if (response.ok) { uploadForm.reset(); fetchTasks(); }
        else alert('Ошибка.');
    });

    uploadReadyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const response = await fetch('/work/upload-ready', { method: 'POST', body: new FormData(uploadReadyForm) });
        if (response.ok) { uploadReadyForm.reset(); fetchReadyDocuments(); }
        else alert('Ошибка.');
    });

    // Обработка кликов (УДАЛЕНИЕ)
    tasksList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-task-btn')) {
            if (confirm('Удалить файл?')) {
                const response = await fetch(`/work/tasks/${e.target.dataset.id}`, { 
                    method: 'DELETE', headers: { 'x-csrf-token': csrfToken } 
                });
                if (response.ok) fetchTasks(); else alert('Ошибка удаления.');
            }
        }
    });

    readyList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-ready-btn')) {
            if (confirm('Удалить файл?')) {
                const response = await fetch(`/work/ready-documents/${e.target.dataset.id}`, { 
                    method: 'DELETE', headers: { 'x-csrf-token': csrfToken } 
                });
                if (response.ok) fetchReadyDocuments(); else alert('Ошибка удаления.');
            }
        }
    });

    fetchTasks();
    fetchReadyDocuments();
});