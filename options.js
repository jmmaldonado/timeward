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
                console.warn("Error al enviar mensaje a background:", chrome.runtime.lastError.message);
            } else {
                console.log("Mensaje rulesChanged enviado, respuesta:", response);
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
            const usageToday = (currentUsage[host] && currentUsage[host][today]) ? currentUsage[host][today] : { minutes: 0, activations: 0 };

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
            details += `<div class="flex-shrink-0 text-right ml-4">
                            <p class="text-sm text-gray-700">${usageToday.minutes} min, ${usageToday.activations} activaciones hoy</p>
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
                        if (chrome.runtime.lastError) console.warn("Error al enviar mensaje:", chrome.runtime.lastError.message);
                        else console.log("Mensaje rulesChanged enviado tras eliminar, respuesta:", response);
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
            const usageToday = (currentUsage[host] && currentUsage[host][today]) ? currentUsage[host][today] : { minutes: 0, activations: 0 };
            const siteRule = currentRules[host];
            
            const p = document.createElement('p');
            let statText = `<strong>${host}:</strong> ${usageToday.minutes} minutos, ${usageToday.activations} activaciones hoy.`;
            if (siteRule && siteRule.dailyLimitMinutes) {
                statText += ` (Límite: ${siteRule.dailyLimitMinutes} min).`;
            }
            p.innerHTML = statText;
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
        }
    });
});
