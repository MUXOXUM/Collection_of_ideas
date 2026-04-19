const CLOCK_DIAMETER = 400;
const CLOCK_CENTER = CLOCK_DIAMETER / 2;
const MOBILE_HINT = "Tap the left and right edges of the screen to switch";
const DESKTOP_HINT = "← → or A/D";
const MAP_SHORTCUT_HINT = "M: select map point";
const CLOCK_GEOMETRY = {
    size: CLOCK_DIAMETER,
    center: CLOCK_CENTER,
    outerRadius: 190,
    dayNightRadius: 185,
    markerInnerRadius: 170,
    markerOuterRadius: 180,
    markerLabelRadius: 140,
    hourHandLength: 110,
    minuteHandLength: 140,
    secondHandLength: 160,
    centerDotRadius: 8,
    classicOuterRadius: 199,
    classicDayNightRadius: 198,
    classicMarkerInnerRadius: 180,
    classicMarkerOuterRadius: 195,
    classicMarkerLabelRadius: 168,
    classicHourHandLength: 180,
    classicSecondsSubdialCenterY: 286,
    classicSecondsSubdialRadius: 44,
    classicSecondsSubdialMinorInnerRadius: 37,
    classicSecondsSubdialMajorInnerRadius: 31,
    classicSecondsSubdialOuterRadius: 42,
    classicSecondsSubdialLabelRadius: 24,
    classicMinutesHandLength: 32,
    classicSecondsHandLength: 34,
    classicCenterDotRadius: 4,
    rotaryTrackHours: 190,
    rotaryTrackMinutes: 136,
    rotaryTrackSeconds: 85,
    rotaryTickOuterHours: 186,
    rotaryTickInnerHours: 178,
    rotaryMinorTickOuterMinutes: 132,
    rotaryMinorTickInnerMinutes: 129,
    rotaryTickOuterMinutes: 132,
    rotaryTickInnerMinutes: 126,
    rotaryMinorTickOuterSeconds: 82,
    rotaryMinorTickInnerSeconds: 79,
    rotaryTickOuterSeconds: 82,
    rotaryTickInnerSeconds: 77,
    rotaryLabelHours: 163,
    rotaryLabelMinutes: 112,
    rotaryLabelSeconds: 65,
    rotaryFontHours: 18,
    rotaryFontMinutes: 16,
    rotaryFontSeconds: 14,
    rotaryCenterDotRadius: 4,
    retrogradeOuterRadius: 196,
    retrogradeArcRadius: 164,
    retrogradeMinorTickInnerRadius: 151,
    retrogradeMajorTickInnerRadius: 143,
    retrogradeLabelRadius: 128,
    retrogradeHandLengthMinute: 152,
    retrogradeHandLengthSecond: 146,
    retrogradeCenterDotRadius: 6,
    retrogradeSubdialCenterY: 290,
    retrogradeSubdialRadius: 54,
    retrogradeSubdialLabelRadius: 40,
    retrogradeHourHandLength: 30,
    retrogradeSubdialCenterDotRadius: 4,
    retrogradeReturnDuration: 180,
    combinedHourRadius: 162,
    combinedMinuteRadius: 116,
    combinedSecondRadius: 72,
    combinedHourBadgeRadius: 16,
    combinedMinuteBadgeRadius: 14,
    combinedSecondBadgeRadius: 12
};

const SunCalculator = (() => {
    async function getSunTimes(lat, lon, date, timeZone) {
        try {
            const url = new URL("https://api.sunrise-sunset.org/json");
            url.searchParams.set("lat", lat);
            url.searchParams.set("lng", lon);
            url.searchParams.set("formatted", "0");

            if (date) {
                url.searchParams.set("date", date);
            }

            if (timeZone) {
                url.searchParams.set("tzid", timeZone);
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.status === "OK") {
                return {
                    sunrise: new Date(data.results.sunrise),
                    sunset: new Date(data.results.sunset),
                    timeZone: data.tzid || timeZone || "UTC"
                };
            }

            throw new Error("Не удалось получить данные о восходе и закате.");
        } catch (error) {
            console.error("Ошибка получения солнечных данных:", error);

            const now = new Date();
            const sunrise = new Date(now);
            const sunset = new Date(now);
            sunrise.setHours(6, 0, 0, 0);
            sunset.setHours(18, 0, 0, 0);

            return { sunrise, sunset, timeZone: timeZone || "UTC" };
        }
    }

    return { getSunTimes };
})();

const TimeZoneResolver = (() => {
    async function getTimeZone(lat, lon) {
        try {
            const url = new URL("https://api.open-meteo.com/v1/forecast");
            url.searchParams.set("latitude", lat);
            url.searchParams.set("longitude", lon);
            url.searchParams.set("timezone", "auto");
            url.searchParams.set("forecast_days", "1");

            const response = await fetch(url);
            const data = await response.json();

            if (data.timezone) {
                return data.timezone;
            }

            throw new Error("Не удалось определить часовой пояс.");
        } catch (error) {
            console.error("Ошибка получения часового пояса:", error);
            return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        }
    }

    return { getTimeZone };
})();

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tagName);

    Object.entries(attributes).forEach(([name, value]) => {
        element.setAttribute(name, value);
    });

    return element;
}

function createRootQuery(state) {
    return (id) => state.root ? state.root.querySelector(`#${id}`) : null;
}

function polarToCartesian(radius, angle, centerX = CLOCK_GEOMETRY.center, centerY = CLOCK_GEOMETRY.center) {
    return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
    };
}

function createLineByAngle(innerRadius, outerRadius, angle, attributes = {}, centerX, centerY) {
    const start = polarToCartesian(innerRadius, angle, centerX, centerY);
    const end = polarToCartesian(outerRadius, angle, centerX, centerY);

    return createSvgElement("line", {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        ...attributes
    });
}

function createTextByAngle(radius, angle, textContent, attributes = {}, centerX, centerY) {
    const point = polarToCartesian(radius, angle, centerX, centerY);
    const text = createSvgElement("text", {
        x: point.x,
        y: point.y,
        ...attributes
    });
    text.textContent = textContent;
    return text;
}

function getCircleAngle(value, total, offsetDegrees = -90) {
    return ((value / total) * 360 + offsetDegrees) * Math.PI / 180;
}

