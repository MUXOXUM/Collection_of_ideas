// ========== ОБЩИЕ ПЕРЕМЕННЫЕ И ФУНКЦИИ РЕНДЕРИНГА ==========

// Размеры контейнера для отображения
const width = 166;
const height = 60;

// ASCII символы для отрисовки (от темного к светлому)
const chars = ".:!/r(l1Z4H9W8$@";

// Поправка на прямоугольность символов (ширина/высота примерно 2:1)
const charAspectRatio = 0.458;

// Глобальные параметры управления
let K1 = 100;  // Масштаб
let K2 = 7;    // Расстояние от наблюдателя
let speedFactor = 150; // Скорость анимации
let isAutoRotating = true;

// Переменные для управления мышью
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;
let mouseRotationX = 0;
let mouseRotationZ = 0;

// Буферы для рендеринга
const zBuffer = new Array(width * height).fill(0);
const outputBuffer = new Array(width * height).fill(' ');

// Углы вращения
let A = 0;  // Угол вращения вокруг оси X
let B = 0;  // Угол вращения вокруг оси Z

// ID текущей анимации (будет переопределяться в отдельных рендерерах)
let animationId = null;

// Общая функция рендеринга точки с учетом аспекта символов
function renderPoint(x, y, z, luminance) {
    const ooz = 1 / z;
    // Учитываем аспект символов - сжимаем по X
    const xp = Math.floor(width / 2 + K1 * ooz * x / charAspectRatio);
    const yp = Math.floor(height / 2 - K1 * ooz * y);
    
    if (xp >= 0 && xp < width && yp >= 0 && yp < height) {
        const bufferIndex = yp * width + xp;
        if (ooz > zBuffer[bufferIndex]) {
            zBuffer[bufferIndex] = ooz;
            const luminanceIndex = Math.floor(luminance * (chars.length - 1));
            outputBuffer[bufferIndex] = chars[Math.max(0, Math.min(luminanceIndex, chars.length - 1))];
        }
    }
}

// Функция рендеринга линии (для рёбер)
function renderLine(x1, y1, z1, x2, y2, z2, luminance) {
    const steps = Math.max(20, Math.sqrt((x2-x1)**2 + (y2-y1)**2) * 10);
    for (let t = 0; t <= 1; t += 1/steps) {
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        const z = z1 + (z2 - z1) * t;
        renderPoint(x, y, z, luminance);
    }
}

// Упрощенная функция рендеринга заполненного треугольника через точки
function renderFilledTriangle(v1, v2, v3, luminance) {
    // Рендерим много точек внутри треугольника
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps - i; j++) {
            const u = i / steps;
            const v = j / steps;
            const w = 1 - u - v;
            
            if (w >= 0) {
                const x = v1[0] * u + v2[0] * v + v3[0] * w;
                const y = v1[1] * u + v2[1] * v + v3[1] * w;
                const z = v1[2] * u + v2[2] * v + v3[2] * w;
                
                renderPoint(x, y, z, luminance);
            }
        }
    }
}

// Функция рендеринга заполненного квадрата
function renderFilledSquare(v1, v2, v3, v4, luminance) {
    // Разбиваем квадрат на два треугольника и рендерим оба
    renderFilledTriangle(v1, v2, v3, luminance);
    renderFilledTriangle(v1, v3, v4, luminance);
}

// Общая функция очистки буферов
function clearBuffers() {
    zBuffer.fill(0);
    outputBuffer.fill(' ');
}

// Общая функция отображения кадра
function displayFrame() {
    let output = '';
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            output += outputBuffer[i * width + j];
        }
        output += '\n';
    }
    document.getElementById('ascii-object').textContent = output;
}

// Инициализация элементов управления
function initCommonControls() {
    const k1Slider = document.getElementById('k1-slider');
    const k2Slider = document.getElementById('k2-slider');
    const speedSlider = document.getElementById('speed-slider');
    const resetButton = document.getElementById('reset-button');
    
    const k1Value = document.getElementById('k1-value');
    const k2Value = document.getElementById('k2-value');
    const speedValue = document.getElementById('speed-value');
    
    // Установка значений по умолчанию
    K1 = parseFloat(k1Slider.value);
    K2 = parseFloat(k2Slider.value);
    speedFactor = parseInt(speedSlider.value) * 15;
    
    // Обновление значений на слайдерах
    function updateSliderValues() {
        k1Value.textContent = K1.toFixed(0);
        k2Value.textContent = K2.toFixed(0);
        speedValue.textContent = parseInt(speedSlider.value);
    }
    
    // Обработчики событий для слайдеров
    k1Slider.addEventListener('input', function() {
        K1 = parseFloat(this.value);
        updateSliderValues();
    });
    
    k2Slider.addEventListener('input', function() {
        K2 = parseFloat(this.value);
        updateSliderValues();
    });
    
    speedSlider.addEventListener('input', function() {
        speedFactor = parseInt(this.value) * 15;
        updateSliderValues();
    });
    
    // Сброс параметров
    resetButton.addEventListener('click', function() {
        K1 = 100;
        K2 = 7;
        speedSlider.value = 10;
        speedFactor = 10 * 15;
        
        k1Slider.value = K1;
        k2Slider.value = K2;
        
        // Сброс вращения
        A = 0;
        B = 0;
        mouseRotationX = 0;
        mouseRotationZ = 0;
        
        updateSliderValues();
    });
    
    updateSliderValues();
    
    // Обработчики событий мыши для вращения
    const asciiContainer = document.getElementById('ascii-object');
    
    asciiContainer.addEventListener('mousedown', function(e) {
        isMouseDown = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        asciiContainer.style.cursor = 'grabbing';
        isAutoRotating = false;
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isMouseDown) return;
        
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        
        const sensitivity = 0.01;
        mouseRotationZ += deltaX * sensitivity;
        mouseRotationX += deltaY * sensitivity;
        
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    
    document.addEventListener('mouseup', function() {
        isMouseDown = false;
        asciiContainer.style.cursor = 'grab';
        isAutoRotating = true;
    });
    
    asciiContainer.addEventListener('mouseenter', function() {
        asciiContainer.style.cursor = 'grab';
    });
    
    asciiContainer.addEventListener('mouseleave', function() {
        asciiContainer.style.cursor = 'default';
    });
    
    // Сенсорные события
    asciiContainer.addEventListener('touchstart', function(e) {
        e.preventDefault();
        isMouseDown = true;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
        isAutoRotating = false;
    });
    
    document.addEventListener('touchmove', function(e) {
        if (!isMouseDown) return;
        e.preventDefault();
        
        const deltaX = e.touches[0].clientX - lastMouseX;
        const deltaY = e.touches[0].clientY - lastMouseY;
        
        const sensitivity = 0.01;
        mouseRotationZ += deltaX * sensitivity;
        mouseRotationX += deltaY * sensitivity;
        
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
    });
    
    document.addEventListener('touchend', function() {
        isMouseDown = false;
        isAutoRotating = true;
    });
}