// options.js
document.addEventListener('DOMContentLoaded', () => {
    const hostnameInput = document.getElementById('hostname');
    const unrestrictedCheckbox = document.getElementById('unrestricted');
    const dailyLimitInput = document.getElementById('dailyLimit');
    const timeRangesContainer = document.getElementById('timeRangesContainer');
    const addTimeRangeButton = document.getElementById('addTimeRangeButton');
    const saveRuleButton = document.getElementById('saveRule');
    const rulesListDiv = document.getElementById('rulesList');
    const usageStatsDiv = document.getElementById('usageStats'); // This will be null now, but kept for existing references if any
    const statusP = document.getElementById('status');
    const limitsSection = document.getElementById('limits-section');
    const rulesTableBody = document.getElementById('rulesTableBody'); // Get rulesTableBody here
    const activationsTableContainer = document.getElementById('activationsTableContainer'); // Get activationsTableContainer here
    const activationDateInput = document.getElementById('activationDate'); // Get activationDateInput here
    const timeResolutionSelect = document.getElementById('timeResolution'); // Get timeResolutionSelect here


    // Cargar reglas y estadísticas al iniciar (order changed)
    loadRules();
    renderActivationsTable(); // Call renderActivationsTable before loadUsageStats


    addTimeRangeButton.addEventListener('click', () => {
        addTimeRangeInput();
    });

    unrestrictedCheckbox.addEventListener('change', () => {
        limitsSection.style.display = unrestrictedCheckbox.checked ? 'none' : 'block';
        if (unrestrictedCheckbox.checked) {
            dailyLimitInput.value = '';
            timeRangesContainer.innerHTML = ''; // Clear time ranges
        }
    });

    saveRuleButton.addEventListener('click', async () => {
        const hostname = hostnameInput.value.trim().toLowerCase();
        if (!hostname) {
            showStatus("El nombre del sitio no puede estar vacío.", true);
            return;
        }
        // Simple validación para evitar http/https y www.
        if (hostname.includes("http") || hostname.includes("www.")) {
            showStatus("Introduce solo el dominio (ej: google.com)", true);
            return;
        }


        const isUnrestricted = unrestrictedCheckbox.checked;
        const dailyLimit = parseInt(dailyLimitInput.value, 10);
        const timeRanges = [];
        timeRangesContainer.querySelectorAll('.time-range-item').forEach(item => {
            const startTime = item.querySelector('.start-time').value;
            const endTime = item.querySelector('.end-time').value;
            if (startTime && endTime) {
                timeRanges.push({ startTime, endTime });
            }
        });

        const ruleType = document.querySelector('input[name="ruleType"]:checked').value;

        const { rules } = await chrome.storage.local.get('rules');
        let currentRules = rules || {};

        // Ensure the hostname entry exists
        if (!currentRules[hostname]) {
            currentRules[hostname] = {};
        }

        if (isUnrestricted) {
            // If unrestricted, it applies to both weekday and weekend,
            // so we can simplify the structure or set unrestricted flag at hostname level
            // Let's set unrestricted at the hostname level for simplicity
            currentRules[hostname] = { unrestricted: true };
        } else {
            // If not unrestricted, ensure the weekday/weekend structure exists
            if (!currentRules[hostname].weekday) {
                currentRules[hostname].weekday = {};
            }
            if (!currentRules[hostname].weekend) {
                currentRules[hostname].weekend = {};
            }

            if (isNaN(dailyLimit) || dailyLimit < 0) {
                showStatus("El límite diario debe ser un número positivo.", true);
                return;
            }
            // Basic validation for time ranges
            for (const range of timeRanges) {
                if (!range.startTime || !range.endTime) {
                     showStatus("Todos los rangos de horario deben tener hora de inicio y fin.", true);
                     return;
                }
                if (range.startTime >= range.endTime) {
                    showStatus("La hora de inicio debe ser anterior a la hora de fin en todos los rangos.", true);
                    return;
                }
            }

            // Save the rule under the selected rule type (weekday or weekend)
            currentRules[hostname][ruleType] = {
                dailyLimitMinutes: dailyLimit || null,
                timeRanges: timeRanges.length > 0 ? timeRanges : null // Save array or null
            };

            // If the rule was previously unrestricted, remove the unrestricted flag
            if (currentRules[hostname].unrestricted) {
                delete currentRules[hostname].unrestricted;
            }
        }

        console.log("Saving rules:", currentRules); // Add logging here
        await chrome.storage.local.set({ rules: currentRules });
        showStatus(`Regla para '${hostname}' (${ruleType}) guardada.`, false);
        loadRules(); // Recargar la lista
        clearInputFields();

        // Notificar al background script que las reglas han cambiado
        chrome.runtime.sendMessage({ type: "rulesChanged" }, (response) => {
            if (chrome.runtime.lastError) {
                // console.warn("Error al enviar mensaje a background:", chrome.runtime.lastError.message);
            } else {
                // console.log("Mensaje rulesChanged enviado, respuesta:", response);
            }
        });
    });

    function addTimeRangeInput(startTime = '', endTime = '') {
        const timeRangeDiv = document.createElement('div');
        timeRangeDiv.classList.add('time-range-item', 'flex', 'items-center', 'space-x-2');
        timeRangeDiv.innerHTML = `
            <input type="time" class="start-time px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500">
            <span>hasta</span>
            <input type="time" class="end-time px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-sm">
            <button type="button" class="remove-time-range px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-sm">X</button>
        `;
        timeRangeDiv.querySelector('.start-time').value = startTime;
        timeRangeDiv.querySelector('.end-time').value = endTime;
        timeRangeDiv.querySelector('.remove-time-range').addEventListener('click', () => {
            timeRangeDiv.remove();
        });
        timeRangesContainer.appendChild(timeRangeDiv);
    }

    function clearInputFields() {
        hostnameInput.value = '';
        unrestrictedCheckbox.checked = false;
        dailyLimitInput.value = '';
        timeRangesContainer.innerHTML = ''; // Clear time ranges
        limitsSection.style.display = 'block';
        // Reset rule type radio button to weekday
        document.getElementById('ruleTypeWeekday').checked = true;
    }

    async function loadRules() {
        const { rules } = await chrome.storage.local.get('rules');
        const currentRules = rules || {};
        
        if (!rulesListDiv) {
             console.error("Element with ID 'rulesList' not found at loadRules start.");
             return;
        }
        if (!rulesTableBody) {
            console.error("Element with ID 'rulesTableBody' not found at loadRules start.");
            // If rulesTableBody is missing, clear the parent div and return
            rulesListDiv.innerHTML = '<p class="text-red-600">Error: Tabla de reglas no encontrada.</p>';
            return;
        }

        rulesTableBody.innerHTML = ''; // Clear table body

        if (Object.keys(currentRules).length === 0) {
            // If no rules, display a message in the rulesListDiv (the parent)
            rulesListDiv.innerHTML = '<p class="text-gray-600">No hay reglas configuradas.</p>';
            return;
        } else {
             // If there are rules, ensure the message is cleared if it was previously shown
             if (rulesListDiv.innerHTML.includes('No hay reglas configuradas.') || rulesListDiv.innerHTML.includes('Error: Tabla de reglas no encontrada.')) {
                 rulesListDiv.innerHTML = '';
             }
        }


        // Fetch usage data for today to display alongside rules
        const today = new Date().toISOString().split('T')[0];
        const usageKeyToday = `usage${today}`;
        const usageTodayData = await chrome.storage.local.get(usageKeyToday);
        const currentUsageToday = usageTodayData[usageKeyToday] || {};


        for (const host in currentRules) {
            const rule = currentRules[host];
            const usageForHostToday = currentUsageToday[host] || { minutes: 0, seconds: 0, activationTimestamps: [] };

            const row = document.createElement('tr');
            row.classList.add('rule-item', 'hover:bg-gray-50');

            // Site Column
            const siteCell = document.createElement('td');
            siteCell.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'font-medium', 'text-gray-900');
            siteCell.textContent = host;
            row.appendChild(siteCell);

            // Daily Limit Column (Combined for Weekday/Weekend)
            const limitCell = document.createElement('td');
            limitCell.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-500');
            if (rule.unrestricted) {
                limitCell.textContent = 'Ilimitado';
            } else {
                const weekdayLimit = (rule.weekday && rule.weekday.dailyLimitMinutes !== null && rule.weekday.dailyLimitMinutes !== undefined) ? rule.weekday.dailyLimitMinutes + ' min (Lun-Vie)' : 'No establecido (Lun-Vie)';
                const weekendLimit = (rule.weekend && rule.weekend.dailyLimitMinutes !== null && rule.weekend.dailyLimitMinutes !== undefined) ? rule.weekend.dailyLimitMinutes + ' min (Sáb-Dom)' : 'No establecido (Sáb-Dom)';
                limitCell.innerHTML = `${weekdayLimit}<br>${weekendLimit}`;
            }
            row.appendChild(limitCell);

            // Time Ranges Column (Combined for Weekday/Weekend)
            const timeRangesCell = document.createElement('td');
            timeRangesCell.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-500');
             if (rule.unrestricted) {
                timeRangesCell.textContent = '-';
            } else {
                const weekdayRanges = (rule.weekday && rule.weekday.timeRanges && Array.isArray(rule.weekday.timeRanges) && rule.weekday.timeRanges.length > 0)
                    ? rule.weekday.timeRanges.map(range => `${range.startTime || 'N/A'} - ${range.endTime || 'N/A'}`).join(', ')
                    : 'No establecidos';
                const weekendRanges = (rule.weekend && rule.weekend.timeRanges && Array.isArray(rule.weekend.timeRanges) && rule.weekend.timeRanges.length > 0)
                    ? rule.weekend.timeRanges.map(range => `${range.startTime || 'N/A'} - ${range.endTime || 'N/A'}`).join(', ')
                    : 'No establecidos';
                 timeRangesCell.innerHTML = `Lun-Vie: ${weekdayRanges}<br>Sáb-Dom: ${weekendRanges}`;
            }
            row.appendChild(timeRangesCell);

            // Usage Today Column
            const usageTodayCell = document.createElement('td');
            usageTodayCell.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-500');
            const activationCount = (usageForHostToday.activationTimestamps || []).length;
            const secondsDisplay = (usageForHostToday.seconds !== undefined && usageForHostToday.seconds > 0) ? `, ${usageForHostToday.seconds} s` : '';
            usageTodayCell.textContent = `${usageForHostToday.minutes} min${secondsDisplay}, ${activationCount} activaciones`;
            row.appendChild(usageTodayCell);


            // Action Column
            const actionsCell = document.createElement('td');
            actionsCell.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-right', 'text-sm', 'font-medium');

            const editWeekdayButton = document.createElement('button');
            editWeekdayButton.textContent = 'Editar (Lun-Vie)';
            editWeekdayButton.classList.add('text-blue-600', 'hover:text-blue-900', 'mr-2');
            editWeekdayButton.addEventListener('click', () => populateFormForRule(host, rule.weekday || {}, 'weekday'));

            const editWeekendButton = document.createElement('button');
            editWeekendButton.textContent = 'Editar (Sáb-Dom)';
            editWeekendButton.classList.add('text-blue-600', 'hover:text-blue-900', 'mr-2');
            editWeekendButton.addEventListener('click', () => populateFormForRule(host, rule.weekend || {}, 'weekend'));

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Eliminar';
            deleteButton.classList.add('text-red-600', 'hover:text-red-900');
            deleteButton.addEventListener('click', async () => {
                if (confirm(`¿Seguro que quieres eliminar la regla para ${host}?`)) {
                    delete currentRules[host];
                    await chrome.storage.local.set({ rules: currentRules });
                    loadRules(); // Recargar
                    showStatus(`Regla para '${host}' eliminada.`, false);
                     // Notificar al background script
                    chrome.runtime.sendMessage({ type: "rulesChanged" }, (response) => {
                        if (chrome.runtime.lastError) {
                            // console.warn("Error al enviar mensaje:", chrome.runtime.lastError.message);
                        } else {
                            // console.log("Message rulesChanged sent after deletion, response:", response);
                        }
                    });
                }
            });

            if (!rule.unrestricted) {
                actionsCell.appendChild(editWeekdayButton);
                actionsCell.appendChild(editWeekendButton);
            }
            actionsCell.appendChild(deleteButton);
            row.appendChild(actionsCell);

            rulesTableBody.appendChild(row);
        }
    }

    function populateFormForRule(host, rule, ruleType = 'weekday') {
        hostnameInput.value = host;
        // unrestrictedCheckbox.checked = !!rule.unrestricted; // Unrestricted is now at the top level
        timeRangesContainer.innerHTML = ''; // Clear existing time ranges

        // Select the correct rule type radio button
        document.getElementById(`ruleType${ruleType.charAt(0).toUpperCase() + ruleType.slice(1)}`).checked = true;


        // Check the top-level unrestricted flag
        chrome.storage.local.get('rules', (result) => {
            const currentRules = result.rules || {};
            const siteRule = currentRules[host] || {};
            unrestrictedCheckbox.checked = !!siteRule.unrestricted;
             limitsSection.style.display = unrestrictedCheckbox.checked ? 'none' : 'block';
        });


        if (rule.dailyLimitMinutes !== null && rule.dailyLimitMinutes !== undefined) {
             dailyLimitInput.value = rule.dailyLimitMinutes;
        } else {
            dailyLimitInput.value = '';
        }

        if (rule.timeRanges && Array.isArray(rule.timeRanges) && rule.timeRanges.length > 0) {
            rule.timeRanges.forEach(range => {
                addTimeRangeInput(range.startTime, range.endTime);
            });
        } else {
             // Add one empty time range input if none exist
             addTimeRangeInput();
        }

        hostnameInput.focus(); // Mover el foco al inicio del formulario
    }

    async function loadUsageStats() {
        console.log("Attempting to load usage stats and get element 'usageStats'"); // Add logging here
         if (!usageStatsDiv) {
             console.error("Element with ID 'usageStats' not found.");
             return;
         }
        usageStatsDiv.innerHTML = ''; // Limpiar

        const today = new Date().toISOString().split('T')[0];
        const usageKeyToday = `usage${today}`;
        const usageTodayData = await chrome.storage.local.get(usageKeyToday);
        const currentUsageToday = usageTodayData[usageKeyToday] || {};

        const { rules } = await chrome.storage.local.get('rules');
        const currentRules = rules || {};


        let foundStats = false;

        // Get all hosts that have usage data or rules (excluding unrestricted)
        const trackedHosts = new Set([
            ...Object.keys(currentUsageToday), // Get hosts from today's usage
            ...Object.keys(currentRules).filter(host => !currentRules[host].unrestricted) // Get hosts from rules
        ]);


        if (trackedHosts.size === 0) {
            usageStatsDiv.innerHTML = '<p>No hay estadísticas de uso disponibles.</p>';
            return;
        }

        // Sort hosts alphabetically for consistent display
        const sortedHosts = Array.from(trackedHosts).sort();

        for (const host of sortedHosts) {
            const usageForHostToday = currentUsageToday[host] || { minutes: 0, seconds: 0, activationTimestamps: [] };
            const siteRule = currentRules[host];
            
            const p = document.createElement('p');
            p.classList.add('flex', 'items-center', 'justify-between', 'text-sm', 'text-gray-700'); // Add flex classes for layout

            const activationCount = (usageForHostToday.activationTimestamps || []).length;
            let statText = `<strong>${host}:</strong> ${usageForHostToday.minutes} minutos, ${usageForHostToday.seconds} segundos, ${activationCount} activaciones hoy.`;
            // Display the relevant daily limit based on today's day of the week
            const todayDayOfWeek = new Date().getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
            const isWeekend = todayDayOfWeek === 0 || todayDayOfWeek === 6;
            const ruleTypeToday = isWeekend ? 'weekend' : 'weekday';
            const dailyLimitToday = siteRule?.[ruleTypeToday]?.dailyLimitMinutes;

            if (dailyLimitToday !== null && dailyLimitToday !== undefined) {
                statText += ` (Límite hoy: ${dailyLimitToday} min).`;
            } else if (siteRule?.unrestricted) {
                 statText += ` (Ilimitado).`;
            } else {
                 statText += ` (Límite hoy: No establecido).`;
            }


            const textSpan = document.createElement('span');
            textSpan.innerHTML = statText;
            p.appendChild(textSpan);

            const createRuleButton = document.createElement('button');
            createRuleButton.textContent = 'Crear Regla';
            createRuleButton.classList.add('ml-4', 'px-3', 'py-1', 'bg-blue-500', 'text-white', 'rounded-md', 'hover:bg-blue-600', 'focus:outline-none', 'focus:ring-2', 'focus:ring-blue-500', 'focus:ring-offset-2', 'text-sm', 'flex-shrink-0');
            createRuleButton.addEventListener('click', () => {
                // When creating a rule from stats, default to weekday rule type
                populateFormForRule(host, { timeRanges: [] }, 'weekday');
            });
            p.appendChild(createRuleButton);

            usageStatsDiv.appendChild(p);
            foundStats = true;
        }

        if (!foundStats) {
            usageStatsDiv.innerHTML = '<p>No hay estadísticas de uso disponibles.</p>';
        }
    }

    function showStatus(message, isError = false) {
        statusP.textContent = message;
        statusP.style.color = isError ? 'red' : 'green';
        setTimeout(() => {
            statusP.textContent = '';
        }, 3000);
    }


    const clearTrackingDataButton = document.getElementById('clearTrackingData');
    clearTrackingDataButton.addEventListener('click', async () => {
        if (confirm("¿Estás seguro de que quieres borrar todos los datos de uso y pestañas visitadas? Las reglas configuradas no se eliminarán.")) {
            // Get all keys that start with 'usage'
            const allStorageKeys = await chrome.storage.local.get(null);
            const usageKeys = Object.keys(allStorageKeys).filter(key => key.startsWith('usage'));
            
            // Remove usage keys and visitedTabs
            await chrome.storage.local.remove([...usageKeys, 'visitedTabs']);

            showStatus("Datos de uso y pestañas visitadas borrados.", false);
            loadUsageStats(); // Recargar estadísticas para mostrar que están vacías
            renderActivationsTable(); // Recargar tabla
        }
    });

    // --- Gráfico de Activaciones ---

    // Set the default date to today
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    activationDateInput.value = todayString;

    // Cargar y renderizar la tabla al iniciar
    renderActivationsTable();

    // Update the table when the time resolution or date changes
    timeResolutionSelect.addEventListener('change', renderActivationsTable);
    activationDateInput.addEventListener('change', renderActivationsTable); // Add event listener for date input

    async function renderActivationsTable() {
        const timeResolution = timeResolutionSelect.value;
        const selectedDateString = activationDateInput.value; // Get the selected date
        const selectedDate = new Date(selectedDateString);

        const selectedDateKey = selectedDate.toISOString().split('T')[0]; // Use selected date for data key
        const usageKeySelectedDate = `usage${selectedDateKey}`;
        const usageDataSelectedDate = await chrome.storage.local.get(usageKeySelectedDate);
        const currentUsageSelectedDate = usageDataSelectedDate[usageKeySelectedDate] || {};


        const now = new Date();
        let overallStartTime = new Date(selectedDate); // Start from the beginning of the selected day
        let bucketSizeMs;
        let timeUnit;

        switch (timeResolution) {
            case 'hour':
                // For 'hour' resolution, we need to consider the time of day *today*
                // relative to the selected date. This might be complex if the selected
                // date is in the past. Let's simplify for now and assume 'hour', '2hours', etc.
                // resolutions are relative to the *end* of the selected day, or the current time if today.
                // A more robust solution might involve picking a specific time on the selected date.
                // For now, let's keep it simple and apply the time resolution window relative to the end of the selected day.
                // If the selected date is today, use the current time as the end point.
                // If the selected date is in the past, use the end of that day as the end point.

                const endPoint = selectedDateKey === todayString ? now : new Date(selectedDate);
                if (selectedDateKey !== todayString) {
                    endPoint.setHours(23, 59, 59, 999);
                }

                overallStartTime = new Date(endPoint);
                overallStartTime.setHours(endPoint.getHours() - 1);
                bucketSizeMs = 10 * 60 * 1000; // 10 minutes buckets
                timeUnit = 'minute';
                break;
            case '2hours':
                 const endPoint2 = selectedDateKey === todayString ? now : new Date(selectedDate);
                if (selectedDateKey !== todayString) {
                    endPoint2.setHours(23, 59, 59, 999);
                }
                overallStartTime = new Date(endPoint2);
                overallStartTime.setHours(endPoint2.getHours() - 2);
                bucketSizeMs = 15 * 60 * 1000; // 15 minutes buckets
                timeUnit = 'minute';
                break;
            case '4hours':
                 const endPoint4 = selectedDateKey === todayString ? now : new Date(selectedDate);
                if (selectedDateKey !== todayString) {
                    endPoint4.setHours(23, 59, 59, 999);
                }
                overallStartTime = new Date(endPoint4);
                overallStartTime.setHours(endPoint4.getHours() - 4);
                bucketSizeMs = 30 * 60 * 1000; // 30 minutes buckets
                timeUnit = 'minute';
                break;
            case '8hours':
                 const endPoint8 = selectedDateKey === todayString ? now : new Date(selectedDate);
                if (selectedDateKey !== todayString) {
                    endPoint8.setHours(23, 59, 59, 999);
                }
                overallStartTime = new Date(endPoint8);
                overallStartTime.setHours(endPoint8.getHours() - 8);
                bucketSizeMs = 60 * 60 * 1000; // 1 hour buckets
                timeUnit = 'hour';
                break;
            case 'day':
            default:
                overallStartTime.setHours(0, 0, 0, 0); // Start of selected day
                bucketSizeMs = 60 * 60 * 1000; // 1 hour buckets
                timeUnit = 'hour';
                break;
        }
        const overallEndTime = selectedDateKey === todayString ? now.getTime() : new Date(selectedDate).setHours(23, 59, 59, 999);


        const aggregatedData = {}; // { host: { bucketStartTime: count } }
        const timeBuckets = new Set();

        for (const host in currentUsageSelectedDate) {
            if (currentUsageSelectedDate[host] && currentUsageSelectedDate[host].activationTimestamps) {
                const timestamps = currentUsageSelectedDate[host].activationTimestamps.filter(ts => ts >= overallStartTime.getTime() && ts <= overallEndTime);

                if (timestamps.length > 0) {
                    aggregatedData[host] = {};
                    for (let ts of timestamps) {
                        const bucketStart = Math.floor(ts / bucketSizeMs) * bucketSizeMs;
                        aggregatedData[host][bucketStart] = (aggregatedData[host][bucketStart] || 0) + 1;
                        timeBuckets.add(bucketStart);
                    }
                }
            }
        }

        // Calculate total activations for each host
        const hostTotals = {};
        for (const host in aggregatedData) {
            hostTotals[host] = Object.values(aggregatedData[host]).reduce((sum, count) => sum + count, 0);
        }

        // Sort hosts by total activations in descending order
        const sortedHosts = Object.keys(aggregatedData).sort((a, b) => hostTotals[b] - hostTotals[a]);
        const sortedTimeBuckets = Array.from(timeBuckets).sort((a, b) => a - b);

        let tableHTML = '<table class="min-w-full divide-y divide-gray-200">';
        tableHTML += '<thead class="bg-gray-50"><tr>';
        tableHTML += '<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sitio Web</th>';

        for (const bucketTime of sortedTimeBuckets) {
            const date = new Date(bucketTime);
            tableHTML += `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</th>`;
        }
        tableHTML += '</tr></thead>';
        tableHTML += '<tbody class="bg-white divide-y divide-gray-200">';

        if (sortedHosts.length === 0) {
            tableHTML += '<tr><td colspan="' + (sortedTimeBuckets.length + 1) + '" class="px-6 py-4 text-center text-sm text-gray-500">No hay datos de activación para mostrar en este período.</td></tr>';
        } else {
            for (const host of sortedHosts) {
                const usageForHostSelectedDate = currentUsageSelectedDate[host] || { minutes: 0, seconds: 0, activationTimestamps: [] };
                tableHTML += '<tr>';
                tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${host}</td>`;
                for (const bucketTime of sortedTimeBuckets) {
                    const count = aggregatedData[host][bucketTime] || 0;
                    tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${count}</td>`;
                }
                // Add Tiempo Hoy column (should be Tiempo en la fecha seleccionada)
                const secondsDisplay = (usageForHostSelectedDate.seconds !== undefined && usageForHostSelectedDate.seconds > 0) ? `, ${usageForHostSelectedDate.seconds} s` : '';
                tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${usageForHostSelectedDate.minutes} min${secondsDisplay}</td>`;
                // Add Action column with button
                tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button class="create-rule-button text-blue-600 hover:text-blue-900" data-host="${host}">Crear Regla</button>
                              </td>`;
                tableHTML += '</tr>';
            }
        }

        tableHTML += '</tbody></table>';

        activationsTableContainer.innerHTML = tableHTML;

        // Add event listeners to the new buttons
        activationsTableContainer.querySelectorAll('.create-rule-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const host = event.target.dataset.host;
                populateFormForRule(host, { timeRanges: [] }, 'weekday'); // Default to weekday when creating rule from stats
            });
        });

        // Display total daily usage below the table
        let totalUsageSummaryHTML = '<div class="mt-6">';
        totalUsageSummaryHTML += '<h3 class="text-lg font-semibold mb-2">Resumen de Uso Diario (' + selectedDateKey + ')</h3>';

        const hostsWithUsage = Object.keys(currentUsageSelectedDate);

        if (hostsWithUsage.length === 0) {
            totalUsageSummaryHTML += '<p class="text-gray-600">No hay datos de uso para esta fecha.</p>';
        } else {
             // Sort hosts alphabetically for consistent display
            const sortedHostsWithUsage = hostsWithUsage.sort();

            for (const host of sortedHostsWithUsage) {
                const usage = currentUsageSelectedDate[host];
                const secondsDisplay = (usage.seconds !== undefined && usage.seconds > 0) ? `, ${usage.seconds} s` : '';
                const activationCount = (usage.activationTimestamps || []).length;
                totalUsageSummaryHTML += `<p class="text-sm text-gray-700"><strong>${host}:</strong> ${usage.minutes} minutos${secondsDisplay}, ${activationCount} activaciones.</p>`;
            }
        }

        totalUsageSummaryHTML += '</div>';
        activationsTableContainer.innerHTML += totalUsageSummaryHTML; // Append the summary below the table

    }

    // Helper function to get host from URL (replicated from background.js for now)
    function getHostFromUrl(urlString) {
        try {
          const url = new URL(urlString);
          if (url.protocol === "http:" || url.protocol === "https:") {
            const hostname = url.hostname;
            const parts = hostname.split('.');
            if (parts.length > 1) {
              if (parts.length > 2 && (parts[parts.length - 2].length <= 3 || parts[parts.length - 1].length <= 2)) {
                 return parts.slice(-3).join('.');
              }
              return parts.slice(-2).join('.');
            }
            return hostname;
          }
        } catch (e) {
          // console.warn("URL inválida o no HTTP/S:", urlString, e);
        }
        return null;
      }
});
