// options.js
document.addEventListener('DOMContentLoaded', () => {
    const hostnameInput = document.getElementById('hostname');
    const unrestrictedCheckbox = document.getElementById('unrestricted');
    const dailyLimitInput = document.getElementById('dailyLimit');
    const timeRangesContainer = document.getElementById('timeRangesContainer');
    const addTimeRangeButton = document.getElementById('addTimeRangeButton');
    const saveRuleButton = document.getElementById('saveRule');
    const rulesListDiv = document.getElementById('rulesList');
    const usageStatsDiv = document.getElementById('usageStats'); 
    const statusP = document.getElementById('status');
    const limitsSection = document.getElementById('limits-section');
    const rulesTableBody = document.getElementById('rulesTableBody');
    const activationsTableContainer = document.getElementById('activationsTableContainer');
    const activationDateInput = document.getElementById('activationDate');
    const timeResolutionSelect = document.getElementById('timeResolution');
    const ruleTypeWeekdayRadio = document.getElementById('ruleTypeWeekday');
    const ruleTypeWeekendRadio = document.getElementById('ruleTypeWeekend');

    // Mode selection elements
    const modeMonitoringRadio = document.getElementById('modeMonitoring');
    const modePermissiveRadio = document.getElementById('modePermissive');
    const modeStrictRadio = document.getElementById('modeStrict');

    // Function to add a time range input group
    function addTimeRangeInput(startTime = '', endTime = '') {
        const timeRangeDiv = document.createElement('div');
        timeRangeDiv.classList.add('time-range-item', 'flex', 'items-center', 'space-x-2', 'mb-2');
        timeRangeDiv.innerHTML = `
            <input type="time" class="start-time px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 w-full">
            <span>hasta</span>
            <input type="time" class="end-time px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 w-full">
            <button type="button" class="remove-time-range px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-sm">X</button>
        `;
        timeRangeDiv.querySelector('.start-time').value = startTime;
        timeRangeDiv.querySelector('.end-time').value = endTime;
        timeRangeDiv.querySelector('.remove-time-range').addEventListener('click', () => {
            timeRangeDiv.remove();
        });
        timeRangesContainer.appendChild(timeRangeDiv);
    }

    // Function to update form limits based on selected rule type (weekday/weekend)
    function updateFormLimitsBasedOnRuleType() {
        const hostname = hostnameInput.value.trim().toLowerCase();
        const selectedRuleType = ruleTypeWeekdayRadio.checked ? 'weekday' : 'weekend';

        chrome.storage.local.get('rules', (result) => {
            const allRules = result.rules || {};
            const siteRule = allRules[hostname]; 

            dailyLimitInput.value = ''; 
            timeRangesContainer.innerHTML = '';

            if (siteRule && !siteRule.unrestricted && siteRule[selectedRuleType]) {
                const specificRuleDetails = siteRule[selectedRuleType];
                dailyLimitInput.value = specificRuleDetails.dailyLimitMinutes !== null && specificRuleDetails.dailyLimitMinutes !== undefined ? specificRuleDetails.dailyLimitMinutes : '';
                
                if (specificRuleDetails.timeRanges && Array.isArray(specificRuleDetails.timeRanges) && specificRuleDetails.timeRanges.length > 0) {
                    specificRuleDetails.timeRanges.forEach(range => {
                        addTimeRangeInput(range.startTime, range.endTime);
                    });
                } else {
                     if (!unrestrictedCheckbox.checked) addTimeRangeInput(); // Add one empty if no ranges and not unrestricted
                }
            } else {
                // No specific rule for this type, or host rule is unrestricted, or no rule for host at all
                if (!unrestrictedCheckbox.checked) addTimeRangeInput(); // Add one empty if not unrestricted
            }
        });
    }

    // Function to populate the form when editing a rule for a specific host
    function populateFormForHost(host) {
        hostnameInput.value = host;
        
        chrome.storage.local.get('rules', (result) => {
            const currentRules = result.rules || {};
            const siteRule = currentRules[host];

            if (siteRule) {
                unrestrictedCheckbox.checked = !!siteRule.unrestricted;
            } else {
                unrestrictedCheckbox.checked = false; // Default for a new rule potentially being created via this path
            }
            limitsSection.style.display = unrestrictedCheckbox.checked ? 'none' : 'block';
            
            ruleTypeWeekdayRadio.checked = true; // Default to showing weekday settings first
            updateFormLimitsBasedOnRuleType(); // Load the weekday settings
        });

        hostnameInput.focus();
        // Scroll to the form for better UX
        const formTitle = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.includes('Añadir/Modificar Regla'));
        if (formTitle) {
            formTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    // Function to clear all input fields in the form
    function clearInputFields() {
        hostnameInput.value = '';
        unrestrictedCheckbox.checked = false;
        limitsSection.style.display = 'block';
        ruleTypeWeekdayRadio.checked = true; // Default to weekday
        // dailyLimitInput and timeRangesContainer will be cleared by updateFormLimitsBasedOnRuleType
        updateFormLimitsBasedOnRuleType(); 
    }

    // Event Listeners for form controls
    ruleTypeWeekdayRadio.addEventListener('change', updateFormLimitsBasedOnRuleType);
    ruleTypeWeekendRadio.addEventListener('change', updateFormLimitsBasedOnRuleType);

    unrestrictedCheckbox.addEventListener('change', () => {
        limitsSection.style.display = unrestrictedCheckbox.checked ? 'none' : 'block';
        if (unrestrictedCheckbox.checked) {
            dailyLimitInput.value = '';
            timeRangesContainer.innerHTML = '';
        } else {
            // When unchecking, load limits for the currently selected radio button
            updateFormLimitsBasedOnRuleType();
        }
    });

    addTimeRangeButton.addEventListener('click', () => {
        addTimeRangeInput();
    });

    // Save Rule Button Event Listener
    saveRuleButton.addEventListener('click', async () => {
        const hostname = hostnameInput.value.trim().toLowerCase();
        if (!hostname) {
            showStatus("El nombre del sitio no puede estar vacío.", true);
            return;
        }
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

        const ruleType = document.querySelector('input[name="ruleType"]:checked').value; // 'weekday' or 'weekend'

        const { rules } = await chrome.storage.local.get('rules');
        let currentRules = rules || {};

        if (!currentRules[hostname]) {
            currentRules[hostname] = {}; // Initialize if new host
        }

        if (isUnrestricted) {
            currentRules[hostname] = { unrestricted: true }; // Overwrites specific weekday/weekend settings
        } else {
            // Ensure weekday/weekend objects exist if we are setting specific rules
            if (!currentRules[hostname].weekday) currentRules[hostname].weekday = {};
            if (!currentRules[hostname].weekend) currentRules[hostname].weekend = {};
            
            // Validate dailyLimit only if not unrestricted
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

            currentRules[hostname][ruleType] = {
                dailyLimitMinutes: dailyLimit || null, // Store null if empty
                timeRanges: timeRanges.length > 0 ? timeRanges : null // Store null if no ranges
            };
            // Remove unrestricted flag if it was set and now we are setting specific limits
            if (currentRules[hostname].unrestricted) {
                delete currentRules[hostname].unrestricted;
            }
        }

        await chrome.storage.local.set({ rules: currentRules });
        showStatus(`Regla para '${hostname}' guardada.`, false);
        loadRules(); 
        clearInputFields();

        chrome.runtime.sendMessage({ type: "rulesChanged" }, (response) => {
            if (chrome.runtime.lastError) { /* console.warn("Error sending message:", chrome.runtime.lastError.message); */ }
        });
    });

    // Function to load and display rules in the table
    async function loadRules() {
        const { rules } = await chrome.storage.local.get('rules');
        const currentRules = rules || {};
        
        if (!rulesListDiv || !rulesTableBody) {
             console.error("Rules list or table body not found.");
             if(rulesListDiv) rulesListDiv.innerHTML = '<p class="text-red-600">Error: Tabla de reglas no encontrada.</p>';
             return;
        }

        rulesTableBody.innerHTML = ''; 
        const tableElement = rulesTableBody.closest('table');

        if (Object.keys(currentRules).length === 0) {
            if (tableElement) { // Check if the table element itself exists
                 rulesTableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No hay reglas configuradas.</td></tr>`;
            } else { // Fallback if the table structure isn't found (e.g. rulesListDiv is used directly)
                rulesListDiv.innerHTML = '<p class="text-gray-600">No hay reglas configuradas.</p>';
            }
            return;
        } else {
            // If rulesListDiv was showing the "no rules" message and now we have rules, clear that message
            // This is to ensure the table is the only content if rules exist.
            const noRulesMsgInListDiv = rulesListDiv.querySelector('p.text-gray-600');
            if (noRulesMsgInListDiv) noRulesMsgInListDiv.remove();
        }

        const today = new Date().toISOString().split('T')[0];
        const usageKeyToday = `usage${today}`;
        const usageTodayData = await chrome.storage.local.get(usageKeyToday);
        const currentUsageToday = usageTodayData[usageKeyToday] || {};

        for (const host in currentRules) {
            const rule = currentRules[host];
            const usageForHostToday = currentUsageToday[host] || { minutes: 0, seconds: 0, activationTimestamps: [] };

            const row = document.createElement('tr');
            row.classList.add('rule-item', 'hover:bg-gray-50');

            // Site Column with Edit button
            const siteCell = document.createElement('td');
            siteCell.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'font-medium', 'text-gray-900', 'flex', 'items-center', 'gap-2', 'justify-start');
            
            const editButton = document.createElement('button');
            editButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 inline-block mr-2 align-middle text-blue-600 hover:text-blue-900"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>`;
            editButton.title = `Editar ${host}`;
            editButton.classList.add('focus:outline-none');
            editButton.addEventListener('click', () => populateFormForHost(host));
            siteCell.appendChild(editButton);

            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = `<svg width="16px" height="16px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#ff0000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M18 6L17.1991 18.0129C17.129 19.065 17.0939 19.5911 16.8667 19.99C16.6666 20.3412 16.3648 20.6235 16.0011 20.7998C15.588 21 15.0607 21 14.0062 21H9.99377C8.93927 21 8.41202 21 7.99889 20.7998C7.63517 20.6235 7.33339 20.3412 7.13332 19.99C6.90607 19.5911 6.871 19.065 6.80086 18.0129L6 6M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M14 10V17M10 10V17" stroke="#ff0000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </g></svg>`
            deleteButton.classList.add('text-red-600', 'hover:text-red-900', 'focus:outline-none', 'pr-2');
            deleteButton.addEventListener('click', async () => {
                if (confirm(`¿Seguro que quieres eliminar la regla para ${host}?`)) {
                    const { rules: freshRules } = await chrome.storage.local.get('rules');
                    let modifiableRules = freshRules || {};
                    delete modifiableRules[host];
                    await chrome.storage.local.set({ rules: modifiableRules });
                    loadRules(); 
                    showStatus(`Regla para '${host}' eliminada.`, false);
                    chrome.runtime.sendMessage({ type: "rulesChanged" }, (response) => {
                        if (chrome.runtime.lastError) { /* console.warn("Error sending message:", chrome.runtime.lastError.message); */ }
                    });
                }
            });
            siteCell.appendChild(deleteButton);

            const hostTextNode = document.createTextNode(host);
            siteCell.appendChild(hostTextNode);
            row.appendChild(siteCell);

            // Weekday Limits & Timeframes Column
            const weekdayCell = document.createElement('td');
            weekdayCell.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-500');
            if (rule.unrestricted) {
                weekdayCell.textContent = 'Ilimitado';
            } else if (rule.weekday) {
                const wdLimit = (rule.weekday.dailyLimitMinutes !== null && rule.weekday.dailyLimitMinutes !== undefined) ? `${rule.weekday.dailyLimitMinutes} min` : 'Sin límite diario';
                const wdRanges = (rule.weekday.timeRanges && Array.isArray(rule.weekday.timeRanges) && rule.weekday.timeRanges.length > 0)
                    ? rule.weekday.timeRanges.map(range => `${range.startTime || 'N/A'}-${range.endTime || 'N/A'}`).join(', ')
                    : 'Todo el día';
                weekdayCell.innerHTML = `${wdLimit}<br>${wdRanges}`;
            } else {
                weekdayCell.textContent = 'No establecido';
            }
            row.appendChild(weekdayCell);

            // Weekend Limits & Timeframes Column
            const weekendCell = document.createElement('td');
            weekendCell.classList.add('px-6', 'py-4', 'whitespace-nowrap', 'text-sm', 'text-gray-500');
            if (rule.unrestricted) {
                weekendCell.textContent = 'Ilimitado';
            } else if (rule.weekend) {
                const weLimit = (rule.weekend.dailyLimitMinutes !== null && rule.weekend.dailyLimitMinutes !== undefined) ? `${rule.weekend.dailyLimitMinutes} min` : 'Sin límite diario';
                const weRanges = (rule.weekend.timeRanges && Array.isArray(rule.weekend.timeRanges) && rule.weekend.timeRanges.length > 0)
                    ? rule.weekend.timeRanges.map(range => `${range.startTime || 'N/A'}-${range.endTime || 'N/A'}`).join(', ')
                    : 'Todo el día';
                weekendCell.innerHTML = `${weLimit}<br>${weRanges}`;
            } else {
                weekendCell.textContent = 'No establecido';
            }
            row.appendChild(weekendCell);
            
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

            rulesTableBody.appendChild(row);
        }
    }

    // Function to show status messages
    function showStatus(message, isError = false) {
        statusP.textContent = message;
        statusP.style.color = isError ? 'red' : 'green';
        setTimeout(() => {
            statusP.textContent = '';
        }, 3000);
    }

    // Function to save the selected operation mode
    async function saveOperationMode(mode) {
        await chrome.storage.local.set({ operationMode: mode });
        showStatus(`Modo de operación cambiado a '${mode}'.`, false);
    }

    // Function to load the saved operation mode
    async function loadOperationMode() {
        const result = await chrome.storage.local.get('operationMode');
        const savedMode = result.operationMode || 'permissive'; // Default to permissive

        switch (savedMode) {
            case 'monitoring':
                modeMonitoringRadio.checked = true;
                break;
            case 'strict':
                modeStrictRadio.checked = true;
                break;
            case 'permissive':
            default:
                modePermissiveRadio.checked = true;
                break;
        }
    }

    // Event listeners for mode selection
    modeMonitoringRadio.addEventListener('change', () => saveOperationMode('monitoring'));
    modePermissiveRadio.addEventListener('change', () => saveOperationMode('permissive'));
    modeStrictRadio.addEventListener('change', () => saveOperationMode('strict'));


    // Load initial data
    loadRules();
    loadOperationMode(); // Load the saved mode on page load

    // --- Handle Activations Table Date Input Initialization and Rendering ---
    function initializeActivationsTable() {
        const activationDateInput = document.getElementById('activationDate');
        const activationsTableContainer = document.getElementById('activationsTableContainer');
        const timeResolutionSelect = document.getElementById('timeResolution');

        if (activationDateInput && activationsTableContainer && timeResolutionSelect) {
            const todayForActivation = new Date();
            const todayStringForActivation = todayForActivation.toISOString().split('T')[0];
            activationDateInput.value = todayStringForActivation;

            renderActivationsTable(); // Initial render

            // Add event listeners after the element is confirmed to exist
            timeResolutionSelect.addEventListener('change', renderActivationsTable);
            activationDateInput.addEventListener('change', renderActivationsTable);

        } else {
            console.log("Activations table elements not yet found. Retrying initialization...");
            // Retry initialization after a short delay
            setTimeout(initializeActivationsTable, 50); 
        }
    }

    // Start the initialization process
    initializeActivationsTable();
    // --- End Handle Activations Table ---


    // --- Placeholder for loadUsageStats if it's still needed ---
    async function loadUsageStats() {
        if (!usageStatsDiv) {
            // console.error("Element with ID 'usageStats' not found for loadUsageStats.");
            return;
        }
        usageStatsDiv.innerHTML = '<p>Estadísticas de uso no implementadas en esta sección.</p>';
    }
    // loadUsageStats(); // Call if this section is to be active

    // Clear Tracking Data Button
    const clearTrackingDataButton = document.getElementById('clearTrackingData');
    if (clearTrackingDataButton) { // Check if element exists
        clearTrackingDataButton.addEventListener('click', async () => {
            if (confirm("¿Estás seguro de que quieres borrar todos los datos de uso y pestañas visitadas? Las reglas configuradas no se eliminarán.")) {
                const allStorageKeys = await chrome.storage.local.get(null);
                const usageKeys = Object.keys(allStorageKeys).filter(key => key.startsWith('usage'));
                await chrome.storage.local.remove([...usageKeys, 'visitedTabs']);
                showStatus("Datos de uso y pestañas visitadas borrados.", false);
                if (typeof loadUsageStats === "function") loadUsageStats(); 
                if (typeof renderActivationsTable === "function") renderActivationsTable();
            }
        });
    } else {
        console.error("clearTrackingDataButton element not found!");
    }


    // --- Activations Table Logic (renderActivationsTable) ---
    // This function is now called by initializeActivationsTable and its event listeners

    async function renderActivationsTable() {
        const activationsTableContainer = document.getElementById('activationsTableContainer');
        const timeResolutionSelect = document.getElementById('timeResolution');
        const activationDateInput = document.getElementById('activationDate');

        if (!activationsTableContainer || !timeResolutionSelect || !activationDateInput) {
            console.error("Activations table elements not found in renderActivationsTable. Skipping render.");
            return;
        }

        const timeResolution = timeResolutionSelect.value;
        const selectedDateString = activationDateInput.value;

        if (!selectedDateString) {
            console.error("Selected date string is empty. Cannot render activations table.");
            activationsTableContainer.innerHTML = '<p class="text-red-500">Por favor, seleccione una fecha válida.</p>';
            return;
        }

        const selectedDate = new Date(selectedDateString);
        if (isNaN(selectedDate.getTime())) { // Check if selectedDate is a valid Date object
            console.error("Invalid date selected:", selectedDateString);
            activationsTableContainer.innerHTML = '<p class="text-red-500">La fecha seleccionada no es válida.</p>';
            return;
        }

        const selectedDateKey = selectedDate.toISOString().split('T')[0];
        const usageKeySelectedDate = `usage${selectedDateKey}`;
        const usageDataSelectedDateResult = await chrome.storage.local.get(usageKeySelectedDate);
        const currentUsageSelectedDate = usageDataSelectedDateResult[usageKeySelectedDate] || {};


        const now = new Date();
        let overallStartTime = new Date(selectedDate); 
        let overallEndTime = new Date(selectedDate);
        overallEndTime.setHours(23,59,59,999); // End of selected day

        let bucketSizeMs;

        switch (timeResolution) {
            case 'hour':
                overallStartTime = new Date(now.getTime() - 1 * 60 * 60 * 1000);
                overallEndTime = now; // up to current time
                bucketSizeMs = 10 * 60 * 1000; // 10 minutes
                break;
            case '2hours':
                overallStartTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);
                overallEndTime = now;
                bucketSizeMs = 15 * 60 * 1000; // 15 minutes
                break;
            case '4hours':
                overallStartTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
                overallEndTime = now;
                bucketSizeMs = 30 * 60 * 1000; // 30 minutes
                break;
            case '8hours':
                overallStartTime = new Date(now.getTime() - 8 * 60 * 60 * 1000);
                overallEndTime = now;
                bucketSizeMs = 60 * 60 * 1000; // 1 hour
                break;
            case 'day':
            default: // Full selected day
                overallStartTime.setHours(0, 0, 0, 0);
                // overallEndTime is already set to end of selected day
                bucketSizeMs = 60 * 60 * 1000; // 1 hour
                break;
        }
        
        // If selectedDate is not today, and resolution is not 'day', adjust overallStartTime and overallEndTime to be within the selected day
        if (selectedDateKey !== now.toISOString().split('T')[0] && timeResolution !== 'day') {
            // This case needs careful handling if we want to show past hour-based resolutions
            // For now, 'day' resolution is the primary one for past dates.
            // Let's ensure for past dates, we only show 'day' resolution effectively or make it clear.
            // Or, for simplicity, if not 'day', and past date, show full day.
             overallStartTime = new Date(selectedDate); overallStartTime.setHours(0,0,0,0);
             overallEndTime = new Date(selectedDate); overallEndTime.setHours(23,59,59,999);
             if (timeResolution !== 'day') bucketSizeMs = 60 * 60 * 1000; // Default to hourly for past days if not 'day'
        }


        const aggregatedData = {}; 
        const timeBuckets = new Set();

        for (const host in currentUsageSelectedDate) {
            if (currentUsageSelectedDate[host] && currentUsageSelectedDate[host].activationTimestamps) {
                const timestamps = currentUsageSelectedDate[host].activationTimestamps.filter(ts => ts >= overallStartTime.getTime() && ts <= overallEndTime.getTime());

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

        const hostTotals = {};
        for (const host in aggregatedData) {
            hostTotals[host] = Object.values(aggregatedData[host]).reduce((sum, count) => sum + count, 0);
        }

        const sortedHosts = Object.keys(aggregatedData).sort((a, b) => hostTotals[b] - hostTotals[a]);
        const sortedTimeBuckets = Array.from(timeBuckets).sort((a, b) => a - b);

        let tableHTML = '<table class="min-w-full divide-y divide-gray-200">';
        tableHTML += '<thead class="bg-gray-50"><tr>';
        tableHTML += '<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sitio Web</th>';

        for (const bucketTime of sortedTimeBuckets) {
            const date = new Date(bucketTime);
            tableHTML += `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</th>`;
        }
        // Add empty header for "Tiempo Total" and "Acción" if needed, or adjust colspan
        if (sortedHosts.length > 0) {
            tableHTML += '<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tiempo Total</th>';
            tableHTML += '<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>';
        }
        tableHTML += '</tr></thead>';
        tableHTML += '<tbody class="bg-white divide-y divide-gray-200">';

        if (sortedHosts.length === 0) {
            const colspan = sortedTimeBuckets.length > 0 ? sortedTimeBuckets.length + 1 + 2 : 1 + 2; // Site + Buckets + Total + Action
            tableHTML += `<tr><td colspan="${colspan}" class="px-6 py-4 text-center text-sm text-gray-500">No hay datos de activación para mostrar en este período.</td></tr>`;
        } else {
            for (const host of sortedHosts) {
                const usageForHostSelectedDate = currentUsageSelectedDate[host] || { minutes: 0, seconds: 0, activationTimestamps: [] };
                tableHTML += '<tr>';
                tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${host}</td>`;
                for (const bucketTime of sortedTimeBuckets) {
                    const count = aggregatedData[host][bucketTime] || 0;
                    tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${count}</td>`;
                }
                const totalMinutes = usageForHostSelectedDate.minutes || 0;
                const totalSeconds = usageForHostSelectedDate.seconds || 0;
                const secondsDisplay = totalSeconds > 0 ? `, ${totalSeconds} s` : '';
                tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${totalMinutes} min${secondsDisplay}</td>`;
                tableHTML += `<td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button class="create-rule-button text-blue-600 hover:text-blue-900" data-host="${host}">Crear/Editar Regla</button>
                              </td>`;
                tableHTML += '</tr>';
            }
        }
        tableHTML += '</tbody></table>';
        activationsTableContainer.innerHTML = tableHTML;

        activationsTableContainer.querySelectorAll('.create-rule-button').forEach(button => {
            button.addEventListener('click', (event) => {
                const host = event.target.dataset.host;
                populateFormForHost(host);
            });
        });

        // Summary below table
        let totalUsageSummaryHTML = '<div class="mt-6">';
        totalUsageSummaryHTML += `<h3 class="text-lg font-semibold mb-2">Resumen de Uso para ${selectedDateKey}</h3>`;
        const hostsWithUsage = Object.keys(currentUsageSelectedDate);
        if (hostsWithUsage.length === 0) {
            totalUsageSummaryHTML += '<p class="text-gray-600">No hay datos de uso para esta fecha.</p>';
        } else {
            const sortedHostsForSummary = hostsWithUsage.sort();
            for (const host of sortedHostsForSummary) {
                const usage = currentUsageSelectedDate[host];
                const sDisplay = (usage.seconds !== undefined && usage.seconds > 0) ? `, ${usage.seconds} s` : '';
                const actCount = (usage.activationTimestamps || []).length;
                totalUsageSummaryHTML += `<p class="text-sm text-gray-700"><strong>${host}:</strong> ${usage.minutes} minutos${sDisplay}, ${actCount} activaciones.</p>`;
            }
        }
        totalUsageSummaryHTML += '</div>';
        // Append summary. Ensure it doesn't overwrite the table if table is also in activationsTableContainer.
        // A good practice is to have a separate div for the summary.
        // For now, appending:
        const summaryDivId = 'activationsSummary';
        let summaryDiv = document.getElementById(summaryDivId);
        if (!summaryDiv) {
            summaryDiv = document.createElement('div');
            summaryDiv.id = summaryDivId;
            activationsTableContainer.parentNode.insertBefore(summaryDiv, activationsTableContainer.nextSibling);
        }
        summaryDiv.innerHTML = totalUsageSummaryHTML;
    }
});
