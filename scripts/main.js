document.addEventListener('DOMContentLoaded', function() {
    const objectSelection = document.getElementById('object-selection');
    const renderControls = document.getElementById('render-controls');
    const asciiContainer = document.getElementById('ascii-object');
    const backButton = document.getElementById('back-button');
    const objectOptions = document.querySelectorAll('.object-option');
    
    let selectedObject = null;
    
    // Обработчики выбора объекта
    objectOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Убираем выделение со всех опций
            objectOptions.forEach(opt => opt.classList.remove('selected'));
            // Выделяем выбранную опцию
            this.classList.add('selected');
            
            selectedObject = this.getAttribute('data-object');
            
            // Переключаем на панель управления рендером
            objectSelection.style.display = 'none';
            renderControls.style.display = 'flex';
            
            // Показываем все элементы управления сначала
            showAllControls();
            
            // Запускаем рендер выбранного объекта
            startObjectRender(selectedObject);
        });
    });
    
    // Обработчик кнопки "Назад"
    backButton.addEventListener('click', function() {
        // Останавливаем текущий рендер
        stopCurrentRender();
        
        // Возвращаем к выбору объекта
        renderControls.style.display = 'none';
        objectSelection.style.display = 'block';
        
        // Очищаем контейнер
        asciiContainer.textContent = '';
        
        // Сбрасываем выделение
        objectOptions.forEach(opt => opt.classList.remove('selected'));
        selectedObject = null;
    });
    
    function showAllControls() {
        // Показываем все элементы управления
        document.querySelectorAll('.control-group').forEach(group => {
            group.style.display = 'flex';
        });
    }
    
    function hideTorusSpecificControls() {
        // Скрываем специфичные для тора элементы управления
        document.querySelectorAll('.control-group').forEach(group => {
            if (group.querySelector('#r1-slider') || group.querySelector('#r2-slider') || group.querySelector('#resolution-slider')) {
                group.style.display = 'none';
            }
        });
    }
    
    function startObjectRender(objectType) {
        // Останавливаем предыдущую анимацию
        stopCurrentRender();
        
        // В зависимости от выбранного объекта запускаем соответствующий рендер
        switch(objectType) {
            case 'torus':
                startTorusRender();
                break;
            case 'octahedron':
                hideTorusSpecificControls();
                startOctahedronRender();
                break;
            case 'cube':
                hideTorusSpecificControls();
                startCubeRender();
                break;
        }
    }
    
    function stopCurrentRender() {
        // Используем глобальную переменную animationId из движка рендеринга
        if (typeof animationId !== 'undefined' && animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        // Очищаем контейнер
        asciiContainer.textContent = '';
        
        // Дополнительно очищаем буферы
        if (typeof clearBuffers === 'function') {
            clearBuffers();
        }
    }
});