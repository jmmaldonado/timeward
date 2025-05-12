// background.js - Service Worker para Manifest V3

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
  chrome.windows.onFocusChanged.addListener((windowId) => {
    isBrowserFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
    if (isBrowserFocused) {
      // console.log(`Foco del navegador GANADO por la ventana ID: ${windowId}`);
      if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        chrome.windows.get(windowId, { populate: true }, (window) => {
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
                  checkAndBlockIfNeeded(activeTab.id, host, activeTab.url); // No await needed here as it's not critical path for focus change
                  startTrackingHostTime(host, activeTab.id);
                  recordActivation(host); // Record activation when window gains focus
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
      if (tab && tab.url && isBrowserFocused) {
        const host = getHostFromUrl(tab.url);
        if (host) {
          const { rules } = await chrome.storage.local.get("rules");
          const siteRule = (rules || DEFAULT_RULES)[host];
          const timeRangesDetails = siteRule && siteRule.timeRanges ? `, Time Ranges: ${JSON.stringify(siteRule.timeRanges)}` : '';
          console.log(`[onActivated] Checking and potentially blocking tab ID: ${tab.id}, Host: ${host}, URL: ${tab.url}${timeRangesDetails}`);
          const blocked = await checkAndBlockIfNeeded(tab.id, host, tab.url);
          if (!blocked) {
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
    if (siteTimers[host] && siteTimers[host].intervalId && siteTimers[host].lastFocusTime) {
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

    // Add seconds and handle rollovers to minutes
    currentUsageToday[host].seconds = (currentUsageToday[host].seconds || 0) + seconds;
    currentUsageToday[host].minutes = (currentUsageToday[host].minutes || 0) + Math.floor(currentUsageToday[host].seconds / 60);
    currentUsageToday[host].seconds %= 60;

    // Save the updated object back to the date-specific key
    await chrome.storage.local.set({ [usageKeyToday]: currentUsageToday });
    // console.log(`Registrados ${seconds}s para ${host}. Total hoy: ${currentUsageToday[host].minutes} min, ${currentUsageToday[host].seconds} s.`);
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
        break; // Solo puede haber un host activo a la vez
      }
    }
    if (!activeHostProcessed && lastKnownActiveTabId && isBrowserFocused) {
      // Si el navegador está enfocado y hay una pestaña activa, pero no se procesó un timer,
      // podría ser una nueva pestaña/URL que necesita iniciar su tracking.
      chrome.tabs.get(lastKnownActiveTabId, (tab) => {
          if (tab && tab.url) {
              const host = getHostFromUrl(tab.url);
              if (host) startTrackingHostTime(host, tab.id);
          }
      });
    }
  }
  
  
  // --- Lógica de Bloqueo ---
  async function checkAndBlockIfNeeded(tabId, host, urlToBlock) {
    if (!host) return false; // Cannot block without a host

    // 1. Get Operation Mode
    const { operationMode: mode } = await chrome.storage.local.get({ operationMode: 'permissive' }); // Default to permissive

    // 2. Monitoring Mode: Never block
    if (mode === 'monitoring') {
        // console.log(`[Mode: Monitoring] Allowing ${host} (monitoring mode).`);
        return false;
    }

    // 3. Get Rules
    const { rules } = await chrome.storage.local.get("rules");
    const siteRules = (rules || DEFAULT_RULES)[host];

    // 4. Strict Mode: Block if no rule exists
    if (mode === 'strict' && !siteRules) {
        // console.log(`[Mode: Strict] BLOCKING ${host} (ID: ${tabId}) because no rule exists.`);
        await blockTab(tabId, host, urlToBlock, `Bloqueado por modo Estricto (sin regla definida).`);
        return true; // Blocked
    }

    // 5. Permissive Mode: Allow if no rule exists (or if unrestricted)
    // Also handles unrestricted case for Strict mode
    if (!siteRules || siteRules.unrestricted) {
        // console.log(`[Mode: ${mode}] Allowing ${host} (no rule/unrestricted).`);
        return false; // Not blocked
    }

    // --- Rule exists and is not unrestricted ---
    // The following checks apply to both Permissive and Strict modes when a specific rule is found.

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentTimeStr = now.toTimeString().substring(0, 5); // "HH:MM"
    const todayDayOfWeek = now.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
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

    // 6. Check Time Ranges
    let isWithinAllowedTime = true; // Assume allowed if no ranges are defined
    if (ruleToday.timeRanges && Array.isArray(ruleToday.timeRanges) && ruleToday.timeRanges.length > 0) {
        isWithinAllowedTime = false; // Requires explicit match if ranges exist
        // console.log(`Checking time ranges for ${host} (${ruleTypeToday}):`, ruleToday.timeRanges);
        for (const range of ruleToday.timeRanges) {
            if (range.startTime && range.endTime) {
                // Handle overnight ranges (e.g., 22:00 - 06:00)
                if (range.startTime > range.endTime) {
                    if (currentTimeStr >= range.startTime || currentTimeStr < range.endTime) {
                        isWithinAllowedTime = true;
                        break;
                    }
                } else { // Normal range (e.g., 08:00 - 18:00)
                    if (currentTimeStr >= range.startTime && currentTimeStr < range.endTime) {
                        isWithinAllowedTime = true;
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
    }

    // 7. Check Daily Limit
    const usageKeyToday = `usage${todayStr}`;
    const usageTodayData = await chrome.storage.local.get(usageKeyToday);
    const currentUsageToday = usageTodayData[usageKeyToday] || {};
    const usedToday = currentUsageToday[host] || { minutes: 0, seconds: 0, activationTimestamps: [] };

    let currentSessionSeconds = 0;
    if (siteTimers[host] && siteTimers[host].intervalId && siteTimers[host].lastFocusTime) {
        currentSessionSeconds = Math.round((Date.now() - siteTimers[host].lastFocusTime) / 1000);
    }

    let totalSecondsConsidered = (usedToday.minutes * 60) + usedToday.seconds + currentSessionSeconds;
    let totalMinutesConsidered = Math.floor(totalSecondsConsidered / 60);

    // console.log(`[Mode: ${mode}] Host: ${host} (${ruleTypeToday}), Daily Limit: ${ruleToday.dailyLimitMinutes} min, Used Today (considered): ${totalMinutesConsidered} min`);

    if (ruleToday.dailyLimitMinutes !== null && ruleToday.dailyLimitMinutes !== undefined && totalMinutesConsidered >= ruleToday.dailyLimitMinutes) {
        // console.log(`[Mode: ${mode}] BLOCKING ${host} (ID: ${tabId}) due to exceeded daily time limit (${totalMinutesConsidered}min / ${ruleToday.dailyLimitMinutes}min) for ${ruleTypeToday}.`);
        await blockTab(tabId, host, urlToBlock, `Límite de tiempo diario (${ruleToday.dailyLimitMinutes} min) alcanzado para ${ruleTypeToday}.`);
        return true; // Blocked (Applies to both Permissive and Strict)
    }

    // 8. If all checks passed, allow
    // console.log(`[Mode: ${mode}] Allowing ${host} (within limits/time ranges).`);
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
    if (message.type === "rulesChanged") {
      // console.log("Reglas cambiadas, re-evaluando pestañas abiertas.");
      checkAllTabsForBlocking();
      // También es buena idea recargar las reglas en los timers activos
      // o simplemente resetearlos para que se adapten a las nuevas reglas.
      // Por simplicidad, un checkAllTabsForBlocking puede ser suficiente inicialmente.
      sendResponse({status: "Reglas actualizadas, pestañas verificadas."});
    }
    return true; // Indica que la respuesta será asíncrona
  });
  
  // console.log("Service Worker de Control de Navegación iniciado.");
