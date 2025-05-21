// background.js - Service Worker para Manifest V3

// Formato de datos para las reglas de control de sitios (almacenado en chrome.storage.local bajo la clave 'rules'):
// {
//   "hostname.com": {
//     "unrestricted": true, // Opcional: si es true, no se aplican otros límites para este sitio.
//     "weekday": { // Reglas para Lunes a Viernes
//       "dailyLimitMinutes": 60, // Opcional: Límite diario total para este sitio en días de semana.
//       "timeRanges": [ // Opcional: Array de franjas horarias permitidas.
//         {
//           "startTime": "09:00", // Hora de inicio de la franja.
//           "endTime": "12:00",   // Hora de fin de la franja.
//           "limitMinutes": 30    // Opcional: Límite específico para esta franja horaria.
//         },
//         // ... más franjas horarias para días de semana.
//       ]
//     },
//     "weekend": { // Reglas para Sábado y Domingo (estructura idéntica a "weekday")
//       "dailyLimitMinutes": 120,
//       "timeRanges": [
//         {
//           "startTime": "10:00",
//           "endTime": "22:00"
//         }
//         // ... más franjas horarias para fines de semana.
//       ]
//     }
//   },
//   // ... más sitios web.
// }
//
// Adicionalmente, existe una clave 'globalLimits' en chrome.storage.local para los límites diarios globales:
// {
//   "globalLimits": {
//     "weekday": 120, // Límite total de minutos para TODOS los sitios en un día de semana.
//     "weekend": 180  // Límite total de minutos para TODOS los sitios en un fin de semana.
//   }
// }

