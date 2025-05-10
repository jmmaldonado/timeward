// options.js
document.addEventListener('DOMContentLoaded', () => {
    const hostnameInput = document.getElementById('hostname');
    const unrestrictedCheckbox = document.getElementById('unrestricted');
    const dailyLimitInput = document.getElementById('dailyLimit');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const saveRuleButton = document.getElementById('saveRule');
    const rulesListDiv = document.getElementById('rulesList');
    const usageStatsDiv = document.getElementById('usageStats');
    const statusP = document.getElementById('status');
    const limitsSection = document.getElementById('limits-section');

    // Cargar reglas y estadísticas al iniciar
    loadRules();
    loadUsageStats();

    unrestrictedCheckbox.addEventListener('change', () => {
        limitsSection.style.display = unrestrictedCheckbox.checked ? 'none' : 'block';
        if (unrestrictedCheckbox.checked) {
            dailyLimitInput.value = '';
            startTimeInput.value = '';
            endTimeInput.value = '';
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
        const startTime = startTimeInput.value;
        const endTime = endTimeInput.value;

        const { rules } = await chrome.storage.local.get('rules');
        const currentRules = rules || {};

        if (isUnrestricted) {
            currentRules[hostname] = { unrestricted: true };
        } else {
            if (isNaN(dailyLimit) || dailyLimit < 0) {
                showStatus("El límite diario debe ser un número positivo.", true);
                return;
            }
            if (startTime && endTime && startTime >= endTime) {
                showStatus("La hora de inicio debe ser anterior a la hora de fin.", true);
                return;
            }
            currentRules[hostname] = {
                dailyLimitMinutes: dailyLimit || null, // Guardar null si está vacío
                startTime: startTime || null,
                endTime: endTime || null
            };
        }

        await chrome.storage.local.set({ rules: currentRules });
        showStatus(`Regla para '${hostname}' guardada.`, false);
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

    function clearInputFields() {
        hostnameInput.value = '';
        unrestrictedCheckbox.checked = false;
        dailyLimitInput.value = '';
        startTimeInput.value = '';
        endTimeInput.value = '';
        limitsSection.style.display = 'block';
    }

    async function loadRules() {
        const { rules, usageData } = await chrome.storage.local.get(['rules', 'usageData']);
        const currentRules = rules || {};
        const currentUsage = usageData || {};
        rulesListDiv.innerHTML = ''; // Limpiar lista actual

        if (Object.keys(currentRules).length === 0) {
            rulesListDiv.innerHTML = '<p class="text-gray-600">No hay reglas configuradas.</p>';
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        for (const host in currentRules) {
            const rule = currentRules[host];
            const usageToday = (currentUsage[host] && currentUsage[host][today]) ? currentUsage[host][today] : { minutes: 0, seconds: 0, activationTimestamps: [] };

            const ruleDiv = document.createElement('div');
            ruleDiv.classList.add('rule-item', 'flex', 'items-center', 'justify-between', 'p-4', 'border', 'border-gray-200', 'rounded-md', 'bg-white', 'shadow-sm');

            let details = `<div class="flex-1">
                                <h3 class="text-lg font-semibold text-gray-800">${host}</h3>`;
            if (rule.unrestricted) {
                details += `<p class="text-sm text-gray-600">Acceso ilimitado.</p>`;
            } else {
                details += `<p class="text-sm text-gray-600">Límite diario: ${rule.dailyLimitMinutes !== null && rule.dailyLimitMinutes !== undefined ? rule.dailyLimitMinutes + ' minutos' : 'No establecido'}</p>`;
                details += `<p class="text-sm text-gray-600">Horario: ${rule.startTime || 'N/A'} - ${rule.endTime || 'N/A'}</p>`;
            }
            details += `</div>`;

            // Add usage stats to the rule item
            const activationCount = (usageToday.activationTimestamps || []).length;
            details += `<div class="flex-shrink-0 text-right ml-4">
                            <p class="text-sm text-gray-700">${usageToday.minutes} min, ${usageToday.seconds} s, ${activationCount} activaciones hoy</p>
                        </div>`;


            const actionsDiv = document.createElement('div');
            actionsDiv.classList.add('flex-shrink-0', 'ml-4', 'flex', 'space-x-2');

            const editButton = document.createElement('button');
            editButton.textContent = 'Editar';
            editButton.classList.add('px-3', 'py-1', 'bg-blue-500', 'text-white', 'rounded-md', 'hover:bg-blue-600', 'focus:outline-none', 'focus:ring-2', 'focus:ring-blue-500', 'focus:ring-offset-2', 'text-sm');
            editButton.addEventListener('click', () => populateFormForRule(host, rule));

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Eliminar';
            deleteButton.classList.add('px-3', 'py-1', 'bg-red-500', 'text-white', 'rounded-md', 'hover:bg-red-600', 'focus:outline-none', 'focus:ring-2', 'focus:ring-red-500', 'focus:ring-offset-2', 'text-sm');
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
                            // console.log("Mensaje rulesChanged enviado tras eliminar, respuesta:", response);
                        }
                    });
                }
            });

            ruleDiv.innerHTML = details;
            actionsDiv.appendChild(editButton);
            actionsDiv.appendChild(deleteButton);
            ruleDiv.appendChild(actionsDiv);
            rulesListDiv.appendChild(ruleDiv);
        }
    }
    
    function populateFormForRule(host, rule) {
        hostnameInput.value = host;
        unrestrictedCheckbox.checked = !!rule.unrestricted;
        if (rule.unrestricted) {
            dailyLimitInput.value = '';
            startTimeInput.value = '';
            endTimeInput.value = '';
        } else {
            dailyLimitInput.value = rule.dailyLimitMinutes !== null && rule.dailyLimitMinutes !== undefined ? rule.dailyLimitMinutes : '';
            startTimeInput.value = rule.startTime || '';
            endTimeInput.value = rule.endTime || '';
        }
        limitsSection.style.display = unrestrictedCheckbox.checked ? 'none' : 'block';
        hostnameInput.focus(); // Mover el foco al inicio del formulario
    }

    async function loadUsageStats() {
        const { usageData, rules } = await chrome.storage.local.get(['usageData', 'rules']);
        const currentUsage = usageData || {};
        const currentRules = rules || {};
        usageStatsDiv.innerHTML = ''; // Limpiar

        const today = new Date().toISOString().split('T')[0];
        let foundStats = false;

        // Get all hosts that have usage data or rules (excluding unrestricted)
        const trackedHosts = new Set([
            ...Object.keys(currentUsage),
            ...Object.keys(currentRules).filter(host => !currentRules[host].unrestricted)
        ]);


        if (trackedHosts.size === 0) {
            usageStatsDiv.innerHTML = '<p>No hay estadísticas de uso disponibles.</p>';
            return;
        }

        // Sort hosts alphabetically for consistent display
        const sortedHosts = Array.from(trackedHosts).sort();

        for (const host of sortedHosts) {
            const usageToday = (currentUsage[host] && currentUsage[host][today]) ? currentUsage[host][today] : { minutes: 0, seconds: 0, activationTimestamps: [] };
            const siteRule = currentRules[host];
            
            const p = document.createElement('p');
            p.classList.add('flex', 'items-center', 'justify-between', 'text-sm', 'text-gray-700'); // Add flex classes for layout

            const activationCount = (usageToday.activationTimestamps || []).length;
            let statText = `<strong>${host}:</strong> ${usageToday.minutes} minutos, ${usageToday.seconds} segundos, ${activationCount} activaciones hoy.`;
            if (siteRule && siteRule.dailyLimitMinutes) {
                statText += ` (Límite: ${siteRule.dailyLimitMinutes} min).`;
            }
            
            const textSpan = document.createElement('span');
            textSpan.innerHTML = statText;
            p.appendChild(textSpan);

            const createRuleButton = document.createElement('button');
            createRuleButton.textContent = 'Crear Regla';
            createRuleButton.classList.add('ml-4', 'px-3', 'py-1', 'bg-blue-500', 'text-white', 'rounded-md', 'hover:bg-blue-600', 'focus:outline-none', 'focus:ring-2', 'focus:ring-blue-500', 'focus:ring-offset-2', 'text-sm', 'flex-shrink-0');
            createRuleButton.addEventListener('click', () => {
                populateFormForRule(host, {}); // Populate form with host and empty rule
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

    // Actualizar estadísticas periódicamente o cuando se abra el popup
    setInterval(loadUsageStats, 30 * 1000); // Cada 30 segundos

    const clearTrackingDataButton = document.getElementById('clearTrackingData');
    clearTrackingDataButton.addEventListener('click', async () => {
        if (confirm("¿Estás seguro de que quieres borrar todos los datos de uso y pestañas visitadas? Las reglas configuradas no se eliminarán.")) {
            await chrome.storage.local.remove(['usageData', 'visitedTabs']);
            showStatus("Datos de uso y pestañas visitadas borrados.", false);
            loadUsageStats(); // Recargar estadísticas para mostrar que están vacías
            renderActivationsTable(); // Recargar tabla
        }
    });

    // --- Gráfico de Activaciones ---
    const timeResolutionSelect = document.getElementById('timeResolution');
    const activationsTableContainer = document.getElementById('activationsTableContainer'); // New container for the table
    const activationDateInput = document.getElementById('activationDate'); // Get the new date input

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

        const { usageData } = await chrome.storage.local.get('usageData');
        const currentUsage = usageData || {};
        const selectedDateKey = selectedDate.toISOString().split('T')[0]; // Use selected date for data key

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

        for (const host in currentUsage) {
            if (currentUsage[host] && currentUsage[host][selectedDateKey] && currentUsage[host][selectedDateKey].activationTimestamps) {
                const timestamps = currentUsage[host][selectedDateKey].activationTimestamps.filter(ts => ts >= overallStartTime.getTime() && ts <= overallEndTime);

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
                tableHTML += '<tr>';
                tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${host}</td>`;
                for (const bucketTime of sortedTimeBuckets) {
                    const count = aggregatedData[host][bucketTime] || 0;
                    tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${count}</td>`;
                }
                tableHTML += '</tr>';
            }
        }

        tableHTML += '</tbody></table>';

        activationsTableContainer.innerHTML = tableHTML;
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
