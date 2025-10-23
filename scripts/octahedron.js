function startOctahedronRender() {
    initCommonControls();
    
    // Вершины октаэдра
    const octahedronVertices = [
        [1, 0, 0],   // правая
        [-1, 0, 0],  // левая
        [0, 1, 0],   // верх
        [0, -1, 0],  // низ
        [0, 0, 1],   // перед
        [0, 0, -1]   // зад
    ];
    
    // Грани октаэдра (треугольники)
    const octahedronFaces = [
        [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],  // вокруг вершины 0
        [1, 2, 5], [1, 5, 3], [1, 3, 4], [1, 4, 2]   // вокруг вершины 1
    ];
    
    function renderOctahedronFrame() {
        clearBuffers();
        
        // Комбинируем автоматическое вращение и вращение мышью
        const totalA = A + mouseRotationX;
        const totalB = B + mouseRotationZ;
        
        // Вычисляем синусы и косинусы углов
        const cosA = Math.cos(totalA);
        const sinA = Math.sin(totalA);
        const cosB = Math.cos(totalB);
        const sinB = Math.sin(totalB);
        
        const scale = 1.5; // Масштаб октаэдра
        
        // Преобразуем и вращаем все вершины
        const transformedVertices = octahedronVertices.map(vertex => {
            const x = vertex[0] * scale;
            const y = vertex[1] * scale;
            const z = vertex[2] * scale;
            
            // 3D вращение
            const rotatedX = x * cosB - z * sinB;
            const rotatedZ = x * sinB + z * cosB;
            const rotatedY = y * cosA - rotatedZ * sinA;
            const finalZ = rotatedZ * cosA + y * sinA + K2;
            
            return [rotatedX, rotatedY, finalZ];
        });
        
        // Сортируем грани по глубине для правильного отображения
        const sortedFaces = octahedronFaces.map((face, index) => {
            const zAvg = (transformedVertices[face[0]][2] + 
                         transformedVertices[face[1]][2] + 
                         transformedVertices[face[2]][2]) / 3;
            return { face, z: zAvg, index };
        }).sort((a, b) => b.z - a.z);
        
        // Рендерим каждую грань (от дальних к ближним)
        for (const { face } of sortedFaces) {
            const v1 = transformedVertices[face[0]];
            const v2 = transformedVertices[face[1]];
            const v3 = transformedVertices[face[2]];
            
            // Вычисляем нормаль грани для освещения
            const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
            const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
            const normal = [
                edge1[1] * edge2[2] - edge1[2] * edge2[1],
                edge1[2] * edge2[0] - edge1[0] * edge2[2],
                edge1[0] * edge2[1] - edge1[1] * edge2[0]
            ];
            
            // Нормализуем нормаль
            const length = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2);
            if (length === 0) continue;
            
            const normalizedNormal = [
                normal[0] / length,
                normal[1] / length,
                normal[2] / length
            ];
            
            // Вычисляем освещение (скалярное произведение с направлением света)
            const lightDir = [0.3, 0.5, -0.8]; // Направленный свет
            const lightLength = Math.sqrt(lightDir[0]**2 + lightDir[1]**2 + lightDir[2]**2);
            const normalizedLightDir = [
                lightDir[0] / lightLength,
                lightDir[1] / lightLength,
                lightDir[2] / lightLength
            ];
            
            let luminance = normalizedNormal[0] * normalizedLightDir[0] + 
                           normalizedNormal[1] * normalizedLightDir[1] + 
                           normalizedNormal[2] * normalizedLightDir[2];
            
            luminance = Math.max(0.1, (luminance + 1) / 2); // Приводим к диапазону 0-1
            
            // Рендерим заполненный треугольник
            renderFilledTriangle(v1, v2, v3, luminance);
            
            // Рендерим рёбра поверх грани
            renderLine(v1[0], v1[1], v1[2], v2[0], v2[1], v2[2], luminance * 0.5);
            renderLine(v2[0], v2[1], v2[2], v3[0], v3[1], v3[2], luminance * 0.5);
            renderLine(v3[0], v3[1], v3[2], v1[0], v1[1], v1[2], luminance * 0.5);
        }
        
        displayFrame();
        
        // Обновляем углы автоматической анимации
        if (isAutoRotating) {
            A += 0.05 / (speedFactor / 10);
            B += 0.03 / (speedFactor / 10);
        }
        
        animationId = requestAnimationFrame(renderOctahedronFrame);
    }
    
    // Останавливаем предыдущую анимацию если есть
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    renderOctahedronFrame();
}