// Valores por defecto para las reglas y el uso
const DEFAULT_RULES = {
    // Ejemplo: "walinwa.net": { unrestricted: true },
    // "youtube.com": { dailyLimitMinutes: 30, startTime: "08:00", endTime: "20:00" },
    // "lichess.org": { dailyLimitMinutes: 60, startTime: "08:00", endTime: "20:00" }
  };

  const DEFAULT_USAGE = {}; // Usage data will be stored under date-specific keys (usageYYYY-MM-DD)

  const DEFAULT_VISITED_TABS = {
    // Ejemplo: "2025-05-10": ["url1", "url2"]
  };

  let siteTimers = {}; // Almacena los temporizadores activos: { "hostname": { intervalId: null, activeTabId: null, lastFocusTime: null } }
  let lastKnownActiveTabId = null;
  let lastKnownWindowId = null;
  let isBrowserFocused = true;


  // --- Inicialización y Alarmas ---
  chrome.runtime.onInstalled.addListener(async () => {
    // console.log("Extensión instalada/actualizada.");
    await chrome.storage.local.get(["rules", "usageData", "visitedTabs"], (result) => {
      if (!result.rules) {
        chrome.storage.local.set({ rules: DEFAULT_RULES });
        // console.log("Reglas por defecto establecidas.");
      }
      if (!result.usageData) {
        chrome.storage.local.set({ usageData: DEFAULT_USAGE });
        // console.log("Datos de uso por defecto establecidos.");
      }
      if (!result.visitedTabs) {
        chrome.storage.local.set({ visitedTabs: DEFAULT_VISITED_TABS });
        // console.log("Datos de pestañas visitadas por defecto establecidos.");
      }
    });

    // Alarma para resetear el uso diario a medianoche
    chrome.alarms.create("dailyReset", {
      when: getNextMidnight(),
      periodInMinutes: 24 * 60 // Repetir cada 24 horas
    });

    // Alarma para guardar periódicamente el tiempo y verificar límites (cada minuto)
    chrome.alarms.create("periodicCheck", {
      delayInMinutes: 1,
      periodInMinutes: 1
    });
    // console.log("Alarmas creadas: dailyReset y periodicCheck.");
  });

  function getNextMidnight() {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1, // Mañana
      0, 0, 5, 0 // 00:00:05 para asegurar que es después de medianoche
    );
    // console.log("Próximo reseteo diario:", nextMidnight.toLocaleString());
    return nextMidnight.getTime();
  }

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    // console.log("Alarma disparada:", alarm.name);
    if (alarm.name === "dailyReset") {
      await resetDailyUsage();
    } else if (alarm.name === "periodicCheck") {
      await processActiveTabTime();
      await checkAllTabsForBlocking();
    }
  });

  async function resetDailyUsage() {
    // console.log("Reseteando datos de uso diario y pestañas visitadas...");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `usage${yesterday.toISOString().split('T')[0]}`;

    // Remove yesterday's usage data and reset visitedTabs
    await chrome.storage.local.remove([yesterdayKey, 'visitedTabs']);

    // Also clear any usage data for today that might exist from a previous run/crash
    const today = new Date().toISOString().split('T')[0];
    const todayKey = `usage${today}`;
     await chrome.storage.local.remove(todayKey);


    // Reset timers in memory
    siteTimers = {};
    // console.log("Datos de uso diario y pestañas visitadas reseteados.");
  }

  // --- Seguimiento del Foco del Navegador ---
  chrome.windows.onFocusChanged.addListener(async (windowId) => { // Added async here
    isBrowserFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
    if (isBrowserFocused) {
      // console.log(`Foco del navegador GANADO por la ventana ID: ${windowId}`);
      if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        chrome.windows.get(windowId, { populate: true }, async (window) => { // Added async here
          if (window) {
            // console.log(`Ventana enfocada ID: ${windowId}, Tipo: ${window.type}`);
            // If the focused window has tabs and is not a devtools window
            if (window.tabs && window.tabs.length > 0 && window.type !== 'devtools') {
              const activeTab = window.tabs.find(tab => tab.active);
              if (activeTab && activeTab.url) {
                lastKnownActiveTabId = activeTab.id;
                lastKnownWindowId = windowId;
                const host = getHostFromUrl(activeTab.url);
                if (host) {
                  // Added await and check for blocked status
                  const blocked = await checkAndBlockIfNeeded(activeTab.id, host, activeTab.url);
                  if (!blocked) { // Only start tracking if not blocked
                    startTrackingHostTime(host, activeTab.id);
                    recordActivation(host); // Record activation when window gains focus
                  }
                }
              }
            }
          }
        });
      }
    } else {
      // console.log("Foco del navegador PERDIDO.");
      // Si el navegador pierde el foco, pausar todos los timers activos
      for (const host in siteTimers) {
        if (siteTimers[host].intervalId) {
          pauseTrackingHostTime(host, Date.now());
        }
      }
    }
  });


  // --- Seguimiento de Pestañas ---
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    // console.log(`Pestaña activada. Nueva pestaña ID: ${activeInfo.tabId}, Ventana ID: ${activeInfo.windowId}`);
    lastKnownActiveTabId = activeInfo.tabId;
    lastKnownWindowId = activeInfo.windowId;

    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab && tab.url) {
        // console.log(`Pestaña activada URL: ${tab.url}`);
        recordVisitedTab(tab.url); // Record visited tab here
        const host = getHostFromUrl(tab.url);
        if (host) {
          recordActivation(host); // Record activation here
        }
      }
    });

    // Pausar el timer de la pestaña anteriormente activa (si la hubo)
    for (const host in siteTimers) {
      if (siteTimers[host].activeTabId !== activeInfo.tabId && siteTimers[host].intervalId) {
        // console.log(`Pestaña ID ${siteTimers[host].activeTabId} para host ${host} PERDIÓ el foco (otra pestaña activada).`);
        pauseTrackingHostTime(host, Date.now());
      }
    }

    // Iniciar/Reanudar timer para la nueva pestaña activa
    chrome.tabs.get(activeInfo.tabId, async (tab) => {
      if (tab && tab.url) { // Removed isBrowserFocused check here
        const host = getHostFromUrl(tab.url);
        if (host) {
          // Moved checkAndBlockIfNeeded to the beginning
          const blocked = await checkAndBlockIfNeeded(tab.id, host, tab.url);
          if (!blocked) {
            const { rules } = await chrome.storage.local.get("rules");
            const siteRule = (rules || DEFAULT_RULES)[host];
            const timeRangesDetails = siteRule && siteRule.timeRanges ? `, Time Ranges: ${JSON.stringify(siteRule.timeRanges)}` : '';
            console.log(`[onActivated] Checking and potentially blocking tab ID: ${tab.id}, Host: ${host}, URL: ${tab.url}${timeRangesDetails}`);
            startTrackingHostTime(host, tab.id);
          } else {
            console.log(`[onActivated] Tab ID: ${tab.id}, Host: ${host} was blocked.`);
          }
        }
      }
    });
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Interesa 'complete' para asegurar que la URL es la final
    if (changeInfo.status === 'complete' && tab.url) {
      // console.log("Pestaña actualizada:", tabId, tab.url);
      // Registrar la URL de la pestaña actualizada si está activa
      if (tab.active) {
        recordVisitedTab(tab.url);
      }
      const host = getHostFromUrl(tab.url);
      if (host) {
        await checkAndBlockIfNeeded(tabId, host, tab.url);
        if (tab.active && isBrowserFocused) {
          // Si la pestaña activa cambió su URL, actualizar el tracking
          // Pausar timers de otros hosts si estaban activos para esta pestaña
          for (const h in siteTimers) {
              if (h !== host && siteTimers[h].activeTabId === tabId) {
                  pauseTrackingHostTime(h, Date.now());
              }
          }
          startTrackingHostTime(host, tabId);
        }
      }
    } else if (changeInfo.status === 'loading' && tab.active && isBrowserFocused) {
      // Si la pestaña activa está cargando una nueva URL, pausar el timer del host anterior
      const hostBeingNavigatedFrom = Object.keys(siteTimers).find(h => siteTimers[h].activeTabId === tabId && siteTimers[h].intervalId);
      if (hostBeingNavigatedFrom) {
          pauseTrackingHostTime(hostBeingNavigatedFrom, Date.now());
      }
    }
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // console.log("Pestaña eliminada:", tabId);
    // Si la pestaña eliminada era la que estaba siendo trackeada, detener su timer
    for (const host in siteTimers) {
      if (siteTimers[host].activeTabId === tabId) {
        pauseTrackingHostTime(host, Date.now()); // Guardar el tiempo acumulado
        delete siteTimers[host]; // Eliminar el timer
        // console.log(`Timer para ${host} en pestaña ${tabId} eliminado.`);
      }
    }
    if (tabId === lastKnownActiveTabId) {
      lastKnownActiveTabId = null;
    }
  });


  // --- Lógica de Tracking de Tiempo ---
  function getHostFromUrl(urlString) {
    try {
      const url = new URL(urlString);
      if (url.protocol === "http:" || url.protocol === "https:") {
        const hostname = url.hostname;
        const parts = hostname.split('.');
        // Simple approach: take the last two parts for the main domain
        if (parts.length > 1) {
          // Handle cases like co.uk, com.au, etc. (basic handling)
          if (parts.length > 2 && (parts[parts.length - 2].length <= 3 || parts[parts.length - 1].length <= 2)) {
             return parts.slice(-3).join('.');
          }
          return parts.slice(-2).join('.');
        }
        return hostname; // Return hostname if it's just a single part
      }
    } catch (e) {
      // console.warn("URL inválida o no HTTP/S:", urlString, e);
    }
    return null;
  }

  async function recordVisitedTab(urlString) {
    if (!urlString) return;

    try {
      const url = new URL(urlString);
      // Excluir URLs internas de la extensión y URLs de datos
      if (url.protocol === "chrome-extension:" || url.protocol === "data:") {
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const { visitedTabs } = await chrome.storage.local.get("visitedTabs");
      const currentVisitedTabs = visitedTabs || DEFAULT_VISITED_TABS;

      if (!currentVisitedTabs[today]) {
        currentVisitedTabs[today] = [];
      }

      // Evitar duplicados consecutivos si el usuario recarga o navega a la misma URL
      if (currentVisitedTabs[today].length === 0 || currentVisitedTabs[today][currentVisitedTabs[today].length - 1] !== urlString) {
        currentVisitedTabs[today].push(urlString);
        await chrome.storage.local.set({ visitedTabs: currentVisitedTabs });
        // console.log(`Pestaña visitada registrada para hoy: ${urlString}`);
      }

    } catch (e) {
      // console.warn("URL inválida al intentar registrar pestaña visitada:", urlString, e);
    }
  }

  async function startTrackingHostTime(host, tabId) {
    // console.log(`[startTrackingHostTime] host: ${host}, tabId: ${tabId}, isBrowserFocused: ${isBrowserFocused}`);
    if (!host || !isBrowserFocused) return;

    const { rules } = await chrome.storage.local.get("rules");
    const siteRule = (rules || DEFAULT_RULES)[host];

    if (siteRule && siteRule.unrestricted) {
      // console.log(`Sitio ${host} es irrestricto. No se trackea.`);
      // Asegurarse de que no haya un timer activo para este host
      if (siteTimers[host] && siteTimers[host].intervalId) {
          pauseTrackingHostTime(host, Date.now());
      }
      return;
    }

    if (!siteTimers[host] || !siteTimers[host].intervalId) {
      // console.log(`Iniciando/Reanudando tracking para ${host} en pestaña ${tabId}`);
      siteTimers[host] = {
        ...siteTimers[host], // Conservar tiempo acumulado si existe
        intervalId: "active", // Marcador de que está activo (no usamos setInterval aquí)
        activeTabId: tabId,
        lastFocusTime: Date.now() // Momento en que empezó el foco actual
      };
    } else {
      // Si ya existe un timer y es para la misma pestaña, solo actualizar lastFocusTime
      siteTimers[host].activeTabId = tabId;
      siteTimers[host].lastFocusTime = Date.now();
      // console.log(`Actualizando lastFocusTime para ${host} en pestaña ${tabId}`);
    }
  }

  async function pauseTrackingHostTime(host, pauseTime) {
    // console.log(`[pauseTrackingHostTime] host: ${host}, pauseTime: ${pauseTime}`);
    if (siteTimers && siteTimers[host] && siteTimers[host].intervalId && siteTimers[host].lastFocusTime) {
      const elapsedSeconds = Math.round((pauseTime - siteTimers[host].lastFocusTime) / 1000);
      if (elapsedSeconds > 0) {
        await recordTimeSpent(host, elapsedSeconds);
      }
      // console.log(`Pausando tracking para ${host}. Tiempo en este foco: ${elapsedSeconds}s`);
      siteTimers[host].intervalId = null; // Marcar como inactivo
      siteTimers[host].lastFocusTime = null;
    }
  }

  async function recordActivation(host) {
    if (!host) return;

    const today = new Date().toISOString().split('T')[0];
    const usageKeyToday = `usage${today}`;

    // Fetch today's usage data
    const usageTodayData = await chrome.storage.local.get(usageKeyToday);
    const currentUsageToday = usageTodayData[usageKeyToday] || {};

    // Ensure the hostname entry exists for today
    if (!currentUsageToday[host]) {
      currentUsageToday[host] = { minutes: 0, seconds: 0, activationTimestamps: [] };
    } else if (!Array.isArray(currentUsageToday[host].activationTimestamps)) {
      // Ensure activationTimestamps is an array if the field exists but is not an array (migration)
      currentUsageToday[host].activationTimestamps = [];
    }

    currentUsageToday[host].activationTimestamps.push(Date.now());

    // Save the updated object back to the date-specific key
    await chrome.storage.local.set({ [usageKeyToday]: currentUsageToday });
    console.log(`Activación registrada para ${host} a las ${new Date().toLocaleTimeString()}. Total hoy: ${currentUsageToday[host].activationTimestamps.length} activaciones.`);
  }

  async function recordTimeSpent(host, seconds) {
    // console.log(`[recordTimeSpent] host: ${host}, seconds: ${seconds}`);
    if (!host || seconds <= 0) return;

    const { rules } = await chrome.storage.local.get("rules");
    const siteRule = (rules || DEFAULT_RULES)[host];

    // Solo registrar si hay una regla (incluso si no es de límite, para estadísticas) o si no es irrestricto
    if (siteRule && siteRule.unrestricted) {
        return; // No registrar tiempo para sitios irrestritos
    }

    const today = new Date().toISOString().split('T')[0];
    const usageKeyToday = `usage${today}`;

    // Fetch today's usage data
    const usageTodayData = await chrome.storage.local.get(usageKeyToday);
    const currentUsageToday = usageTodayData[usageKeyToday] || {};

    // Ensure the hostname entry exists for today
    if (!currentUsageToday[host]) {
      currentUsageToday[host] = { minutes: 0, seconds: 0, activationTimestamps: [] };
    }

    // Add seconds to total daily usage
    currentUsageToday[host].seconds = (currentUsageToday[host].seconds || 0) + seconds;
    currentUsageToday[host].minutes = (currentUsageToday[host].minutes || 0) + Math.floor(currentUsageToday[host].seconds / 60);
    currentUsageToday[host].seconds %= 60;

    // Determine the current time range and add seconds to range-specific usage
    const now = new Date();
    const currentTimeStr = now.toTimeString().substring(0, 5); // "HH:MM"
    const todayDayOfWeek = now.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
    const isWeekend = todayDayOfWeek === 0 || todayDayOfWeek === 6;
    const ruleTypeToday = isWeekend ? 'weekend' : 'weekday';

    const ruleToday = siteRule ? siteRule[ruleTypeToday] : null;

    if (ruleToday && ruleToday.timeRanges && Array.isArray(ruleToday.timeRanges)) {
        for (const range of ruleToday.timeRanges) {
            if (range.startTime && range.endTime) {
                // Check if current time is within this range
                let isWithinRange = false;
                if (range.startTime > range.endTime) { // Overnight range
                    if (currentTimeStr >= range.startTime || currentTimeStr < range.endTime) {
                        isWithinRange = true;
                    }
                } else { // Normal range
                    if (currentTimeStr >= range.startTime && currentTimeStr < range.endTime) {
                        isWithinRange = true;
                    }
                }

                if (isWithinRange) {
                    const rangeKey = `${range.startTime}-${range.endTime}`;
                    if (!currentUsageToday[host].rangeUsage) {
                        currentUsageToday[host].rangeUsage = {};
                    }
                    if (!currentUsageToday[host].rangeUsage[rangeKey]) {
                        currentUsageToday[host].rangeUsage[rangeKey] = { minutes: 0, seconds: 0 };
                    }

                    // Add seconds to this specific range's usage
                    currentUsageToday[host].rangeUsage[rangeKey].seconds = (currentUsageToday[host].rangeUsage[rangeKey].seconds || 0) + seconds;
                    currentUsageToday[host].rangeUsage[rangeKey].minutes = (currentUsageToday[host].rangeUsage[rangeKey].minutes || 0) + Math.floor(currentUsageToday[host].rangeUsage[rangeKey].seconds / 60);
                    currentUsageToday[host].rangeUsage[rangeKey].seconds %= 60;

                    // Since time is recorded periodically (e.g., every minute), a single time segment
                    // should ideally fall into only one range. If ranges overlap, this logic might need refinement.
                    // For now, we assume non-overlapping ranges for simplicity in recording.
                    break; // Assume time falls into the first matching range
                }
            }
        }
    }


    // Save the updated object back to the date-specific key
    await chrome.storage.local.set({ [usageKeyToday]: currentUsageToday });
    // console.log(`Registrados ${seconds}s para ${host}. Total hoy: ${currentUsageToday[host].minutes} min, ${currentUsageToday[host].seconds} s.`);
    // console.log(`Uso por rango para ${host}:`, currentUsageToday[host].rangeUsage);
  }

  async function processActiveTabTime() {
    // console.log("Procesando tiempo de pestaña activa (periodicCheck)...");
    let activeHostProcessed = false;
    for (const host in siteTimers) {
      if (siteTimers[host].intervalId && siteTimers[host].activeTabId === lastKnownActiveTabId && isBrowserFocused) {
        // console.log(`[processActiveTabTime] Processing active host: ${host}, tabId: ${siteTimers[host].activeTabId}`);
        const now = Date.now();
        const elapsedSeconds = Math.round((now - siteTimers[host].lastFocusTime) / 1000);
        if (elapsedSeconds > 0) {
          await recordTimeSpent(host, elapsedSeconds);
          siteTimers[host].lastFocusTime = now; // Resetear para el próximo intervalo
        }
        activeHostProcessed = true;
        break; // Only one host can be active at a time
      }
    }
    if (!activeHostProcessed && lastKnownActiveTabId && isBrowserFocused) {
      // If the browser is focused and there's an active tab, but no timer was processed,
      // it might be a new tab/URL that needs its tracking started.
      chrome.tabs.get(lastKnownActiveTabId, (tab) => {
          if (tab && tab.url) {
              const host = getHostFromUrl(tab.url);
              if (host) startTrackingHostTime(host, tab.id);
          }
      });
    }

    // Check and clear temporary disable if expired during this periodic check
    const { temporaryDisableEndTime } = await chrome.storage.local.get('temporaryDisableEndTime');
    const now = Date.now();
    if (temporaryDisableEndTime && now >= temporaryDisableEndTime) {
        await chrome.storage.local.remove('temporaryDisableEndTime');
        // console.log("Temporary disable expired and cleared during periodic check.");
    }
  }


  // --- Lógica de Bloqueo ---
  async function checkAndBlockIfNeeded(tabId, host, urlToBlock) {
    if (!host) return false; // Cannot block without a host

    // 1. Check for Temporary Disable
    const { temporaryDisableEndTime } = await chrome.storage.local.get('temporaryDisableEndTime');
    const now = Date.now();
    if (temporaryDisableEndTime && now < temporaryDisableEndTime) {
        // console.log(`[Temporary Disable Active] Allowing ${host} (ID: ${tabId}). Disable ends at ${new Date(temporaryDisableEndTime).toLocaleString()}`);
        return false; // Extension is temporarily disabled, allow navigation
    } else if (temporaryDisableEndTime && now >= temporaryDisableEndTime) {
        // Temporary disable has expired, clear it from storage
        await chrome.storage.local.remove('temporaryDisableEndTime');
        // console.log("Temporary disable expired and cleared.");
    }


    // 2. Get Operation Mode
    const { operationMode: mode } = await chrome.storage.local.get({ operationMode: 'permissive' }); // Default to permissive

    // 3. Monitoring Mode: Never block
    if (mode === 'monitoring') {
        // console.log(`[Mode: Monitoring] Allowing ${host} (monitoring mode).`);
        return false;
    }

    // 4. Get Rules
    const { rules } = await chrome.storage.local.get("rules");
    const siteRules = (rules || DEFAULT_RULES)[host];

    // 5. Strict Mode: Block if no rule exists
    if (mode === 'strict' && !siteRules) {
        // console.log(`[Mode: Strict] BLOCKING ${host} (ID: ${tabId}) because no rule exists.`);
        await blockTab(tabId, host, urlToBlock, `Bloqueado por modo Estricto (sin regla definida).`);
        return true; // Blocked
    }

    // 6. Permissive Mode: Allow if no rule exists (or if unrestricted)
    // Also handles unrestricted case for Strict mode
    if (!siteRules || siteRules.unrestricted) {
        // console.log(`[Mode: ${mode}] Allowing ${host} (no rule/unrestricted).`);
        return false; // Not blocked
    }

    // --- Rule exists and is not unrestricted ---
    // The following checks apply to both Permissive and Strict modes when a specific rule is found.

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const currentTimeStr = today.toTimeString().substring(0, 5); // "HH:MM"
    const todayDayOfWeek = today.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
    const isWeekend = todayDayOfWeek === 0 || todayDayOfWeek === 6;
    const ruleTypeToday = isWeekend ? 'weekend' : 'weekday';

    const ruleToday = siteRules[ruleTypeToday];

    // If there's no specific rule for today (weekday/weekend)
    if (!ruleToday) {
        if (mode === 'strict') {
            // console.log(`[Mode: Strict] BLOCKING ${host} (ID: ${tabId}) because no specific rule for ${ruleTypeToday}.`);
            await blockTab(tabId, host, urlToBlock, `Bloqueado por modo Estricto (sin regla para ${ruleTypeToday}).`);
            return true; // Blocked
        } else { // Permissive mode
            // console.log(`[Mode: Permissive] Allowing ${host} because no specific rule for ${ruleTypeToday}.`);
            return false; // Allow
        }
    }

    // --- Rule for today exists ---

    // 7. Check Time Ranges and Per-Range Limits
    let isWithinAllowedTime = false; // Assume not allowed if ranges are defined
    let currentRangeLimit = null;
    let currentRange = null;
    let currentRangeKey = null;

    if (ruleToday.timeRanges && Array.isArray(ruleToday.timeRanges) && ruleToday.timeRanges.length > 0) {
        // console.log(`Checking time ranges for ${host} (${ruleTypeToday}):`, ruleToday.timeRanges);
        for (const range of ruleToday.timeRanges) {
            if (range.startTime && range.endTime) {
                // Handle overnight ranges (e.g., 22:00 - 06:00)
                if (range.startTime > range.endTime) {
                    if (currentTimeStr >= range.startTime || currentTimeStr < range.endTime) {
                        isWithinAllowedTime = true;
                        currentRangeLimit = range.limitMinutes;
                        currentRange = range;
                        currentRangeKey = `${range.startTime}-${range.endTime}`;
                        break;
                    }
                } else { // Normal range (e.g., 08:00 - 18:00)
                    if (currentTimeStr >= range.startTime && currentTimeStr < range.endTime) {
                        isWithinAllowedTime = true;
                        currentRangeLimit = range.limitMinutes;
                        currentRange = range;
                        currentRangeKey = `${range.startTime}-${range.endTime}`;
                        break;
                    }
                }
            }
        }
        if (!isWithinAllowedTime) {
            // console.log(`[Mode: ${mode}] BLOCKING ${host} (ID: ${tabId}) for being outside allowed time ranges for ${ruleTypeToday}.`);
            await blockTab(tabId, host, urlToBlock, `Fuera de los horarios permitidos para ${ruleTypeToday}.`);
            return true; // Blocked (Applies to both Permissive and Strict)
        }
    } else {
        // No time ranges defined, assume allowed all day within the rule's context
        isWithinAllowedTime = true;
        // If no time ranges, the daily limit is the only time-based restriction
        currentRangeLimit = null; // No specific range limit
        currentRange = null;
        currentRangeKey = null;
    }

    // If within allowed time (or no ranges defined), check limits

    const usageKeyToday = `usage${todayStr}`;
    const usageTodayData = await chrome.storage.local.get(usageKeyToday);
    const currentUsageToday = usageTodayData[usageKeyToday] || {};
    const usedToday = currentUsageToday[host] || { minutes: 0, seconds: 0, activationTimestamps: [], rangeUsage: {} }; // Ensure rangeUsage exists

    // 8. Check Per-Range Limit (if within a range and limit is defined)
    if (isWithinAllowedTime && currentRange && currentRangeKey && currentRangeLimit !== null && currentRangeLimit !== undefined) {
        const rangeUsage = usedToday.rangeUsage && usedToday.rangeUsage[currentRangeKey] ? usedToday.rangeUsage[currentRangeKey] : { minutes: 0, seconds: 0 };
        const timeSpentInCurrentRangeMinutes = rangeUsage.minutes + Math.floor(rangeUsage.seconds / 60);

        // console.log(`[Mode: ${mode}] Host: ${host} (${ruleTypeToday}), Current Range: ${currentRangeKey}, Range Limit: ${currentRangeLimit} min, Used in Range Today: ${timeSpentInCurrentRangeMinutes} min`);

        if (timeSpentInCurrentRangeMinutes >= currentRangeLimit) {
            // console.log(`[Mode: ${mode}] BLOCKING ${host} (ID: ${tabId}) due to exceeded per-range time limit (${timeSpentInCurrentRangeMinutes}min / ${currentRangeLimit}min) for range ${currentRangeKey}.`);
            await blockTab(tabId, host, urlToBlock, `Límite de tiempo (${currentRangeLimit} min) alcanzado para el horario ${currentRangeKey} (${ruleTypeToday}).`);
            return true; // Blocked
        }
    }

    // 9. Check Overall Daily Limit (if defined)
    const totalSecondsToday = (usedToday.minutes * 60) + usedToday.seconds;
    const totalMinutesToday = Math.floor(totalSecondsToday / 60);

    if (ruleToday.dailyLimitMinutes !== null && ruleToday.dailyLimitMinutes !== undefined && totalMinutesToday >= ruleToday.dailyLimitMinutes) {
        // console.log(`[Mode: ${mode}] BLOCKING ${host} (ID: ${tabId}) due to exceeded overall daily time limit (${totalMinutesToday}min / ${ruleToday.dailyLimitMinutes}min) for ${ruleTypeToday}.`);
        await blockTab(tabId, host, urlToBlock, `Límite de tiempo diario total (${ruleToday.dailyLimitMinutes} min) alcanzado para ${ruleTypeToday} en ${host}.`);
        return true; // Blocked
    }

    // --- Global Daily Limit Check ---
    // This check happens only if the site was not blocked by specific rules above.
    const { globalLimits } = await chrome.storage.local.get('globalLimits');
    if (globalLimits) {
        const globalLimitForTodayType = isWeekend ? globalLimits.weekend : globalLimits.weekday;

        if (globalLimitForTodayType !== null && globalLimitForTodayType !== undefined) {
            // Calculate total time spent across ALL sites today
            let totalTimeAcrossAllSitesMinutes = 0;
            for (const siteHost in currentUsageToday) {
                if (Object.hasOwnProperty.call(currentUsageToday, siteHost)) {
                    const siteUsage = currentUsageToday[siteHost];
                    totalTimeAcrossAllSitesMinutes += siteUsage.minutes || 0;
                    totalTimeAcrossAllSitesMinutes += Math.floor((siteUsage.seconds || 0) / 60);
                }
            }

            // console.log(`[Global Limit Check] Host: ${host}, Global Limit (${ruleTypeToday}): ${globalLimitForTodayType} min, Total Used Today (All Sites): ${totalTimeAcrossAllSitesMinutes} min`);

            if (totalTimeAcrossAllSitesMinutes >= globalLimitForTodayType) {
                // console.log(`[Mode: ${mode}] BLOCKING ${host} (ID: ${tabId}) due to exceeded GLOBAL daily time limit (${totalTimeAcrossAllSitesMinutes}min / ${globalLimitForTodayType}min) for ${ruleTypeToday}.`);
                await blockTab(tabId, host, urlToBlock, `Límite de tiempo diario GLOBAL (${globalLimitForTodayType} min) alcanzado para ${ruleTypeToday}.`);
                return true; // Blocked
            }
        }
    }

    // 10. If all checks passed (including global), allow
    // console.log(`[Mode: ${mode}] Allowing ${host} (within specific and global limits/time ranges).`);
    return false; // Not blocked
  }


  async function blockTab(tabId, host, originalUrl, reason) {
    // Pausar el timer antes de redirigir para guardar el último fragmento de tiempo
    await pauseTrackingHostTime(host, Date.now());
  
    const blockedPageUrl = chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(originalUrl)}&reason=${encodeURIComponent(reason)}&host=${encodeURIComponent(host)}`);
    try {
      await chrome.tabs.update(tabId, { url: blockedPageUrl });
      // console.log(`Pestaña ${tabId} redirigida a página de bloqueo para ${host}.`);
    } catch (error) {
      // console.error(`Error al actualizar la pestaña ${tabId} a la página de bloqueo:`, error, `URL original: ${originalUrl}`);
      // Esto puede pasar si la pestaña fue cerrada o ya no es accesible
    }
  }
  
  // Función para verificar todas las pestañas abiertas (útil después de cambios de reglas o al inicio)
  async function checkAllTabsForBlocking() {
    // console.log("Verificando todas las pestañas para bloqueo...");
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url) {
        const host = getHostFromUrl(tab.url);
        if (host && tab.id) {
          // Evitar bloquear la propia página de bloqueo o la de opciones
          if (tab.url.startsWith(chrome.runtime.getURL(""))) {
              continue;
          }
          await checkAndBlockIfNeeded(tab.id, host, tab.url);
        }
      }
    }
  }
  
  // Escuchar cambios en las reglas desde la página de opciones
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "rulesChanged" || message.type === "globalLimitsChanged") {
      // console.log(`${message.type} detectado, re-evaluando pestañas abiertas.`);
      checkAllTabsForBlocking();
      sendResponse({status: `${message.type} procesado, pestañas verificadas.`});
    } else if (message.type === "temporaryDisableActivated") {
        // console.log("Temporary disable activated, re-evaluating tabs.");
        checkAllTabsForBlocking(); // Re-check tabs, some might become unblocked
        sendResponse({status: "Temporary disable processed."});
    }
    return true; // Indica que la respuesta será asíncrona
  });
  
  // console.log("Service Worker de Control de Navegación iniciado.");