function setLineEnd(element, point) {
    if (!element) {
        return;
    }

    element.setAttribute("x2", point.x);
    element.setAttribute("y2", point.y);
}

function setRotation(element, degrees, centerX = CLOCK_GEOMETRY.center, centerY = CLOCK_GEOMETRY.center) {
    if (!element) {
        return;
    }

    element.setAttribute("transform", `rotate(${degrees} ${centerX} ${centerY})`);
}

function getCurrentTimeParts() {
    const now = new Date();
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours12 = (now.getHours() % 12) + minutes / 60;
    const hours24 = now.getHours() + minutes / 60;

    return { now, seconds, minutes, hours12, hours24 };
}

function getDateStringInTimeZone(timeZone, date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(date).map((part) => [part.type, part.value])
    );

    return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTimePartsInTimeZone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(date).map((part) => [part.type, part.value])
    );

    return {
        hours: Number(parts.hour),
        minutes: Number(parts.minute),
        seconds: Number(parts.second)
    };
}

function describePieSlice(radius, startAngle, endAngle, className, centerX = CLOCK_GEOMETRY.center, centerY = CLOCK_GEOMETRY.center) {
    const start = polarToCartesian(radius, startAngle, centerX, centerY);
    const end = polarToCartesian(radius, endAngle, centerX, centerY);
    const sweep = ((endAngle - startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const largeArc = sweep > Math.PI ? 1 : 0;

    return createSvgElement("path", {
        d: [
            "M", centerX, centerY,
            "L", start.x, start.y,
            "A", radius, radius, 0, largeArc, 1, end.x, end.y,
            "Z"
        ].join(" "),
        class: className
    });
}

function runAnimationLoop(state, update) {
    function frame() {
        update();
        state.frameId = window.requestAnimationFrame(frame);
    }

    frame();
}

function createTwentyFourHourClockView() {
    const ids = {
        svg: "clock-svg",
        hourMarkers: "hour-markers",
        hourMarkersNight: "hour-markers-night",
        secondsSubdial: "seconds-subdial",
        hourHand: "hour-hand",
        hourHandNight: "hour-hand-night",
        minutesHand: "minutes-subdial-hand",
        secondsHand: "seconds-subdial-hand",
        nightClipPath: "night-clip-path",
        mapOverlay: "clock-map-overlay",
        mapSurface: "clock-map-surface",
        mapCoordinates: "clock-map-coordinates",
        mapCloseButton: "clock-map-close"
    };
    const state = {
        sunriseTime: null,
        sunsetTime: null,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        currentLocation: { lat: 55.7558, lon: 37.6173 },
        tickTimer: null,
        root: null,
        map: null,
        mapMarker: null
    };
    const query = createRootQuery(state);

    function render() {
        return `
            <div class="clock-wrapper">
                <div class="clock-container">
                    <svg class="clock-svg" viewBox="0 0 ${CLOCK_GEOMETRY.size} ${CLOCK_GEOMETRY.size}" id="${ids.svg}">
                        <defs>
                            <clipPath id="night-clip" clipPathUnits="userSpaceOnUse">
                                <path
                                    id="${ids.nightClipPath}"
                                    d="M ${CLOCK_GEOMETRY.center} ${CLOCK_GEOMETRY.center} L ${CLOCK_GEOMETRY.center} ${CLOCK_GEOMETRY.center - CLOCK_GEOMETRY.classicDayNightRadius} A ${CLOCK_GEOMETRY.classicDayNightRadius} ${CLOCK_GEOMETRY.classicDayNightRadius} 0 1 1 ${CLOCK_GEOMETRY.center} ${CLOCK_GEOMETRY.center + CLOCK_GEOMETRY.classicDayNightRadius} Z"
                                ></path>
                            </clipPath>
                        </defs>

                        <circle cx="${CLOCK_GEOMETRY.center}" cy="${CLOCK_GEOMETRY.center}" r="${CLOCK_GEOMETRY.classicOuterRadius}" class="metal-ring"></circle>
                        <g id="${ids.hourMarkers}"></g>
                        <g id="${ids.hourMarkersNight}" clip-path="url(#night-clip)"></g>
                        <g id="${ids.secondsSubdial}"></g>
                        <g>
                            <line x1="${CLOCK_GEOMETRY.center}" y1="${CLOCK_GEOMETRY.center}" x2="${CLOCK_GEOMETRY.center}" y2="${CLOCK_GEOMETRY.center - CLOCK_GEOMETRY.classicHourHandLength}" class="hour-hand" id="${ids.hourHand}"></line>
                            <line x1="${CLOCK_GEOMETRY.center}" y1="${CLOCK_GEOMETRY.center}" x2="${CLOCK_GEOMETRY.center}" y2="${CLOCK_GEOMETRY.center - CLOCK_GEOMETRY.classicHourHandLength}" class="hour-hand-night" id="${ids.hourHandNight}" clip-path="url(#night-clip)"></line>
                            <line x1="${CLOCK_GEOMETRY.center}" y1="${CLOCK_GEOMETRY.classicSecondsSubdialCenterY}" x2="${CLOCK_GEOMETRY.center}" y2="${CLOCK_GEOMETRY.classicSecondsSubdialCenterY - CLOCK_GEOMETRY.classicMinutesHandLength}" class="minutes-subdial-hand" id="${ids.minutesHand}"></line>
                            <line x1="${CLOCK_GEOMETRY.center}" y1="${CLOCK_GEOMETRY.classicSecondsSubdialCenterY}" x2="${CLOCK_GEOMETRY.center}" y2="${CLOCK_GEOMETRY.classicSecondsSubdialCenterY - CLOCK_GEOMETRY.classicSecondsHandLength}" class="seconds-subdial-hand" id="${ids.secondsHand}"></line>
                            <circle cx="${CLOCK_GEOMETRY.center}" cy="${CLOCK_GEOMETRY.classicSecondsSubdialCenterY}" r="2.5" class="seconds-subdial-center"></circle>
                            <circle cx="${CLOCK_GEOMETRY.center}" cy="${CLOCK_GEOMETRY.center}" r="${CLOCK_GEOMETRY.classicCenterDotRadius}" class="center-circle"></circle>
                        </g>
                    </svg>
                    <div class="map-overlay" id="${ids.mapOverlay}" hidden>
                        <div class="map-panel" role="dialog" aria-modal="true" aria-labelledby="map-panel-title">
                            <div class="map-panel-header">
                                <div>
                                    <h3 class="map-panel-title" id="map-panel-title">Выбор точки для восхода и заката</h3>
                                    <p class="map-panel-copy">Нажмите на карту, чтобы выбрать место. Для этой точки часы пересчитают восход и закат. Закрыть можно клавишей Esc.</p>
                                </div>
                                <button class="map-close-button" id="${ids.mapCloseButton}" type="button">Закрыть</button>
                            </div>
                            <div class="map-surface" id="${ids.mapSurface}" aria-label="Карта мира для выбора точки"></div>
                            <p class="map-coordinates" id="${ids.mapCoordinates}"></p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function formatCoordinate(value, positive, negative) {
        const suffix = value >= 0 ? positive : negative;
        return `${Math.abs(value).toFixed(2)}° ${suffix}`;
    }

    function updateMapCoordinateText() {
        const coordinates = query(ids.mapCoordinates);

        if (!coordinates) {
            return;
        }

        coordinates.textContent = `${formatCoordinate(state.currentLocation.lat, "N", "S")}, ${formatCoordinate(state.currentLocation.lon, "E", "W")}`;
    }

    function updateMapMarker() {
        if (!state.map || !window.L) {
            return;
        }

        const latLng = [state.currentLocation.lat, state.currentLocation.lon];

        if (!state.mapMarker) {
            const icon = window.L.divIcon({
                className: "",
                html: '<div class="map-marker"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });
            state.mapMarker = window.L.marker(latLng, { icon }).addTo(state.map);
        } else {
            state.mapMarker.setLatLng(latLng);
        }

        updateMapCoordinateText();
    }

    function closeMapOverlay() {
        const overlay = query(ids.mapOverlay);

        if (overlay) {
            overlay.hidden = true;
        }
    }

    function openMapOverlay() {
        const overlay = query(ids.mapOverlay);

        if (!overlay) {
            return;
        }

        overlay.hidden = false;
        updateMapMarker();
        window.setTimeout(() => {
            if (state.map) {
                state.map.invalidateSize();
                state.map.setView([state.currentLocation.lat, state.currentLocation.lon], state.map.getZoom(), { animate: false });
            }
        }, 0);
    }

    function isMapOpen() {
        const overlay = query(ids.mapOverlay);
        return Boolean(overlay && !overlay.hidden);
    }

    function refreshSunTimes() {
        const { lat, lon } = state.currentLocation;
        return TimeZoneResolver.getTimeZone(lat, lon)
            .then((timeZone) => {
                state.timeZone = timeZone;

                return SunCalculator.getSunTimes(
                    lat,
                    lon,
                    getDateStringInTimeZone(timeZone),
                    timeZone
                );
            })
            .then((times) => {
                if (!state.root) {
                    return;
                }

                state.sunriseTime = times.sunrise;
                state.sunsetTime = times.sunset;
                state.timeZone = times.timeZone || state.timeZone;
                updateDayNightSections();
            });
    }

    function handleMapPick(lat, lon) {
        state.currentLocation = { lat, lon };
        updateMapMarker();
        refreshSunTimes();
        closeMapOverlay();
    }

    function initializeMap() {
        const surface = query(ids.mapSurface);

        if (!surface || state.map) {
            return;
        }

        if (!window.L) {
            surface.classList.add("map-surface--fallback");
            surface.textContent = "Не удалось загрузить библиотеку карты. Проверьте подключение к сети и перезагрузите страницу.";
            return;
        }

        state.map = window.L.map(surface, {
            center: [state.currentLocation.lat, state.currentLocation.lon],
            zoom: 2,
            minZoom: 2,
            maxZoom: 8,
            worldCopyJump: true,
            zoomControl: true,
            attributionControl: true
        });

        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(state.map);

        state.map.on("click", (event) => {
            handleMapPick(event.latlng.lat, event.latlng.lng);
        });

        updateMapMarker();
    }

    function bindMapInteractions() {
        initializeMap();
        query(ids.mapCloseButton)?.addEventListener("click", closeMapOverlay);
        query(ids.mapOverlay)?.addEventListener("click", (event) => {
            if (event.target === query(ids.mapOverlay)) {
                closeMapOverlay();
            }
        });
    }

    function appendHourMarkers(markers, markersNight) {
        for (let hour = 0; hour < 24; hour += 1) {
            const angle = getCircleAngle(hour, 24);

            markers.appendChild(
                createLineByAngle(
                    CLOCK_GEOMETRY.classicMarkerInnerRadius,
                    CLOCK_GEOMETRY.classicMarkerOuterRadius,
                    angle,
                    { class: "marker" }
                )
            );
            markersNight.appendChild(
                createLineByAngle(
                    CLOCK_GEOMETRY.classicMarkerInnerRadius,
                    CLOCK_GEOMETRY.classicMarkerOuterRadius,
                    angle,
                    { class: "marker-night" }
                )
            );
            markers.appendChild(
                createTextByAngle(
                    CLOCK_GEOMETRY.classicMarkerLabelRadius,
                    angle,
                    hour.toString(),
                    { class: "marker-number" }
                )
            );
            markersNight.appendChild(
                createTextByAngle(
                    CLOCK_GEOMETRY.classicMarkerLabelRadius,
                    angle,
                    hour.toString(),
                    { class: "marker-number-night" }
                )
            );
        }
    }

    function createHourMarkers() {
        const markers = query(ids.hourMarkers);
        const markersNight = query(ids.hourMarkersNight);
        markers.innerHTML = "";
        markersNight.innerHTML = "";
        appendHourMarkers(markers, markersNight);
    }

    function createSecondsSubdial() {
        const subdial = query(ids.secondsSubdial);
        const centerX = CLOCK_GEOMETRY.center;
        const centerY = CLOCK_GEOMETRY.classicSecondsSubdialCenterY;
        subdial.innerHTML = "";

        subdial.appendChild(
            createSvgElement("circle", {
                cx: centerX,
                cy: centerY,
                r: CLOCK_GEOMETRY.classicSecondsSubdialRadius,
                class: "seconds-subdial"
            })
        );

        for (let second = 0; second < 60; second += 1) {
            const angle = getCircleAngle(second, 60);
            const isMajor = second % 5 === 0;
            const innerRadius = isMajor
                ? CLOCK_GEOMETRY.classicSecondsSubdialMajorInnerRadius
                : CLOCK_GEOMETRY.classicSecondsSubdialMinorInnerRadius;

            subdial.appendChild(
                createLineByAngle(
                    innerRadius,
                    CLOCK_GEOMETRY.classicSecondsSubdialOuterRadius,
                    angle,
                    { class: isMajor ? "seconds-subdial-tick seconds-subdial-tick--major" : "seconds-subdial-tick" },
                    centerX,
                    centerY
                )
            );

            if (second % 10 === 0) {
                subdial.appendChild(
                    createTextByAngle(
                        CLOCK_GEOMETRY.classicSecondsSubdialLabelRadius,
                        angle,
                        second.toString(),
                        { class: "seconds-subdial-label" },
                        centerX,
                        centerY
                    )
                );
            }
        }
    }

    function updateDayNightSections() {
        if (!state.sunriseTime || !state.sunsetTime) {
            return;
        }

        const svg = query(ids.svg);
        svg.querySelectorAll(".day-section, .night-section").forEach((element) => element.remove());

        const getTimeAngle = (date) => {
            const time = getTimePartsInTimeZone(date, state.timeZone);
            const hours = time.hours + time.minutes / 60 + time.seconds / 3600;
            return getCircleAngle(hours, 24);
        };

        const sunriseAngle = getTimeAngle(state.sunriseTime);
        const sunsetAngle = getTimeAngle(state.sunsetTime);
        const daySection = describePieSlice(
            CLOCK_GEOMETRY.classicDayNightRadius,
            sunriseAngle,
            sunsetAngle,
            "day-section"
        );
        const nightSection = describePieSlice(
            CLOCK_GEOMETRY.classicDayNightRadius,
            sunsetAngle,
            sunriseAngle + 2 * Math.PI,
            "night-section"
        );
        svg.insertBefore(daySection, query(ids.hourMarkers));
        svg.insertBefore(nightSection, query(ids.hourMarkers));
        query(ids.nightClipPath).setAttribute("d", nightSection.getAttribute("d"));
    }

    function updateHands() {
        const { now, minutes, hours24 } = getCurrentTimeParts();
        const hourAngle = getCircleAngle(hours24, 24);
        const minuteAngle = getCircleAngle(minutes, 60);
        const secondAngle = getCircleAngle(now.getSeconds(), 60);
        const hourPoint = polarToCartesian(CLOCK_GEOMETRY.classicHourHandLength, hourAngle);
        const minutePoint = polarToCartesian(
            CLOCK_GEOMETRY.classicMinutesHandLength,
            minuteAngle,
            CLOCK_GEOMETRY.center,
            CLOCK_GEOMETRY.classicSecondsSubdialCenterY
        );
        const secondPoint = polarToCartesian(
            CLOCK_GEOMETRY.classicSecondsHandLength,
            secondAngle,
            CLOCK_GEOMETRY.center,
            CLOCK_GEOMETRY.classicSecondsSubdialCenterY
        );

        setLineEnd(query(ids.hourHand), hourPoint);
        setLineEnd(query(ids.hourHandNight), hourPoint);
        setLineEnd(query(ids.minutesHand), minutePoint);
        setLineEnd(query(ids.secondsHand), secondPoint);
    }

    function mount(root) {
        state.root = root;
        root.innerHTML = render();
        createHourMarkers();
        createSecondsSubdial();
        bindMapInteractions();
        updateMapMarker();
        updateHands();
        state.tickTimer = window.setInterval(updateHands, 1000);
        refreshSunTimes();
    }

    function unmount() {
        if (state.tickTimer) {
            window.clearInterval(state.tickTimer);
            state.tickTimer = null;
        }

        if (state.map) {
            state.map.remove();
            state.map = null;
            state.mapMarker = null;
        }

        state.root = null;
    }

    function getHint(baseHint) {
        return `${baseHint} | ${MAP_SHORTCUT_HINT}`;
    }

    function handleKeydown(event) {
        if (event.key === "Escape" && isMapOpen()) {
            closeMapOverlay();
            return true;
        }

        if (event.key === "m" || event.key === "M" || event.key === "ь" || event.key === "Ь") {
            if (isMapOpen()) {
                closeMapOverlay();
            } else {
                openMapOverlay();
            }

            return true;
        }

        return false;
    }

    return { mount, unmount, getHint, handleKeydown };
}

function createRetrogradeClockView() {
    const ids = {
        minuteHand: "retrograde-minute-hand",
        secondHand: "retrograde-second-hand",
        hourHand: "retrograde-hour-hand",
        sharedScale: "retrograde-shared-scale",
        hourSubdial: "retrograde-hour-subdial"
    };
    const state = {
        frameId: null,
        root: null,
        lastSecondValue: null,
        lastMinuteValue: null,
        secondReturnStart: null,
        minuteReturnStart: null
    };
    const query = createRootQuery(state);

    function render() {
        return `
            <div class="clock-wrapper">
                <div class="retrograde-clock">
                    <svg class="retrograde-clock-svg" viewBox="0 0 ${CLOCK_GEOMETRY.size} ${CLOCK_GEOMETRY.size}" aria-hidden="true">
                        <circle class="retrograde-dial" cx="${CLOCK_GEOMETRY.center}" cy="${CLOCK_GEOMETRY.center}" r="${CLOCK_GEOMETRY.retrogradeOuterRadius}"></circle>
                        <path class="retrograde-arc" d="${describeRetrogradeArc(CLOCK_GEOMETRY.retrogradeArcRadius)}"></path>
                        <g id="${ids.sharedScale}"></g>
                        <line
                            id="${ids.minuteHand}"
                            class="retrograde-hand retrograde-hand--minute"
                            x1="${CLOCK_GEOMETRY.center}"
                            y1="${CLOCK_GEOMETRY.center}"
                            x2="${CLOCK_GEOMETRY.center}"
                            y2="${CLOCK_GEOMETRY.center - CLOCK_GEOMETRY.retrogradeHandLengthMinute}"
                        ></line>
                        <line
                            id="${ids.secondHand}"
                            class="retrograde-hand retrograde-hand--second"
                            x1="${CLOCK_GEOMETRY.center}"
                            y1="${CLOCK_GEOMETRY.center}"
                            x2="${CLOCK_GEOMETRY.center}"
                            y2="${CLOCK_GEOMETRY.center - CLOCK_GEOMETRY.retrogradeHandLengthSecond}"
                        ></line>
                        <circle class="retrograde-center-dot" cx="${CLOCK_GEOMETRY.center}" cy="${CLOCK_GEOMETRY.center}" r="${CLOCK_GEOMETRY.retrogradeCenterDotRadius}"></circle>
                        <g id="${ids.hourSubdial}"></g>
                    </svg>
                </div>
            </div>
        `;
    }

    function getRetrogradeAngle(value) {
        return Math.PI + (value / 60) * Math.PI;
    }

    function describeRetrogradeArc(radius) {
        const start = polarToCartesian(radius, Math.PI);
        const end = polarToCartesian(radius, Math.PI * 2);
        return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
    }

    function buildSharedScale() {
        const scale = query(ids.sharedScale);
        scale.innerHTML = "";

        for (let value = 0; value <= 60; value += 1) {
            const angle = getRetrogradeAngle(value);
            const isMajor = value % 5 === 0;
            const innerRadius = isMajor
                ? CLOCK_GEOMETRY.retrogradeMajorTickInnerRadius
                : CLOCK_GEOMETRY.retrogradeMinorTickInnerRadius;

            scale.appendChild(
                createLineByAngle(
                    innerRadius,
                    CLOCK_GEOMETRY.retrogradeArcRadius,
                    angle,
                    { class: isMajor ? "retrograde-tick retrograde-tick--major" : "retrograde-tick" }
                )
            );

            if (isMajor) {
                scale.appendChild(
                    createTextByAngle(
                        CLOCK_GEOMETRY.retrogradeLabelRadius,
                        angle,
                        value.toString().padStart(2, "0"),
                        { class: "retrograde-label" }
                    )
                );
            }
        }

        const caption = createSvgElement("text", {
            x: CLOCK_GEOMETRY.center,
            y: 108,
            class: "retrograde-label-caption"
        });
        caption.textContent = "MIN / SEC";
        scale.appendChild(caption);
    }

    function buildHourSubdial() {
        const subdial = query(ids.hourSubdial);
        const centerX = CLOCK_GEOMETRY.center;
        const centerY = CLOCK_GEOMETRY.retrogradeSubdialCenterY;
        const romanHours = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

        subdial.innerHTML = "";
        subdial.appendChild(
            createSvgElement("circle", {
                cx: centerX,
                cy: centerY,
                r: CLOCK_GEOMETRY.retrogradeSubdialRadius,
                class: "hour-subdial"
            })
        );

        romanHours.forEach((label, index) => {
            const angle = getCircleAngle(index, 12);
            subdial.appendChild(
                createTextByAngle(
                    CLOCK_GEOMETRY.retrogradeSubdialLabelRadius,
                    angle,
                    label,
                    { class: "hour-subdial-label" },
                    centerX,
                    centerY
                )
            );
        });

        subdial.appendChild(
            createSvgElement("line", {
                id: ids.hourHand,
                x1: centerX,
                y1: centerY,
                x2: centerX,
                y2: centerY - CLOCK_GEOMETRY.retrogradeHourHandLength,
                class: "hour-subdial-hand"
            })
        );
        subdial.appendChild(
            createSvgElement("circle", {
                cx: centerX,
                cy: centerY,
                r: CLOCK_GEOMETRY.retrogradeSubdialCenterDotRadius,
                class: "hour-subdial-center-dot"
            })
        );
    }

    function update() {
        const timestamp = performance.now();
        const { seconds, minutes, hours12 } = getCurrentTimeParts();
        const wrappedSecond = state.lastSecondValue !== null && seconds < state.lastSecondValue;
        const wrappedMinute = state.lastMinuteValue !== null && minutes < state.lastMinuteValue;

        if (wrappedSecond) {
            state.secondReturnStart = timestamp;
        }

        if (wrappedMinute) {
            state.minuteReturnStart = timestamp;
        }

        let displayedSeconds = seconds;
        let displayedMinutes = minutes;

        if (state.secondReturnStart !== null) {
            const progress = Math.min(1, (timestamp - state.secondReturnStart) / CLOCK_GEOMETRY.retrogradeReturnDuration);
            displayedSeconds = 60 * (1 - progress);

            if (progress >= 1) {
                state.secondReturnStart = null;
                displayedSeconds = seconds;
            }
        }

        if (state.minuteReturnStart !== null) {
            const progress = Math.min(1, (timestamp - state.minuteReturnStart) / CLOCK_GEOMETRY.retrogradeReturnDuration);
            displayedMinutes = 60 * (1 - progress);

            if (progress >= 1) {
                state.minuteReturnStart = null;
                displayedMinutes = minutes;
            }
        }

        const minutePoint = polarToCartesian(
            CLOCK_GEOMETRY.retrogradeHandLengthMinute,
            getRetrogradeAngle(displayedMinutes),
            CLOCK_GEOMETRY.center,
            CLOCK_GEOMETRY.center
        );
        const secondPoint = polarToCartesian(
            CLOCK_GEOMETRY.retrogradeHandLengthSecond,
            getRetrogradeAngle(displayedSeconds),
            CLOCK_GEOMETRY.center,
            CLOCK_GEOMETRY.center
        );
        const hourPoint = polarToCartesian(
            CLOCK_GEOMETRY.retrogradeHourHandLength,
            getCircleAngle(hours12, 12),
            CLOCK_GEOMETRY.center,
            CLOCK_GEOMETRY.retrogradeSubdialCenterY
        );

        setLineEnd(query(ids.minuteHand), minutePoint);
        setLineEnd(query(ids.secondHand), secondPoint);
        setLineEnd(query(ids.hourHand), hourPoint);
        state.lastSecondValue = seconds;
        state.lastMinuteValue = minutes;
    }

    function mount(root) {
        state.root = root;
        root.innerHTML = render();
        buildSharedScale();
        buildHourSubdial();
        runAnimationLoop(state, update);
    }

    function unmount() {
        if (state.frameId) {
            window.cancelAnimationFrame(state.frameId);
            state.frameId = null;
        }

        state.lastSecondValue = null;
        state.lastMinuteValue = null;
        state.secondReturnStart = null;
        state.minuteReturnStart = null;
        state.root = null;
    }

    return { mount, unmount };
}

function createRotaryDialClockView() {
    const ids = {
        hoursRing: "rotary-hours-ring",
        minutesRing: "rotary-minutes-ring",
        secondsRing: "rotary-seconds-ring"
    };
    const state = {
        frameId: null,
        root: null
    };
    const query = createRootQuery(state);

    function render() {
        return `
            <div class="clock-wrapper">
                <div class="rotary-clock">
                    <div class="rotary-pointer"></div>
                    <svg class="rotary-clock-svg" viewBox="0 0 ${CLOCK_GEOMETRY.size} ${CLOCK_GEOMETRY.size}" aria-hidden="true">
                        <circle class="rotary-track rotary-track--hours" cx="${CLOCK_GEOMETRY.center}" cy="${CLOCK_GEOMETRY.center}" r="${CLOCK_GEOMETRY.rotaryTrackHours}"></circle>
                        <circle class="rotary-track rotary-track--minutes" cx="${CLOCK_GEOMETRY.center}" cy="${CLOCK_GEOMETRY.center}" r="${CLOCK_GEOMETRY.rotaryTrackMinutes}"></circle>
                        <circle class="rotary-track rotary-track--seconds" cx="${CLOCK_GEOMETRY.center}" cy="${CLOCK_GEOMETRY.center}" r="${CLOCK_GEOMETRY.rotaryTrackSeconds}"></circle>
                        <g id="${ids.hoursRing}"></g>
                        <g id="${ids.minutesRing}"></g>
                        <g id="${ids.secondsRing}"></g>
                        <circle class="rotary-center-dot" cx="${CLOCK_GEOMETRY.center}" cy="${CLOCK_GEOMETRY.center}" r="${CLOCK_GEOMETRY.rotaryCenterDotRadius}"></circle>
                    </svg>
                </div>
            </div>
        `;
    }

    function appendTicks(ring, config) {
        if (!config.minorTickInnerRadius || !config.minorTickOuterRadius) {
            return;
        }

        for (let value = 0; value < config.total; value += 1) {
            if (value % config.step === 0) {
                continue;
            }

            ring.appendChild(
                createLineByAngle(
                    config.minorTickInnerRadius,
                    config.minorTickOuterRadius,
                    getCircleAngle(value, config.total),
                    { class: "rotary-tick rotary-tick--minor" }
                )
            );
        }
    }

    function appendLabelsAndMajorTicks(ring, config) {
        for (let value = 0; value < config.total; value += config.step) {
            const angle = getCircleAngle(value, config.total);
            const point = polarToCartesian(config.labelRadius, angle);
            const rotation = (value / config.total) * 360;

            ring.appendChild(
                createLineByAngle(
                    config.tickInnerRadius,
                    config.tickOuterRadius,
                    angle,
                    { class: config.tickClassName }
                )
            );

            const label = createTextByAngle(
                config.labelRadius,
                angle,
                config.formatter(value),
                { class: config.className }
            );
            label.style.fontSize = `${config.fontSize}px`;
            label.setAttribute("transform", `rotate(${rotation} ${point.x} ${point.y})`);
            ring.appendChild(label);
        }
    }

    function buildRing(ring, config) {
        ring.innerHTML = "";
        setRotation(ring, 0);
        appendTicks(ring, config);
        appendLabelsAndMajorTicks(ring, config);
    }

    function update() {
        const { hours24, minutes, seconds } = getCurrentTimeParts();

        setRotation(query(ids.hoursRing), -hours24 * 15);
        setRotation(query(ids.minutesRing), -minutes * 6);
        setRotation(query(ids.secondsRing), -seconds * 6);
    }

    function mount(root) {
        state.root = root;
        root.innerHTML = render();

        buildRing(query(ids.hoursRing), {
            total: 24,
            step: 1,
            labelRadius: CLOCK_GEOMETRY.rotaryLabelHours,
            tickInnerRadius: CLOCK_GEOMETRY.rotaryTickInnerHours,
            tickOuterRadius: CLOCK_GEOMETRY.rotaryTickOuterHours,
            fontSize: CLOCK_GEOMETRY.rotaryFontHours,
            className: "rotary-text rotary-text--hours",
            tickClassName: "rotary-tick rotary-tick--hours",
            formatter: (value) => value.toString()
        });
        buildRing(query(ids.minutesRing), {
            total: 60,
            step: 5,
            labelRadius: CLOCK_GEOMETRY.rotaryLabelMinutes,
            minorTickInnerRadius: CLOCK_GEOMETRY.rotaryMinorTickInnerMinutes,
            minorTickOuterRadius: CLOCK_GEOMETRY.rotaryMinorTickOuterMinutes,
            tickInnerRadius: CLOCK_GEOMETRY.rotaryTickInnerMinutes,
            tickOuterRadius: CLOCK_GEOMETRY.rotaryTickOuterMinutes,
            fontSize: CLOCK_GEOMETRY.rotaryFontMinutes,
            className: "rotary-text rotary-text--minutes",
            tickClassName: "rotary-tick rotary-tick--minutes",
            formatter: (value) => value.toString()
        });
        buildRing(query(ids.secondsRing), {
            total: 60,
            step: 5,
            labelRadius: CLOCK_GEOMETRY.rotaryLabelSeconds,
            minorTickInnerRadius: CLOCK_GEOMETRY.rotaryMinorTickInnerSeconds,
            minorTickOuterRadius: CLOCK_GEOMETRY.rotaryMinorTickOuterSeconds,
            tickInnerRadius: CLOCK_GEOMETRY.rotaryTickInnerSeconds,
            tickOuterRadius: CLOCK_GEOMETRY.rotaryTickOuterSeconds,
            fontSize: CLOCK_GEOMETRY.rotaryFontSeconds,
            className: "rotary-text rotary-text--seconds",
            tickClassName: "rotary-tick rotary-tick--seconds",
            formatter: (value) => value.toString()
        });

        runAnimationLoop(state, update);
    }

    function unmount() {
        if (state.frameId) {
            window.cancelAnimationFrame(state.frameId);
            state.frameId = null;
        }

        state.root = null;
    }

    return { mount, unmount };
}

function createBinaryClockView() {
    const ids = {
        hoursRow: "binary-hours-row",
        minutesRow: "binary-minutes-row",
        secondsRow: "binary-seconds-row"
    };
    const state = {
        frameId: null,
        root: null
    };

    const rowConfigs = [
        { id: ids.hoursRow, label: "Hours", y: 126, values: [16, 8, 4, 2, 1], max: 23 },
        { id: ids.minutesRow, label: "Minutes", y: 200, values: [32, 16, 8, 4, 2, 1], max: 59 },
        { id: ids.secondsRow, label: "Seconds", y: 274, values: [32, 16, 8, 4, 2, 1], max: 59 }
    ];

    const query = createRootQuery(state);

    function render() {
        return `
            <div class="clock-wrapper">
                <div class="binary-clock">
                    <svg class="binary-clock-svg" viewBox="0 0 ${CLOCK_GEOMETRY.size} ${CLOCK_GEOMETRY.size}" aria-hidden="true">
                        <circle
                            class="binary-clock-dial"
                            cx="${CLOCK_GEOMETRY.center}"
                            cy="${CLOCK_GEOMETRY.center}"
                            r="${CLOCK_GEOMETRY.classicOuterRadius}"
                        ></circle>
                        <g id="${ids.hoursRow}"></g>
                        <g id="${ids.minutesRow}"></g>
                        <g id="${ids.secondsRow}"></g>
                    </svg>
                </div>
            </div>
        `;
    }

    function buildRow(group, config) {
        const ledSpacing = 34;
        const startX = CLOCK_GEOMETRY.center - ((config.values.length - 1) * ledSpacing) / 2;

        group.innerHTML = "";

        const rowLabel = createSvgElement("text", {
            x: CLOCK_GEOMETRY.center,
            y: config.y - 24,
            class: "binary-row-label"
        });
        rowLabel.textContent = config.label;
        group.appendChild(rowLabel);

        config.values.forEach((bitValue, index) => {
            const x = startX + index * ledSpacing;
            const led = createSvgElement("circle", {
                cx: x,
                cy: config.y,
                r: 11,
                class: "binary-led",
                "data-led-value": bitValue
            });

            const bitLabel = createSvgElement("text", {
                x,
                y: config.y + 26,
                class: "binary-bit-label"
            });
            bitLabel.textContent = bitValue.toString();

            group.appendChild(led);
            group.appendChild(bitLabel);
        });
    }

    function updateRow(group, value) {
        const leds = group.querySelectorAll("[data-led-value]");

        leds.forEach((led) => {
            const bitValue = Number(led.getAttribute("data-led-value"));
            led.classList.toggle("is-on", (value & bitValue) === bitValue);
        });
    }

    function mount(root) {
        state.root = root;
        root.innerHTML = render();

        rowConfigs.forEach((config) => {
            buildRow(query(config.id), config);
        });

        runAnimationLoop(state, () => {
            const { now } = getCurrentTimeParts();
            updateRow(query(ids.hoursRow), now.getHours());
            updateRow(query(ids.minutesRow), now.getMinutes());
            updateRow(query(ids.secondsRow), now.getSeconds());
        });
    }

    function unmount() {
        if (state.frameId) {
            window.cancelAnimationFrame(state.frameId);
            state.frameId = null;
        }

        state.root = null;
    }

    return { mount, unmount };
}

function createCombinedClockView() {
    const ids = {
        hourRotor: "combined-hour-rotor",
        minuteRotor: "combined-minute-rotor",
        secondRotor: "combined-second-rotor",
        hourCounter: "combined-hour-counter",
        minuteCounter: "combined-minute-counter",
        secondCounter: "combined-second-counter",
        hourText: "combined-hour-text",
        minuteText: "combined-minute-text",
        secondText: "combined-second-text"
    };
    const state = {
        frameId: null,
        root: null,
        startTimeMs: 0,
        startPerfMs: 0,
        lastHourLabel: null,
        lastMinuteLabel: null,
        lastSecondLabel: null
    };
    const query = createRootQuery(state);

    function renderBadge(rotorId, counterId, textId, orbitRadius, badgeRadius, label) {
        const badgeY = CLOCK_GEOMETRY.center - orbitRadius;
        return `
            <g id="${rotorId}" class="combined-badge-rotor">
                <g transform="translate(${CLOCK_GEOMETRY.center} ${badgeY})">
                    <circle class="combined-badge-circle" r="${badgeRadius}"></circle>
                    <g id="${counterId}" class="combined-badge-counter">
                        <text id="${textId}" class="combined-badge-text">${label}</text>
                    </g>
                </g>
            </g>
        `;
    }

    function render() {
        return `
            <div class="clock-wrapper">
                <div class="combined-clock">
                    <svg class="combined-clock-svg" viewBox="0 0 ${CLOCK_GEOMETRY.size} ${CLOCK_GEOMETRY.size}" aria-hidden="true">
                        <circle
                            class="combined-clock-dial"
                            cx="${CLOCK_GEOMETRY.center}"
                            cy="${CLOCK_GEOMETRY.center}"
                            r="${CLOCK_GEOMETRY.classicOuterRadius}"
                        ></circle>
                        <circle
                            class="combined-orbit"
                            cx="${CLOCK_GEOMETRY.center}"
                            cy="${CLOCK_GEOMETRY.center}"
                            r="${CLOCK_GEOMETRY.combinedHourRadius}"
                        ></circle>
                        <circle
                            class="combined-orbit"
                            cx="${CLOCK_GEOMETRY.center}"
                            cy="${CLOCK_GEOMETRY.center}"
                            r="${CLOCK_GEOMETRY.combinedMinuteRadius}"
                        ></circle>
                        <circle
                            class="combined-orbit"
                            cx="${CLOCK_GEOMETRY.center}"
                            cy="${CLOCK_GEOMETRY.center}"
                            r="${CLOCK_GEOMETRY.combinedSecondRadius}"
                        ></circle>
                        ${renderBadge(
                            ids.hourRotor,
                            ids.hourCounter,
                            ids.hourText,
                            CLOCK_GEOMETRY.combinedHourRadius,
                            CLOCK_GEOMETRY.combinedHourBadgeRadius,
                            "0"
                        )}
                        ${renderBadge(
                            ids.minuteRotor,
                            ids.minuteCounter,
                            ids.minuteText,
                            CLOCK_GEOMETRY.combinedMinuteRadius,
                            CLOCK_GEOMETRY.combinedMinuteBadgeRadius,
                            "00"
                        )}
                        ${renderBadge(
                            ids.secondRotor,
                            ids.secondCounter,
                            ids.secondText,
                            CLOCK_GEOMETRY.combinedSecondRadius,
                            CLOCK_GEOMETRY.combinedSecondBadgeRadius,
                            "00"
                        )}
                    </svg>
                </div>
            </div>
        `;
    }

    function setBadge(rotorId, counterId, textId, degrees, text, previousTextKey) {
        const rotor = query(rotorId);
        const counter = query(counterId);
        const textNode = query(textId);

        if (!rotor || !counter || !textNode) {
            return;
        }

        setRotation(rotor, degrees);
        setRotation(counter, -degrees, 0, 0);

        if (state[previousTextKey] !== text) {
            textNode.textContent = text;
            state[previousTextKey] = text;
        }
    }

    function getAnimatedTimeParts() {
        const elapsed = performance.now() - state.startPerfMs;
        const now = new Date(state.startTimeMs + elapsed);
        const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
        const minutes = now.getMinutes() + seconds / 60;
        const hours24 = now.getHours() + minutes / 60;

        return { now, seconds, minutes, hours24 };
    }

    function update() {
        const { now, seconds, minutes, hours24 } = getAnimatedTimeParts();
        const displayHours = now.getHours();
        const displayMinutes = now.getMinutes();
        const displaySeconds = now.getSeconds();

        setBadge(
            ids.hourRotor,
            ids.hourCounter,
            ids.hourText,
            (hours24 / 24) * 360,
            displayHours.toString(),
            "lastHourLabel"
        );
        setBadge(
            ids.minuteRotor,
            ids.minuteCounter,
            ids.minuteText,
            (minutes / 60) * 360,
            displayMinutes.toString().padStart(2, "0"),
            "lastMinuteLabel"
        );
        setBadge(
            ids.secondRotor,
            ids.secondCounter,
            ids.secondText,
            (seconds / 60) * 360,
            displaySeconds.toString().padStart(2, "0"),
            "lastSecondLabel"
        );
    }

    function mount(root) {
        state.root = root;
        state.startTimeMs = Date.now();
        state.startPerfMs = performance.now();
        state.lastHourLabel = null;
        state.lastMinuteLabel = null;
        state.lastSecondLabel = null;
        root.innerHTML = render();
        runAnimationLoop(state, update);
    }

    function unmount() {
        if (state.frameId) {
            window.cancelAnimationFrame(state.frameId);
            state.frameId = null;
        }

        state.root = null;
    }

    return { mount, unmount };
}

const TwentyFourHourClockView = createTwentyFourHourClockView();
const RotaryDialClockView = createRotaryDialClockView();
const RetrogradeClockView = createRetrogradeClockView();
const BinaryClockView = createBinaryClockView();
const CombinedClockView = createCombinedClockView();

const clockViews = [
    {
        title: "Sunrise/Sunset Clock",
        ...TwentyFourHourClockView
    },
    {
        title: "Rotary Dial Clock",
        ...RotaryDialClockView
    },
    {
        title: "Retrograde Clock",
        ...RetrogradeClockView
    },
    {
        title: "Binary Clock",
        ...BinaryClockView
    },
    {
        title: "Orbit Like Clock",
        ...CombinedClockView
    }
];

const ClockGallery = (() => {
    let currentIndex = 0;
    let activeClock = null;
    let hintMediaQuery = null;

    function updateHint() {
        const hint = document.getElementById("clock-hint");

        if (!hint) {
            return;
        }

        const baseHint = hintMediaQuery && hintMediaQuery.matches ? MOBILE_HINT : DESKTOP_HINT;
        hint.textContent = activeClock && typeof activeClock.getHint === "function"
            ? activeClock.getHint(baseHint)
            : baseHint;
    }

    function mountCurrentClock() {
        const root = document.getElementById("clock-view-root");
        const title = document.getElementById("clock-title");

        if (activeClock && typeof activeClock.unmount === "function") {
            activeClock.unmount();
        }

        activeClock = clockViews[currentIndex];
        title.textContent = activeClock.title;
        activeClock.mount(root);
        updateHint();
    }

    function showClock(nextIndex) {
        const total = clockViews.length;
        currentIndex = (nextIndex + total) % total;
        mountCurrentClock();
    }

    function handleKeydown(event) {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
        }

        if (activeClock && typeof activeClock.handleKeydown === "function" && activeClock.handleKeydown(event)) {
            event.preventDefault();
            return;
        }

        if (event.key === "ArrowRight" || event.key === "d" || event.key === "D" || event.key === "в" || event.key === "В") {
            event.preventDefault();
            showClock(currentIndex + 1);
        }

        if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A" || event.key === "ф" || event.key === "Ф") {
            event.preventDefault();
            showClock(currentIndex - 1);
        }
    }

    function handlePointerUp(event) {
        if (!(hintMediaQuery && hintMediaQuery.matches)) {
            return;
        }

        if (event.pointerType === "mouse") {
            return;
        }

        const screenMidpoint = window.innerWidth / 2;

        if (event.clientX >= screenMidpoint) {
            showClock(currentIndex + 1);
            return;
        }

        showClock(currentIndex - 1);
    }

    function init() {
        hintMediaQuery = window.matchMedia("(max-width: 720px)");
        mountCurrentClock();
        window.addEventListener("keydown", handleKeydown);
        window.addEventListener("pointerup", handlePointerUp);
        hintMediaQuery.addEventListener("change", updateHint);
    }

    return { init };
})();

document.addEventListener("DOMContentLoaded", () => {
    ClockGallery.init();
});
