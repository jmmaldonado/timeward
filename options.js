// options.js
document.addEventListener('DOMContentLoaded', async () => { // Make async for initial password check
    // Existing elements
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
    const clearTrackingDataButton = document.getElementById('clearTrackingData');

    // Password related elements
    const createPasswordSection = document.getElementById('create-password-section');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const savePasswordButton = document.getElementById('savePasswordButton');
    const passwordStatusP = document.getElementById('passwordStatus');
    const unlockSection = document.getElementById('unlock-section');
    const passwordInput = document.getElementById('passwordInput');
    const unlockButton = document.getElementById('unlockButton');
    const unlockStatusP = document.getElementById('unlockStatus');
    const configSection = document.getElementById('config-section');
    const lockButton = document.getElementById('lockButton');

    // Mode selection elements (new buttons)
    const modeMonitoringButton = document.getElementById('modeMonitoringButton');
    const modePermissiveButton = document.getElementById('modePermissiveButton');
    const modeStrictButton = document.getElementById('modeStrictButton');
    const modeButtons = [modeMonitoringButton, modePermissiveButton, modeStrictButton].filter(Boolean); // Filter out nulls if an ID is wrong


    // Temporary Disable elements
    const disableDurationInput = document.getElementById('disableDuration');
    const activateDisableButton = document.getElementById('activateDisableButton');
    const disableStatusP = document.getElementById('disableStatus');
    const disableProgressSection = document.getElementById('disable-progress-section');
    const disableProgressBar = document.getElementById('disable-progress-bar');
    const disableTimerCountdown = document.getElementById('disable-timer-countdown');
    const disableProgressMessage = document.getElementById('disable-progress-message');

    // Locked screen elements
    const lockedRulesSummarySection = document.getElementById('locked-rules-summary-section');
    const lockedRulesListDiv = document.getElementById('locked-rules-list');
    const lockedDisableProgressSection = document.getElementById('locked-disable-progress-section');
    const lockedDisableProgressBar = document.getElementById('locked-disable-progress-bar');
    const lockedDisableTimerCountdown = document.getElementById('locked-disable-timer-countdown');
    const lockedDisableProgressMessage = document.getElementById('locked-disable-progress-message');
    const cancelTemporaryDisableButton = document.getElementById('cancelTemporaryDisableButton');
    const cancelTemporaryDisableLockedButton = document.getElementById('cancelTemporaryDisableLockedButton');


    // Global Daily Limits elements
    const globalDailyLimitWeekdayInput = document.getElementById('globalDailyLimitWeekday');
    const globalDailyLimitWeekendInput = document.getElementById('globalDailyLimitWeekend');
    const saveGlobalLimitsButton = document.getElementById('saveGlobalLimitsButton');
    const globalLimitsStatusP = document.getElementById('globalLimitsStatus');


    let isUnlocked = false; // State variable to track if config is accessible

    // --- Password Handling Functions ---

    function showPasswordStatus(message, isError = true) {
        passwordStatusP.textContent = message;
        passwordStatusP.style.color = isError ? 'red' : 'green';
        if (!isError) {
            setTimeout(() => { passwordStatusP.textContent = ''; }, 3000);
        }
    }

    function showUnlockStatus(message, isError = true) {
        unlockStatusP.textContent = message;
        unlockStatusP.style.color = isError ? 'red' : 'green';
        if (!isError) {
            setTimeout(() => { unlockStatusP.textContent = ''; }, 3000);
        }
    }

    function lockConfiguration() {
        isUnlocked = false;
        if(configSection) configSection.classList.add('hidden');
        if(unlockSection) unlockSection.classList.remove('hidden');
        if(createPasswordSection) createPasswordSection.classList.add('hidden'); // Ensure create is hidden when locking
        if(passwordInput) passwordInput.value = ''; // Clear password field on lock
        if(unlockStatusP) unlockStatusP.textContent = ''; // Clear any previous unlock errors
        displayLockedRulesSummary(); // Show summary of rules when locked
        updateDisableProgress(); // Also update progress bar in locked view
        if(lockedRulesSummarySection && rulesCache) lockedRulesSummarySection.classList.toggle('hidden', Object.keys(rulesCache).length === 0);
    }

    function unlockConfiguration() {
        isUnlocked = true;
        if(configSection) configSection.classList.remove('hidden');
        if(unlockSection) unlockSection.classList.add('hidden');
        if(createPasswordSection) createPasswordSection.classList.add('hidden');
        if(passwordInput) passwordInput.value = ''; // Clear password field on unlock
        if(unlockStatusP) unlockStatusP.textContent = '';
        if(lockedRulesSummarySection) lockedRulesSummarySection.classList.add('hidden'); // Hide locked summary
        if(lockedDisableProgressSection) lockedDisableProgressSection.classList.add('hidden'); // Hide locked progress bar

        // Load rules and settings only after unlocking
        loadRules();
        loadOperationMode();
        loadGlobalLimits(); // Load global limits
        initializeActivationsTable(); // Initialize or re-render activations table
        updateDisableProgress(); // Update progress bar in main config view
    }

    // --- End Password Handling Functions ---

    // --- Temporary Disable Progress Bar Logic ---
    let disableIntervalId = null;

    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
    }

    async function updateDisableProgress() {
        const { temporaryDisableEndTime, temporaryDisableDuration } = await chrome.storage.local.get(['temporaryDisableEndTime', 'temporaryDisableDuration']);

        if (disableIntervalId) {
            clearInterval(disableIntervalId);
            disableIntervalId = null;
        }

        const now = Date.now();
        if (temporaryDisableEndTime && temporaryDisableEndTime > now) {
            const totalDurationMs = temporaryDisableDuration * 60 * 1000; // Original duration in ms
            
            const updateView = () => {
                const currentTime = Date.now();
                const remainingTimeMs = temporaryDisableEndTime - currentTime;

                if (remainingTimeMs <= 0) {
                    if (disableIntervalId) clearInterval(disableIntervalId);
                    disableIntervalId = null;
                    if(disableProgressSection) disableProgressSection.classList.add('hidden');
                    if(lockedDisableProgressSection) lockedDisableProgressSection.classList.add('hidden');
                    chrome.storage.local.remove(['temporaryDisableEndTime', 'temporaryDisableDuration']);
                    if (isUnlocked && disableStatusP) {
                        disableStatusP.textContent = 'La desactivación temporal ha finalizado.';
                        disableStatusP.style.color = 'green';
                        setTimeout(() => { if(disableStatusP) disableStatusP.textContent = ''; }, 3000);
                    }
                    return;
                }

                const elapsedMs = totalDurationMs - remainingTimeMs;
                const progressPercentage = Math.min(100, (elapsedMs / totalDurationMs) * 100);
                const remainingSeconds = Math.ceil(remainingTimeMs / 1000);
                const timeString = formatTime(remainingSeconds);

                if (isUnlocked) {
                    if(disableProgressSection) disableProgressSection.classList.remove('hidden');
                    if(disableProgressBar) disableProgressBar.style.width = `${progressPercentage}%`;
                    if(disableTimerCountdown) disableTimerCountdown.textContent = timeString;
                    if(disableProgressMessage) disableProgressMessage.textContent = `Extensión desactivada. Tiempo restante:`;
                    if(lockedDisableProgressSection) lockedDisableProgressSection.classList.add('hidden');
                } else { // Locked
                    if(lockedDisableProgressSection) lockedDisableProgressSection.classList.remove('hidden');
                    if(lockedDisableProgressBar) lockedDisableProgressBar.style.width = `${progressPercentage}%`;
                    if(lockedDisableTimerCountdown) lockedDisableTimerCountdown.textContent = timeString;
                    if(lockedDisableProgressMessage) lockedDisableProgressMessage.textContent = `Extensión desactivada. Tiempo restante:`;
                    if(disableProgressSection) disableProgressSection.classList.add('hidden');
                }
            };

            updateView(); // Initial call
            disableIntervalId = setInterval(updateView, 1000);
        } else {
            if(disableProgressSection) disableProgressSection.classList.add('hidden');
            if(lockedDisableProgressSection) lockedDisableProgressSection.classList.add('hidden');
            if (temporaryDisableEndTime && temporaryDisableEndTime <= now) { // Expired
                 chrome.storage.local.remove(['temporaryDisableEndTime', 'temporaryDisableDuration']);
            }
        }
    }
    // --- End Temporary Disable Progress Bar Logic ---


    // --- Global Daily Limits Functions ---
    async function saveGlobalLimits() {
        if (!isUnlocked) {
            globalLimitsStatusP.textContent = "Desbloquea la configuración para guardar.";
            globalLimitsStatusP.style.color = 'red';
            setTimeout(() => { globalLimitsStatusP.textContent = ''; }, 3000);
            return;
        }

        const weekdayLimitValue = globalDailyLimitWeekdayInput.value.trim();
        const weekendLimitValue = globalDailyLimitWeekendInput.value.trim();

        const weekdayLimit = weekdayLimitValue === '' ? null : parseInt(weekdayLimitValue, 10);
        const weekendLimit = weekendLimitValue === '' ? null : parseInt(weekendLimitValue, 10);

        if ((weekdayLimit !== null && (isNaN(weekdayLimit) || weekdayLimit < 0)) ||
            (weekendLimit !== null && (isNaN(weekendLimit) || weekendLimit < 0))) {
            globalLimitsStatusP.textContent = "Los límites deben ser números positivos o dejarse vacíos.";
            globalLimitsStatusP.style.color = 'red';
            setTimeout(() => { globalLimitsStatusP.textContent = ''; }, 3000);
            return;
        }

        const globalLimits = {
            weekday: weekdayLimit,
            weekend: weekendLimit
        };

        try {
            await chrome.storage.local.set({ globalLimits: globalLimits });
            globalLimitsStatusP.textContent = "Límites globales guardados con éxito.";
            globalLimitsStatusP.style.color = 'green';
            setTimeout(() => { globalLimitsStatusP.textContent = ''; }, 3000);
            // Send message to background script if needed
            chrome.runtime.sendMessage({ type: "globalLimitsChanged" }, (response) => {
                if (chrome.runtime.lastError) { /* console.warn("Error sending globalLimitsChanged message:", chrome.runtime.lastError.message); */ }
            });
        } catch (error) {
            console.error("Error saving global limits:", error);
            globalLimitsStatusP.textContent = "Error al guardar los límites globales.";
            globalLimitsStatusP.style.color = 'red';
            setTimeout(() => { globalLimitsStatusP.textContent = ''; }, 3000);
        }
    }

    async function loadGlobalLimits() {
        if (!isUnlocked && globalDailyLimitWeekdayInput && globalDailyLimitWeekendInput) { // Check if elements exist
             // Clear fields if locked or set to default, or simply do nothing
            globalDailyLimitWeekdayInput.value = '';
            globalDailyLimitWeekendInput.value = '';
            return;
        }
        try {
            const result = await chrome.storage.local.get('globalLimits');
            const savedLimits = result.globalLimits;

            if (savedLimits && globalDailyLimitWeekdayInput && globalDailyLimitWeekendInput) {
                globalDailyLimitWeekdayInput.value = savedLimits.weekday !== null && savedLimits.weekday !== undefined ? savedLimits.weekday : '';
                globalDailyLimitWeekendInput.value = savedLimits.weekend !== null && savedLimits.weekend !== undefined ? savedLimits.weekend : '';
            } else if (globalDailyLimitWeekdayInput && globalDailyLimitWeekendInput) {
                // No limits saved, ensure fields are empty or have placeholders
                globalDailyLimitWeekdayInput.value = '';
                globalDailyLimitWeekendInput.value = '';
            }
        } catch (error) {
            console.error("Error loading global limits:", error);
            if (globalLimitsStatusP) {
                globalLimitsStatusP.textContent = "Error al cargar los límites globales.";
                globalLimitsStatusP.style.color = 'red';
                setTimeout(() => { globalLimitsStatusP.textContent = ''; }, 3000);
            }
        }
    }

    // Event listener for save global limits button
    if (saveGlobalLimitsButton) {
        saveGlobalLimitsButton.addEventListener('click', saveGlobalLimits);
    }
    // --- End Global Daily Limits Functions ---


    // Function to add a time range input group
    function addTimeRangeInput(startTime = '', endTime = '') {
        if (!isUnlocked) return; // Protect action
        const timeRangeDiv = document.createElement('div');
        timeRangeDiv.classList.add('time-range-item', 'flex', 'items-center', 'space-x-2', 'mb-2');
        timeRangeDiv.innerHTML = `
            <input type="time" class="start-time px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 w-full">
            <span>hasta</span>
            <input type="time" class="end-time px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 w-full">
            <input type="number" class="limit-minutes px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 w-full" placeholder="Límite (min)">
            <button type="button" class="remove-time-range px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-sm">X</button>
        `;
        timeRangeDiv.querySelector('.start-time').value = startTime;
        timeRangeDiv.querySelector('.end-time').value = endTime;
        // Assuming limitMinutes is passed as a third argument now
        if (arguments.length > 2 && arguments[2] !== null && arguments[2] !== undefined) {
             timeRangeDiv.querySelector('.limit-minutes').value = arguments[2];
        } else {
             timeRangeDiv.querySelector('.limit-minutes').value = ''; // Ensure it's empty if null/undefined
        }

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
                        // Pass the limitMinutes when adding the input
                        addTimeRangeInput(range.startTime, range.endTime, range.limitMinutes);
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
        if (!isUnlocked) {
            showStatus("Desbloquea la configuración para guardar.", true);
            return;
        }
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
        const dailyLimitValue = dailyLimitInput.value.trim();
        const dailyLimit = dailyLimitValue === '' ? null : parseInt(dailyLimitValue, 10);

        const timeRanges = [];
        let hasInvalidTimeRange = false;
        timeRangesContainer.querySelectorAll('.time-range-item').forEach(item => {
            const startTime = item.querySelector('.start-time').value;
            const endTime = item.querySelector('.end-time').value;
            const limitMinutesValue = item.querySelector('.limit-minutes').value.trim();
            const limitMinutes = limitMinutesValue === '' ? null : parseInt(limitMinutesValue, 10);

            if (startTime && endTime) {
                 if (limitMinutes !== null && (isNaN(limitMinutes) || limitMinutes < 0)) {
                     showStatus("El límite por rango debe ser un número positivo.", true);
                     hasInvalidTimeRange = true;
                     return; // Skip this range, but mark as invalid
                 }
                 if (startTime >= endTime) {
                     showStatus("La hora de inicio debe ser anterior a la hora de fin en todos los rangos.", true);
                     hasInvalidTimeRange = true;
                     return; // Skip this range, but mark as invalid
                 }
                timeRanges.push({ startTime, endTime, limitMinutes });
            } else if (startTime || endTime || limitMinutesValue !== '') {
                 // If any part of the range is filled, but not both times
                 showStatus("Todos los rangos de horario deben tener hora de inicio y fin.", true);
                 hasInvalidTimeRange = true;
                 return; // Skip this range, but mark as invalid
            }
        });

        if (hasInvalidTimeRange) {
             return; // Stop saving if any time range was invalid
        }

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

            // Validate dailyLimit only if not unrestricted and value is provided
            if (dailyLimit !== null && (isNaN(dailyLimit) || dailyLimit < 0)) {
                showStatus("El límite diario debe ser un número positivo.", true);
                return;
            }

            currentRules[hostname][ruleType] = {
                dailyLimitMinutes: dailyLimit, // Store null if empty or invalid
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

    let rulesCache = {}; // Cache to store rules for faster access

    // Function to display a summary of rules when the configuration is locked
    async function displayLockedRulesSummary() {
        if (isUnlocked || !lockedRulesListDiv) return;

        const { rules } = await chrome.storage.local.get('rules');
        const currentRules = rules || {};
        rulesCache = currentRules; // Update cache

        if(lockedRulesListDiv) lockedRulesListDiv.innerHTML = ''; // Clear previous summary

        if (Object.keys(currentRules).length === 0) {
            if(lockedRulesListDiv) lockedRulesListDiv.innerHTML = '<p class="text-sm text-gray-500">No hay reglas configuradas.</p>';
            if(lockedRulesSummarySection) lockedRulesSummarySection.classList.add('hidden');
            return;
        }
        if(lockedRulesSummarySection) lockedRulesSummarySection.classList.remove('hidden');


        const today = new Date().toISOString().split('T')[0];
        const usageKeyToday = `usage${today}`;
        const usageTodayData = await chrome.storage.local.get(usageKeyToday);
        const currentUsageToday = usageTodayData[usageKeyToday] || {};

        for (const host in currentRules) {
            const rule = currentRules[host];
            const usageForHostToday = currentUsageToday[host] || { minutes: 0, seconds: 0 };
            const consumedTime = `${usageForHostToday.minutes} min` + (usageForHostToday.seconds > 0 ? `, ${usageForHostToday.seconds}s` : '');

            const p = document.createElement('p');
            p.classList.add('text-gray-600');
            p.innerHTML = `<span class="font-semibold">${host}:</span> ${consumedTime} consumidos hoy.`;
            if(lockedRulesListDiv) lockedRulesListDiv.appendChild(p);
        }
    }


    // Function to load and display rules in the table
    async function loadRules() {
        const { rules } = await chrome.storage.local.get('rules');
        const currentRules = rules || {};
        rulesCache = currentRules; // Update cache
        
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
                        if (!isUnlocked) {
                            showStatus("Desbloquea la configuración para eliminar.", true);
                            return;
                        }
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
                const wdDailyLimit = (rule.weekday.dailyLimitMinutes !== null && rule.weekday.dailyLimitMinutes !== undefined) ? `${rule.weekday.dailyLimitMinutes} min (Diario)` : 'Sin límite diario';
                let wdRangesHTML = 'Todo el día';
                if (rule.weekday.timeRanges && Array.isArray(rule.weekday.timeRanges) && rule.weekday.timeRanges.length > 0) {
                    wdRangesHTML = rule.weekday.timeRanges.map(range => {
                        const rangeLimit = (range.limitMinutes !== null && range.limitMinutes !== undefined) ? ` (${range.limitMinutes} min)` : '';
                        return `${range.startTime || 'N/A'}-${range.endTime || 'N/A'}${rangeLimit}`;
                    }).join('<br>');
                }
                weekdayCell.innerHTML = `${wdDailyLimit}<br>${wdRangesHTML}`;
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
                const weDailyLimit = (rule.weekend.dailyLimitMinutes !== null && rule.weekend.dailyLimitMinutes !== undefined) ? `${rule.weekend.dailyLimitMinutes} min (Diario)` : 'Sin límite diario';
                let weRangesHTML = 'Todo el día';
                if (rule.weekend.timeRanges && Array.weekend.timeRanges.length > 0) {
                     weRangesHTML = rule.weekend.timeRanges.map(range => {
                        const rangeLimit = (range.limitMinutes !== null && range.limitMinutes !== undefined) ? ` (${range.limitMinutes} min)` : '';
                        return `${range.startTime || 'N/A'}-${range.endTime || 'N/A'}${rangeLimit}`;
                    }).join('<br>');
                }
                weekendCell.innerHTML = `${weDailyLimit}<br>${weRangesHTML}`;
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

        modeButtons.forEach(button => {
            if (button) { // Check if button exists
                const isActive = button.dataset.mode === savedMode;
                button.classList.toggle('bg-blue-500', isActive);
                button.classList.toggle('text-white', isActive);
                button.classList.toggle('border-blue-500', isActive);
                button.classList.toggle('hover:bg-blue-600', isActive);

                button.classList.toggle('bg-white', !isActive);
                button.classList.toggle('text-gray-700', !isActive);
                button.classList.toggle('border-gray-300', !isActive);
                button.classList.toggle('hover:bg-gray-50', !isActive);

                const icon = button.querySelector('svg');
                if (icon) {
                    icon.classList.toggle('text-white', isActive);
                    icon.classList.toggle('text-gray-500', !isActive);
                }
                const subtext = button.querySelector('.mode-subtext');
                if (subtext) {
                    subtext.classList.toggle('text-white', isActive);
                    subtext.classList.toggle('text-gray-500', !isActive);
                }
            }
        });
    }

    // Event listeners for new mode buttons
    modeButtons.forEach(button => {
        if (button) { // Check if button exists
            button.addEventListener('click', async () => {
                if (!isUnlocked) {
                    showStatus("Desbloquea la configuración para cambiar el modo.", true);
                    return;
                }
                const mode = button.dataset.mode;
                await saveOperationMode(mode);
                loadOperationMode(); // Reload to update UI styles for all buttons
            });
        }
    });


    // Event listener for temporary disable button
    activateDisableButton.addEventListener('click', async () => {
        if (!isUnlocked) {
            if (disableStatusP) {
                disableStatusP.textContent = "Desbloquea la configuración para desactivar temporalmente.";
                disableStatusP.style.color = 'red';
            }
            return;
        }

        const durationMinutes = parseInt(disableDurationInput.value, 10);
        if (isNaN(durationMinutes) || durationMinutes <= 0) {
            if (disableStatusP) {
                disableStatusP.textContent = "Por favor, introduce una duración válida en minutos.";
                disableStatusP.style.color = 'red';
            }
            return;
        }

        const now = Date.now();
        const disableEndTime = now + (durationMinutes * 60 * 1000);

        await chrome.storage.local.set({ temporaryDisableEndTime: disableEndTime, temporaryDisableDuration: durationMinutes });
        
        if (disableStatusP) {
            disableStatusP.textContent = `Extensión desactivada temporalmente por ${durationMinutes} minutos.`;
            disableStatusP.style.color = 'green';
            setTimeout(() => { if(disableStatusP) disableStatusP.textContent = ''; }, 5000);
        }
        
        updateDisableProgress(); // Start or update the progress bar

        chrome.runtime.sendMessage({ type: "temporaryDisableActivated" }, (response) => {
             if (chrome.runtime.lastError) { /* console.warn("Error sending temporaryDisableActivated message:", chrome.runtime.lastError.message); */ }
        });
    });

    async function cancelTemporaryDisable() {
        if (!isUnlocked && !document.getElementById('cancelTemporaryDisableLockedButton')) { // Check if called from locked button if not unlocked
             if (disableStatusP) {
                disableStatusP.textContent = "Desbloquea la configuración para reactivar.";
                disableStatusP.style.color = 'red';
                setTimeout(() => { if(disableStatusP) disableStatusP.textContent = ''; }, 3000);
            }
            // For locked button, it should proceed if password is not the issue.
            // This check might need refinement based on how locked button is handled.
            // For now, assume if cancelTemporaryDisableLockedButton exists, it's okay to proceed.
            if (!document.getElementById('cancelTemporaryDisableLockedButton')) return;
        }

        if (disableIntervalId) {
            clearInterval(disableIntervalId);
            disableIntervalId = null;
        }
        await chrome.storage.local.remove(['temporaryDisableEndTime', 'temporaryDisableDuration']);
        if(disableProgressSection) disableProgressSection.classList.add('hidden');
        if(lockedDisableProgressSection) lockedDisableProgressSection.classList.add('hidden');

        if (disableStatusP) {
            disableStatusP.textContent = 'Desactivación temporal cancelada. La extensión está activa.';
            disableStatusP.style.color = 'green';
            setTimeout(() => { if(disableStatusP) disableStatusP.textContent = ''; }, 3000);
        }
        // Send message to background to re-evaluate state
        chrome.runtime.sendMessage({ type: "rulesChanged" }); // Or a more specific message like "temporaryDisableCancelled"
    }

    if(cancelTemporaryDisableButton) {
        cancelTemporaryDisableButton.addEventListener('click', cancelTemporaryDisable);
    }
    if(cancelTemporaryDisableLockedButton) {
        cancelTemporaryDisableLockedButton.addEventListener('click', async () => {
            // For the locked button, we don't require full unlock, just proceed to cancel.
            if (disableIntervalId) {
                clearInterval(disableIntervalId);
                disableIntervalId = null;
            }
            await chrome.storage.local.remove(['temporaryDisableEndTime', 'temporaryDisableDuration']);
            if(disableProgressSection) disableProgressSection.classList.add('hidden');
            if(lockedDisableProgressSection) lockedDisableProgressSection.classList.add('hidden');
            // No status message here as it's on the locked screen, the bar disappearing is the feedback.
            chrome.runtime.sendMessage({ type: "rulesChanged" });
        });
    }


    // Load initial data
    // loadRules, loadOperationMode, loadGlobalLimits are called within unlockConfiguration or initializeOptionsPage
    // updateDisableProgress is called in unlockConfiguration and lockConfiguration

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

    // Clear Tracking Data Button Listener (check if button exists)
    if (clearTrackingDataButton) {
        clearTrackingDataButton.addEventListener('click', async () => {
            if (!isUnlocked) {
                showStatus("Desbloquea la configuración para borrar datos.", true);
                return;
            }
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
        if (!isUnlocked) { // Don't render if locked
             // Optionally clear the table or show a message
             const activationsTableContainer = document.getElementById('activationsTableContainer');
             if (activationsTableContainer) activationsTableContainer.innerHTML = '<p class="text-gray-500 text-center py-4">Desbloquea para ver activaciones.</p>';
             const summaryDiv = document.getElementById('activationsSummary');
             if (summaryDiv) summaryDiv.innerHTML = '';
             return;
        }
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
                if (!isUnlocked) return; // Protect action
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

    // --- Initialization and Password Check ---

    async function initializeOptionsPage() {
        try {
            const result = await chrome.storage.sync.get('configPassword');
            const storedPassword = result.configPassword;

            if (!storedPassword) {
                if(createPasswordSection) createPasswordSection.classList.remove('hidden');
                if(unlockSection) unlockSection.classList.add('hidden');
                if(configSection) configSection.classList.add('hidden');
            } else {
                if(unlockSection) unlockSection.classList.remove('hidden');
                if(createPasswordSection) createPasswordSection.classList.add('hidden');
                if(configSection) configSection.classList.add('hidden');
                // Initial check for active disable when page loads in locked state
                displayLockedRulesSummary();
                updateDisableProgress();
            }
        } catch (error) {
            console.error("Error checking password:", error);
            if(unlockSection) unlockSection.classList.remove('hidden'); 
            if(createPasswordSection) createPasswordSection.classList.add('hidden');
            if(configSection) configSection.classList.add('hidden');
            showUnlockStatus("Error al verificar la contraseña.", true);
        }
    }

    // --- Event Listeners for Password Sections ---

    savePasswordButton.addEventListener('click', async () => {
        const newPass = newPasswordInput.value;
        const confirmPass = confirmPasswordInput.value;

        if (!newPass || !confirmPass) {
            showPasswordStatus("Ambos campos de contraseña son requeridos.", true);
            return;
        }
        if (newPass !== confirmPass) {
            showPasswordStatus("Las contraseñas no coinciden.", true);
            return;
        }

        try {
            // For now, storing directly. Hashing should be added here later.
            await chrome.storage.sync.set({ configPassword: newPass });
            showPasswordStatus("Contraseña guardada con éxito.", false);
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
            unlockConfiguration(); // Unlock and load settings
        } catch (error) {
            console.error("Error saving password:", error);
            showPasswordStatus("Error al guardar la contraseña.", true);
        }
    });

    unlockButton.addEventListener('click', async () => {
        const enteredPassword = passwordInput.value;
        if (!enteredPassword) {
            showUnlockStatus("Por favor, introduce la contraseña.", true);
            return;
        }

        try {
            const result = await chrome.storage.sync.get('configPassword');
            const storedPassword = result.configPassword;

            if (enteredPassword === storedPassword) {
                showUnlockStatus("Desbloqueado.", false);
                unlockConfiguration(); // Unlock and load settings
            } else {
                showUnlockStatus("Contraseña incorrecta.", true);
                passwordInput.value = ''; // Clear incorrect password
                isUnlocked = false; // Ensure state is locked
            }
        } catch (error) {
            console.error("Error verifying password:", error);
            showUnlockStatus("Error al verificar la contraseña.", true);
            isUnlocked = false; // Ensure state is locked
        }
    });

    // Add listener for Enter key in password input
    passwordInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent potential form submission
            unlockButton.click(); // Trigger unlock button click
        }
    });

    lockButton.addEventListener('click', () => {
        lockConfiguration();
    });

    // Initial page setup
    await initializeOptionsPage();

});
