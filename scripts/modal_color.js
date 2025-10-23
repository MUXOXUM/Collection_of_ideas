// Элементы модального окна
const colorModal = document.getElementById('color-modal');
const closeModal = document.getElementById('close-modal');
const colorOptions = document.querySelectorAll('.color-option');

// Функции для работы с модальным окном выбора цвета
function openColorModal() {
    colorModal.style.display = 'block';
    // Сбрасываем выделение при открытии
    colorOptions.forEach(option => {
        option.classList.remove('selected');
    });
}

function closeColorModal() {
    colorModal.style.display = 'none';
}

function setTheme(color) {
    // Удаляем все классы тем
    document.body.classList.remove('green-theme', 'blue-theme', 'purple-theme', 'yellow-theme', 'red-theme');

    // Добавляем выбранную тему
    document.body.classList.add(`${color}-theme`);

    // Сохраняем выбор в localStorage
    localStorage.setItem('ascii-torus-theme', color);
}

// Обработчики для модального окна
closeModal.addEventListener('click', closeColorModal);

colorOptions.forEach(option => {
    option.addEventListener('click', function () {
        const color = this.getAttribute('data-color');
        setTheme(color);
        closeColorModal();
    });

    option.addEventListener('mouseenter', function () {
        // Убираем выделение со всех элементов
        colorOptions.forEach(opt => {
            opt.classList.remove('selected');
        });
        // Добавляем выделение текущему элементу
        this.classList.add('selected');
    });
});

// Закрытие модального окна при клике вне его
window.addEventListener('click', function (e) {
    if (e.target === colorModal) {
        closeColorModal();
    }
});

// Обработчик нажатия клавиши C для открытия модального окна
document.addEventListener('keydown', function (e) {
    if (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') {
        openColorModal();
    }
});

// Загрузка сохраненной темы при загрузке страницы
const savedTheme = localStorage.getItem('ascii-torus-theme') || 'green';
setTheme(savedTheme);