function startTorusRender() {
    initCommonControls();
    
    // Специфичные для тора элементы управления
    const r1Slider = document.getElementById('r1-slider');
    const r2Slider = document.getElementById('r2-slider');
    const resolutionSlider = document.getElementById('resolution-slider');
    
    const r1Value = document.getElementById('r1-value');
    const r2Value = document.getElementById('r2-value');
    const resolutionValue = document.getElementById('resolution-value');
    
    let R1 = parseFloat(r1Slider.value);
    let R2 = parseFloat(r2Slider.value);
    let resolution = parseFloat(resolutionSlider.value);
    
    function updateTorusSliderValues() {
        r1Value.textContent = R1.toFixed(1);
        r2Value.textContent = R2.toFixed(1);
        resolutionValue.textContent = resolution.toFixed(3);
    }
    
    r1Slider.addEventListener('input', function() {
        R1 = parseFloat(this.value);
        updateTorusSliderValues();
    });
    
    r2Slider.addEventListener('input', function() {
        R2 = parseFloat(this.value);
        updateTorusSliderValues();
    });
    
    resolutionSlider.addEventListener('input', function() {
        resolution = parseFloat(this.value);
        updateTorusSliderValues();
    });
    
    // Сброс специфичных параметров тора
    document.getElementById('reset-button').addEventListener('click', function() {
        R1 = 0.8;
        R2 = 1.5;
        resolution = 0.015;
        
        r1Slider.value = R1;
        r2Slider.value = R2;
        resolutionSlider.value = resolution;
        
        updateTorusSliderValues();
    });
    
    updateTorusSliderValues();
    
    function renderTorusFrame() {
        clearBuffers();
        
        // Комбинируем автоматическое вращение и вращение мышью
        const totalA = A + mouseRotationX;
        const totalB = B + mouseRotationZ;
        
        // Вычисляем синусы и косинусы углов
        const cosA = Math.cos(totalA);
        const sinA = Math.sin(totalA);
        const cosB = Math.cos(totalB);
        const sinB = Math.sin(totalB);
        
        // Проходим по углам тора
        for (let theta = 0; theta < 2 * Math.PI; theta += 0.07) {
            const cosTheta = Math.cos(theta);
            const sinTheta = Math.sin(theta);
            
            for (let phi = 0; phi < 2 * Math.PI; phi += resolution) {
                const cosPhi = Math.cos(phi);
                const sinPhi = Math.sin(phi);
                
                // Вычисляем координаты точки на торе
                const circleX = R2 + R1 * cosTheta;
                const circleY = R1 * sinTheta;
                
                // 3D вращение точки
                const x = circleX * (cosB * cosPhi + sinA * sinB * sinPhi) - circleY * cosA * sinB;
                const y = circleX * (sinB * cosPhi - sinA * cosB * sinPhi) + circleY * cosA * cosB;
                const z = K2 + cosA * circleX * sinPhi + circleY * sinA;
                
                // Вычисляем освещение
                const L = cosPhi * cosTheta * sinB - cosA * cosTheta * sinPhi - sinA * sinTheta + cosB * (cosA * sinTheta - cosTheta * sinA * sinPhi);
                
                if (L > 0) {
                    renderPoint(x, y, z, L);
                }
            }
        }
        
        displayFrame();
        
        // Обновляем углы автоматической анимации
        if (isAutoRotating) {
            A += 0.07 / (speedFactor / 10);
            B += 0.03 / (speedFactor / 10);
        }
        
        animationId = requestAnimationFrame(renderTorusFrame);
    }
    
    // Останавливаем предыдущую анимацию если есть
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    renderTorusFrame();
}