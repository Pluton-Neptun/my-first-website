document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    const tasksList = document.getElementById('tasks-list');
    const readyList = document.getElementById('ready-list');
    const uploadForm = document.getElementById('upload-form');

    // Переключение вкладок
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(item => item.classList.remove('active'));
            contents.forEach(item => item.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // Функция для загрузки и отображения задач
    async function fetchTasks() {
        try {
            const response = await fetch('/tasks');
            if (!response.ok) throw new Error('Ошибка сети');
            const tasks = await response.json();

            tasksList.innerHTML = ''; // Очищаем список
            if (tasks.length === 0) {
                tasksList.innerHTML = '<li>Новых задач нет.</li>';
            } else {
                tasks.forEach(task => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        ${task.originalName} (Загрузил: ${task.uploadedBy})
                        <button class="complete-btn" data-id="${task._id}">Завершить</button>
                    `;
                    tasksList.appendChild(li);
                });
            }
        } catch (error) {
            console.error('Не удалось загрузить задачи:', error);
            tasksList.innerHTML = '<li>Не удалось загрузить список задач.</li>';
        }
    }

    // Функция для загрузки и отображения готовых документов
    async function fetchReadyDocuments() {
        try {
            const response = await fetch('/ready-documents');
             if (!response.ok) throw new Error('Ошибка сети');
            const documents = await response.json();

            readyList.innerHTML = ''; // Очищаем список
            if (documents.length === 0) {
                readyList.innerHTML = '<li>Готовых документов нет.</li>';
            } else {
                documents.forEach(doc => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        ${doc.originalName} (Выполнил: ${doc.uploadedBy})
                        <a href="/download/${doc._id}" download>Скачать</a>
                    `;
                    readyList.appendChild(li);
                });
            }
        } catch (error) {
            console.error('Не удалось загрузить готовые документы:', error);
            readyList.innerHTML = '<li>Не удалось загрузить список документов.</li>';
        }
    }
    
    // Обработка формы загрузки
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(uploadForm);
        
        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                uploadForm.reset(); // Очистить форму
                fetchTasks(); // Обновить список задач
            } else {
                alert('Ошибка при загрузке файла.');
            }
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Произошла ошибка.');
        }
    });

    // Обработка кнопки "Завершить"
    tasksList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('complete-btn')) {
            const taskId = e.target.dataset.id;
            try {
                const response = await fetch(`/complete-task/${taskId}`, {
                    method: 'POST'
                });
                const result = await response.json();
                if (result.success) {
                    // Обновляем оба списка после успешного завершения
                    fetchTasks();
                    fetchReadyDocuments();
                } else {
                    alert('Не удалось завершить задачу.');
                }
            } catch (error) {
                console.error('Ошибка:', error);
                alert('Произошла ошибка при завершении задачи.');
            }
        }
    });

    // Первоначальная загрузка данных
    fetchTasks();
    fetchReadyDocuments();
});