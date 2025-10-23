function startCubeRender() {
    initCommonControls();
    
    // Вершины куба
    const cubeVertices = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], // задняя грань
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]     // передняя грань
    ];
    
    // Грани куба (квадраты)
    const cubeFaces = [
        [0, 1, 2, 3], // задняя
        [4, 5, 6, 7], // передняя
        [0, 1, 5, 4], // нижняя
        [2, 3, 7, 6], // верхняя
        [0, 3, 7, 4], // левая
        [1, 2, 6, 5]  // правая
    ];
    
    // Нормали для каждой грани
    const faceNormals = [
        [0, 0, -1],  // задняя
        [0, 0, 1],   // передняя
        [0, -1, 0],  // нижняя
        [0, 1, 0],   // верхняя
        [-1, 0, 0],  // левая
        [1, 0, 0]    // правая
    ];
    
    function renderCubeFrame() {
        clearBuffers();
        
        // Комбинируем автоматическое вращение и вращение мышью
        const totalA = A + mouseRotationX;
        const totalB = B + mouseRotationZ;
        
        // Вычисляем синусы и косинусы углов
        const cosA = Math.cos(totalA);
        const sinA = Math.sin(totalA);
        const cosB = Math.cos(totalB);
        const sinB = Math.sin(totalB);
        
        const scale = 1.3; // Масштаб куба
        
        // Преобразуем и вращаем все вершины
        const transformedVertices = cubeVertices.map(vertex => {
            const x = vertex[0] * scale;
            const y = vertex[1] * scale;
            const z = vertex[2] * scale;
            
            const rotatedX = x * cosB - z * sinB;
            const rotatedZ = x * sinB + z * cosB;
            const rotatedY = y * cosA - rotatedZ * sinA;
            const finalZ = rotatedZ * cosA + y * sinA + K2;
            
            return [rotatedX, rotatedY, finalZ];
        });
        
        // Сортируем грани по глубине
        const sortedFaces = cubeFaces.map((face, index) => {
            const zAvg = (transformedVertices[face[0]][2] + 
                         transformedVertices[face[1]][2] + 
                         transformedVertices[face[2]][2] + 
                         transformedVertices[face[3]][2]) / 4;
            return { face, z: zAvg, index };
        }).sort((a, b) => b.z - a.z);
        
        // Рендерим каждую грань (от дальних к ближним)
        for (const { face, index } of sortedFaces) {
            const normal = faceNormals[index];
            
            // Вращаем нормаль для вычисления освещения
            const rotatedNormalX = normal[0] * cosB - normal[2] * sinB;
            const rotatedNormalZ = normal[0] * sinB + normal[2] * cosB;
            const rotatedNormalY = normal[1] * cosA - rotatedNormalZ * sinA;
            
            // Вычисляем освещение
            const lightDir = [0.3, 0.5, -0.8];
            const lightLength = Math.sqrt(lightDir[0]**2 + lightDir[1]**2 + lightDir[2]**2);
            const normalizedLightDir = [
                lightDir[0] / lightLength,
                lightDir[1] / lightLength,
                lightDir[2] / lightLength
            ];
            
            let luminance = rotatedNormalX * normalizedLightDir[0] + 
                           rotatedNormalY * normalizedLightDir[1] + 
                           rotatedNormalZ * normalizedLightDir[2];
            
            luminance = Math.max(0.2, (luminance + 1) / 2);
            
            const v1 = transformedVertices[face[0]];
            const v2 = transformedVertices[face[1]];
            const v3 = transformedVertices[face[2]];
            const v4 = transformedVertices[face[3]];
            
            // Рендерим заполненный квадрат
            renderFilledSquare(v1, v2, v3, v4, luminance);
            
            // Рендерим рёбра поверх грани
            renderLine(v1[0], v1[1], v1[2], v2[0], v2[1], v2[2], luminance * 0.5);
            renderLine(v2[0], v2[1], v2[2], v3[0], v3[1], v3[2], luminance * 0.5);
            renderLine(v3[0], v3[1], v3[2], v4[0], v4[1], v4[2], luminance * 0.5);
            renderLine(v4[0], v4[1], v4[2], v1[0], v1[1], v1[2], luminance * 0.5);
        }
        
        displayFrame();
        
        // Обновляем углы автоматической анимации
        if (isAutoRotating) {
            A += 0.04 / (speedFactor / 10);
            B += 0.02 / (speedFactor / 10);
        }
        
        animationId = requestAnimationFrame(renderCubeFrame);
    }
    
    // Останавливаем предыдущую анимацию если есть
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    renderCubeFrame();
}